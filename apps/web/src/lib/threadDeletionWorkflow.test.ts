import {
  EnvironmentId,
  ProjectId,
  type ScopedProjectRef,
  type ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { clearDeletedThreadState, runThreadDeletionLifecycle } from "./threadDeletionWorkflow";

const deletedThreadRef: ScopedThreadRef = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-deleted"),
};

const projectRef: ScopedProjectRef = {
  environmentId: deletedThreadRef.environmentId,
  projectId: ProjectId.make("project-1"),
};

describe("clearDeletedThreadState", () => {
  it("clears only state scoped to the deleted thread", () => {
    const actions = {
      clearComposerDraftForThread: vi.fn(),
      clearProjectDraftThreadById: vi.fn(),
      clearTerminalUiState: vi.fn(),
      clearRightPanelState: vi.fn(),
      clearDiffPanelState: vi.fn(),
    };

    clearDeletedThreadState({ threadRef: deletedThreadRef, projectRef, actions });

    expect(actions.clearComposerDraftForThread).toHaveBeenCalledExactlyOnceWith(deletedThreadRef);
    expect(actions.clearProjectDraftThreadById).toHaveBeenCalledExactlyOnceWith(
      projectRef,
      deletedThreadRef,
    );
    expect(actions.clearTerminalUiState).toHaveBeenCalledExactlyOnceWith(deletedThreadRef);
    expect(actions.clearRightPanelState).toHaveBeenCalledExactlyOnceWith(deletedThreadRef);
    expect(actions.clearDiffPanelState).toHaveBeenCalledExactlyOnceWith(deletedThreadRef);
  });
});

describe("runThreadDeletionLifecycle", () => {
  it("removes an orphaned worktree before routing to fallback content", async () => {
    const calls: string[] = [];
    let finishWorktreeRemoval: (() => void) | undefined;
    let markWorktreeRemovalStarted: (() => void) | undefined;
    const worktreeRemovalStarted = new Promise<void>((resolve) => {
      markWorktreeRemovalStarted = resolve;
    });
    const worktreeRemovalFinished = new Promise<void>((resolve) => {
      finishWorktreeRemoval = resolve;
    });

    const lifecycle = runThreadDeletionLifecycle({
      stopSession: vi.fn(async () => {
        calls.push("stop-session");
      }),
      closeTerminalState: vi.fn(async () => {
        calls.push("close-terminals");
      }),
      deleteThreadRecord: vi.fn(async () => {
        calls.push("delete-thread");
        return { deleted: true, result: "deleted" };
      }),
      clearLocalThreadState: vi.fn(() => {
        calls.push("clear-local-state");
      }),
      removeOrphanedWorktree: vi.fn(async () => {
        calls.push("remove-worktree");
        markWorktreeRemovalStarted?.();
        await worktreeRemovalFinished;
        calls.push("remove-worktree-complete");
      }),
      navigateToFallback: vi.fn(async () => {
        calls.push("navigate-fallback");
      }),
    });

    await worktreeRemovalStarted;
    expect(calls).toEqual([
      "stop-session",
      "close-terminals",
      "delete-thread",
      "clear-local-state",
      "remove-worktree",
    ]);

    finishWorktreeRemoval?.();
    const result = await lifecycle;

    expect(result).toBe("deleted");
    expect(calls).toEqual([
      "stop-session",
      "close-terminals",
      "delete-thread",
      "clear-local-state",
      "remove-worktree",
      "remove-worktree-complete",
      "navigate-fallback",
    ]);
  });

  it("reports worktree removal failure before continuing fallback navigation", async () => {
    const calls: string[] = [];
    const removalError = new Error("remove failed");
    const onWorktreeRemovalError = vi.fn((error: unknown) => {
      calls.push("report-worktree-error");
      expect(error).toBe(removalError);
    });

    await runThreadDeletionLifecycle({
      closeTerminalState: vi.fn(async () => {
        calls.push("close-terminals");
      }),
      deleteThreadRecord: vi.fn(async () => {
        calls.push("delete-thread");
        return { deleted: true, result: "deleted" };
      }),
      clearLocalThreadState: vi.fn(() => {
        calls.push("clear-local-state");
      }),
      removeOrphanedWorktree: vi.fn(async () => {
        calls.push("remove-worktree");
        throw removalError;
      }),
      onWorktreeRemovalError,
      navigateToFallback: vi.fn(async () => {
        calls.push("navigate-fallback");
      }),
    });

    expect(onWorktreeRemovalError).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "close-terminals",
      "delete-thread",
      "clear-local-state",
      "remove-worktree",
      "report-worktree-error",
      "navigate-fallback",
    ]);
  });

  it("does not clear state, remove a worktree, or navigate when deletion fails", async () => {
    const clearLocalThreadState = vi.fn();
    const removeOrphanedWorktree = vi.fn(async () => undefined);
    const navigateToFallback = vi.fn(async () => undefined);

    const result = await runThreadDeletionLifecycle({
      closeTerminalState: vi.fn(async () => undefined),
      deleteThreadRecord: vi.fn(async () => ({ deleted: false, result: "failed" })),
      clearLocalThreadState,
      removeOrphanedWorktree,
      navigateToFallback,
    });

    expect(result).toBe("failed");
    expect(clearLocalThreadState).not.toHaveBeenCalled();
    expect(removeOrphanedWorktree).not.toHaveBeenCalled();
    expect(navigateToFallback).not.toHaveBeenCalled();
  });

  it("returns fallback navigation failures after teardown completes", async () => {
    const navigationFailure = { type: "navigation-failure" } as const;

    const result = await runThreadDeletionLifecycle({
      closeTerminalState: vi.fn(async () => undefined),
      deleteThreadRecord: vi.fn(async () => ({ deleted: true, result: "deleted" })),
      clearLocalThreadState: vi.fn(),
      navigateToFallback: vi.fn(async () => navigationFailure),
    });

    expect(result).toBe(navigationFailure);
  });
});
