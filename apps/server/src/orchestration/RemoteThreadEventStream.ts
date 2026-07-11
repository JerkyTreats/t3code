import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

export interface RemoteSnapshotEventStreamInput<
  Snapshot,
  SnapshotItem,
  EventItem,
  SnapshotError,
  ReplayError,
> {
  readonly subscribeLive: Effect.Effect<Stream.Stream<OrchestrationEvent>, never, Scope.Scope>;
  readonly loadSnapshot: Effect.Effect<Snapshot, SnapshotError>;
  readonly snapshotSequence: (snapshot: Snapshot) => number;
  readonly readEvents: (
    fromSequenceExclusive: number,
  ) => Stream.Stream<OrchestrationEvent, ReplayError>;
  readonly isRelevant: (event: OrchestrationEvent) => boolean;
  readonly toSnapshotItem: (snapshot: Snapshot) => SnapshotItem;
  readonly toEventItem: (event: OrchestrationEvent) => EventItem;
}

// Bound telemetry values even if a stale cursor causes an unexpectedly large replay.
const REPLAY_EVENT_COUNT_LIMIT = 10_000;

/**
 * Subscribes before snapshot loading, then replays persisted events before
 * draining the queued live tail. The sequence accumulator preserves ordering
 * and suppresses replay and live duplicates.
 */
export const makeRemoteSnapshotEventStream = <
  Snapshot,
  SnapshotItem,
  EventItem,
  SnapshotError,
  ReplayError,
>(
  input: RemoteSnapshotEventStreamInput<
    Snapshot,
    SnapshotItem,
    EventItem,
    SnapshotError,
    ReplayError
  >,
): Stream.Stream<SnapshotItem | EventItem, SnapshotError | ReplayError> =>
  Stream.scoped(
    Stream.unwrap(
      Effect.gen(function* () {
        const liveEvents = (yield* input.subscribeLive).pipe(Stream.filter(input.isRelevant));
        const snapshot = yield* input.loadSnapshot;
        const snapshotSequence = input.snapshotSequence(snapshot);
        let replayEventCount = 0;
        let replayEventCountCapped = false;
        const replayEvents = input.readEvents(snapshotSequence).pipe(
          Stream.mapArray((events) => {
            const remainingCount = REPLAY_EVENT_COUNT_LIMIT - replayEventCount;
            replayEventCountCapped ||= events.length > remainingCount;
            replayEventCount += Math.min(events.length, remainingCount);
            return events;
          }),
          Stream.onExit(() =>
            Effect.annotateCurrentSpan({
              "orchestration.replay.event_count": replayEventCount,
              "orchestration.replay.event_count_capped": replayEventCountCapped,
            }),
          ),
        );
        const eventsAfterSnapshot = Stream.concat(replayEvents, liveEvents).pipe(
          Stream.filter((event) => input.isRelevant(event) && event.sequence > snapshotSequence),
          Stream.mapAccum<number, OrchestrationEvent, OrchestrationEvent>(
            () => snapshotSequence,
            (lastSequence, event) =>
              event.sequence > lastSequence ? [event.sequence, [event]] : [lastSequence, []],
          ),
          Stream.map(input.toEventItem),
        );

        return Stream.concat(Stream.make(input.toSnapshotItem(snapshot)), eventsAfterSnapshot);
      }),
    ),
  );

export const makeRemoteThreadEventStream = makeRemoteSnapshotEventStream;
export type RemoteThreadEventStreamInput<
  Snapshot,
  SnapshotItem,
  EventItem,
  SnapshotError,
  ReplayError,
> = RemoteSnapshotEventStreamInput<Snapshot, SnapshotItem, EventItem, SnapshotError, ReplayError>;
