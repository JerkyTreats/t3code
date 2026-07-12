import type { ProjectScript, ResolvedKeybindingsConfig, VcsStatusResult } from "@t3tools/contracts";
import {
  ArrowRightIcon,
  ClipboardIcon,
  Code2Icon,
  ExternalLinkIcon,
  GitPullRequestArrowIcon,
  PlayIcon,
  RefreshCwIcon,
  SquarePenIcon,
} from "lucide-react";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import ProjectScriptsControl, {
  type NewProjectScriptInput,
  type ProjectScriptActionResult,
} from "~/components/ProjectScriptsControl";
import type {
  ProjectManagementProject,
  ProjectManagementThread,
} from "~/project-management/projectManagementTypes";
import type { ProjectOverviewSnapshot } from "~/project-management/projectManagementOverview";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { ProjectMetricCard } from "./ProjectMetricCard";

interface ProjectManagementPageProps {
  readonly project: ProjectManagementProject;
  readonly snapshot: ProjectOverviewSnapshot;
  readonly repositoryStatus: VcsStatusResult | null;
  readonly repositoryStatusError: string | null;
  readonly repositoryStatusPending: boolean;
  readonly latestActiveThread: ProjectManagementThread | null;
  readonly onNewThread: () => void;
  readonly onOpenEditor: () => void;
  readonly onOpenLatestThread: () => void;
  readonly onOpenThread: (thread: ProjectManagementThread) => void;
  readonly onRefreshGit: () => void;
  readonly onPullGit: () => void;
  readonly onRunScript: (script: ProjectScript) => void;
  readonly keybindings: ResolvedKeybindingsConfig;
  readonly onAddProjectScript: (input: NewProjectScriptInput) => Promise<ProjectScriptActionResult>;
  readonly onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  readonly onDeleteProjectScript: (scriptId: string) => Promise<ProjectScriptActionResult>;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatThreadTime(value: string): string {
  return formatRelativeTimeLabel(value);
}

export function ProjectManagementPage({
  project,
  snapshot,
  repositoryStatus,
  repositoryStatusError,
  repositoryStatusPending,
  latestActiveThread,
  onNewThread,
  onOpenEditor,
  onOpenLatestThread,
  onOpenThread,
  onRefreshGit,
  onPullGit,
  onRunScript,
  keybindings,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
}: ProjectManagementPageProps) {
  const { copyToClipboard: copyScriptCommand } = useCopyToClipboard<{
    scriptName: string;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Command copied",
        description: ctx.scriptName,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not copy command",
          description: error instanceof Error ? error.message : "The command was not copied.",
        }),
      );
    },
  });
  const changedFiles = repositoryStatus?.workingTree.files ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ProjectMetricCard
          label="Active threads"
          value={snapshot.activeThreadCount}
          detail={`${snapshot.archivedThreadCount} archived`}
        />
        <ProjectMetricCard
          label="Branches"
          value={snapshot.branches.length}
          detail={snapshot.branches.slice(0, 2).join(", ") || "No branches yet"}
        />
        <ProjectMetricCard
          label="Worktrees"
          value={snapshot.worktreeCount}
          detail={snapshot.repoSummary.workspaceKindLabel}
        />
        <ProjectMetricCard
          label="Tracked turns"
          value={snapshot.inference.totalTurns}
          detail={snapshot.inference.totalLabel}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold tracking-normal text-foreground">Workspace</h2>
              <p className="mt-1 text-xs text-muted-foreground">{project.cwd}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={onNewThread}>
                <SquarePenIcon className="size-4" />
                New thread
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onOpenEditor}>
                <Code2Icon className="size-4" />
                Open editor
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={latestActiveThread === null}
                onClick={onOpenLatestThread}
              >
                <ArrowRightIcon className="size-4" />
                Latest thread
              </Button>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Repository</div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {snapshot.repoSummary.statusLabel}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Branch</div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {snapshot.repoSummary.branchLabel}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Remote</div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {snapshot.repoSummary.remoteLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold tracking-normal text-foreground">Git status</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {repositoryStatusError ??
                  (repositoryStatusPending ? "Refreshing repository status" : project.cwd)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="icon-sm" variant="ghost" onClick={onRefreshGit}>
                <RefreshCwIcon className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!repositoryStatus?.isRepo}
                onClick={onPullGit}
              >
                <GitPullRequestArrowIcon className="size-4" />
                Pull
              </Button>
            </div>
          </div>
          <div className="max-h-72 overflow-auto p-4">
            {changedFiles.length > 0 ? (
              <div className="space-y-2">
                {changedFiles.slice(0, 12).map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{file.path}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      +{file.insertions} -{file.deletions}
                    </span>
                  </div>
                ))}
                {changedFiles.length > 12 ? (
                  <p className="text-xs text-muted-foreground">
                    {formatCount(changedFiles.length - 12)} more changed files
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {repositoryStatus?.isRepo === false
                  ? "This workspace is not a Git repository."
                  : "No changed files detected."}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-normal text-foreground">
                Project scripts
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Commands saved on this concrete project.
              </p>
            </div>
            <ProjectScriptsControl
              scripts={project.scripts}
              keybindings={keybindings}
              onRunScript={onRunScript}
              onAddScript={onAddProjectScript}
              onUpdateScript={onUpdateProjectScript}
              onDeleteScript={onDeleteProjectScript}
            />
          </div>
          <div className="divide-y divide-border">
            {project.scripts.length > 0 ? (
              project.scripts.map((script) => (
                <div key={script.id} className="grid gap-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {script.name}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {script.command}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onRunScript(script)}
                      >
                        <PlayIcon className="size-4" />
                      </Button>
                      {script.previewUrl ? (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => window.open(script.previewUrl, "_blank", "noopener")}
                        >
                          <ExternalLinkIcon className="size-4" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() =>
                          copyScriptCommand(script.command, { scriptName: script.name })
                        }
                      >
                        <ClipboardIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {script.runOnWorktreeCreate ? (
                    <div className="w-fit rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Worktree setup
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No project scripts are configured.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold tracking-normal text-foreground">
              Linked threads
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Threads attached to this environment scoped project.
            </p>
          </div>
          <div className="divide-y divide-border">
            {snapshot.linkedThreads.length > 0 ? (
              snapshot.linkedThreads.slice(0, 10).map((thread) => (
                <button
                  type="button"
                  key={`${thread.environmentId}:${thread.id}`}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-accent"
                  onClick={() =>
                    onOpenThread({
                      id: thread.id,
                      environmentId: thread.environmentId,
                      projectId: project.id,
                      title: thread.title,
                      archivedAt: thread.archivedAt,
                      createdAt: thread.latestActivityAt,
                      updatedAt: thread.latestActivityAt,
                      latestTurn: null,
                      branch: thread.branch,
                      worktreePath: thread.worktreePath,
                      activities: [],
                    })
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {thread.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {thread.branch ?? "No branch"}
                      {thread.worktreePath ? ` - ${thread.worktreePath}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatThreadTime(thread.latestActivityAt)}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No linked threads for this project yet.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
