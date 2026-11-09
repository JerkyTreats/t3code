import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const threadCanvasScene = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:thread-canvas:scene",
  tag: WS_METHODS.subscribeThreadCanvas,
});

export const threadCanvasSave = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:thread-canvas:save",
  tag: WS_METHODS.threadCanvasSave,
});

export const threadCanvasBrowserTrail = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:thread-canvas:browser-trail",
  tag: WS_METHODS.threadCanvasBrowserTrail,
});
