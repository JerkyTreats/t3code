import type {
  EnvironmentId,
  OrchestrationLatestTurn,
  OrchestrationThreadActivity,
  ProjectId,
  ProjectScript,
  ThreadId,
} from "@t3tools/contracts";

export interface ProjectManagementProject {
  readonly id: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly name: string;
  readonly cwd: string;
  readonly scripts: ReadonlyArray<ProjectScript>;
}

export interface ProjectManagementThread {
  readonly id: ThreadId;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt?: string | undefined;
  readonly latestTurn: OrchestrationLatestTurn | null;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly activities: ReadonlyArray<OrchestrationThreadActivity>;
}

export interface ProjectManagementRepositoryStatusInput {
  readonly isRepo: boolean;
  readonly hasOriginRemote: boolean;
  readonly branch: string | null;
  readonly hasWorkingTreeChanges: boolean;
  readonly changedFileCount: number;
  readonly hasUpstream: boolean;
  readonly aheadCount: number;
  readonly behindCount: number;
}

export interface ProjectManagementRepositoryContextInput {
  readonly isWorktree: boolean;
}

export interface ProjectManagementRouteTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly view: ProjectManagementRouteView;
}

export type ProjectManagementRouteView = "management" | "inference";
