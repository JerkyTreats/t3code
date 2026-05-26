export interface ThreadDeletionLifecycleInput {
  stopSession?: () => Promise<void>;
  closeTerminalState: () => Promise<void>;
  deleteThreadRecord: () => Promise<void>;
  clearLocalThreadState: () => void;
  removeOrphanedWorktree?: () => Promise<void>;
  navigateToFallback?: () => Promise<void>;
  onWorktreeRemovalError?: (error: unknown) => void;
}

export async function runThreadDeletionLifecycle(input: ThreadDeletionLifecycleInput) {
  await input.stopSession?.();
  await input.closeTerminalState();
  await input.deleteThreadRecord();
  input.clearLocalThreadState();

  if (input.removeOrphanedWorktree) {
    try {
      await input.removeOrphanedWorktree();
    } catch (error) {
      input.onWorktreeRemovalError?.(error);
    }
  }

  await input.navigateToFallback?.();
}
