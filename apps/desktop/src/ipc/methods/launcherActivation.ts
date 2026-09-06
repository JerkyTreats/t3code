import {
  DesktopLauncherActivation,
  DesktopLauncherActivationCompletion,
} from "@t3tools/contracts/desktopLauncher";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopLauncherRuntime from "../../app/DesktopLauncherRuntime.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const takeLauncherActivation = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.TAKE_LAUNCHER_ACTIVATION_CHANNEL,
  payload: Schema.Undefined,
  result: Schema.NullOr(DesktopLauncherActivation),
  handler: Effect.fn("desktop.ipc.launcherActivation.take")(function* () {
    const runtime = yield* DesktopLauncherRuntime.DesktopLauncherRuntime;
    return runtime.takeLauncherActivation ? yield* runtime.takeLauncherActivation : null;
  }),
});

export const completeLauncherActivation = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.COMPLETE_LAUNCHER_ACTIVATION_CHANNEL,
  // Completion accepts only the bounded identifier. Prompt data has no renderer-write path.
  payload: DesktopLauncherActivationCompletion,
  result: Schema.Boolean,
  handler: Effect.fn("desktop.ipc.launcherActivation.complete")(function* (completion) {
    const runtime = yield* DesktopLauncherRuntime.DesktopLauncherRuntime;
    return runtime.completeLauncherActivation
      ? yield* runtime.completeLauncherActivation(completion)
      : false;
  }),
});
