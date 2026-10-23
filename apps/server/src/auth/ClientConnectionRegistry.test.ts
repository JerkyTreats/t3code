import { AuthSessionId, type AuthClientId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ClientConnectionRegistry from "./ClientConnectionRegistry.ts";
import * as SessionStore from "./SessionStore.ts";

it.effect("disconnects every guarded connection for the exact client only", () =>
  Effect.gen(function* () {
    const registry = yield* ClientConnectionRegistry.make;
    const targetClientId = "target-client" as AuthClientId;
    const otherClientId = "other-client" as AuthClientId;
    const targetStarted = yield* Deferred.make<void>();
    const secondTargetStarted = yield* Deferred.make<void>();
    const otherStarted = yield* Deferred.make<void>();

    const targetFiber = yield* Effect.forkChild(
      registry.guard(
        targetClientId,
        Deferred.succeed(targetStarted, undefined).pipe(Effect.andThen(Effect.never)),
      ),
    );
    const secondTargetFiber = yield* Effect.forkChild(
      registry.guard(
        targetClientId,
        Deferred.succeed(secondTargetStarted, undefined).pipe(Effect.andThen(Effect.never)),
      ),
    );
    const otherFiber = yield* Effect.forkChild(
      registry.guard(
        otherClientId,
        Deferred.succeed(otherStarted, undefined).pipe(Effect.andThen(Effect.never)),
      ),
    );

    yield* Deferred.await(targetStarted);
    yield* Deferred.await(secondTargetStarted);
    yield* Deferred.await(otherStarted);
    const disconnected = yield* registry.disconnect(targetClientId);
    const targetExit = yield* Fiber.await(targetFiber);
    const secondTargetExit = yield* Fiber.await(secondTargetFiber);

    expect(disconnected).toBe(2);
    expect(targetExit._tag).toBe("Failure");
    expect(secondTargetExit._tag).toBe("Failure");
    if (targetExit._tag === "Failure") {
      expect(Cause.hasInterruptsOnly(targetExit.cause)).toBe(true);
    }
    if (secondTargetExit._tag === "Failure") {
      expect(Cause.hasInterruptsOnly(secondTargetExit.cause)).toBe(true);
    }
    expect(otherFiber.pollUnsafe()).toBeUndefined();
    yield* Fiber.interrupt(otherFiber);
  }).pipe(Effect.provide(ClientConnectionRegistry.layer)),
);

it.effect("shares persisted checks per session and closes failed or stalled admissions", () =>
  Effect.gen(function* () {
    const registry = yield* ClientConnectionRegistry.make;
    const failed = AuthSessionId.make("failed-session");
    const stalled = AuthSessionId.make("stalled-session");
    const valid = AuthSessionId.make("valid-session");
    const checks: AuthSessionId[] = [];
    yield* Layer.build(
      ClientConnectionRegistry.sessionRevocationLayer.pipe(
        Layer.provide(Layer.succeed(ClientConnectionRegistry.ClientConnectionRegistry, registry)),
        Layer.provide(
          Layer.mock(SessionStore.SessionStore)({
            cookieName: "test-session",
            legacyCookieName: undefined,
            streamChanges: Stream.never,
            assertClientAdmission: (sessionId) =>
              Effect.suspend(() => {
                checks.push(sessionId);
                if (sessionId === stalled) return Effect.never;
                if (sessionId === failed)
                  return Effect.fail(new SessionStore.UnknownSessionTokenError({ sessionId }));
                return Effect.void;
              }),
          }),
        ),
      ),
    );
    const fibers = [];
    for (const sessionId of [failed, failed, stalled, valid]) {
      const started = yield* Deferred.make<void>();
      fibers.push(
        yield* registry
          .guardSession(
            sessionId,
            Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
          )
          .pipe(Effect.forkChild),
      );
      yield* Deferred.await(started);
    }
    yield* TestClock.adjust(ClientConnectionRegistry.SESSION_REVALIDATION_INTERVAL);
    expect(checks.filter((id) => id === failed)).toHaveLength(1);
    yield* Fiber.await(fibers[0]!);
    yield* Fiber.await(fibers[1]!);
    expect(fibers[2]!.pollUnsafe()).toBeUndefined();
    yield* TestClock.adjust(ClientConnectionRegistry.SESSION_REVALIDATION_TIMEOUT);
    yield* Fiber.await(fibers[2]!);
    expect(fibers[3]!.pollUnsafe()).toBeUndefined();
    expect(yield* registry.activeSessionIds).toEqual([valid]);
    yield* Fiber.interrupt(fibers[3]!);
    expect(yield* registry.activeSessionIds).toEqual([]);
  }),
);
