import type { AuthClientId, AuthSessionId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";

import * as SessionStore from "./SessionStore.ts";

type DisconnectSignal = Deferred.Deferred<void>;

export const SESSION_REVALIDATION_INTERVAL = "1 second";
export const SESSION_REVALIDATION_TIMEOUT = "1 second";
export const SESSION_REVALIDATION_GRACE = "30 seconds";

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
    // A denial disconnects at once; a stalled or unreadable check only after the grace window.
    const unconfirmedSince = new Map<AuthSessionId, number>();
    const disconnect = (sessionId: AuthSessionId) =>
      Effect.sync(() => unconfirmedSince.delete(sessionId)).pipe(
        Effect.andThen(registry.disconnectSession(sessionId)),
        Effect.asVoid,
      );
    const revalidate = (sessionId: AuthSessionId) =>
      sessions.assertClientAdmission(sessionId).pipe(
        Effect.timeout(SESSION_REVALIDATION_TIMEOUT),
        Effect.matchEffect({
          onSuccess: () => Effect.sync(() => unconfirmedSince.delete(sessionId)),
          onFailure: (error) =>
            Cause.isTimeoutError(error) || error._tag === "SessionCredentialVerificationError"
              ? Clock.currentTimeMillis.pipe(
                  Effect.flatMap((now) => {
                    const since = unconfirmedSince.get(sessionId) ?? now;
                    unconfirmedSince.set(sessionId, since);
                    return now - since >= Duration.toMillis(SESSION_REVALIDATION_GRACE)
                      ? Effect.logWarning("session admission unconfirmed; disconnecting", {
                          sessionId,
                          unconfirmedMs: now - since,
                        }).pipe(Effect.andThen(disconnect(sessionId)))
                      : Effect.void;
                  }),
                )
              : disconnect(sessionId),
        }),
      );
    yield* registry.activeSessionIds.pipe(
      Effect.tap((sessionIds) =>
        Effect.sync(() => {
          const active = new Set(sessionIds);
          for (const sessionId of unconfirmedSince.keys()) {
            if (!active.has(sessionId)) unconfirmedSince.delete(sessionId);
          }
        }),
      ),
      Effect.flatMap((sessionIds) =>
        Effect.forEach(sessionIds, revalidate, { concurrency: 8, discard: true }),
      ),
      Effect.repeat(Schedule.spaced(SESSION_REVALIDATION_INTERVAL)),
      Effect.forkScoped({ startImmediately: true }),
    );
  }),
);
