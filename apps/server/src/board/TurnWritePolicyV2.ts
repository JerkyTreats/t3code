import type {
  OrchestrationV2Run,
  ProviderInteractionMode,
  ProviderInstanceId,
  ProviderSessionId,
  ProviderTurnId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";

import { McpSessionRegistry } from "../mcp/McpSessionRegistry.ts";
import * as TurnWritePolicy from "./TurnWritePolicy.ts";

const terminalStatuses = new Set<OrchestrationV2Run["status"]>([
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);

/** Admitted Plan intent outlives queueing, provider attempts and credential rotation. */
export const make = Effect.fn("BoardTurnWritePolicyV2.make")(function* (
  setWriteEnabled: (threadId: ThreadId, enabled: boolean) => Effect.Effect<void>,
) {
  const turns = yield* TurnWritePolicy.make(setWriteEnabled);
  const transitions = yield* Semaphore.make(1);
  // A cancellation cannot expose a recorded run before its credential denial is ready.
  const synchronize = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    transitions.withPermits(1)(Effect.uninterruptible(effect));
  const runs = new Map<
    OrchestrationV2Run["id"],
    {
      readonly run: OrchestrationV2Run;
      readonly mode: ProviderInteractionMode;
    }
  >();
  const requests = new Map<
    string,
    {
      threadId: ThreadId;
      instanceId: ProviderInstanceId;
      providerSessionId: ProviderSessionId;
      providerTurnId: ProviderTurnId;
    }
  >();
  const proposals = new Map<OrchestrationV2Run["id"], number>();
  const runKey = (run: OrchestrationV2Run) => `run:${run.id}`;
  const admit = (run: OrchestrationV2Run, mode: ProviderInteractionMode) =>
    turns
      .begin(run.threadId, run.providerInstanceId, mode)
      .pipe(Effect.flatMap((admission) => turns.associate(admission, runKey(run))));
  return {
    ...turns,
    beginRunProposal: (runId: OrchestrationV2Run["id"]) =>
      synchronize(
        Effect.sync(() => {
          proposals.set(runId, (proposals.get(runId) ?? 0) + 1);
        }),
      ),
    endRunProposal: (runId: OrchestrationV2Run["id"]) =>
      synchronize(
        Effect.sync(() => {
          const remaining = (proposals.get(runId) ?? 1) - 1;
          if (remaining === 0) proposals.delete(runId);
          else proposals.set(runId, remaining);
        }),
      ),
    registerRequest: (input: {
      threadId: ThreadId;
      instanceId: ProviderInstanceId;
      requestId: RuntimeRequestId;
      providerSessionId: ProviderSessionId;
      providerTurnId: ProviderTurnId;
    }) =>
      Effect.sync(() => {
        const key = `request:${input.threadId}:${input.requestId}`;
        requests.set(key, input);
        return key;
      }),
    terminalRequests: (providerSessionId: ProviderSessionId, providerTurnId: ProviderTurnId) =>
      Effect.gen(function* () {
        for (const [key, request] of requests) {
          if (
            request.providerSessionId !== providerSessionId ||
            request.providerTurnId !== providerTurnId
          )
            continue;
          requests.delete(key);
          yield* turns.terminal(request.threadId, request.instanceId, key);
        }
      }),
    // Call before a nonterminal event commits, and after a terminal event commits.
    observeRun: (run: OrchestrationV2Run, mode: ProviderInteractionMode) =>
      synchronize(
        Effect.gen(function* () {
          if (terminalStatuses.has(run.status)) {
            const recorded = runs.get(run.id);
            if (!recorded) return false;
            runs.delete(run.id);
            yield* turns.terminal(run.threadId, recorded.run.providerInstanceId, runKey(run));
            return false;
          } else if (!runs.has(run.id)) {
            runs.set(run.id, { run, mode });
            yield* admit(run, mode);
            return true;
          }
          return false;
        }),
      ),
    // Only a definite precommit rejection can release a planned run admission.
    forgetRejectedRun: (runId: OrchestrationV2Run["id"]) =>
      synchronize(
        Effect.gen(function* () {
          const recorded = runs.get(runId);
          if (!recorded) return;
          runs.delete(runId);
          yield* turns.terminal(
            recorded.run.threadId,
            recorded.run.providerInstanceId,
            runKey(recorded.run),
          );
        }),
      ),
    // The old credential has been revoked. Rebuild outstanding run denial before
    // a newly issued credential can be attached to any native provider process.
    credentialChanged: <E = never, R = never>(
      threadId: ThreadId,
      loadDurableRuns?: Effect.Effect<
        ReadonlyArray<{
          readonly run: OrchestrationV2Run;
          readonly mode: ProviderInteractionMode;
        }>,
        E,
        R
      >,
    ) =>
      synchronize(
        Effect.gen(function* () {
          if (loadDurableRuns) {
            // Hold the run lock across the projection read: a concurrent commit
            // cannot finish its proposal between the snapshot and this rebuild.
            const durable = yield* loadDurableRuns;
            const persisted = new Set(durable.map(({ run }) => run.id));
            for (const [runId, recorded] of runs) {
              if (
                recorded.run.threadId === threadId &&
                !persisted.has(runId) &&
                (proposals.get(runId) ?? 0) === 0
              )
                runs.delete(runId);
            }
            for (const admission of durable) {
              if (terminalStatuses.has(admission.run.status)) runs.delete(admission.run.id);
              else runs.set(admission.run.id, admission);
            }
          }
          yield* turns.reset(threadId);
          for (const [key, request] of requests)
            if (request.threadId === threadId) requests.delete(key);
          for (const { run, mode } of runs.values()) {
            if (run.threadId === threadId) yield* admit(run, mode);
          }
        }),
      ),
  };
});

export class BoardTurnWritePolicyV2 extends Context.Service<
  BoardTurnWritePolicyV2,
  Effect.Success<ReturnType<typeof make>>
>()("t3/board/TurnWritePolicyV2/BoardTurnWritePolicyV2") {}

export const layer = Layer.effect(
  BoardTurnWritePolicyV2,
  Effect.gen(function* () {
    const registry = yield* McpSessionRegistry;
    return yield* make((threadId, enabled) => registry.setBoardWriteEnabled(threadId, enabled));
  }),
);
