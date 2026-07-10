import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  type EnvironmentId,
  type KeybindingCommand,
  type ProjectId,
  type ProjectScript,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type {
  NewProjectScriptInput,
  ProjectScriptActionResult,
} from "~/components/ProjectScriptsControl";
import { isElectron } from "~/env";
import { useOpenInPreferredEditor } from "~/editorPreferences";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { decodeProjectScriptKeybindingRule } from "~/lib/projectScriptKeybindings";
import { commandForProjectScript, nextProjectScriptId } from "~/projectScripts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { mapVcsStatusToProjectRepositoryStatus } from "~/project-management/projectManagementStatusAdapter";
import { buildProjectOverviewSnapshot } from "~/project-management/projectManagementOverview";
import type {
  ProjectManagementProject,
  ProjectManagementRouteTarget,
  ProjectManagementThread,
} from "~/project-management/projectManagementTypes";
import { buildThreadRouteParams } from "~/threadRoutes";
import { useServerConfigs, useProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { environmentShell } from "~/state/shell";
import { serverEnvironment } from "~/state/server";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsEnvironment } from "~/state/vcs";
import { schedulePendingProjectScriptRun } from "~/projectPendingScriptRun";
import {
  isAtomCommandInterrupted,
  mapAtomCommandResult,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ProjectManagementShell } from "./ProjectManagementShell";
import { ProjectManagementPage } from "./ProjectManagementPage";
import { ProjectInferenceDashboardPage } from "./ProjectInferenceDashboardPage";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { useRightPanelStore } from "~/rightPanelStore";
import {
  latestActiveProjectThread,
  useProjectManagementThreads,
} from "~/project-management/useProjectManagementThreads";

function threadRefForManagementThread(thread: ProjectManagementThread): ScopedThreadRef {
  return scopeThreadRef(thread.environmentId, thread.id);
}

function buildManagementProject(input: {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly scripts: ProjectManagementProject["scripts"];
}): ProjectManagementProject {
  return {
    id: input.id,
    environmentId: input.environmentId,
    name: input.title,
    cwd: input.workspaceRoot,
    scripts: input.scripts,
  };
}

function reportActionFailure(title: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "The action did not complete.";
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: message,
    }),
  );
}

function mapProjectScriptInput(
  script: Pick<ProjectScript, "id">,
  input: NewProjectScriptInput,
): ProjectScript {
  return {
    id: script.id,
    name: input.name,
    command: input.command,
    icon: input.icon,
    runOnWorktreeCreate: input.runOnWorktreeCreate,
    ...(input.previewUrl ? { previewUrl: input.previewUrl } : {}),
    ...(input.previewUrl ? { autoOpenPreview: input.autoOpenPreview } : {}),
  };
}

