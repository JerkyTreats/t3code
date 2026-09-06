import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useComposerDraftStore, type DraftId } from "../../composerDraftStore";
import {
  type DesktopLauncherActivationOwner,
  type DesktopLauncherActivationOutcome,
  desktopLauncherActivationOwner,
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

  const stage = useCallback(
    async (activation: Parameters<typeof stageDesktopLauncherActivation>[0]["activation"]) => {
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
    },
    [openDraft, primaryEnvironmentId, projects, owner],
  );

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
  useLayoutEffect(() => {
    hostRef.current = { draftId, onSend, readComposerState };
  });

  const refresh = useCallback(() => {
    if (draftId) owner.refreshSubmitter(draftId);
  }, [draftId, owner]);

  useEffect(() => {
    if (!draftId) return;
    return owner.registerSubmitter(
      draftId,
      () => hostRef.current.onSend(),
      (expectedPrompt) => {
        if (hostRef.current.draftId !== draftId) return "waiting";
        const draft = useComposerDraftStore.getState().getComposerDraft(draftId);
        if (draft?.prompt !== expectedPrompt) return "refused";
        // The store can lead the committed composer. Only the exact ref bytes used by onSend admit dispatch.
        const committed = hostRef.current.readComposerState();
        return committed.ready && committed.prompt === expectedPrompt ? "ready" : "waiting";
      },
    );
  }, [draftId, owner]);

  // Parent readiness changes and the child's post-ref-sync notification share the same owner guard.
  useEffect(refresh);
  return refresh;
}
