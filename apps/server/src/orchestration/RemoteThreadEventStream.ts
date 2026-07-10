import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

export interface RemoteThreadEventStreamInput<Snapshot, Item, SnapshotError, ReplayError> {
  readonly subscribeLive: Effect.Effect<Stream.Stream<OrchestrationEvent>, never, Scope.Scope>;
  readonly loadSnapshot: Effect.Effect<Snapshot, SnapshotError>;
  readonly snapshotSequence: (snapshot: Snapshot) => number;
  readonly readEvents: (
    fromSequenceExclusive: number,
  ) => Stream.Stream<OrchestrationEvent, ReplayError>;
  readonly isRelevant: (event: OrchestrationEvent) => boolean;
  readonly toSnapshotItem: (snapshot: Snapshot) => Item;
  readonly toEventItem: (event: OrchestrationEvent) => Item;
}

/**
 * Subscribes before snapshot loading, then replays persisted events before
 * draining the queued live tail. The sequence accumulator preserves ordering
 * and suppresses replay and live duplicates.
 */
export const makeRemoteThreadEventStream = <Snapshot, Item, SnapshotError, ReplayError>(
  input: RemoteThreadEventStreamInput<Snapshot, Item, SnapshotError, ReplayError>,
): Stream.Stream<Item, SnapshotError | ReplayError> =>
  Stream.scoped(
    Stream.unwrap(
      Effect.gen(function* () {
        const liveEvents = (yield* input.subscribeLive).pipe(Stream.filter(input.isRelevant));
        const snapshot = yield* input.loadSnapshot;
        const snapshotSequence = input.snapshotSequence(snapshot);
        const eventsAfterSnapshot = Stream.concat(
          input.readEvents(snapshotSequence),
          liveEvents,
        ).pipe(
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
