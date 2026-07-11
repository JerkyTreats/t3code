import { EventId, type OrchestrationEvent, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as Tracer from "effect/Tracer";

import { makeRemoteSnapshotEventStream } from "./RemoteThreadEventStream.ts";
import { isThreadDetailEvent } from "./ThreadDetailEvents.ts";

const threadId = ThreadId.make("thread-remote-replay");

const makeDeletedEvent = (
  sequence: number,
): Extract<OrchestrationEvent, { type: "thread.deleted" }> => ({
  sequence,
  eventId: EventId.make(`event-thread-deleted-${sequence}`),
  aggregateKind: "thread",
  aggregateId: threadId,
  occurredAt: `2026-01-01T00:00:0${sequence}.000Z`,
  commandId: null,
  causationEventId: null,
  correlationId: null,
  metadata: {},
  type: "thread.deleted",
  payload: {
    threadId,
    deletedAt: `2026-01-01T00:00:0${sequence}.000Z`,
  },
});

function makeArchiveEvent(
  type: "thread.archived",
  sequence: number,
): Extract<OrchestrationEvent, { type: "thread.archived" }>;
function makeArchiveEvent(
  type: "thread.unarchived",
  sequence: number,
): Extract<OrchestrationEvent, { type: "thread.unarchived" }>;
function makeArchiveEvent(
  type: "thread.archived" | "thread.unarchived",
  sequence: number,
):
  | Extract<OrchestrationEvent, { type: "thread.archived" }>
  | Extract<OrchestrationEvent, { type: "thread.unarchived" }> {
  const base = {
    sequence,
    eventId: EventId.make(`event-thread-${type}-${sequence}`),
    aggregateKind: "thread" as const,
    aggregateId: threadId,
    occurredAt: `2026-01-01T00:00:0${sequence}.000Z`,
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
  };
  return type === "thread.archived"
    ? {
        ...base,
        type,
        payload: {
          threadId,
          archivedAt: base.occurredAt,
          updatedAt: base.occurredAt,
        },
      }
    : {
        ...base,
        type,
        payload: { threadId, updatedAt: base.occurredAt },
      };
}

const assertTransitionWindow = (version: "v1" | "v2") =>
  Effect.gen(function* () {
    const snapshotSequence = 3;
    const replayedEvent = makeDeletedEvent(4);
    const transitionEvent = makeDeletedEvent(5);
    const liveEvents = yield* PubSub.unbounded<OrchestrationEvent>();
    const replayCursors: number[] = [];
    const snapshotSubscriptionCounts: number[] = [];
    let subscriptionsAcquired = 0;
    let subscriptionsReleased = 0;
    let threadDeleted = false;

    const stream = makeRemoteSnapshotEventStream({
      subscribeLive: Effect.acquireRelease(
        PubSub.subscribe(liveEvents).pipe(
          Effect.map((queue) => {
            subscriptionsAcquired += 1;
            return Stream.fromEffectRepeat(PubSub.take(queue));
          }),
        ),
        () =>
          Effect.sync(() => {
            subscriptionsReleased += 1;
          }),
      ),
      loadSnapshot: Effect.gen(function* () {
        snapshotSubscriptionCounts.push(subscriptionsAcquired);
        const snapshot = { snapshotSequence, version, threadDeleted };
        threadDeleted = true;
        yield* PubSub.publish(liveEvents, replayedEvent);
        yield* PubSub.publish(liveEvents, transitionEvent);
        return snapshot;
      }),
      snapshotSequence: (snapshot) => snapshot.snapshotSequence,
      readEvents: (fromSequenceExclusive) => {
        replayCursors.push(fromSequenceExclusive);
        return Stream.make(replayedEvent);
      },
      isRelevant: (event) => event.aggregateId === threadId && isThreadDetailEvent(event),
      toSnapshotItem: (snapshot) => ({
        kind: "snapshot" as const,
        version: snapshot.version,
        threadDeleted: snapshot.threadDeleted,
      }),
      toEventItem: (event) => ({ kind: "event" as const, sequence: event.sequence }),
    });
    const items = Array.from(yield* Stream.runCollect(Stream.take(stream, 3)));

    assert.deepEqual(snapshotSubscriptionCounts, [1]);
    assert.deepEqual(replayCursors, [snapshotSequence]);
    assert.equal(subscriptionsReleased, 1);
    assert.deepEqual(items, [
      { kind: "snapshot", version, threadDeleted: false },
      { kind: "event", sequence: 4 },
      { kind: "event", sequence: 5 },
    ]);
  });

it.effect("replays deletion injected after the atomic v1 snapshot", () =>
  assertTransitionWindow("v1"),
);

it.effect("replays deletion injected after the atomic v2 snapshot", () =>
  assertTransitionWindow("v2"),
);

it.effect("deduplicates replay and queued live overlap by sequence", () =>
  Effect.gen(function* () {
    const replayedEvent = makeDeletedEvent(4);
    const nextLiveEvent = makeDeletedEvent(5);
    const liveEvents = yield* PubSub.unbounded<OrchestrationEvent>();
    const stream = makeRemoteSnapshotEventStream({
      subscribeLive: PubSub.subscribe(liveEvents).pipe(
        Effect.map((queue) => Stream.fromEffectRepeat(PubSub.take(queue))),
      ),
      loadSnapshot: Effect.gen(function* () {
        yield* PubSub.publish(liveEvents, replayedEvent);
        yield* PubSub.publish(liveEvents, nextLiveEvent);
        return { snapshotSequence: 3 };
      }),
      snapshotSequence: (snapshot) => snapshot.snapshotSequence,
      readEvents: () => Stream.make(replayedEvent),
      isRelevant: (event) => event.aggregateId === threadId,
      toSnapshotItem: () => ({ kind: "snapshot" as const }),
      toEventItem: (event) => ({ kind: "event" as const, sequence: event.sequence }),
    });

    assert.deepEqual(Array.from(yield* Stream.runCollect(Stream.take(stream, 3))), [
      { kind: "snapshot" },
      { kind: "event", sequence: 4 },
      { kind: "event", sequence: 5 },
    ]);
  }),
);

it.effect("records bounded replay counts without payload data", () =>
  Effect.gen(function* () {
    const completedSpans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options);
        const end = span.end.bind(span);
        span.end = (endTime, exit) => {
          end(endTime, exit);
          completedSpans.push(span);
        };
        return span;
      },
    });
    const sensitiveValue = "sensitive-prompt-fragment";
    const stream = makeRemoteSnapshotEventStream({
      subscribeLive: Effect.succeed(Stream.empty),
      loadSnapshot: Effect.succeed({ snapshotSequence: 0 }),
      snapshotSequence: (snapshot) => snapshot.snapshotSequence,
      readEvents: () =>
        Stream.range(1, 10_001).pipe(
          Stream.map((sequence) => ({
            ...makeDeletedEvent(sequence),
            metadata: sequence === 1 ? { adapterKey: sensitiveValue } : {},
          })),
        ),
      isRelevant: () => true,
      toSnapshotItem: () => ({ kind: "snapshot" as const }),
      toEventItem: (event) => ({ kind: "event" as const, sequence: event.sequence }),
    });

    yield* Stream.runDrain(stream).pipe(
      Effect.withSpan("remote-snapshot-replay-measurement"),
      Effect.withTracer(tracer),
    );

    const span = completedSpans.find(
      (candidate) => candidate.name === "remote-snapshot-replay-measurement",
    );
    assert.isDefined(span);
    assert.equal(span.attributes.get("orchestration.replay.event_count"), 10_000);
    assert.equal(span.attributes.get("orchestration.replay.event_count_capped"), true);
    assert.equal(Array.from(span.attributes.values()).includes(sensitiveValue), false);
  }),
);

