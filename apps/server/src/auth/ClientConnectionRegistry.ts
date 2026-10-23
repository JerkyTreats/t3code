import type { AuthClientId, AuthSessionId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

import * as SessionStore from "./SessionStore.ts";

type DisconnectSignal = Deferred.Deferred<void>;

export const SESSION_REVALIDATION_INTERVAL = "1 second";
export const SESSION_REVALIDATION_TIMEOUT = "1 second";

export class ClientConnectionRegistry extends Context.Service<
  ClientConnectionRegistry,
  {
    readonly guard: <A, E, R>(
      clientId: AuthClientId,
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>;
    readonly disconnect: (clientId: AuthClientId) => Effect.Effect<number>;
    readonly guardSession: <A, E, R>(
      sessionId: AuthSessionId,
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>;
    readonly disconnectSession: (sessionId: AuthSessionId) => Effect.Effect<number>;
    readonly activeSessionIds: Effect.Effect<ReadonlyArray<AuthSessionId>>;
  }
>()("t3/auth/ClientConnectionRegistry") {}

export const make = Effect.gen(function* () {
  const connections = yield* Ref.make(new Map<AuthClientId, ReadonlySet<DisconnectSignal>>());
  const sessionConnections = yield* Ref.make(
    new Map<AuthSessionId, ReadonlySet<DisconnectSignal>>(),
  );

  const makeGuard =
    <Id>(registry: Ref.Ref<Map<Id, ReadonlySet<DisconnectSignal>>>) =>
    <A, E, R>(id: Id, effect: Effect.Effect<A, E, R>) =>
      Effect.acquireUseRelease(
        Effect.gen(function* () {
          const signal = yield* Deferred.make<void>();
          yield* Ref.update(registry, (current) => {
            const next = new Map(current);
            const signals = new Set(next.get(id) ?? []);
            signals.add(signal);
            next.set(id, signals);
            return next;
          });
          return signal;
        }),
        (signal) => {
          const interrupted: Effect.Effect<never> = Deferred.await(signal).pipe(
            Effect.andThen(Effect.interrupt),
          );
          return Effect.raceFirst(effect, interrupted);
        },
        (signal) =>
          Ref.update(registry, (current) => {
            const next = new Map(current);
            const signals = new Set(next.get(id) ?? []);
            signals.delete(signal);
            if (signals.size === 0) next.delete(id);
            else next.set(id, signals);
            return next;
          }),
      );

  const makeDisconnect =
    <Id>(registry: Ref.Ref<Map<Id, ReadonlySet<DisconnectSignal>>>) =>
    (id: Id) =>
      Ref.modify(registry, (current) => {
        const next = new Map(current);
        const signals = Array.from(next.get(id) ?? []);
        next.delete(id);
        return [signals, next] as const;
      }).pipe(
        Effect.flatMap((signals) =>
          Effect.forEach(signals, (signal) => Deferred.succeed(signal, undefined), {
            concurrency: "unbounded",
            discard: true,
          }).pipe(Effect.as(signals.length)),
        ),
      );

  const guard: ClientConnectionRegistry["Service"]["guard"] = makeGuard(connections);
  const disconnect: ClientConnectionRegistry["Service"]["disconnect"] = makeDisconnect(connections);

  return ClientConnectionRegistry.of({
    guard,
    disconnect,
    guardSession: makeGuard(sessionConnections),
    disconnectSession: makeDisconnect(sessionConnections),
    activeSessionIds: Ref.get(sessionConnections).pipe(
      Effect.map((current) => [...current.keys()]),
    ),
  });
});

export const layer = Layer.effect(ClientConnectionRegistry, make);

export const sessionRevocationLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* ClientConnectionRegistry;
    const sessions = yield* SessionStore.SessionStore;
    yield* Stream.runForEach(sessions.streamChanges, (change) =>
      change.type === "clientRemoved"
        ? registry.disconnectSession(change.sessionId).pipe(Effect.asVoid)
        : Effect.void,
    ).pipe(Effect.forkScoped({ startImmediately: true }), Effect.asVoid);
    // CLI runtimes have independent PubSubs. One bounded watcher observes their persisted changes.
    yield* registry.activeSessionIds.pipe(
      Effect.flatMap((sessionIds) =>
        Effect.forEach(
          sessionIds,
          (sessionId) =>
            sessions.assertClientAdmission(sessionId).pipe(
              Effect.timeout(SESSION_REVALIDATION_TIMEOUT),
              Effect.catch(() => registry.disconnectSession(sessionId).pipe(Effect.asVoid)),
            ),
          { concurrency: 8, discard: true },
        ),
      ),
      Effect.repeat(Schedule.spaced(SESSION_REVALIDATION_INTERVAL)),
      Effect.forkScoped({ startImmediately: true }),
    );
  }),
);
