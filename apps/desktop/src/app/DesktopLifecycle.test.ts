import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import type * as Electron from "electron";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopLifecycle from "./DesktopLifecycle.ts";
import * as DesktopShutdown from "./DesktopShutdown.ts";
import * as DesktopState from "./DesktopState.ts";

type AppListener = (...args: readonly unknown[]) => void;

function makeHarness(platform: NodeJS.Platform) {
  const listeners = new Map<string, AppListener>();
  let quitCount = 0;
  let shutdownRequestCount = 0;

  const electronApp = ElectronApp.ElectronApp.of({
    metadata: Effect.die("unexpected metadata read"),
    name: Effect.succeed("T3 Code"),
    whenReady: Effect.void,
    quit: Effect.sync(() => {
      quitCount += 1;
    }),
    exit: () => Effect.void,
    relaunch: () => Effect.void,
    setPath: () => Effect.void,
    setName: () => Effect.void,
    setAboutPanelOptions: () => Effect.void,
    setAppUserModelId: () => Effect.void,
    requestSingleInstanceLock: Effect.succeed(true),
    isDefaultProtocolClient: () => Effect.succeed(false),
    setAsDefaultProtocolClient: () => Effect.succeed(true),
    setDesktopName: () => Effect.void,
    setDockIcon: () => Effect.void,
    appendCommandLineSwitch: () => Effect.void,
    onBeforeQuitForUpdate: (listener) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          listeners.set("before-quit-for-update", listener);
        }),
        () =>
          Effect.sync(() => {
            listeners.delete("before-quit-for-update");
          }),
      ).pipe(Effect.asVoid),
    on: (eventName, listener) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          listeners.set(eventName, listener as AppListener);
        }),
        () =>
          Effect.sync(() => {
            listeners.delete(eventName);
          }),
      ).pipe(Effect.asVoid),
  });
  const desktopWindow = DesktopWindow.DesktopWindow.of({
    createMain: Effect.die("unexpected window creation"),
    ensureMain: Effect.die("unexpected window creation"),
    revealOrCreateMain: Effect.die("unexpected window creation"),
    activate: Effect.void,
    createMainIfBackendReady: Effect.void,
    showConnectingSplash: Effect.void,
    handleBackendReady: () => Effect.void,
    handleBackendNotReady: Effect.void,
    dispatchMenuAction: () => Effect.void,
    syncAppearance: Effect.void,
  });
  const shutdown = DesktopShutdown.DesktopShutdown.of({
    request: Effect.sync(() => {
      shutdownRequestCount += 1;
    }),
    awaitRequest: Effect.void,
    markComplete: Effect.void,
    awaitComplete: Effect.void,
    isComplete: Effect.succeed(true),
  });

  const layer = DesktopLifecycle.layer.pipe(
    Layer.provideMerge(Layer.succeed(ElectronApp.ElectronApp, electronApp)),
    Layer.provideMerge(
      Layer.succeed(ElectronTheme.ElectronTheme, {
        shouldUseDarkColors: Effect.succeed(false),
        setSource: () => Effect.void,
        onUpdated: () => Effect.void,
      }),
    ),
    Layer.provideMerge(Layer.succeed(DesktopWindow.DesktopWindow, desktopWindow)),
    Layer.provideMerge(
      Layer.succeed(DesktopEnvironment.DesktopEnvironment, {
        platform,
        isDevelopment: false,
      } as DesktopEnvironment.DesktopEnvironment["Service"]),
    ),
    Layer.provideMerge(Layer.succeed(DesktopShutdown.DesktopShutdown, shutdown)),
    Layer.provideMerge(DesktopState.layer),
  );

  return {
    layer,
    listeners,
    quitCount: () => quitCount,
    shutdownRequestCount: () => shutdownRequestCount,
  };
}

function beforeQuitEvent() {
  let prevented = false;
  return {
    event: {
      preventDefault: () => {
        prevented = true;
      },
    } as Electron.Event,
    prevented: () => prevented,
  };
}

describe("DesktopLifecycle", () => {
  for (const platform of ["darwin", "win32", "linux"] satisfies ReadonlyArray<NodeJS.Platform>) {
    it.effect(`allows native updater quit on ${platform}`, () => {
      const harness = makeHarness(platform);
      return Effect.scoped(
        Effect.gen(function* () {
          const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
          yield* lifecycle.register;

          harness.listeners.get("before-quit-for-update")?.();
          const quitEvent = beforeQuitEvent();
          harness.listeners.get("before-quit")?.(quitEvent.event);
          yield* Effect.yieldNow;

          assert.isFalse(quitEvent.prevented());
          assert.equal(harness.shutdownRequestCount(), 0);
          assert.equal(harness.quitCount(), 0);
          const state = yield* DesktopState.DesktopState;
          assert.isTrue(yield* Ref.get(state.quitting));
        }),
      ).pipe(Effect.provide(harness.layer));
    });
  }

  for (const platform of ["darwin", "win32", "linux"] satisfies ReadonlyArray<NodeJS.Platform>) {
    it.effect(`keeps ordinary quit behind the shutdown guard on ${platform}`, () => {
      const harness = makeHarness(platform);
      return Effect.scoped(
        Effect.gen(function* () {
          const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
          yield* lifecycle.register;

          const quitEvent = beforeQuitEvent();
          harness.listeners.get("before-quit")?.(quitEvent.event);
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;

          assert.isTrue(quitEvent.prevented());
          assert.equal(harness.shutdownRequestCount(), 1);
          assert.equal(harness.quitCount(), 1);
        }),
      ).pipe(Effect.provide(harness.layer));
    });
  }
});
