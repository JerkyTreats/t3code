import { describe, expect, it } from "vite-plus/test";
import type { EnvironmentId, ProjectId, ThreadId, TurnId } from "@t3tools/contracts";

import { buildProjectOverviewSnapshot } from "./projectManagementOverview";
import type { ProjectManagementThread } from "./projectManagementTypes";

function makeThread(
  overrides: Partial<ProjectManagementThread> &
    Pick<ProjectManagementThread, "id" | "projectId" | "title">,
): ProjectManagementThread {
  const { id, projectId, title, ...rest } = overrides;
  return {
    id,
    environmentId: "env-local" as EnvironmentId,
    projectId,
    title,
    createdAt: "2026-03-01T10:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-03-01T10:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    activities: [],
    ...rest,
  };
}

describe("buildProjectOverviewSnapshot", () => {
  it("rolls up thread counts, unique branches, and recent work", () => {
    const snapshot = buildProjectOverviewSnapshot({
      threads: [
        makeThread({
          id: "thread-1" as ThreadId,
          projectId: "project-1" as ProjectId,
          title: "Fix login",
          branch: "feature/login",
          updatedAt: "2026-03-10T10:00:00.000Z",
          latestTurn: {
            turnId: "turn-1" as TurnId,
            state: "completed",
            assistantMessageId: null,
            requestedAt: "2026-03-10T09:00:00.000Z",
            startedAt: "2026-03-10T09:00:00.000Z",
            completedAt: "2026-03-10T09:05:00.000Z",
          },
          activities: [
            {
              id: "activity-1" as never,
              tone: "tool",
              kind: "tool.completed",
              summary: "Updated auth form",
              payload: {
                detail: "Edited auth.tsx",
              },
              turnId: "turn-1" as TurnId,
              sequence: 1,
              createdAt: "2026-03-10T09:03:00.000Z",
            },
          ],
        }),
        makeThread({
          id: "thread-2" as ThreadId,
          projectId: "project-1" as ProjectId,
          title: "Archive me",
          branch: "feature/login",
          archivedAt: "2026-03-05T10:00:00.000Z",
          updatedAt: "2026-03-05T10:00:00.000Z",
        }),
        makeThread({
          id: "thread-3" as ThreadId,
          projectId: "project-1" as ProjectId,
          title: "Refine docs",
          branch: "docs/project-page",
          worktreePath: "/repo/.worktrees/docs",
          updatedAt: "2026-03-11T10:00:00.000Z",
        }),
      ],
      repositoryStatus: {
        isRepo: true,
        hasOriginRemote: true,
        branch: "main",
        hasWorkingTreeChanges: false,
        changedFileCount: 0,
        hasUpstream: true,
        aheadCount: 2,
        behindCount: 1,
      },
      repositoryContext: {
        isWorktree: false,
      },
      nowIso: "2026-03-12T10:00:00.000Z",
    });

    expect(snapshot.activeThreadCount).toBe(2);
    expect(snapshot.archivedThreadCount).toBe(1);
    expect(snapshot.branches).toEqual(["main", "docs/project-page", "feature/login"]);
    expect(snapshot.worktreeCount).toBe(1);
    expect(snapshot.linkedThreads.map((thread) => thread.id)).toEqual([
      "thread-3",
      "thread-1",
      "thread-2",
    ]);
    expect(snapshot.recentWork).toEqual([
      expect.objectContaining({
        id: "activity-1",
        threadId: "thread-1",
        threadTitle: "Fix login",
        label: "Updated auth form",
      }),
    ]);
    expect(snapshot.repoSummary).toEqual({
      statusLabel: "Working tree clean",
      branchLabel: "On main",
      remoteLabel: "2 ahead / 1 behind",
      workspaceKindLabel: "Primary checkout",
    });
  });

  it("deduplicates inference rollups by turn and keeps the latest duration", () => {
    const snapshot = buildProjectOverviewSnapshot({
      threads: [
        makeThread({
          id: "thread-1" as ThreadId,
          projectId: "project-1" as ProjectId,
          title: "Inference",
          activities: [
            {
              id: "activity-1" as never,
              tone: "info",
              kind: "context-window.updated",
              summary: "Usage updated",
              payload: {
                durationMs: 1_500,
              },
              turnId: "turn-1" as TurnId,
              sequence: 1,
              createdAt: "2026-03-10T09:00:00.000Z",
            },
            {
              id: "activity-2" as never,
              tone: "info",
              kind: "context-window.updated",
              summary: "Usage updated",
              payload: {
                durationMs: 3_500,
              },
              turnId: "turn-1" as TurnId,
              sequence: 2,
              createdAt: "2026-03-10T09:01:00.000Z",
            },
            {
              id: "activity-3" as never,
              tone: "info",
              kind: "context-window.updated",
              summary: "Usage updated",
              payload: {
                durationMs: 4_000,
              },
              turnId: "turn-2" as TurnId,
              sequence: 3,
              createdAt: "2026-02-20T09:01:00.000Z",
            },
          ],
        }),
      ],
      repositoryStatus: null,
      repositoryContext: null,
      nowIso: "2026-03-12T10:00:00.000Z",
    });

    expect(snapshot.inference.totalDurationMs).toBe(7_500);
    expect(snapshot.inference.totalTurns).toBe(2);
    expect(snapshot.inference.recentDurationMs).toBe(3_500);
    expect(snapshot.inference.recentTurns).toBe(1);
    expect(snapshot.inference.totalLabel).toBe("7.5s");
    expect(snapshot.inference.recentLabel).toBe("3.5s");
  });
});
