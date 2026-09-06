import { assert, it } from "@effect/vitest";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

import * as TurnWritePolicy from "./TurnWritePolicy.ts";

const thread = ThreadId.make("thread");
const instance = ProviderInstanceId.make("codex");

it.effect("requires every Plan turn to finish across reversed responses and early terminals", () =>
  Effect.gen(function* () {
    let writable = true;
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      Effect.sync(() => {
        writable = enabled;
      }),
    );
    const first = yield* policy.begin(thread, instance, "plan");
    const second = yield* policy.begin(thread, instance, "plan");
    yield* policy.begin(thread, instance, "default");
    yield* policy.terminal(thread, instance, "second");
    yield* policy.associate(second, "second");
    assert.isFalse(writable);
    yield* policy.associate(first, "first");
    yield* policy.terminal(thread, ProviderInstanceId.make("other"), "first");
    yield* policy.terminal(thread, instance, undefined);
    assert.isFalse(writable);
    yield* policy.terminal(thread, instance, "first");
    assert.isTrue(writable);
  }),
);

it.effect("discards stale admissions on credential replacement", () =>
  Effect.gen(function* () {
    let writable = true;
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      Effect.sync(() => {
        writable = enabled;
      }),
    );
    const old = yield* policy.begin(thread, instance, "plan");
    yield* policy.reset(thread);
    const current = yield* policy.begin(thread, instance, "plan");
    yield* policy.associate(old, "old");
    yield* policy.failed(old);
    yield* policy.terminal(thread, instance, "old");
    assert.isFalse(writable);
    yield* policy.associate(current, "current");
    yield* policy.terminal(thread, instance, "current");
    assert.isTrue(writable);
  }),
);

it.effect("bounds early terminal memory by retaining denial until credential reset", () =>
  Effect.gen(function* () {
    let writable = true;
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      Effect.sync(() => {
        writable = enabled;
      }),
    );
    const pending = yield* policy.begin(thread, instance, "plan");
    for (let index = 0; index < 300; index++) {
      yield* policy.terminal(thread, instance, `turn-${index}`);
    }
    yield* policy.associate(pending, "turn-1");
    yield* policy.begin(thread, instance, "default");
    assert.isFalse(writable);
    yield* policy.reset(thread);
    yield* policy.begin(thread, instance, "default");
    assert.isTrue(writable);
  }),
);

it.effect(
  "serializes capability updates so a delayed restoration cannot overtake Plan denial",
  () =>
    Effect.gen(function* () {
      const restoring = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let writable = true;
      const policy = yield* TurnWritePolicy.make((_, enabled) =>
        Effect.gen(function* () {
          if (enabled) {
            yield* Deferred.succeed(restoring, undefined);
            yield* Deferred.await(release);
          }
          writable = enabled;
        }),
      );
      const defaultAdmission = yield* policy
        .begin(thread, instance, "default")
        .pipe(Effect.forkChild);
      yield* Deferred.await(restoring);
      const planAdmission = yield* policy.begin(thread, instance, "plan").pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(defaultAdmission);
      yield* Fiber.join(planAdmission);
      assert.isFalse(writable);
    }),
);

it.effect("awaits dispatch cancellation and finalizers before credential lifecycle mutation", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const finalized = yield* Deferred.make<void>();
    const releaseFinalizer = yield* Deferred.make<void>();
    const policy = yield* TurnWritePolicy.make(() => Effect.void);
    let replaced = false;
    const pending = yield* policy
      .trackDispatch(
        thread,
        Effect.gen(function* () {
          yield* Deferred.succeed(entered, undefined);
          return yield* Effect.never;
        }).pipe(
          Effect.ensuring(
            Deferred.succeed(finalized, undefined).pipe(
              Effect.andThen(Deferred.await(releaseFinalizer)),
            ),
          ),
        ),
      )
      .pipe(Effect.exit, Effect.forkChild);
    yield* Deferred.await(entered);
    const replacement = yield* policy
      .withCredentialLifecycle(
        thread,
        policy.cancelDispatches(thread).pipe(
          Effect.andThen(
            Effect.sync(() => {
              replaced = true;
            }),
          ),
        ),
      )
      .pipe(Effect.forkChild);
    yield* Deferred.await(finalized);
    assert.isFalse(replaced);
    yield* Deferred.succeed(releaseFinalizer, undefined);
    yield* Fiber.join(replacement);
    yield* Fiber.join(pending);
    assert.isTrue(replaced);
  }),
);

it.effect("drains every admitted thread before a global credential reset", () =>
  Effect.gen(function* () {
    const policy = yield* TurnWritePolicy.make(() => Effect.void);
    const started = [yield* Deferred.make<void>(), yield* Deferred.make<void>()];
    let finalized = 0;
    const fibers = [];
    for (const index of [0, 1]) {
      const fiber = yield* policy
        .trackDispatch(
          ThreadId.make(`thread-${index}`),
          Deferred.succeed(started[index]!, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Effect.sync(() => {
                finalized += 1;
              }),
            ),
          ),
        )
        .pipe(Effect.exit, Effect.forkChild);
      fibers.push(fiber);
      yield* Deferred.await(started[index]!);
    }
    yield* policy.withAllCredentialLifecycles(Effect.sync(() => assert.equal(finalized, 2)));
    for (const fiber of fibers) yield* Fiber.join(fiber);
  }),
);
