import {
  BOARD_AGGREGATE_ID,
  BoardAuthorId,
  BoardPostId,
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type BoardPage,
  type BoardPost,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as NodeAssert from "node:assert/strict";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import type { BoardQueryShape } from "../orchestration/Services/BoardQuery.ts";
import {
  BOARD_EVENT_BUFFER_CAPACITY,
  classifyBoardReplayItems,
  makeBoardEventHub,
  makeBoardSubscription,
} from "./BoardSubscription.ts";

const makePost = (sequence: number, updatedSequence = sequence): BoardPost => ({
  id: BoardPostId.make(`post-${sequence}`),
  author: {
    kind: "agent",
    id: BoardAuthorId.make(`board-public-${sequence}`),
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  body: `post ${sequence}`,
  targets: [],
  source: {
    projectId: ProjectId.make("project"),
    threadId: ThreadId.make("thread"),
  },
  sequence,
  createdAt: "2026-08-30T00:00:00.000Z",
  revision: updatedSequence === sequence ? 1 : 2,
  updatedSequence,
  updatedAt: "2026-08-30T00:00:00.000Z",
  lastEditor: { kind: "agent" },
  lastEditorSource: {
    projectId: ProjectId.make("project"),
    threadId: ThreadId.make("thread"),
  },
});

const page = (posts: ReadonlyArray<BoardPost>, headSequence: number): BoardPage => ({
  posts,
  beforeCursor: null,
  headSequence,
});

const makePublishedEvent = (
  sequence: number,
): Extract<OrchestrationEvent, { type: "board.post-published" }> => ({
  sequence,
  eventId: EventId.make(`event-${sequence}`),
  aggregateKind: "board",
  aggregateId: BOARD_AGGREGATE_ID,
  occurredAt: "2026-08-30T00:00:00.000Z",
  commandId: CommandId.make(`command-${sequence}`),
  causationEventId: null,
  correlationId: CommandId.make(`command-${sequence}`),
  metadata: {},
  type: "board.post-published",
  payload: {
    postId: BoardPostId.make(`post-${sequence}`),
    author: {
      kind: "agent",
      id: BoardAuthorId.make(`board-public-${sequence}`),
      providerInstanceId: ProviderInstanceId.make("codex"),
    },
    source: {
      projectId: ProjectId.make("project"),
      threadId: ThreadId.make("thread"),
    },
    body: `post ${sequence}`,
    targets: [],
    createdAt: "2026-08-30T00:00:00.000Z",
  },
});

const makeQuery = (overrides: Partial<BoardQueryShape>): BoardQueryShape => ({
  getPage: () => Effect.succeed(page([], 0)),
  getHeadSequence: Effect.succeed(0),
  getPostBySequence: () => Effect.succeed(Option.none()),
  getPostById: () => Effect.succeed(Option.none()),
  getHistory: () => Effect.succeed(Option.none()),
  listAfterSequenceThroughHead: () => Effect.succeed([]),
  readAfterSequenceSnapshot: () => Effect.succeed({ posts: [], headSequence: 0, replayable: true }),
  ...overrides,
});

it.effect("bounds Board wakeups without letting unrelated traffic evict the final update", () =>
  Effect.gen(function* () {
    const hub = yield* makeBoardEventHub;
    const subscription = yield* hub.subscribe;
    const head = BOARD_EVENT_BUFFER_CAPACITY + 20;
    for (let sequence = 1; sequence <= head; sequence++) {
      yield* hub.publish(makePublishedEvent(sequence));
    }
    for (let index = 1; index <= BOARD_EVENT_BUFFER_CAPACITY + 1; index++) {
      yield* hub.publish({
        ...makePublishedEvent(head + index),
        type: "project.deleted",
        aggregateKind: "project",
        aggregateId: ProjectId.make("unrelated"),
        payload: { projectId: ProjectId.make("unrelated"), deletedAt: "2026-08-30T00:00:00.000Z" },
      });
    }
    const retained = yield* subscription.pipe(
      Stream.take(BOARD_EVENT_BUFFER_CAPACITY),
      Stream.runCollect,
    );
    NodeAssert.equal(retained.length, BOARD_EVENT_BUFFER_CAPACITY);
    NodeAssert.equal(retained[0]?.sequence, 21);
    NodeAssert.equal(retained.at(-1)?.sequence, head);
    NodeAssert.ok(retained.every((event) => event.type === "board.post-published"));
  }),
);

it.effect("classifies replay by original publication position", () =>
  Effect.sync(() => {
    const revised = makePost(5, 8);
    const published = makePost(7);
    NodeAssert.deepStrictEqual(
      classifyBoardReplayItems([revised, published], 6).map((item) => item.kind),
      ["revision", "post"],
    );
  }),
);

it.effect("owns resumable replay and completion markers", () =>
  Effect.gen(function* () {
    const revised = makePost(5, 8);
    const published = makePost(7);
    const subscribe = makeBoardSubscription({
      domainEvents: Stream.empty,
      query: makeQuery({
        readAfterSequenceSnapshot: (afterSequence) => {
          NodeAssert.equal(afterSequence, 6);
          return Effect.succeed({
            posts: [revised, published],
            headSequence: 8,
            replayable: true,
          });
        },
      }),
    });

    const items = yield* subscribe({ afterSequence: 6, requestCompletionMarker: true }).pipe(
      Effect.flatMap((stream) => stream.pipe(Stream.take(3), Stream.runCollect)),
      Effect.scoped,
    );
    NodeAssert.deepStrictEqual(
      Array.from(items, (item) => item.kind),
      ["revision", "post", "synchronized"],
    );
  }),
);

it.effect("rebases an unreplayable cursor with a bounded snapshot", () =>
  Effect.gen(function* () {
    const snapshot = page([makePost(20)], 20);
    const subscribe = makeBoardSubscription({
      domainEvents: Stream.empty,
      query: makeQuery({
        getPage: () => Effect.succeed(snapshot),
        readAfterSequenceSnapshot: () =>
          Effect.succeed({ posts: [], headSequence: 20, replayable: false }),
      }),
    });

    const items = yield* subscribe({ afterSequence: 1, requestCompletionMarker: true }).pipe(
      Effect.flatMap((stream) => stream.pipe(Stream.take(2), Stream.runCollect)),
      Effect.scoped,
    );
    NodeAssert.deepStrictEqual(
      Array.from(items, (item) => item.kind),
      ["snapshot", "synchronized"],
    );
    NodeAssert.deepStrictEqual(Array.from(items)[0], { kind: "snapshot", page: snapshot });
  }),
);

it.effect("catches up from a live Board wakeup through the focused owner", () =>
  Effect.gen(function* () {
    const domainEvents = yield* Queue.unbounded<OrchestrationEvent>();
    const published = makePost(11);
    const subscribe = makeBoardSubscription({
      domainEvents: Stream.fromQueue(domainEvents),
      query: makeQuery({
        readAfterSequenceSnapshot: (afterSequence) =>
          Effect.succeed(
            afterSequence === 10
              ? { posts: [published], headSequence: 11, replayable: true }
              : { posts: [], headSequence: 10, replayable: true },
          ),
      }),
    });

    const stream = yield* subscribe({ afterSequence: 10 });
    const result = yield* Effect.forkChild(stream.pipe(Stream.take(1), Stream.runCollect));
    yield* Queue.offer(domainEvents, makePublishedEvent(11));
    const items = yield* Fiber.join(result);

    NodeAssert.deepStrictEqual(Array.from(items), [{ kind: "post", post: published }]);
  }),
);

it.effect("rebases a slow live subscriber beyond the replay window", () =>
  Effect.gen(function* () {
    const domainEvents = yield* Queue.unbounded<OrchestrationEvent>();
    const snapshot = page([makePost(2_000)], 2_000);
    const subscribe = makeBoardSubscription({
      domainEvents: Stream.fromQueue(domainEvents),
      query: makeQuery({
        getPage: () => Effect.succeed(snapshot),
        readAfterSequenceSnapshot: () =>
          Effect.succeed({ posts: [], headSequence: 10, replayable: true }),
      }),
    });

    const stream = yield* subscribe({ afterSequence: 10, requestCompletionMarker: true });
    const result = yield* Effect.forkChild(
      stream.pipe(Stream.drop(1), Stream.take(2), Stream.runCollect),
    );
    yield* Queue.offer(domainEvents, makePublishedEvent(2_000));
    const items = yield* Fiber.join(result);

    NodeAssert.deepStrictEqual(Array.from(items), [
      { kind: "snapshot", page: snapshot },
      { kind: "synchronized" },
    ]);
  }),
);
