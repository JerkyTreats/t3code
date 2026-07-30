import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";

export interface DeletedThreadStateActions {
  clearComposerDraftForThread: (threadRef: ScopedThreadRef) => void;
  clearProjectDraftThreadById: (projectRef: ScopedProjectRef, threadRef: ScopedThreadRef) => void;
  clearTerminalUiState: (threadRef: ScopedThreadRef) => void;
  clearRightPanelState: (threadRef: ScopedThreadRef) => void;
  clearDiffPanelState: (threadRef: ScopedThreadRef) => void;
  removeFromThreadSelection: (threadRefs: readonly ScopedThreadRef[]) => void;
}

export interface DeletedThreadStateTarget {
  threadRef: ScopedThreadRef;
  projectRef: ScopedProjectRef;
}

export interface ClearDeletedThreadStateInput extends DeletedThreadStateTarget {
  actions: DeletedThreadStateActions;
}

export interface ClearDeletedThreadStatesInput {
  targets: readonly DeletedThreadStateTarget[];
  actions: DeletedThreadStateActions;
}

export function clearDeletedThreadStates(input: ClearDeletedThreadStatesInput): void {
  for (const target of input.targets) {
    input.actions.clearComposerDraftForThread(target.threadRef);
    input.actions.clearProjectDraftThreadById(target.projectRef, target.threadRef);
    input.actions.clearTerminalUiState(target.threadRef);
    input.actions.clearRightPanelState(target.threadRef);
    input.actions.clearDiffPanelState(target.threadRef);
  }
  input.actions.removeFromThreadSelection(input.targets.map((target) => target.threadRef));
}

export function clearDeletedThreadState(input: ClearDeletedThreadStateInput): void {
  clearDeletedThreadStates({
    targets: [{ threadRef: input.threadRef, projectRef: input.projectRef }],
    actions: input.actions,
  });
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
