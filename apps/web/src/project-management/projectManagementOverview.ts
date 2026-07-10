import { deriveWorkLogEntries } from "../session-logic";
import {
  deriveProjectInferenceRollup,
  latestProjectThreadActivityAt,
  type ProjectInferenceRollup,
} from "./projectManagementInference";
import type {
  ProjectManagementRepositoryContextInput,
  ProjectManagementRepositoryStatusInput,
  ProjectManagementThread,
} from "./projectManagementTypes";

export interface ProjectOverviewLinkedThread {
  readonly id: ProjectManagementThread["id"];
  readonly environmentId: ProjectManagementThread["environmentId"];
  readonly title: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly archivedAt: string | null;
  readonly latestActivityAt: string;
}

export interface ProjectOverviewRecentWorkEntry {
  readonly id: string;
  readonly threadId: ProjectManagementThread["id"];
  readonly environmentId: ProjectManagementThread["environmentId"];
  readonly threadTitle: string;
  readonly createdAt: string;
  readonly label: string;
  readonly detail?: string | undefined;
  readonly command?: string | undefined;
  readonly tone: "info" | "tool" | "error" | "thinking";
}

export interface ProjectRepoSummary {
  readonly statusLabel: string;
  readonly branchLabel: string;
  readonly remoteLabel: string;
  readonly workspaceKindLabel: string;
}

export interface ProjectOverviewSnapshot {
  readonly activeThreadCount: number;
  readonly archivedThreadCount: number;
  readonly linkedThreads: ReadonlyArray<ProjectOverviewLinkedThread>;
  readonly recentWork: ReadonlyArray<ProjectOverviewRecentWorkEntry>;
  readonly inference: ProjectInferenceRollup;
  readonly branches: ReadonlyArray<string>;
  readonly worktreeCount: number;
  readonly repoSummary: ProjectRepoSummary;
}

function deriveRecentWork(
  threads: ReadonlyArray<ProjectManagementThread>,
  limit: number,
): ProjectOverviewRecentWorkEntry[] {
  return threads
    .flatMap((thread) =>
      deriveWorkLogEntries(thread.activities).map((entry) => {
        return {
          id: entry.id,
          threadId: thread.id,
          environmentId: thread.environmentId,
          threadTitle: thread.title,
          createdAt: entry.createdAt,
          label: entry.label,
          detail: entry.detail,
          command: entry.command,
          tone: entry.tone,
        };
      }),
    )
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

function buildRepoSummary(input: {
  readonly repositoryStatus: ProjectManagementRepositoryStatusInput | null;
  readonly repositoryContext: ProjectManagementRepositoryContextInput | null;
}): ProjectRepoSummary {
  const { repositoryStatus, repositoryContext } = input;
  if (!repositoryStatus?.isRepo) {
    return {
      statusLabel: "Not a Git repository",
      branchLabel: "No branch detected",
      remoteLabel: "No remote data",
      workspaceKindLabel: "Plain workspace",
    };
  }

  const remoteLabel = repositoryStatus.hasOriginRemote
    ? repositoryStatus.hasUpstream
      ? `${repositoryStatus.aheadCount} ahead / ${repositoryStatus.behindCount} behind`
      : "Origin configured, no upstream"
    : "No origin remote";
  const branchLabel = repositoryStatus.branch ? `On ${repositoryStatus.branch}` : "Detached HEAD";

  return {
    statusLabel: repositoryStatus.hasWorkingTreeChanges
      ? `${repositoryStatus.changedFileCount} changed file${
          repositoryStatus.changedFileCount === 1 ? "" : "s"
        }`
      : "Working tree clean",
    branchLabel,
    remoteLabel,
    workspaceKindLabel: repositoryContext?.isWorktree ? "Linked worktree" : "Primary checkout",
  };
}

export function buildProjectOverviewSnapshot(input: {
  readonly threads: ReadonlyArray<ProjectManagementThread>;
  readonly repositoryStatus: ProjectManagementRepositoryStatusInput | null;
  readonly repositoryContext: ProjectManagementRepositoryContextInput | null;
  readonly nowIso?: string;
  readonly recentWorkLimit?: number;
}): ProjectOverviewSnapshot {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const linkedThreads = [...input.threads]
    .map<ProjectOverviewLinkedThread>((thread) => ({
      id: thread.id,
      environmentId: thread.environmentId,
      title: thread.title,
      branch: thread.branch,
      worktreePath: thread.worktreePath,
      archivedAt: thread.archivedAt ?? null,
      latestActivityAt: latestProjectThreadActivityAt(thread),
    }))
    .toSorted((left, right) => right.latestActivityAt.localeCompare(left.latestActivityAt));

  const branches = [
    input.repositoryStatus?.branch,
    ...linkedThreads.map((thread) => thread.branch),
  ].filter((branch, index, values): branch is string => {
    if (!branch) {
      return false;
    }
    return values.indexOf(branch) === index;
  });

  return {
    activeThreadCount: linkedThreads.filter((thread) => thread.archivedAt === null).length,
    archivedThreadCount: linkedThreads.filter((thread) => thread.archivedAt !== null).length,
    linkedThreads,
    recentWork: deriveRecentWork(input.threads, input.recentWorkLimit ?? 6),
    inference: deriveProjectInferenceRollup(input.threads, nowIso),
    branches,
    worktreeCount: linkedThreads.filter((thread) => thread.worktreePath !== null).length,
    repoSummary: buildRepoSummary({
      repositoryStatus: input.repositoryStatus,
      repositoryContext: input.repositoryContext,
    }),
  };
}
