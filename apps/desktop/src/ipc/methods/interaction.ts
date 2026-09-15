import {
  DesktopInteractionArmInputSchema,
  DesktopInteractionDisarmInputSchema,
  DesktopInteractionPointerInputSchema,
  DesktopInteractionStartInputSchema,
  DesktopInteractionStopInputSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import { interactionManager } from "../../interaction/Manager.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

const fromPromise = <A>(run: () => Promise<A>) => Effect.tryPromise(run).pipe(Effect.orDie);

export const start = makeIpcMethod({
  channel: IpcChannels.INTERACTION_START_CHANNEL,
  payload: DesktopInteractionStartInputSchema,
  result: Schema.Void,
  handler: (input) => fromPromise(() => interactionManager.start(input)),
});

export const arm = makeIpcMethod({
  channel: IpcChannels.INTERACTION_ARM_CHANNEL,
  payload: DesktopInteractionArmInputSchema,
  result: Schema.Void,
  handler: (input) => fromPromise(() => interactionManager.arm(input)),
});

export const input = makeIpcMethod({
  channel: IpcChannels.INTERACTION_INPUT_CHANNEL,
  payload: DesktopInteractionPointerInputSchema,
  result: Schema.Boolean,
  handler: (value) => fromPromise(() => interactionManager.input(value)),
});

export const disarm = makeIpcMethod({
  channel: IpcChannels.INTERACTION_DISARM_CHANNEL,
  payload: DesktopInteractionDisarmInputSchema,
  result: Schema.Void,
  handler: (input) => fromPromise(() => interactionManager.disarm(input)),
});

export const stop = makeIpcMethod({
  channel: IpcChannels.INTERACTION_STOP_CHANNEL,
  payload: DesktopInteractionStopInputSchema,
  result: Schema.Void,
  handler: (input) => fromPromise(() => interactionManager.stop(input)),
});

export const methods = [start, arm, input, disarm, stop] as const;

export const installEventForwarding = Effect.gen(function* () {
  const windows = yield* ElectronWindow.ElectronWindow;
  const context = yield* Effect.context<ElectronWindow.ElectronWindow>();
  const runPromise = Effect.runPromiseWith(context);
  yield* Effect.acquireRelease(
    Effect.sync(() =>
      interactionManager.onEvent((event) => {
        void runPromise(windows.sendAll(IpcChannels.INTERACTION_EVENT_CHANNEL, event));
      }),
    ),
    (remove) => Effect.sync(remove),
  );
});
