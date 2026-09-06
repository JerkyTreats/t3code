import {
  OrchestrationGetSnapshotError,
  type BoardPost,
  type BoardStreamItem,
  type BoardSubscribeInput,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { isBoardEvent } from "./Event.ts";
import type { BoardQueryShape } from "../orchestration/Services/BoardQuery.ts";

export const BOARD_RESUME_MAX_GAP = 1_000;
export const BOARD_EVENT_BUFFER_CAPACITY = 256;
const BOARD_LIVE_WAKEUP_CAPACITY = 1;

/**
 * Retains bounded Board wakeups independently of upstream's lossless domain bus.
 * Unrelated traffic cannot evict the final Board event. Consumers acquire the
 * subscription before reading a snapshot and recover dropped events from SQL.
 */
export const makeBoardEventHub = Effect.gen(function* () {
  const events = yield* PubSub.sliding<OrchestrationEvent>(BOARD_EVENT_BUFFER_CAPACITY);
  return {
    publish: (event: OrchestrationEvent) =>
      isBoardEvent(event) ? PubSub.publish(events, event).pipe(Effect.asVoid) : Effect.void,
    subscribe: PubSub.subscribe(events).pipe(Effect.map(Stream.fromSubscription)),
  };
});

export interface BoardSubscriptionDependencies {
  readonly domainEvents: Stream.Stream<OrchestrationEvent>;
  readonly query: BoardQueryShape;
}

export function classifyBoardReplayItems(
  posts: ReadonlyArray<BoardPost>,
  afterSequence: number,
): ReadonlyArray<BoardStreamItem> {
  return posts.map((post) => ({
    kind: post.sequence > afterSequence ? "post" : "revision",
    post,
  }));
}

/**
 * Owns Board-specific wakeup coalescing, bounded replay, revision
 * classification, and snapshot rebasing. A transport host only supplies the
 * authenticated input and returns the resulting typed stream.
 */
export const makeBoardSubscription = (dependencies: BoardSubscriptionDependencies) =>
  Effect.fn("BoardSubscription.subscribe")(
    function* (input: BoardSubscribeInput) {
      const liveWakeups = yield* Queue.sliding<number>(BOARD_LIVE_WAKEUP_CAPACITY);
      const liveWakeupStream = dependencies.domainEvents.pipe(
        Stream.filter(
          (event) => event.type === "board.post-published" || event.type === "board.post-revised",
        ),
        Stream.runForEach((event) => Queue.offer(liveWakeups, event.sequence)),
      );
      yield* Effect.forkScoped(liveWakeupStream, { startImmediately: true });

      const synchronized =
        input.requestCompletionMarker === true
          ? Stream.make({ kind: "synchronized" as const })
          : Stream.empty;
      const liveAfterHead = (headSequence: number) => {
        let deliveredThroughSequence = headSequence;
        return Stream.fromQueue(liveWakeups).pipe(
          Stream.mapEffect((latestSequence) =>
            Effect.gen(function* () {
              if (latestSequence <= deliveredThroughSequence) {
                return [];
              }

              const replayGap = latestSequence - deliveredThroughSequence;
              if (replayGap <= BOARD_RESUME_MAX_GAP) {
                const replayAfterSequence = deliveredThroughSequence;
                const replay = yield* dependencies.query.readAfterSequenceSnapshot(
                  replayAfterSequence,
                  BOARD_RESUME_MAX_GAP,
                );
                if (replay.replayable) {
                  deliveredThroughSequence = replay.headSequence;
                  return classifyBoardReplayItems(replay.posts, replayAfterSequence);
                }
              }

              const page = yield* dependencies.query.getPage({});
              deliveredThroughSequence = page.headSequence;
              return [
                { kind: "snapshot" as const, page },
                ...(input.requestCompletionMarker === true
                  ? [{ kind: "synchronized" as const }]
                  : []),
              ] satisfies ReadonlyArray<BoardStreamItem>;
            }),
          ),
          Stream.flatMap((items) => Stream.fromIterable(items)),
          Stream.mapError(
            (cause) =>
              new OrchestrationGetSnapshotError({
                message: "Failed to recover the global Board live stream.",
                cause,
              }),
          ),
        );
      };

      if (input.afterSequence !== undefined) {
        const replay = yield* dependencies.query.readAfterSequenceSnapshot(
          input.afterSequence,
          BOARD_RESUME_MAX_GAP,
        );
        if (replay.replayable) {
          return Stream.concat(
            Stream.fromIterable(classifyBoardReplayItems(replay.posts, input.afterSequence)),
            Stream.concat(synchronized, liveAfterHead(replay.headSequence)),
          );
        }
      }

      const page = yield* dependencies.query.getPage({});
      return Stream.concat(
        Stream.make({ kind: "snapshot" as const, page }),
        Stream.concat(synchronized, liveAfterHead(page.headSequence)),
      );
    },
    Effect.mapError(
      (cause) =>
        new OrchestrationGetSnapshotError({
          message: "Failed to subscribe to the global Board.",
          cause,
        }),
    ),
  );
