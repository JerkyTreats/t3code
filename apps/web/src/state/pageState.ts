import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

/** One page state document of a thread, by key; every frame reading it shares this. */
export const pageStateDocument = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:page-state:document",
  tag: WS_METHODS.subscribePageState,
});

export const pageStateWrite = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:page-state:write",
  tag: WS_METHODS.pageStateWrite,
});