const assertArchiveTransitions = (version: "v1" | "v2") =>
  Effect.gen(function* () {
    const archived = makeArchiveEvent("thread.archived", 1);
    const unarchived = makeArchiveEvent("thread.unarchived", 2);
    const liveEvents = yield* PubSub.unbounded<OrchestrationEvent>();
    const stream = makeRemoteSnapshotEventStream({
      subscribeLive: PubSub.subscribe(liveEvents).pipe(
        Effect.map((queue) => Stream.fromEffectRepeat(PubSub.take(queue))),
      ),
      loadSnapshot: Effect.succeed({ snapshotSequence: 0, version }),
      snapshotSequence: (snapshot) => snapshot.snapshotSequence,
      readEvents: () => Stream.fromIterable([archived, unarchived]),
      isRelevant: (event) => event.aggregateId === threadId && isThreadDetailEvent(event),
      toSnapshotItem: (snapshot) => ({ kind: "snapshot" as const, version: snapshot.version }),
      toEventItem: (event) => ({ kind: "event" as const, type: event.type }),
    });

    assert.deepEqual(Array.from(yield* Stream.runCollect(Stream.take(stream, 3))), [
      { kind: "snapshot", version },
      { kind: "event", type: "thread.archived" },
      { kind: "event", type: "thread.unarchived" },
    ]);
  });

it.effect("delivers archive transitions in the v1 detail stream", () =>
  assertArchiveTransitions("v1"),
);

it.effect("delivers archive transitions in the v2 detail stream", () =>
  assertArchiveTransitions("v2"),
);
