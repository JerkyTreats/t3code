import {
  BoardAuthorId,
  BoardPostId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import { ProjectionBoardPostRepository } from "../../persistence/Services/ProjectionBoardPosts.ts";
import { ProjectionStateRepository } from "../../persistence/Services/ProjectionState.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { encodeBoardPageCursor } from "../board/Cursor.ts";
import { BoardQuery } from "../Services/BoardQuery.ts";
import { BoardQueryCoreLive, BoardQueryLive } from "./BoardQuery.ts";
import { ORCHESTRATION_PROJECTOR_NAMES } from "./ProjectionPipeline.ts";

function makePost(sequence: number) {
  return {
    id: BoardPostId.make(`post-${sequence}`),
    author: {
      kind: "agent" as const,
      id: BoardAuthorId.make("trusted-agent"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    },
    source: {
      projectId: ProjectId.make(sequence % 2 === 0 ? "project-two" : "project-one"),
      threadId: ThreadId.make(sequence % 2 === 0 ? "thread-two" : "thread-one"),
    },
    body: `Message ${sequence}`,
    targets: sequence === 3 ? ["attention-only"] : [],
    sequence,
    createdAt: "2026-08-28T00:00:00.000Z",
    revision: 1,
    updatedSequence: sequence,
    updatedAt: "2026-08-28T00:00:00.000Z",
    lastEditor: {
      kind: "agent" as const,
    },
    lastEditorSource: {
      projectId: ProjectId.make(sequence % 2 === 0 ? "project-two" : "project-one"),
      threadId: ThreadId.make(sequence % 2 === 0 ? "thread-two" : "thread-one"),
    },
  };
}

const TestLayer = BoardQueryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory));

it.layer(TestLayer)("BoardQuery", (it) => {
  it.effect("returns bounded newest and older global pages without target filtering", () =>
    Effect.gen(function* () {
      const query = yield* BoardQuery;
      const posts = yield* ProjectionBoardPostRepository;
      const projectionState = yield* ProjectionStateRepository;
      for (const sequence of [1, 3, 5, 7]) {
        yield* posts.insert(makePost(sequence));
      }
      yield* posts.insert(makePost(11));
      yield* projectionState.upsert({
        projector: ORCHESTRATION_PROJECTOR_NAMES.boardPosts,
        lastAppliedSequence: 9,
        updatedAt: "2026-08-28T00:00:00.000Z",
      });

      const newest = yield* query.getPage({ limit: 2 });
      assert.deepStrictEqual(
        newest.posts.map((post) => post.sequence),
        [5, 7],
      );
      assert.strictEqual(newest.headSequence, 9);
      assert.notStrictEqual(newest.beforeCursor, null);

      const older = yield* query.getPage({
        limit: 2,
        ...(newest.beforeCursor === null ? {} : { beforeCursor: newest.beforeCursor }),
      });
      assert.deepStrictEqual(
        older.posts.map((post) => post.sequence),
        [1, 3],
      );
      assert.deepStrictEqual(older.posts[1]?.targets, ["attention-only"]);

      const replay = yield* query.listAfterSequenceThroughHead({
        afterSequence: 1,
        throughSequence: 7,
      });
      assert.deepStrictEqual(
        replay.map((post) => post.sequence),
        [3, 5, 7],
      );

      const malformed = yield* query.getPage({ limit: 2, beforeCursor: "not-a-cursor" });
      assert.deepStrictEqual(malformed.posts, newest.posts);

      const future = yield* query.getPage({
        limit: 2,
        beforeCursor: encodeBoardPageCursor({
          sequence: 99,
          postId: BoardPostId.make("future"),
        }),
      });
      assert.deepStrictEqual(future.posts, newest.posts);
    }),
  );

  it.effect("preserves historical Collective source rows without a Collective runtime", () =>
    Effect.gen(function* () {
      const query = yield* BoardQuery;
      const posts = yield* ProjectionBoardPostRepository;
      const projectionState = yield* ProjectionStateRepository;
      const historical = {
        ...makePost(10),
        source: {
          kind: "collective-expedition" as const,
          expeditionId: "expedition-legacy",
          residentId: "resident-legacy",
        },
        lastEditorSource: {
          kind: "collective-expedition" as const,
          expeditionId: "expedition-legacy",
          residentId: "resident-legacy",
        },
      };
      yield* posts.insert(historical);
      yield* projectionState.upsert({
        projector: ORCHESTRATION_PROJECTOR_NAMES.boardPosts,
        lastAppliedSequence: 10,
        updatedAt: "2026-08-28T00:00:00.000Z",
      });

      const page = yield* query.getPage({ limit: 1 });
      assert.deepStrictEqual(page.posts, [historical]);
    }),
  );
});

