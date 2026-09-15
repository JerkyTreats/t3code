import {
  DesktopInteractionArmInputSchema,
  DesktopInteractionDisarmInputSchema,
  DesktopInteractionPointerInputSchema,
  DesktopInteractionStartInputSchema,
  DesktopInteractionStopInputSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as Electron from "electron";
import { interactionManager } from "../../interaction/Manager.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

const fromPromise = <A>(run: () => Promise<A>) => Effect.tryPromise(run).pipe(Effect.orDie);
const senderId = (context: { readonly senderId: number } | undefined): number => {
  if (context === undefined) throw new Error("Interaction IPC requires an invoking renderer.");
  return context.senderId;
};

export const start = makeIpcMethod({
  channel: IpcChannels.INTERACTION_START_CHANNEL,
  payload: DesktopInteractionStartInputSchema,
  result: Schema.Void,
  handler: (input, context) =>
    fromPromise(() => interactionManager.start(input, senderId(context))),
});

export const arm = makeIpcMethod({
  channel: IpcChannels.INTERACTION_ARM_CHANNEL,
  payload: DesktopInteractionArmInputSchema,
  result: Schema.Void,
  handler: (input, context) => fromPromise(() => interactionManager.arm(input, senderId(context))),
});

export const input = makeIpcMethod({
  channel: IpcChannels.INTERACTION_INPUT_CHANNEL,
  payload: DesktopInteractionPointerInputSchema,
  result: Schema.Boolean,
  handler: (value, context) =>
    fromPromise(() => interactionManager.input(value, senderId(context))),
});

export const disarm = makeIpcMethod({
  channel: IpcChannels.INTERACTION_DISARM_CHANNEL,
  payload: DesktopInteractionDisarmInputSchema,
  result: Schema.Void,
  handler: (input, context) =>
    fromPromise(() => interactionManager.disarm(input, senderId(context))),
});

export const stop = makeIpcMethod({
  channel: IpcChannels.INTERACTION_STOP_CHANNEL,
  payload: DesktopInteractionStopInputSchema,
  result: Schema.Void,
  handler: (input, context) => fromPromise(() => interactionManager.stop(input, senderId(context))),
});

export const methods = [start, arm, input, disarm, stop] as const;

export const installEventForwarding = Effect.acquireRelease(
  Effect.sync(() =>
    interactionManager.onOwnedEvent((event, ownerRendererId) => {
      const owner = Electron.webContents.fromId(ownerRendererId);
      if (owner !== undefined && !owner.isDestroyed()) {
        owner.send(IpcChannels.INTERACTION_EVENT_CHANNEL, event);
      }
    }),
  ),
  (remove) => Effect.sync(remove),
);
