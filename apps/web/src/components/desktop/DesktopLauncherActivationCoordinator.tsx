import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { useComposerDraftStore, type DraftId } from "../../composerDraftStore";
import {
  type DesktopLauncherActivationOwner,
  type DesktopLauncherActivationOutcome,
  desktopLauncherActivationOwner,
  launcherPromptMatches,
  stageDesktopLauncherActivation,
} from "../../fork/desktopLauncherActivation";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { usePrimaryEnvironment } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { environmentShell } from "../../state/shell";

function ReadyDesktopLauncherActivationCoordinator(props: {
  readonly primaryEnvironmentId: EnvironmentId;
  readonly owner: DesktopLauncherActivationOwner;
}) {
  const { primaryEnvironmentId, owner } = props;
  const submitState = useSyncExternalStore(owner.subscribeSubmitState, owner.getSubmitState);
  const [outcome, setOutcome] = useState<DesktopLauncherActivationOutcome | null>(null);
  const shellState = useAtomValue(environmentShell.stateValueAtom(primaryEnvironmentId));
  const projects = useProjects();
  const openDraft = useNewThreadHandler();

  const stage = async (
    activation: Parameters<typeof stageDesktopLauncherActivation>[0]["activation"],
  ) => {
    const bridge = window.desktopBridge;
    return stageDesktopLauncherActivation({
      activation,
      primaryEnvironmentId,
      projects,
      openDraft: (project) => openDraft(scopeProjectRef(project.environmentId, project.id)),
      readDraft: (draftId) => useComposerDraftStore.getState().getComposerDraft(draftId),
      setPrompt: (draftId, prompt) => useComposerDraftStore.getState().setPrompt(draftId, prompt),
      owner,
      complete: async (activationId) =>
        (await bridge?.completeLauncherActivation?.({ activationId })) ?? false,
    });
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- takes the pending launcher activation over the desktop bridge once the primary shell is live
  useEffect(() => {
    const bridge = window.desktopBridge;
    if (shellState.status !== "live" || !bridge?.takeLauncherActivation) return;
    let mounted = true;
    void owner.takeOnce({ take: () => bridge.takeLauncherActivation!(), stage }).then((result) => {
      if (mounted) setOutcome(result);
    });
    return () => {
      mounted = false;
    };
  }, [stage, owner, shellState.status]);

  if (submitState === null && (outcome === null || outcome === "completed" || outcome === "queued"))
    return null;
  return (
    <div role="status" className="flex items-center gap-3 border-b px-4 py-2 text-sm">
      <span>
        {submitState === "waiting"
          ? "The launcher prompt is waiting for the composer to be ready."
          : submitState === "sending"
            ? "Submitting the launcher prompt."
            : submitState === "refused"
              ? "The composer did not submit the launcher prompt. Resolve the issue, then retry."
              : submitState === "uncertain"
                ? "The launcher could not confirm submission. Check the conversation before sending again."
                : outcome === "target-not-found"
                  ? "The launcher prompt is waiting for its project."
                  : outcome === "completion-pending"
                    ? "The launcher is waiting for confirmation."
                    : "The launcher prompt could not be opened. Your existing draft is preserved."}
      </span>
      {(submitState === null || submitState === "refused") && (
        <button
          type="button"
          className="underline"
          onClick={() => {
            if (submitState === "refused") owner.retrySubmit();
            else void owner.retryStaging(stage).then(setOutcome);
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function DesktopLauncherActivationCoordinator({
  owner = desktopLauncherActivationOwner,
}: { readonly owner?: DesktopLauncherActivationOwner } = {}) {
  const primaryEnvironment = usePrimaryEnvironment();
  return primaryEnvironment ? (
    <ReadyDesktopLauncherActivationCoordinator
      primaryEnvironmentId={primaryEnvironment.environmentId}
      owner={owner}
    />
  ) : null;
}

export interface DesktopLauncherComposerState {
  readonly prompt: string;
  readonly ready: boolean;
}

export function useDesktopLauncherSubmitAdmission(
  draftId: DraftId | null,
  onSend: () => Promise<void | boolean>,
  readComposerState: () => DesktopLauncherComposerState,
  owner: DesktopLauncherActivationOwner = desktopLauncherActivationOwner,
): () => void {
  const hostRef = useRef({ draftId, onSend, readComposerState });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes the committed draft, send handler and composer reader to the ref the launcher owner's submitter reads
  useLayoutEffect(() => {
    hostRef.current = { draftId, onSend, readComposerState };
  });

  const refresh = () => {
    if (draftId) owner.refreshSubmitter(draftId);
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds this draft's submitter registration in the launcher activation owner until the draft changes or unmounts
  useEffect(() => {
    if (!draftId) return;
    return owner.registerSubmitter(
      draftId,
      () => hostRef.current.onSend(),
      (expectedPrompt) => {
        if (hostRef.current.draftId !== draftId) return "waiting";
        const draft = useComposerDraftStore.getState().getComposerDraft(draftId);
        if (!draft || !launcherPromptMatches(expectedPrompt, draft.prompt)) return "refused";
        // The store can lead the committed composer. Only the exact ref bytes used by onSend admit dispatch.
        const committed = hostRef.current.readComposerState();
        return committed.ready && launcherPromptMatches(expectedPrompt, committed.prompt)
          ? "ready"
          : "waiting";
      },
    );
  }, [draftId, owner]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tells the launcher owner after each commit to re-check admission against the committed composer; parent and child notifications share its guard
  useEffect(refresh);
  return refresh;
}
