import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ScopedProjectRef } from "@t3tools/contracts";
import { PlusIcon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import {
  composerDraftHasUserContent,
  type DraftSessionState,
  useComposerDraftStore,
} from "../../composerDraftStore";
import {
  threadClientActivationOwner,
  type OpenedThreadClientDraft,
  type ThreadClientDraftDisposition,
  type ThreadClientActivationOwner,
} from "../../fork/threadClientActivation";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useRightPanelStore } from "../../rightPanelStore";
import { usePrimaryEnvironment } from "../../state/environments";
import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { environmentShell } from "../../state/shell";
import { sortScopedProjectsForSidebar } from "../Sidebar.logic";
import { Button } from "../ui/button";

type ThreadActivationBridge = NonNullable<Window["t3ThreadBridge"]>;

export interface ThreadClientActivationHostProps {
  readonly bridge: Pick<ThreadActivationBridge, "completeActivation" | "subscribe"> | undefined;
  readonly owner: ThreadClientActivationOwner;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly projectRef: ScopedProjectRef | null;
  readonly shellLive: boolean;
  readonly openDraft: ReturnType<typeof useNewThreadHandler>;
  readonly inspectDraft: (
    draftId: OpenedThreadClientDraft["draftId"],
  ) => ThreadClientDraftDisposition;
  readonly stageDraft: (draftId: OpenedThreadClientDraft["draftId"], draft: string) => void;
  readonly finishOpen: (opened: OpenedThreadClientDraft) => void;
}

function useActivationState(owner: ThreadClientActivationOwner) {
  return useSyncExternalStore(owner.subscribe, owner.read, owner.read);
}

export function selectThreadClientActivationProject(
  primaryEnvironmentId: EnvironmentId,
  projects: readonly EnvironmentProject[],
  threads: readonly EnvironmentThreadShell[],
): ScopedProjectRef | null {
  const project =
    sortScopedProjectsForSidebar(
      projects.filter((candidate) => candidate.environmentId === primaryEnvironmentId),
      threads,
      "updated_at",
    )[0] ?? null;
  return project === null ? null : scopeProjectRef(project.environmentId, project.id);
}

export function resolveThreadClientDraftDisposition(
  projectRef: ScopedProjectRef,
  session: Pick<DraftSessionState, "environmentId" | "projectId"> | null,
  hasUserContent: boolean,
): ThreadClientDraftDisposition {
  if (
    session === null ||
    session.environmentId !== projectRef.environmentId ||
    session.projectId !== projectRef.projectId
  ) {
    return "missing";
  }
  return hasUserContent ? "authored" : "available";
}

export function ThreadClientActivationHost(props: ThreadClientActivationHostProps) {
  const {
    bridge,
    finishOpen,
    inspectDraft,
    openDraft,
    owner,
    primaryEnvironmentId,
    projectRef,
    shellLive,
    stageDraft,
  } = props;
  const activationState = useActivationState(owner);

  useEffect(() => {
    if (!bridge) return;
    return bridge.subscribe((activation) => {
      owner.admit(activation);
    });
  }, [bridge, owner]);

  useEffect(() => {
    if (activationState.phase !== "waiting" || !shellLive || projectRef === null) return;

    void owner.attempt({
      completeActivation: bridge?.completeActivation,
      openDraft: () => openDraft(projectRef),
      inspectDraft,
      stageDraft,
      finishOpen,
    });
  }, [
    activationState,
    bridge,
    finishOpen,
    inspectDraft,
    openDraft,
    owner,
    projectRef,
    shellLive,
    stageDraft,
  ]);

  const openAddProject = useCallback(() => openCommandPalette({ open: "add-project" }), []);

  if (activationState.phase === "idle" || activationState.phase === "completed") return null;

  let title = "Preparing your launch message";
  let description = "Waiting for the primary environment to become ready.";
  if (activationState.phase === "opening") {
    title = "Opening your launch message";
    description = "The message will stay in the composer for you to review.";
  } else if (activationState.phase === "acknowledging") {
    title = "Confirming your launch message";
    description = "The message is staged and remains unsent.";
  } else if (activationState.phase === "receipt-pending") {
    title = "Launch message needs confirmation";
    description = activationState.message;
  } else if (activationState.phase === "failed") {
    title = "Couldn’t open the launch message";
    description = activationState.message;
  } else if (primaryEnvironmentId !== null && shellLive && projectRef === null) {
    title = "Add a project to continue";
    description = "Your launch message is waiting and will remain unsent.";
  }

  return (
    <aside
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3"
      data-thread-client-activation={activationState.phase}
    >
      <div className="surface-glass pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-left shadow-lg">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        </div>
        {activationState.phase === "failed" ? (
          <Button size="sm" variant="outline" onClick={() => owner.retryOpen()}>
            <RotateCcwIcon className="size-4" />
            Try again
          </Button>
        ) : activationState.phase === "receipt-pending" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => owner.retryCompletion(bridge?.completeActivation)}
          >
            <RotateCcwIcon className="size-4" />
            Try again
          </Button>
        ) : primaryEnvironmentId !== null && shellLive && projectRef === null ? (
          <Button size="sm" onClick={openAddProject}>
            <PlusIcon className="size-4" />
            Add project
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

export function ThreadClientActivationCoordinator(props: {
  readonly owner?: ThreadClientActivationOwner;
}) {
  const owner = props.owner ?? threadClientActivationOwner;
  const primaryEnvironment = usePrimaryEnvironment();
  const primaryEnvironmentId = primaryEnvironment?.environmentId ?? null;
  const shellState = useEnvironmentQuery(
    primaryEnvironmentId === null ? null : environmentShell.stateAtom(primaryEnvironmentId),
  );
  const projects = useProjects();
  const threads = useThreadShells();
  const openDraft = useNewThreadHandler();
  const projectRef = useMemo(
    () =>
      primaryEnvironmentId === null
        ? null
        : selectThreadClientActivationProject(primaryEnvironmentId, projects, threads),
    [primaryEnvironmentId, projects, threads],
  );
  const inspectDraft = useCallback(
    (draftId: OpenedThreadClientDraft["draftId"]) => {
      const store = useComposerDraftStore.getState();
      const session = store.getDraftSession(draftId);
      return projectRef === null
        ? "missing"
        : resolveThreadClientDraftDisposition(
            projectRef,
            session,
            composerDraftHasUserContent(store.getComposerDraft(draftId)),
          );
    },
    [projectRef],
  );
  const stageDraft = useCallback((draftId: OpenedThreadClientDraft["draftId"], draft: string) => {
    useComposerDraftStore.getState().setPrompt(draftId, draft);
  }, []);
  const finishOpen = useCallback(
    (opened: OpenedThreadClientDraft) => {
      if (projectRef === null) return;
      useRightPanelStore
        .getState()
        .close(scopeThreadRef(projectRef.environmentId, opened.threadId));
    },
    [projectRef],
  );

  return (
    <ThreadClientActivationHost
      bridge={window.t3ThreadBridge}
      finishOpen={finishOpen}
      inspectDraft={inspectDraft}
      openDraft={openDraft}
      owner={owner}
      primaryEnvironmentId={primaryEnvironmentId}
      projectRef={projectRef}
      shellLive={shellState.data?.status === "live"}
      stageDraft={stageDraft}
    />
  );
}