it.effect("captures the projector head before a concurrent page read", () =>
  Effect.gen(function* () {
    const headCaptured = yield* Deferred.make<void>();
    const allowPageRead = yield* Deferred.make<void>();
    const rows = yield* Ref.make([makePost(1)]);
    const repository = ProjectionBoardPostRepository.of({
      insert: () => Effect.void,
      getBySequence: () => Effect.succeed(Option.none()),
      getById: () => Effect.succeed(Option.none()),
      revise: () => Effect.succeed({ _tag: "not-found" }),
      listHistory: () => Effect.succeed([]),
      readHistorySnapshot: () => Effect.succeed(Option.none()),
      readPageSnapshot: (input) =>
        Deferred.succeed(headCaptured, undefined).pipe(
          Effect.andThen(Deferred.await(allowPageRead)),
          Effect.andThen(Ref.get(rows)),
          Effect.map((current) => ({
            posts: current.filter((post) => post.sequence <= 1).slice(0, input.limit),
            headSequence: 1,
          })),
        ),
      readAfterSnapshot: () => Effect.succeed({ posts: [], headSequence: 1, replayable: true }),
      listNewestPage: (input) =>
        Deferred.await(allowPageRead).pipe(
          Effect.andThen(Ref.get(rows)),
          Effect.map((current) => current.filter((post) => post.sequence <= input.throughSequence)),
        ),
      listBeforeCursor: () => Effect.succeed([]),
      listAfterSequenceThroughHead: () => Effect.succeed([]),
    });
    const projectionState = ProjectionStateRepository.of({
      upsert: () => Effect.void,
      upsertMany: () => Effect.void,
      getByProjector: () =>
        Effect.succeed(
          Option.some({
            projector: ORCHESTRATION_PROJECTOR_NAMES.boardPosts,
            lastAppliedSequence: 1,
            updatedAt: "2026-08-28T00:00:00.000Z",
          }),
        ),
      listAll: () => Effect.succeed([]),
      minLastAppliedSequence: () => Effect.succeed(1),
    });
    const layer = BoardQueryCoreLive.pipe(
      Layer.provide(
        Layer.merge(
          Layer.succeed(ProjectionBoardPostRepository, repository),
          Layer.succeed(ProjectionStateRepository, projectionState),
        ),
      ),
    );

    const pageFiber = yield* BoardQuery.pipe(
      Effect.flatMap((query) => query.getPage({})),
      Effect.provide(layer),
      Effect.forkChild,
    );
    yield* Deferred.await(headCaptured);
    yield* Ref.update(rows, (current) => [...current, makePost(2)]);
    yield* Deferred.succeed(allowPageRead, undefined);

    const page = yield* Fiber.join(pageFiber);
    assert.strictEqual(page.headSequence, 1);
    assert.deepStrictEqual(
      page.posts.map((post) => post.sequence),
      [1],
    );
  }),
);

it.layer(TestLayer)("BoardQuery replay", (it) => {
  it.effect("atomically includes intervening publications through the current replay head", () =>
    Effect.gen(function* () {
      const query = yield* BoardQuery;
      const posts = yield* ProjectionBoardPostRepository;
      const projectionState = yield* ProjectionStateRepository;
      const publishedThenRevised = makePost(101);
      const laterPublication = makePost(102);
      const interveningPublication = makePost(150);
      yield* posts.insert(publishedThenRevised);
      yield* posts.insert(laterPublication);
      yield* posts.insert(interveningPublication);
      const revised = yield* posts.revise({
        postId: publishedThenRevised.id,
        previousRevision: 1,
        revision: 2,
        body: "Corrected after another publication",
        targets: publishedThenRevised.targets,
        editor: { kind: "environment-owner" },
        editorSource: null,
        editedAt: "2026-08-28T00:05:00.000Z",
        eventSequence: 200,
      });
      assert.deepStrictEqual(revised, { _tag: "changed" });
      yield* projectionState.upsert({
        projector: ORCHESTRATION_PROJECTOR_NAMES.boardPosts,
        lastAppliedSequence: 200,
        updatedAt: "2026-08-28T00:05:00.000Z",
      });

      const catchUp = yield* query.readAfterSequenceSnapshot(100, 1_000);
      assert.strictEqual(catchUp.headSequence, 200);
      assert.deepStrictEqual(
        catchUp.posts.map((post) => [post.id, post.revision, post.updatedSequence]),
        [
          [laterPublication.id, 1, 102],
          [interveningPublication.id, 1, 150],
          [publishedThenRevised.id, 2, 200],
        ],
      );
      const bounded = yield* query.readAfterSequenceSnapshot(100, 50);
      assert.deepStrictEqual(bounded, {
        posts: [],
        headSequence: 200,
        replayable: false,
      });
    }),
  );
});
