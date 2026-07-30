import {
  EnvironmentId,
  ProjectId,
  type ScopedProjectRef,
  type ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  clearDeletedThreadState,
  clearDeletedThreadStates,
  runProjectDeletionLifecycle,
  runThreadDeletionLifecycle,
  runWorktreeThreadTeardown,
} from "./threadDeletionWorkflow";

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
      removeFromThreadSelection: vi.fn(),
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
    expect(actions.removeFromThreadSelection).toHaveBeenCalledExactlyOnceWith([deletedThreadRef]);
  });

  it("clears local state and bulk selection for every deleted project thread", () => {
    const secondThreadRef: ScopedThreadRef = {
      environmentId: deletedThreadRef.environmentId,
      threadId: ThreadId.make("thread-second"),
    };
    const actions = {
      clearComposerDraftForThread: vi.fn(),
      clearProjectDraftThreadById: vi.fn(),
      clearTerminalUiState: vi.fn(),
      clearRightPanelState: vi.fn(),
      clearDiffPanelState: vi.fn(),
      removeFromThreadSelection: vi.fn(),
    };

    clearDeletedThreadStates({
      targets: [
        { threadRef: deletedThreadRef, projectRef },
        { threadRef: secondThreadRef, projectRef },
      ],
      actions,
    });

    expect(actions.clearComposerDraftForThread).toHaveBeenCalledTimes(2);
    expect(actions.clearComposerDraftForThread).toHaveBeenNthCalledWith(1, deletedThreadRef);
    expect(actions.clearComposerDraftForThread).toHaveBeenNthCalledWith(2, secondThreadRef);
    expect(actions.clearProjectDraftThreadById).toHaveBeenCalledTimes(2);
    expect(actions.removeFromThreadSelection).toHaveBeenCalledExactlyOnceWith([
      deletedThreadRef,
      secondThreadRef,
    ]);
  });
});

