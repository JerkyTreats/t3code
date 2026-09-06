import type { ProviderInstanceId, ProviderInteractionMode, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Semaphore from "effect/Semaphore";

import { resolveBoardInteractionPolicy } from "./InteractionPolicy.ts";

const MAX_EARLY_TERMINALS = 256;

interface Session {
  readonly instanceId: ProviderInstanceId;
  readonly pending: Set<object>;
  readonly active: Set<string>;
  readonly earlyTerminals: Set<string>;
  uncertain: boolean;
}

interface Admission {
  readonly threadId: ThreadId;
  readonly session: Session;
  readonly request: object;
}

/**
 * MCP credentials identify sessions, not invoking turns. A Plan admission therefore
 * denies writes for the entire session until its exact turn is terminal. Starts
 * cannot bind requests: providers may emit unrelated synthetic starts while a send
 * is pending. Only the send response supplies that association.
 */
export const make = Effect.fn("BoardTurnWritePolicy.make")(function* (
  setWriteEnabled: (threadId: ThreadId, enabled: boolean) => Effect.Effect<void>,
) {
  const sessions = new Map<ThreadId, Session>();
  const lock = yield* Semaphore.make(1);
  const synchronize = lock.withPermits(1);
  const update = (threadId: ThreadId, session: Session) =>
    setWriteEnabled(
      threadId,
      !session.uncertain && session.pending.size === 0 && session.active.size === 0,
    );
  const clearEarlyTerminals = (session: Session) => {
    if (session.pending.size === 0) session.earlyTerminals.clear();
  };

  interface Dispatches {
    readonly gate: Semaphore.Semaphore;
    readonly fibers: Set<Fiber.Fiber<unknown, unknown>>;
    users: number;
  }
  const dispatches = new Map<ThreadId, Dispatches>();
  const lifecycleGate = yield* Semaphore.make(1);
  const withDispatches = <A, E, R>(
    threadId: ThreadId,
    use: (current: Dispatches) => Effect.Effect<A, E, R>,
  ) =>
    Effect.acquireUseRelease(
      lifecycleGate.withPermits(1)(
        Effect.sync(() => {
          const current = dispatches.get(threadId) ?? {
            gate: Semaphore.makeUnsafe(1),
            fibers: new Set<Fiber.Fiber<unknown, unknown>>(),
            users: 0,
          };
          current.users += 1;
          dispatches.set(threadId, current);
          return current;
        }),
      ),
      use,
      (current) =>
        Effect.sync(() => {
          current.users -= 1;
          if (current.users === 0) dispatches.delete(threadId);
        }),
    );
  // Join a separate cancellation fiber before entering the credential mutation.
  const drain = (current: Dispatches) =>
    Effect.suspend(() =>
      Fiber.interruptAll(Array.from(current.fibers)).pipe(
        Effect.forkChild,
        Effect.flatMap(Fiber.join),
      ),
    );

  return {
    // Register before any asynchronous admission work. Replacement waits for local
    // sends and their finalizers to stop, including attachment reads and adapter
    // lock waits. Cancellation is not proof of remote rejection: failed admission
    // cleanup still retains denial until credentials are actually invalidated.
    trackDispatch: <A, E, R>(threadId: ThreadId, effect: Effect.Effect<A, E, R>) =>
      withDispatches(threadId, (current) =>
        Effect.acquireUseRelease(
          current.gate.withPermits(1)(
            Effect.gen(function* () {
              const fiber = yield* Effect.forkChild(effect);
              current.fibers.add(fiber);
              return fiber;
            }),
          ),
          Fiber.join,
          (fiber) =>
            Fiber.interrupt(fiber).pipe(
              Effect.andThen(Effect.sync(() => void current.fibers.delete(fiber))),
            ),
        ),
      ),
    withCredentialLifecycle: <A, E, R>(threadId: ThreadId, effect: Effect.Effect<A, E, R>) =>
      withDispatches(threadId, (current) => current.gate.withPermits(1)(effect)),
    // Called inside the credential lifecycle gate, after host validation succeeds.
    cancelDispatches: (threadId: ThreadId) =>
      Effect.suspend(() => {
        const current = dispatches.get(threadId);
        return current ? drain(current) : Effect.void;
      }),
    withAllCredentialLifecycles: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      lifecycleGate.withPermits(1)(
        Effect.suspend(() =>
          Array.from(dispatches.values()).reduce(
            (next, current) =>
              current.gate.withPermits(1)(drain(current).pipe(Effect.andThen(next))),
            effect,
          ),
        ),
      ),
    // Replacement/revocation invalidates the old credential. Never restore it as
    // part of a reset; outstanding responses retain the discarded session object.
    reset: (threadId: ThreadId) => synchronize(Effect.sync(() => void sessions.delete(threadId))),
    resetAll: synchronize(Effect.sync(() => sessions.clear())),
    begin: (
      threadId: ThreadId,
      instanceId: ProviderInstanceId,
      mode: ProviderInteractionMode | undefined,
    ) =>
      synchronize(
        Effect.gen(function* () {
          const session = sessions.get(threadId) ?? {
            instanceId,
            pending: new Set<object>(),
            active: new Set<string>(),
            earlyTerminals: new Set<string>(),
            uncertain: false,
          };
          sessions.set(threadId, session);
          // A provider change without credential replacement is not a safe reset.
          if (session.instanceId !== instanceId) session.uncertain = true;
          const admission: Admission = { threadId, session, request: {} };
          if (!resolveBoardInteractionPolicy(mode).boardWriteEnabled) {
            session.pending.add(admission.request);
          }
          yield* update(threadId, session);
          return admission;
        }),
      ),
    associate: (admission: Admission, turnId: string) =>
      synchronize(
        Effect.gen(function* () {
          const { threadId, session, request } = admission;
          if (sessions.get(threadId) !== session || !session.pending.delete(request)) return;
          if (!session.earlyTerminals.has(turnId)) session.active.add(turnId);
          clearEarlyTerminals(session);
          yield* update(threadId, session);
        }),
      ),
    failed: (admission: Admission) =>
      synchronize(
        Effect.gen(function* () {
          const { threadId, session, request } = admission;
          if (sessions.get(threadId) !== session || !session.pending.delete(request)) return;
          // A transport error or interruption does not prove rejection. Without a
          // response ID, even a terminal event cannot identify this admission.
          session.uncertain = true;
          clearEarlyTerminals(session);
          yield* update(threadId, session);
        }),
      ),
    terminal: (threadId: ThreadId, instanceId: ProviderInstanceId, turnId: string | undefined) =>
      synchronize(
        Effect.gen(function* () {
          const session = sessions.get(threadId);
          if (!session || session.instanceId !== instanceId || turnId === undefined) return;
          session.active.delete(turnId);
          if (session.pending.size > 0) {
            if (session.earlyTerminals.size < MAX_EARLY_TERMINALS) {
              session.earlyTerminals.add(turnId);
            } else {
              // Bound event memory without ever evicting evidence into permission.
              session.uncertain = true;
            }
          }
          yield* update(threadId, session);
        }),
      ),
    exited: (threadId: ThreadId, instanceId: ProviderInstanceId) =>
      synchronize(
        Effect.gen(function* () {
          const session = sessions.get(threadId);
          if (!session || session.instanceId !== instanceId) return;
          // Exit events have no session-generation identity and may arrive after a
          // restart. Collapse live admissions to a bounded denial, never use an
          // uncorrelated exit to enable a replacement session's credential.
          session.uncertain ||= session.pending.size > 0 || session.active.size > 0;
          session.pending.clear();
          session.active.clear();
          session.earlyTerminals.clear();
          yield* update(threadId, session);
        }),
      ),
  };
});
