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

export interface WorktreeThreadTeardownInput<TResult, TNavigationResult = never> {
  stopSession?: () => Promise<void>;
  closeTerminalState: () => Promise<void>;
  transitionThreadRecord: () => Promise<{ transitioned: boolean; result: TResult }>;
  rollbackThreadRecord?: () => Promise<void>;
  clearRuntimeState: () => void;
  removeWorktree?: () => Promise<void>;
  refreshRepository?: () => Promise<void>;
  removeWorktreeBeforeTransition?: boolean;
  continueAfterWorktreeRemovalError?: boolean;
  navigateToFallback?: () => Promise<TNavigationResult | undefined>;
  onWorktreeRemovalError?: (error: unknown) => void;
}

export async function runWorktreeThreadTeardown<TResult, TNavigationResult = never>(
  input: WorktreeThreadTeardownInput<TResult, TNavigationResult>,
): Promise<TResult | TNavigationResult> {
  await input.stopSession?.();
  await input.closeTerminalState();

  const removeWorktree = async () => {
    if (!input.removeWorktree) return;
    try {
      await input.removeWorktree();
    } catch (error) {
      input.onWorktreeRemovalError?.(error);
      if (!input.continueAfterWorktreeRemovalError) {
        throw error;
      }
    }
    await input.refreshRepository?.();
  };
  if (input.removeWorktreeBeforeTransition) {
    await removeWorktree();
  }

  const transition = await input.transitionThreadRecord();
  if (!transition.transitioned) {
    return transition.result;
  }

  if (!input.removeWorktreeBeforeTransition) {
    try {
      await removeWorktree();
    } catch (error) {
      await input.rollbackThreadRecord?.();
      throw error;
    }
  }
  input.clearRuntimeState();

  const navigationResult = await input.navigateToFallback?.();
  if (navigationResult !== undefined) {
    return navigationResult;
  }
  return transition.result;
}

export async function runThreadDeletionLifecycle<TResult, TNavigationResult = never>(
  input: ThreadDeletionLifecycleInput<TResult, TNavigationResult>,
): Promise<TResult | TNavigationResult> {
  return runWorktreeThreadTeardown({
    ...(input.stopSession ? { stopSession: input.stopSession } : {}),
    closeTerminalState: input.closeTerminalState,
    transitionThreadRecord: async () => {
      const deletion = await input.deleteThreadRecord();
      return { transitioned: deletion.deleted, result: deletion.result };
    },
    clearRuntimeState: input.clearLocalThreadState,
    ...(input.removeOrphanedWorktree ? { removeWorktree: input.removeOrphanedWorktree } : {}),
    continueAfterWorktreeRemovalError: true,
    ...(input.navigateToFallback ? { navigateToFallback: input.navigateToFallback } : {}),
    ...(input.onWorktreeRemovalError
      ? { onWorktreeRemovalError: input.onWorktreeRemovalError }
      : {}),
  });
}
