import type {
  OrchestrationV2DomainEvent,
  OrchestrationV2StoredEvent,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { EventSinkV2, EventSinkWriteError } from "../orchestration-v2/EventSink.ts";
import { ProjectionStoreV2 } from "../orchestration-v2/ProjectionStore.ts";
import { BoardTurnWritePolicyV2 } from "./TurnWritePolicyV2.ts";

const terminalStatuses = new Set([
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);

/** Admit Plan work before storage can wake a provider, then release only committed terminal work. */
export const layer = Layer.effect(
  EventSinkV2,
  Effect.gen(function* () {
    const sink = yield* EventSinkV2;
    const projections = yield* ProjectionStoreV2;
    const policy = yield* BoardTurnWritePolicyV2;
    const proposals = new Map<RunId, number>();

    const protect = <A>(
      events: ReadonlyArray<OrchestrationV2DomainEvent>,
      write: Effect.Effect<A, import("../orchestration-v2/EventSink.ts").EventSinkV2Error>,
      committedEvents: (result: A) => ReadonlyArray<OrchestrationV2StoredEvent>,
    ) =>
      Effect.suspend(() => {
        const proposed = new Set<RunId>();
        return Effect.gen(function* () {
          const pending: Array<Effect.Success<ReturnType<typeof policy.begin>>> = [];
          const touched = new Map<RunId, ThreadId>();
          for (const event of events) {
            if (
              (event.type !== "run.created" && event.type !== "run.updated") ||
              terminalStatuses.has(event.payload.status)
            )
              continue;
            const run = event.payload;
            if (!proposed.has(run.id)) {
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  yield* policy.beginRunProposal(run.id);
                  proposed.add(run.id);
                  proposals.set(run.id, (proposals.get(run.id) ?? 0) + 1);
                }),
              );
            }
            const mode =
              run.interactionMode ?? (yield* projections.getThread(run.threadId)).interactionMode;
            // Each proposal keeps its own pending admission. A rejected duplicate
            // cannot clear another proposal, and every writer awaits capability denial.
            pending.push(yield* policy.begin(run.threadId, run.providerInstanceId, mode));
            yield* policy.observeRun(run, mode);
            touched.set(run.id, run.threadId);
          }
          // Failed or interrupted writes may have committed. Keep their outcome
          // uncertain until the credential is revoked rather than reopening writes.
          const result = yield* write.pipe(
            Effect.onError(() =>
              Effect.forEach(pending, (admission) => policy.failed(admission), { discard: true }),
            ),
          );
          for (const { event } of committedEvents(result)) {
            if (event.type === "run.created" || event.type === "run.updated") {
              touched.set(event.payload.id, event.payload.threadId);
            }
          }
          for (const [runId, threadId] of touched) {
            // Read the current committed state: another write can finish between
            // this write's publication and return. Never replay stale admission state.
            const records = yield* projections.getThreadRecords(threadId, ["runs"], {
              runIds: [runId],
            });
            const current = records.runs.find((run) => run.id === runId);
            if (current === undefined) {
              // Another proposal can still commit this same identity. Do not
              // record a terminal tombstone while that proposal remains pending.
              if ((proposals.get(runId) ?? 0) <= (proposed.has(runId) ? 1 : 0)) {
                yield* policy.forgetRejectedRun(runId);
              }
            } else {
              const mode =
                current.interactionMode ?? (yield* projections.getThread(threadId)).interactionMode;
              yield* policy.observeRun(current, mode);
            }
          }
          for (const admission of pending) yield* policy.accepted(admission);
          return result;
        }).pipe(
          Effect.mapError((cause) => new EventSinkWriteError({ eventCount: events.length, cause })),
          Effect.ensuring(
            Effect.gen(function* () {
              for (const runId of proposed) {
                yield* policy.endRunProposal(runId);
                const remaining = (proposals.get(runId) ?? 1) - 1;
                if (remaining === 0) proposals.delete(runId);
                else proposals.set(runId, remaining);
              }
            }),
          ),
        );
      });

    return EventSinkV2.of({
      ...sink,
      write: (input) => protect(input.events, sink.write(input), (events) => events),
      writeWithEffects: (input) =>
        protect(input.events, sink.writeWithEffects(input), (events) => events),
      writeIfRunCurrent: (input) =>
        protect(input.events, sink.writeIfRunCurrent(input), (result) => result.storedEvents),
      writeIfProviderThreadOwner: (input) =>
        protect(
          input.events,
          sink.writeIfProviderThreadOwner(input),
          (result) => result.storedEvents,
        ),
      commitCommand: (input) =>
        protect(input.events, sink.commitCommand(input), (result) => result.storedEvents),
    });
  }),
);
