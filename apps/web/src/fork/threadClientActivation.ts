import type {
  ThreadId,
  ThreadAppActivation,
  ThreadAppActivationCompletion,
} from "@t3tools/contracts";
import { decodeThreadAppActivation } from "@t3tools/shared/threadAppActivation";

import type { DraftId } from "../composerDraftStore";

export type ThreadClientDraftDisposition = "available" | "authored" | "missing";

export interface OpenedThreadClientDraft {
  readonly draftId: DraftId;
  readonly threadId: ThreadId;
}

export interface ThreadClientActivationAttempt {
  readonly openDraft: () => Promise<OpenedThreadClientDraft | null>;
  readonly inspectDraft: (draftId: DraftId) => ThreadClientDraftDisposition;
  readonly stageDraft: (draftId: DraftId, draft: string) => void;
  readonly finishOpen: (opened: OpenedThreadClientDraft) => void;
  readonly completeActivation:
    | ((completion: ThreadAppActivationCompletion) => Promise<boolean>)
    | undefined;
}

export type ThreadClientActivationState =
  | { readonly phase: "idle" }
  | { readonly phase: "waiting"; readonly activation: ThreadAppActivation }
  | { readonly phase: "opening"; readonly activation: ThreadAppActivation }
  | { readonly phase: "acknowledging"; readonly activation: ThreadAppActivation }
  | {
      readonly phase: "receipt-pending";
      readonly activation: ThreadAppActivation;
      readonly message: string;
    }
  | {
      readonly phase: "failed";
      readonly activation: ThreadAppActivation;
      readonly message: string;
    }
  | { readonly phase: "completed"; readonly activation: ThreadAppActivation };

export type ThreadClientActivationAdmission = "accepted" | "duplicate" | "rejected";

export interface ThreadClientActivationOwner {
  readonly read: () => ThreadClientActivationState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly admit: (value: unknown) => ThreadClientActivationAdmission;
  readonly attempt: (dependencies: ThreadClientActivationAttempt) => Promise<void> | null;
  readonly retryOpen: () => boolean;
  readonly retryCompletion: (
    completeActivation:
      | ((completion: ThreadAppActivationCompletion) => Promise<boolean>)
      | undefined,
  ) => Promise<void> | null;
}

const OPEN_FAILED_MESSAGE = "T3 Thread could not open a draft for this launch message.";
const DRAFT_MISSING_MESSAGE = "The opened draft changed before the launch message was ready.";
const DRAFT_AUTHORED_MESSAGE =
  "The opened draft now contains your work. Try again to keep it and open the launch message separately.";
const COMPLETION_UNAVAILABLE_MESSAGE =
  "The launch message is staged, but T3 Thread could not confirm the handoff.";

function sameActivation(left: ThreadAppActivation, right: ThreadAppActivation): boolean {
  return (
    left.contractVersion === right.contractVersion &&
    left.launchId === right.launchId &&
    left.draft === right.draft
  );
}

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : OPEN_FAILED_MESSAGE;
}

/**
 * Owns one launch for the lifetime of the loaded web document. The shell may
 * replay that launch after an auth remount, but a second identity is rejected
 * instead of becoming a queue entry.
 */
export function createThreadClientActivationOwner(): ThreadClientActivationOwner {
  let state: ThreadClientActivationState = { phase: "idle" };
  let activeAttempt: Promise<void> | null = null;
  let activeCompletion: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: ThreadClientActivationState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const fail = (activation: ThreadAppActivation, message: string) => {
    publish({ phase: "failed", activation, message });
  };

  const acknowledge = (
    activation: ThreadAppActivation,
    completeActivation:
      | ((completion: ThreadAppActivationCompletion) => Promise<boolean>)
      | undefined,
  ) => {
    if (activeCompletion !== null) return activeCompletion;
    publish({ phase: "acknowledging", activation });
    const completion = {
      contractVersion: activation.contractVersion,
      launchId: activation.launchId,
    } as const;
    const pending = (async () => {
      try {
        const acknowledged = completeActivation ? await completeActivation(completion) : false;
        activeCompletion = null;
        publish(
          acknowledged
            ? { phase: "completed", activation }
            : {
                phase: "receipt-pending",
                activation,
                message: COMPLETION_UNAVAILABLE_MESSAGE,
              },
        );
      } catch (error) {
        activeCompletion = null;
        publish({
          phase: "receipt-pending",
          activation,
          message: failureMessage(error),
        });
      }
    })();
    activeCompletion = pending;
    void pending.finally(() => {
      if (activeCompletion === pending) activeCompletion = null;
    });
    return pending;
  };

  return {
    read: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    admit: (value) => {
      let activation: ThreadAppActivation;
      try {
        const decoded = decodeThreadAppActivation(value);
        activation =
          decoded.draft === undefined
            ? { contractVersion: decoded.contractVersion, launchId: decoded.launchId }
            : {
                contractVersion: decoded.contractVersion,
                launchId: decoded.launchId,
                draft: decoded.draft,
              };
      } catch {
        return "rejected";
      }

      if (state.phase === "idle") {
        publish({ phase: "waiting", activation });
        return "accepted";
      }
      return sameActivation(state.activation, activation) ? "duplicate" : "rejected";
    },
    attempt: (dependencies) => {
      if (state.phase === "opening") return activeAttempt;
      if (state.phase !== "waiting") return null;

      const activation = state.activation;
      publish({ phase: "opening", activation });

      // The claim belongs to this document-level owner, not the rendering
      // component. React cleanup therefore does not cancel or release it, and
      // overlapping renders cannot start another open while it is unresolved.
      const attempt = (async () => {
        let staged = false;
        try {
          const opened = await dependencies.openDraft();
          if (opened === null) {
            fail(activation, OPEN_FAILED_MESSAGE);
            return;
          }

          if (activation.draft !== undefined) {
            const disposition = dependencies.inspectDraft(opened.draftId);
            if (disposition === "authored") {
              fail(activation, DRAFT_AUTHORED_MESSAGE);
              return;
            }
            if (disposition === "missing") {
              fail(activation, DRAFT_MISSING_MESSAGE);
              return;
            }
            dependencies.stageDraft(opened.draftId, activation.draft);
          }

          // From this point onward the draft has been staged, or the launch
          // intentionally carried no draft. Any later failure belongs to the
          // identity-only receipt and must never reopen or rewrite the draft.
          staged = true;
          publish({ phase: "acknowledging", activation });
          dependencies.finishOpen(opened);
          await acknowledge(activation, dependencies.completeActivation);
        } catch (error) {
          if (staged) {
            publish({
              phase: "receipt-pending",
              activation,
              message: failureMessage(error),
            });
          } else {
            fail(activation, failureMessage(error));
          }
        }
      })();
      activeAttempt = attempt;
      void attempt.finally(() => {
        if (activeAttempt === attempt) activeAttempt = null;
      });
      return attempt;
    },
    retryOpen: () => {
      if (state.phase !== "failed") return false;
      publish({ phase: "waiting", activation: state.activation });
      return true;
    },
    retryCompletion: (completeActivation) => {
      if (state.phase === "acknowledging") return activeCompletion;
      if (state.phase !== "receipt-pending") return null;
      return acknowledge(state.activation, completeActivation);
    },
  };
}

export const threadClientActivationOwner = createThreadClientActivationOwner();
