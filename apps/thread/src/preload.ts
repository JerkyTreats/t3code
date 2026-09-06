import type {
  ThreadAppActivation,
  ThreadAppActivationCompletion,
} from "@t3tools/contracts/threadAppActivation";
import { decodeThreadAppActivationCompletion } from "@t3tools/shared/threadAppActivation";
import { contextBridge, ipcRenderer } from "electron";

import { decodeThreadAppActivation } from "./activationContract.ts";
import {
  THREAD_CLIENT_ACTIVATION_CHANNEL,
  THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL,
  THREAD_ENROLLMENT_SUBMISSION_CHANNEL,
  type ThreadEnrollmentSubmissionResult,
} from "./bridge.ts";

let retained: ThreadAppActivation | null = null;
const listeners = new Set<(activation: ThreadAppActivation) => void>();

function notifyActivation(
  listener: (activation: ThreadAppActivation) => void,
  activation: ThreadAppActivation,
): void {
  try {
    listener(activation);
  } catch {
    // A subscriber cannot block other listeners or lose the retained activation.
  }
}

ipcRenderer.on(THREAD_CLIENT_ACTIVATION_CHANNEL, (_event, value: unknown) => {
  try {
    const activation = decodeThreadAppActivation(value);
    // This process owns one launch, not a mailbox. Even a same-id changed draft
    // cannot replace already admitted bytes or overwrite later renderer input.
    if (retained !== null) return;
    retained = Object.freeze({ ...activation });
    for (const listener of listeners) notifyActivation(listener, retained);
  } catch {
    // Main-process values still cross a trust boundary and malformed input fails closed.
  }
});

contextBridge.exposeInMainWorld(
  "t3ThreadBridge",
  Object.freeze({
    subscribe(listener: (activation: ThreadAppActivation) => void): () => void {
      listeners.add(listener);
      if (retained !== null) notifyActivation(listener, retained);
      return () => listeners.delete(listener);
    },
    async completeActivation(completion: ThreadAppActivationCompletion): Promise<boolean> {
      try {
        const identity = decodeThreadAppActivationCompletion(completion);
        return (
          (await ipcRenderer.invoke(THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL, identity)) === true
        );
      } catch {
        return false;
      }
    },
    async submitPairingCredential(credential: string): Promise<ThreadEnrollmentSubmissionResult> {
      if (typeof credential !== "string") return { status: "rejected" };
      let result: unknown;
      try {
        result = await ipcRenderer.invoke(THREAD_ENROLLMENT_SUBMISSION_CHANNEL, credential);
      } catch {
        return { status: "unavailable" };
      }
      if (
        typeof result === "object" &&
        result !== null &&
        "status" in result &&
        (result.status === "accepted" ||
          result.status === "rejected" ||
          result.status === "unavailable")
      ) {
        return { status: result.status };
      }
      return { status: "unavailable" };
    },
  }),
);
