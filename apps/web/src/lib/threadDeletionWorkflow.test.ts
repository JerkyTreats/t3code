import { describe, expect, it, vi } from "vitest";

import { runThreadDeletionLifecycle } from "./threadDeletionWorkflow";

describe("runThreadDeletionLifecycle", () => {
  it("removes an orphaned worktree before routing to fallback content", async () => {
    const calls: string[] = [];

    await runThreadDeletionLifecycle({
      stopSession: vi.fn(async () => {
        calls.push("stop-session");
      }),
      closeTerminalState: vi.fn(async () => {
        calls.push("close-terminals");
      }),
      deleteThreadRecord: vi.fn(async () => {
        calls.push("delete-thread");
      }),
      clearLocalThreadState: vi.fn(() => {
        calls.push("clear-local-state");
      }),
      removeOrphanedWorktree: vi.fn(async () => {
        calls.push("remove-worktree");
      }),
      navigateToFallback: vi.fn(async () => {
        calls.push("navigate-fallback");
      }),
    });

    expect(calls).toEqual([
      "stop-session",
      "close-terminals",
      "delete-thread",
      "clear-local-state",
      "remove-worktree",
      "navigate-fallback",
    ]);
  });

  it("still routes after reporting a worktree removal failure", async () => {
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
});
