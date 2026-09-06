import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as DesktopLauncherRuntime from "../../app/DesktopLauncherRuntime.ts";
import { completeLauncherActivation, takeLauncherActivation } from "./launcherActivation.ts";

const activation = {
  activationId: "12345678-1234-4234-8234-1234567890ab",
  contractVersion: 1,
  workspace: "/home/example/exact-workspace",
  action: "submit",
  prompt: "private prompt sentinel",
} as const;

function makeRuntime(): DesktopLauncherRuntime.DesktopLauncherRuntime["Service"] {
  let taken = false;
  return DesktopLauncherRuntime.DesktopLauncherRuntime.of({
    markBackendReady: Effect.void,
    markBackendNotReady: Effect.void,
    markRendererReady: Effect.void,
    markRendererNotReady: Effect.void,
    acceptSingleInstanceHandoff: () => Effect.succeed(false),
    takeLauncherActivation: Effect.sync(() => {
      if (taken) return null;
      taken = true;
      return activation;
    }),
    completeLauncherActivation: ({ activationId }) =>
      Effect.succeed(taken && activationId === activation.activationId),
  });
}

describe("launcher activation IPC", () => {
  it.effect("takes without renderer input and completes only by bounded identifier", () =>
    Effect.gen(function* () {
      const runtime = makeRuntime();
      const first = yield* takeLauncherActivation
        .handler(undefined)
        .pipe(Effect.provideService(DesktopLauncherRuntime.DesktopLauncherRuntime, runtime));
      const second = yield* takeLauncherActivation
        .handler(undefined)
        .pipe(Effect.provideService(DesktopLauncherRuntime.DesktopLauncherRuntime, runtime));
      const completed = yield* completeLauncherActivation
        .handler({
          activationId: activation.activationId,
        })
        .pipe(Effect.provideService(DesktopLauncherRuntime.DesktopLauncherRuntime, runtime));

      assert.deepEqual(first, activation);
      assert.isNull(second);
      assert.isTrue(completed);
    }),
  );

  it.effect("rejects renderer-authored take data and unbounded completion data", () =>
    Effect.gen(function* () {
      const runtime = makeRuntime();
      const takeExit = yield* Effect.exit(
        takeLauncherActivation
          .handler({ prompt: "injected" })
          .pipe(Effect.provideService(DesktopLauncherRuntime.DesktopLauncherRuntime, runtime)),
      );
      const completionExit = yield* Effect.exit(
        completeLauncherActivation
          .handler({
            activationId: activation.activationId,
            prompt: "injected",
          })
          .pipe(Effect.provideService(DesktopLauncherRuntime.DesktopLauncherRuntime, runtime)),
      );
      assert.strictEqual(takeExit._tag, "Failure");
      assert.strictEqual(completionExit._tag, "Failure");
    }),
  );
});
