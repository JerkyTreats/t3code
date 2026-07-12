import type { DesktopSystemTheme } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as IpcChannels from "../ipc/channels.ts";
import { readDesktopSystemTheme, watchDesktopSystemTheme } from "./OmarchyThemeSource.ts";

export interface DesktopSystemThemeServiceShape {
  readonly get: Effect.Effect<DesktopSystemTheme | null>;
  readonly register: Effect.Effect<void, never, Scope.Scope | ElectronWindow.ElectronWindow>;
}

export class DesktopSystemThemeService extends Context.Service<
  DesktopSystemThemeService,
  DesktopSystemThemeServiceShape
>()("@t3tools/desktop/fork/DesktopSystemThemeService") {}

export const layer = Layer.succeed(
  DesktopSystemThemeService,
  DesktopSystemThemeService.of({
    get: Effect.sync(() => readDesktopSystemTheme()),
    register: Effect.gen(function* () {
      const electronWindow = yield* ElectronWindow.ElectronWindow;
      const context = yield* Effect.context<ElectronWindow.ElectronWindow>();
      const runPromise = Effect.runPromiseWith(context);

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          watchDesktopSystemTheme((theme) => {
            void runPromise(electronWindow.sendAll(IpcChannels.SYSTEM_THEME_CHANNEL, theme));
          }),
        ),
        (stopWatching) => Effect.sync(stopWatching),
      );
    }).pipe(Effect.withSpan("desktop.fork.systemTheme.register")),
  }),
);
