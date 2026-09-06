import { describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as DesktopApp from "./DesktopApp.ts";
import * as DesktopState from "./DesktopState.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopAppActivation from "./DesktopAppActivation.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopBackendPool from "../backend/DesktopBackendPool.ts";
import * as DesktopServerExposure from "../backend/DesktopServerExposure.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopWslBackend from "../wsl/DesktopWslBackend.ts";
import * as ElectronProtocol from "../electron/ElectronProtocol.ts";

const host = vi.hoisted(() => ({ events: [] as string[] }));
vi.mock("../ipc/DesktopIpcHandlers.ts", async () => {
  const Effect = await import("effect/Effect");
  return {
    installDesktopIpcHandlers: () =>
      Effect.sync(() => {
        host.events.push("ipc");
      }),
  };
});

// Deliberately omit every unused service: any accidental allocation, port scan, protocol,
// exposure or WSL acquisition in the standalone branch fails this actual host execution.
const runHost = (context: Context.Context<never>) =>
  Effect.scoped(DesktopApp.bootstrap.pipe(Effect.andThen(Effect.yieldNow))).pipe(
    Effect.provide(context as Context.Context<Effect.Services<typeof DesktopApp.bootstrap>>),
  );

const hostContext = Effect.fn("test.hostContext")(function* (
  standalone: boolean,
  quitting = false,
) {
  host.events = [];
  const url = new URL("https://code.example.test/");
  const environment = {
    standaloneServerUrl: standalone ? Option.some(url) : Option.none(),
    isDevelopment: false,
    configuredBackendPort: Option.some(3773),
    defaultDesktopSettings: { serverExposureMode: "local-only" },
  } as DesktopEnvironment.DesktopEnvironment["Service"];
  return Context.make(DesktopState.DesktopState, {
    backendReady: yield* Ref.make(false),
    quitting: yield* Ref.make(quitting),
  }).pipe(
    Context.add(DesktopEnvironment.DesktopEnvironment, environment),
    Context.add(DesktopWindow.DesktopWindow, {
      handleBackendReady: (target: URL) =>
        Effect.sync(() => {
          host.events.push(`window:${target.href}`);
        }),
    } as unknown as DesktopWindow.DesktopWindow["Service"]),
    Context.add(DesktopAppActivation.DesktopAppActivation, {
      start: Effect.sync(() => {
        host.events.push("upstream-activation");
      }),
      complete: () => Effect.void,
      setRendererReady: () => Effect.void,
    }),
  );
});

describe("current DesktopApp bootstrap", () => {
  it.effect(
    "opens standalone HTTPS without even acquiring backend, port, exposure, protocol or WSL services",
    () =>
      Effect.gen(function* () {
        yield* runHost(yield* hostContext(true));
        expect(host.events).toEqual([
          "ipc",
          "window:https://code.example.test/",
          "upstream-activation",
        ]);
      }),
  );
  it.effect("does not open a standalone window while quitting", () =>
    Effect.gen(function* () {
      yield* runHost(yield* hostContext(true, true));
      expect(host.events).toEqual(["ipc"]);
    }),
  );
  it.effect(
    "preserves ordinary local protocol, backend start, upstream activation and WSL reconciliation",
    () =>
      Effect.gen(function* () {
        const context = (yield* hostContext(false)).pipe(
          Context.add(DesktopBackendPool.DesktopBackendPool, {
            primary: Effect.sync(() => {
              host.events.push("allocate-primary");
              return {
                start: Effect.sync(() => {
                  host.events.push("backend-start");
                }),
              };
            }),
          } as DesktopBackendPool.DesktopBackendPool["Service"]),
          Context.add(DesktopAppSettings.DesktopAppSettings, {
            get: Effect.succeed({
              serverExposureMode: "local-only",
              wslOnly: false,
              wslBackendEnabled: false,
            }),
          } as DesktopAppSettings.DesktopAppSettings["Service"]),
          Context.add(DesktopServerExposure.DesktopServerExposure, {
            configureFromSettings: () =>
              Effect.sync(() => {
                host.events.push("exposure");
                return { endpointUrl: null };
              }),
            backendConfig: Effect.succeed({ httpBaseUrl: new URL("http://127.0.0.1:3773") }),
          } as unknown as DesktopServerExposure.DesktopServerExposure["Service"]),
          Context.add(ElectronProtocol.ElectronProtocol, {
            registerDesktopProtocol: () =>
              Effect.sync(() => {
                host.events.push("protocol");
              }),
          } as ElectronProtocol.ElectronProtocol["Service"]),
          Context.add(DesktopWslBackend.DesktopWslBackend, {
            reconcile: Effect.sync(() => {
              host.events.push("wsl");
            }),
          } as DesktopWslBackend.DesktopWslBackend["Service"]),
        );
        yield* runHost(context);
        expect(host.events).toEqual([
          "allocate-primary",
          "exposure",
          "protocol",
          "ipc",
          "backend-start",
          "upstream-activation",
          "wsl",
        ]);
      }),
  );
});
