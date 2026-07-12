import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";

export interface DeletedThreadStateActions {
  clearComposerDraftForThread: (threadRef: ScopedThreadRef) => void;
  clearProjectDraftThreadById: (projectRef: ScopedProjectRef, threadRef: ScopedThreadRef) => void;
  clearTerminalUiState: (threadRef: ScopedThreadRef) => void;
  clearRightPanelState: (threadRef: ScopedThreadRef) => void;
  clearDiffPanelState: (threadRef: ScopedThreadRef) => void;
}

export interface ClearDeletedThreadStateInput {
  threadRef: ScopedThreadRef;
  projectRef: ScopedProjectRef;
  actions: DeletedThreadStateActions;
}

export function clearDeletedThreadState(input: ClearDeletedThreadStateInput): void {
  input.actions.clearComposerDraftForThread(input.threadRef);
  input.actions.clearProjectDraftThreadById(input.projectRef, input.threadRef);
  input.actions.clearTerminalUiState(input.threadRef);
  input.actions.clearRightPanelState(input.threadRef);
  input.actions.clearDiffPanelState(input.threadRef);
}

export interface ThreadDeletionLifecycleInput<TResult, TNavigationResult = never> {
  stopSession?: () => Promise<void>;
  closeTerminalState: () => Promise<void>;
  deleteThreadRecord: () => Promise<{ deleted: boolean; result: TResult }>;
  clearLocalThreadState: () => void;
  removeOrphanedWorktree?: () => Promise<void>;
  navigateToFallback?: () => Promise<TNavigationResult | undefined>;
  onWorktreeRemovalError?: (error: unknown) => void;
}

export async function runThreadDeletionLifecycle<TResult, TNavigationResult = never>(
  input: ThreadDeletionLifecycleInput<TResult, TNavigationResult>,
): Promise<TResult | TNavigationResult> {
  await input.stopSession?.();
  await input.closeTerminalState();

  const deletion = await input.deleteThreadRecord();
  if (!deletion.deleted) {
    return deletion.result;
  }

  input.clearLocalThreadState();

  if (input.removeOrphanedWorktree) {
    try {
      await input.removeOrphanedWorktree();
    } catch (error) {
      input.onWorktreeRemovalError?.(error);
    }
  }

  const navigationResult = await input.navigateToFallback?.();
  if (navigationResult !== undefined) {
    return navigationResult;
  }
  return deletion.result;
}
