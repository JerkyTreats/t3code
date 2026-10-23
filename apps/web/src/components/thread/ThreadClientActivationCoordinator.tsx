import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
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
import {
  findThreadClientProject,
  resolveThreadClientProject,
} from "../../fork/threadClientProject";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { inferProjectTitleFromPath } from "../../lib/projectPaths";
import { newProjectId } from "../../lib/utils";
import { useRightPanelStore } from "../../rightPanelStore";
import { usePrimaryEnvironment } from "../../state/environments";
import { readProjects, waitForProject, useProjects, useThreadShells } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useEnvironmentQuery } from "../../state/query";
import { environmentShell } from "../../state/shell";
import { useAtomCommand } from "../../state/use-atom-command";
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
  readonly resolveProject?: (workingDirectory: string) => Promise<ScopedProjectRef>;
  readonly inspectDraft: (
    draftId: OpenedThreadClientDraft["draftId"],
    projectRef: ScopedProjectRef,
  ) => ThreadClientDraftDisposition;
  readonly stageDraft: (draftId: OpenedThreadClientDraft["draftId"], draft: string) => void;
  readonly finishOpen: (opened: OpenedThreadClientDraft, projectRef: ScopedProjectRef) => void;
}

function useActivationState(owner: ThreadClientActivationOwner) {
  return useSyncExternalStore(owner.subscribe, owner.read, owner.read);
}

export function selectThreadClientActivationProject(
  primaryEnvironmentId: EnvironmentId,
  projects: readonly EnvironmentProject[],
  threads: readonly EnvironmentThreadShell[],
  workingDirectory?: string,
): ScopedProjectRef | null {
  if (workingDirectory !== undefined) {
    return findThreadClientProject(primaryEnvironmentId, workingDirectory, projects);
  }
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
    resolveProject,
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
    if (activationState.phase !== "waiting" || !shellLive || primaryEnvironmentId === null) return;
    const workingDirectory = activationState.activation.workingDirectory;
    if (workingDirectory === undefined && projectRef === null) return;
    let openedProjectRef: ScopedProjectRef | null = null;

    void owner.attempt({
      completeActivation: bridge?.completeActivation,
      openDraft: async () => {
        if (workingDirectory !== undefined) {
          if (!resolveProject) throw new Error("The requested working directory is unavailable.");
          openedProjectRef = await resolveProject(workingDirectory);
        } else {
          openedProjectRef = projectRef;
        }
        if (openedProjectRef === null || openedProjectRef.environmentId !== primaryEnvironmentId) {
          throw new Error("The requested primary project is unavailable.");
        }
        return workingDirectory === undefined
          ? openDraft(openedProjectRef)
          : openDraft(openedProjectRef, {
              envMode: "local",
              branch: null,
              worktreePath: null,
              startFromOrigin: false,
            });
      },
      inspectDraft: (draftId) =>
        openedProjectRef === null ? "missing" : inspectDraft(draftId, openedProjectRef),
      stageDraft,
      finishOpen: (opened) => {
        if (openedProjectRef !== null) finishOpen(opened, openedProjectRef);
      },
    });
  }, [
    activationState,
    bridge,
    finishOpen,
    inspectDraft,
    openDraft,
    owner,
    projectRef,
    primaryEnvironmentId,
    resolveProject,
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
  } else if (
    primaryEnvironmentId !== null &&
    shellLive &&
    projectRef === null &&
    activationState.activation.workingDirectory === undefined
  ) {
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
        ) : primaryEnvironmentId !== null &&
          shellLive &&
          projectRef === null &&
          activationState.activation.workingDirectory === undefined ? (
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
  const activationState = useActivationState(owner);
  const workingDirectory =
    activationState.phase === "idle" ? undefined : activationState.activation.workingDirectory;
  const primaryEnvironment = usePrimaryEnvironment();
  const primaryEnvironmentId = primaryEnvironment?.environmentId ?? null;
  const shellState = useEnvironmentQuery(
    primaryEnvironmentId === null ? null : environmentShell.stateAtom(primaryEnvironmentId),
  );
  const projects = useProjects();
  const threads = useThreadShells();
  const openDraft = useNewThreadHandler();
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const resolveProject = useCallback(
    async (directory: string) => {
      if (primaryEnvironmentId === null) throw new Error("The primary environment is unavailable.");
      return resolveThreadClientProject(primaryEnvironmentId, directory, {
        readProjects,
        waitForProject,
        createProject: async (environmentId, workspaceRoot) => {
          const projectId = newProjectId();
          const result = await createProject({
            environmentId,
            input: {
              projectId,
              title: inferProjectTitleFromPath(workspaceRoot),
              workspaceRoot,
              createWorkspaceRootIfMissing: false,
            },
          });
          if (result._tag === "Failure") {
            const error = squashAtomCommandFailure(result);
            throw error instanceof Error
              ? error
              : new Error("T3 Thread could not add the requested project.");
          }
          return projectId;
        },
      });
    },
    [createProject, primaryEnvironmentId],
  );
  const projectRef = useMemo(
    () =>
      primaryEnvironmentId === null
        ? null
        : selectThreadClientActivationProject(
            primaryEnvironmentId,
            projects,
            threads,
            workingDirectory,
          ),
    [primaryEnvironmentId, projects, threads, workingDirectory],
  );
  const inspectDraft = useCallback(
    (draftId: OpenedThreadClientDraft["draftId"], selectedProjectRef: ScopedProjectRef) => {
      const store = useComposerDraftStore.getState();
      const session = store.getDraftSession(draftId);
      return resolveThreadClientDraftDisposition(
        selectedProjectRef,
        session,
        composerDraftHasUserContent(store.getComposerDraft(draftId)),
      );
    },
    [],
  );
  const stageDraft = useCallback((draftId: OpenedThreadClientDraft["draftId"], draft: string) => {
    useComposerDraftStore.getState().setPrompt(draftId, draft);
  }, []);
  const finishOpen = useCallback(
    (opened: OpenedThreadClientDraft, selectedProjectRef: ScopedProjectRef) => {
      useRightPanelStore
        .getState()
        .close(scopeThreadRef(selectedProjectRef.environmentId, opened.threadId));
    },
    [],
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
      resolveProject={resolveProject}
      shellLive={shellState.data?.status === "live"}
      stageDraft={stageDraft}
    />
  );
}