export function ProjectManagementRouteView({
  target,
}: {
  readonly target: ProjectManagementRouteTarget;
}) {
  const navigate = useNavigate();
  const redirectStartedRef = useRef(false);
  const projectRef = useMemo(
    () => scopeProjectRef(target.environmentId, target.projectId),
    [target.environmentId, target.projectId],
  );
  const project = useProject(projectRef);
  const serverConfigs = useServerConfigs();
  const threads = useProjectManagementThreads(target);
  const shell = useEnvironmentQuery(environmentShell.stateAtom(target.environmentId));
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const statusQuery = useEnvironmentQuery(
    project
      ? vcsEnvironment.status({
          environmentId: target.environmentId,
          input: { cwd: project.workspaceRoot },
        })
      : null,
  );
  const refreshStatus = useAtomCommand(vcsEnvironment.refreshStatus, {
    reportFailure: false,
  });
  const pullProject = useAtomCommand(vcsEnvironment.pull, {
    reportFailure: false,
  });
  const updateProject = useAtomCommand(projectEnvironment.update, {
    reportFailure: false,
  });
  const upsertKeybinding = useAtomCommand(serverEnvironment.upsertKeybinding, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();
  const openInPreferredEditor = useOpenInPreferredEditor(
    target.environmentId,
    serverConfigs.get(target.environmentId)?.availableEditors ?? [],
  );
  const keybindings =
    serverConfigs.get(target.environmentId)?.keybindings ?? DEFAULT_RESOLVED_KEYBINDINGS;

  useEffect(() => {
    if (bootstrapComplete && project === null) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, navigate, project]);

  const managementProject = useMemo(
    () =>
      project
        ? buildManagementProject({
            environmentId: project.environmentId,
            id: project.id,
            title: project.title,
            workspaceRoot: project.workspaceRoot,
            scripts: project.scripts,
          })
        : null,
    [project],
  );
  const repositoryStatus = mapVcsStatusToProjectRepositoryStatus(statusQuery.data);
  const snapshot = useMemo(
    () =>
      buildProjectOverviewSnapshot({
        threads,
        repositoryStatus,
        repositoryContext: {
          isWorktree: false,
        },
      }),
    [repositoryStatus, threads],
  );
  const latestActiveThread = useMemo(
    () => latestActiveProjectThread(threads, snapshot),
    [snapshot, threads],
  );

  useEffect(() => {
    if (!project || !bootstrapComplete || redirectStartedRef.current) return;
    redirectStartedRef.current = true;

    const openPanel = (threadRef: ScopedThreadRef) => {
      if (target.view === "inference") {
        useRightPanelStore.getState().openProjectSurface(threadRef, "inference", projectRef);
      } else {
        useRightPanelStore.getState().showLauncher(threadRef);
      }
    };

    if (latestActiveThread) {
      const threadRef = threadRefForManagementThread(latestActiveThread);
      openPanel(threadRef);
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
        replace: true,
      });
      return;
    }

    void handleNewThread(projectRef, {
      beforeNavigate: (threadId) => openPanel(scopeThreadRef(target.environmentId, threadId)),
    });
  }, [
    bootstrapComplete,
    handleNewThread,
    latestActiveThread,
    navigate,
    project,
    projectRef,
    target.environmentId,
    target.view,
  ]);

  const openThread = useCallback(
    (thread: ProjectManagementThread) => {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRefForManagementThread(thread)),
      });
    },
    [navigate],
  );

  const openLatestThread = useCallback(() => {
    if (latestActiveThread) {
      openThread(latestActiveThread);
    }
  }, [latestActiveThread, openThread]);

  const startNewThread = useCallback(() => {
    void handleNewThread(projectRef);
  }, [handleNewThread, projectRef]);

  const runScript = useCallback(
    (script: ProjectScript) => {
      if (!project) {
        return;
      }
      void handleNewThread(projectRef, {
        beforeNavigate: (threadId) => {
          schedulePendingProjectScriptRun({
            threadId,
            projectId: project.id,
            scriptId: script.id,
          });
        },
      });
    },
    [handleNewThread, project, projectRef],
  );

  const persistProjectScripts = useCallback(
    async (input: {
      readonly projectId: ProjectId;
      readonly nextScripts: ReadonlyArray<ProjectScript>;
      readonly keybinding?: string | null;
      readonly keybindingCommand: KeybindingCommand;
    }): Promise<ProjectScriptActionResult> => {
      const updateResult = mapAtomCommandResult(
        await updateProject({
          environmentId: target.environmentId,
          input: {
            projectId: input.projectId,
            scripts: input.nextScripts,
          },
        }),
        () => undefined,
      );
      if (updateResult._tag === "Failure") {
        return updateResult;
      }

      const keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding: input.keybinding,
        command: input.keybindingCommand,
      });

      if (isElectron && keybindingRule) {
        return mapAtomCommandResult(
          await upsertKeybinding({
            environmentId: target.environmentId,
            input: keybindingRule,
          }),
          () => undefined,
        );
      }
      return updateResult;
    },
    [target.environmentId, updateProject, upsertKeybinding],
  );

  const addProjectScript = useCallback(
    async (input: NewProjectScriptInput): Promise<ProjectScriptActionResult> => {
      if (!project) {
        return AsyncResult.success(undefined);
      }
      const nextId = nextProjectScriptId(
        input.name,
        project.scripts.map((script) => script.id),
      );
      const nextScript = mapProjectScriptInput({ id: nextId }, input);
      const nextScripts = input.runOnWorktreeCreate
        ? [
            ...project.scripts.map((script) =>
              script.runOnWorktreeCreate ? { ...script, runOnWorktreeCreate: false } : script,
            ),
            nextScript,
          ]
        : [...project.scripts, nextScript];

      return persistProjectScripts({
        projectId: project.id,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(nextId),
      });
    },
    [persistProjectScripts, project],
  );

  const updateProjectScript = useCallback(
    async (scriptId: string, input: NewProjectScriptInput): Promise<ProjectScriptActionResult> => {
      if (!project) {
        return AsyncResult.success(undefined);
      }
      const existingScript = project.scripts.find((script) => script.id === scriptId);
      if (!existingScript) {
        return AsyncResult.failure(Cause.fail(new Error("Script not found.")));
      }

      const updatedScript = mapProjectScriptInput(existingScript, input);
      const nextScripts = project.scripts.map((script) =>
        script.id === scriptId
          ? updatedScript
          : input.runOnWorktreeCreate
            ? { ...script, runOnWorktreeCreate: false }
            : script,
      );

      return persistProjectScripts({
        projectId: project.id,
        nextScripts,
        keybinding: input.keybinding,
        keybindingCommand: commandForProjectScript(scriptId),
      });
    },
    [persistProjectScripts, project],
  );

  const deleteProjectScript = useCallback(
    async (scriptId: string): Promise<ProjectScriptActionResult> => {
      if (!project) {
        return AsyncResult.success(undefined);
      }
      const result = await persistProjectScripts({
        projectId: project.id,
        nextScripts: project.scripts.filter((script) => script.id !== scriptId),
        keybinding: null,
        keybindingCommand: commandForProjectScript(scriptId),
      });
      if (result._tag === "Success") {
        toastManager.add({
          type: "success",
          title: "Deleted project action",
        });
      } else if (!isAtomCommandInterrupted(result)) {
        reportActionFailure("Could not delete project action", squashAtomCommandFailure(result));
      }
      return result;
    },
    [persistProjectScripts, project],
  );

  const openEditor = useCallback(() => {
    if (!project) {
      return;
    }
    void (async () => {
      const result = await openInPreferredEditor(project.workspaceRoot);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        reportActionFailure("Could not open editor", squashAtomCommandFailure(result));
      }
    })();
  }, [openInPreferredEditor, project]);

  const refreshGit = useCallback(() => {
    if (!project) {
      return;
    }
    void (async () => {
      const result = await refreshStatus({
        environmentId: target.environmentId,
        input: { cwd: project.workspaceRoot },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        reportActionFailure("Could not refresh Git status", squashAtomCommandFailure(result));
      }
    })();
  }, [project, refreshStatus, target.environmentId]);

  const pullGit = useCallback(() => {
    if (!project) {
      return;
    }
    void (async () => {
      const result = await pullProject({
        environmentId: target.environmentId,
        input: { cwd: project.workspaceRoot },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        reportActionFailure("Could not pull repository", squashAtomCommandFailure(result));
      }
    })();
  }, [project, pullProject, target.environmentId]);

  const navigateTarget = useCallback(
    (nextTarget: ProjectManagementRouteTarget) => {
      void navigate({
        to: "/projects/$environmentId/$projectId",
        params: {
          environmentId: nextTarget.environmentId,
          projectId: nextTarget.projectId,
        },
        search: { view: nextTarget.view },
      });
    },
    [navigate],
  );

  if (!managementProject) {
    return null;
  }

  return (
    <ProjectManagementShell
      target={target}
      title={managementProject.name}
      workspaceRoot={managementProject.cwd}
      onNavigate={navigateTarget}
    >
      {target.view === "inference" ? (
        <ProjectInferenceDashboardPage
          projectId={target.projectId}
          threads={threads}
          onOpenThread={openThread}
        />
      ) : (
        <ProjectManagementPage
          project={managementProject}
          snapshot={snapshot}
          repositoryStatus={statusQuery.data}
          repositoryStatusError={statusQuery.error}
          repositoryStatusPending={statusQuery.isPending}
          latestActiveThread={latestActiveThread}
          onNewThread={startNewThread}
          onOpenEditor={openEditor}
          onOpenLatestThread={openLatestThread}
          onOpenThread={openThread}
          onRefreshGit={refreshGit}
          onPullGit={pullGit}
          onRunScript={runScript}
          keybindings={keybindings}
          onAddProjectScript={addProjectScript}
          onUpdateProjectScript={updateProjectScript}
          onDeleteProjectScript={deleteProjectScript}
        />
      )}
    </ProjectManagementShell>
  );
}