describe("runProjectDeletionLifecycle", () => {
  it("cleans threads that appear during confirmation and deletion", async () => {
    const existingThreadRef = deletedThreadRef;
    const duringConfirmationThreadRef: ScopedThreadRef = {
      environmentId: deletedThreadRef.environmentId,
      threadId: ThreadId.make("thread-during-confirmation"),
    };
    const duringDeletionThreadRef: ScopedThreadRef = {
      environmentId: deletedThreadRef.environmentId,
      threadId: ThreadId.make("thread-during-deletion"),
    };
    const targetsBeforeDelete = [
      { threadRef: existingThreadRef, projectRef },
      { threadRef: duringConfirmationThreadRef, projectRef },
    ];
    const targetsAfterDelete = [
      ...targetsBeforeDelete,
      { threadRef: duringDeletionThreadRef, projectRef },
    ];
    const readThreadTargets = vi
      .fn<() => readonly (typeof targetsAfterDelete)[number][]>()
      .mockReturnValueOnce(targetsBeforeDelete)
      .mockReturnValueOnce(targetsAfterDelete);
    const actions = {
      clearComposerDraftForThread: vi.fn(),
      clearProjectDraftThreadById: vi.fn(),
      clearTerminalUiState: vi.fn(),
      clearRightPanelState: vi.fn(),
      clearDiffPanelState: vi.fn(),
      removeFromThreadSelection: vi.fn(),
    };
    const deleteProjectRecord = vi.fn(
      async (targets: readonly (typeof targetsAfterDelete)[number][]) => {
        expect(targets).toEqual(targetsBeforeDelete);
        return { deleted: true };
      },
    );

    await runProjectDeletionLifecycle({
      readThreadTargets,
      deleteProjectRecord,
      didDeleteProject: (result) => result.deleted,
      actions,
    });

    expect(readThreadTargets).toHaveBeenCalledTimes(2);
    for (const threadRef of [
      existingThreadRef,
      duringConfirmationThreadRef,
      duringDeletionThreadRef,
    ]) {
      expect(actions.clearComposerDraftForThread).toHaveBeenCalledWith(threadRef);
      expect(actions.clearTerminalUiState).toHaveBeenCalledWith(threadRef);
      expect(actions.clearRightPanelState).toHaveBeenCalledWith(threadRef);
      expect(actions.clearDiffPanelState).toHaveBeenCalledWith(threadRef);
    }
    expect(actions.removeFromThreadSelection).toHaveBeenCalledExactlyOnceWith([
      existingThreadRef,
      duringConfirmationThreadRef,
      duringDeletionThreadRef,
    ]);
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
    expect(calls).toEqual(["stop-session", "close-terminals", "delete-thread", "remove-worktree"]);

    finishWorktreeRemoval?.();
    const result = await lifecycle;

    expect(result).toBe("deleted");
    expect(calls).toEqual([
      "stop-session",
      "close-terminals",
      "delete-thread",
      "remove-worktree",
      "remove-worktree-complete",
      "clear-local-state",
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
      "remove-worktree",
      "report-worktree-error",
      "clear-local-state",
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

describe("runWorktreeThreadTeardown", () => {
  it("closes a worktree before retaining and releasing its thread", async () => {
    const calls: string[] = [];
    const result = await runWorktreeThreadTeardown({
      stopSession: async () => {
        calls.push("stop-session");
      },
      closeTerminalState: async () => {
        calls.push("close-terminals");
      },
      removeWorktreeBeforeTransition: true,
      removeWorktree: async () => {
        calls.push("remove-worktree");
      },
      refreshRepository: async () => {
        calls.push("refresh-repository");
      },
      transitionThreadRecord: async () => {
        calls.push("release-thread");
        return { transitioned: true, result: "retained" };
      },
      clearRuntimeState: () => {
        calls.push("clear-runtime");
      },
    });

    expect(result).toBe("retained");
    expect(calls).toEqual([
      "stop-session",
      "close-terminals",
      "remove-worktree",
      "refresh-repository",
      "release-thread",
      "clear-runtime",
    ]);
  });

  it("does not release a retained thread when safe worktree removal fails", async () => {
    const releaseThread = vi.fn(async () => ({ transitioned: true, result: "retained" }));
    await expect(
      runWorktreeThreadTeardown({
        closeTerminalState: async () => undefined,
        removeWorktreeBeforeTransition: true,
        removeWorktree: async () => {
          throw new Error("dirty worktree");
        },
        transitionThreadRecord: releaseThread,
        clearRuntimeState: vi.fn(),
      }),
    ).rejects.toThrow("dirty worktree");
    expect(releaseThread).not.toHaveBeenCalled();
  });

  it("restores a retained thread when removal fails after release", async () => {
    const calls: string[] = [];
    await expect(
      runWorktreeThreadTeardown({
        closeTerminalState: async () => undefined,
        transitionThreadRecord: async () => {
          calls.push("release-thread");
          return { transitioned: true, result: "retained" };
        },
        removeWorktree: async () => {
          calls.push("remove-worktree");
          throw new Error("dirty worktree");
        },
        rollbackThreadRecord: async () => {
          calls.push("restore-thread");
        },
        clearRuntimeState: vi.fn(),
      }),
    ).rejects.toThrow("dirty worktree");
    expect(calls).toEqual(["release-thread", "remove-worktree", "restore-thread"]);
  });

  it("discards by deleting the thread before forced worktree teardown", async () => {
    const calls: string[] = [];
    await runWorktreeThreadTeardown({
      closeTerminalState: async () => {
        calls.push("close-terminals");
      },
      transitionThreadRecord: async () => {
        calls.push("delete-thread");
        return { transitioned: true, result: "discarded" };
      },
      removeWorktree: async () => {
        calls.push("remove-worktree");
      },
      clearRuntimeState: () => {
        calls.push("clear-thread-state");
      },
    });
    expect(calls).toEqual([
      "close-terminals",
      "delete-thread",
      "remove-worktree",
      "clear-thread-state",
    ]);
  });
});
