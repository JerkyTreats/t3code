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
  THREAD_STARTUP_MARK_CHANNEL,
  type ThreadEnrollmentSubmissionResult,
} from "./bridge.ts";
import type { ThreadRendererStartupMark } from "./startupTrace.ts";

// @effect-diagnostics noGlobalProcess:off -- The sandboxed preload reads one opt-in diagnostic flag.
const startupTraceEnabled = process.env.T3_THREAD_STARTUP_TRACE === "1";

function markStartup(name: ThreadRendererStartupMark): void {
  if (startupTraceEnabled) ipcRenderer.send(THREAD_STARTUP_MARK_CHANNEL, name);
}

markStartup("renderer.preload-evaluated");

let composerMounted = false;
let composerEditable = false;
let composerEnabled = false;
let composerPrepared = false;
let composerVisible = false;
let composerInputable = false;
let composerCheckScheduled = false;

function scheduleComposerReadinessCheck(): void {
  if (composerInputable || composerCheckScheduled) return;
  composerCheckScheduled = true;
  requestAnimationFrame(() => {
    composerCheckScheduled = false;
    observeComposerReadiness();
  });
}

function isComposerVisible(composer: HTMLElement): boolean {
  let element: HTMLElement | null = composer;
  while (element) {
    const style = window.getComputedStyle(element);
    if (
      element.hidden ||
      element.getAttribute("aria-hidden") === "true" ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      return false;
    }
    element = element.parentElement;
  }
  return true;
}

function observeComposerReadiness(): void {
  if (composerInputable) return;
  const composers = Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid="composer-editor"]'),
  );
  if (composers.length === 0) return;
  if (!composerMounted) {
    composerMounted = true;
    markStartup("renderer.composer-mounted");
  }
  if (composers.some((composer) => composer.isContentEditable) && !composerEditable) {
    composerEditable = true;
    markStartup("renderer.composer-editable");
  }
  if (
    composers.some((composer) => composer.getAttribute("aria-disabled") !== "true") &&
    !composerEnabled
  ) {
    composerEnabled = true;
    markStartup("renderer.composer-enabled");
  }
  if (
    !composerPrepared &&
    composers.some(
      (composer) => composer.isContentEditable && composer.getAttribute("aria-disabled") !== "true",
    )
  ) {
    composerPrepared = true;
    markStartup("renderer.composer-prepared");
  }
  if (composers.some(isComposerVisible) && !composerVisible) {
    composerVisible = true;
    markStartup("renderer.composer-visible");
  }
  if (
    composers.some(
      (composer) =>
        composer.isContentEditable &&
        composer.getAttribute("aria-disabled") !== "true" &&
        isComposerVisible(composer),
    )
  ) {
    composerInputable = true;
    markStartup("renderer.composer-inputable");
  } else {
    scheduleComposerReadinessCheck();
  }
}

if (startupTraceEnabled) {
  const composerObserver = new MutationObserver(() => observeComposerReadiness());
  composerObserver.observe(document, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ["aria-disabled", "contenteditable", "hidden", "style"],
  });
  window.addEventListener("focus", () => {
    markStartup("renderer.window-focused");
    observeComposerReadiness();
  });
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      markStartup("renderer.dom-content-loaded");
      observeComposerReadiness();
    },
    { once: true },
  );
}

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
    markStartup("renderer.activation-received");
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
        const completed =
          (await ipcRenderer.invoke(THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL, identity)) ===
          true;
        if (completed) {
          markStartup("renderer.activation-completed");
          if (startupTraceEnabled) scheduleComposerReadinessCheck();
        }
        return completed;
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
