import { EventId, type OrchestrationEvent, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import { makeRemoteThreadEventStream } from "./RemoteThreadEventStream.ts";
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

    const stream = makeRemoteThreadEventStream({
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
