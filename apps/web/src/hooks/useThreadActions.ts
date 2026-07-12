import {
  parseScopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { settlePromise, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";

import { getFallbackThreadIdAfterDelete } from "../components/Sidebar.logic";
import { useComposerDraftStore } from "../composerDraftStore";
import { useDiffPanelStore } from "../diffPanelStore";
import { clearDeletedThreadState, runThreadDeletionLifecycle } from "../lib/threadDeletionWorkflow";
import { terminalEnvironment } from "../state/terminal";
import { threadEnvironment } from "../state/threads";
import { vcsEnvironment } from "../state/vcs";
import { useNewThreadHandler } from "./useHandleNewThread";
import { refreshArchivedThreadsForEnvironment } from "../lib/archivedThreadsState";
import { readLocalApi } from "../localApi";
import { useRightPanelStore } from "../rightPanelStore";
import { readEnvironmentThreadRefs, readProject, readThreadShell } from "../state/entities";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import { buildThreadRouteParams, resolveThreadRouteRef } from "../threadRoutes";
import { formatWorktreePathForDisplay, getOrphanedWorktreePathForThread } from "../worktreeCleanup";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useClientSettings } from "./useSettings";
import { useAtomCommand } from "../state/use-atom-command";

export class ThreadArchiveBlockedError extends Schema.TaggedErrorClass<ThreadArchiveBlockedError>()(
  "ThreadArchiveBlockedError",
  {
    environmentId: EnvironmentId,
    threadId: ThreadId,
  },
) {
  override get message(): string {
    return "Cannot archive a running thread.";
  }
}

export function useThreadActions() {
  const closeTerminal = useAtomCommand(terminalEnvironment.close);
  const archiveThreadMutation = useAtomCommand(threadEnvironment.archive, {
    reportFailure: false,
  });
  const unarchiveThreadMutation = useAtomCommand(threadEnvironment.unarchive, {
    reportFailure: false,
  });
  const deleteThreadMutation = useAtomCommand(threadEnvironment.delete, {
    reportFailure: false,
  });
  const stopThreadSession = useAtomCommand(threadEnvironment.stopSession);
  const removeWorktree = useAtomCommand(vcsEnvironment.removeWorktree, {
    reportFailure: false,
  });
  const refreshVcsStatus = useAtomCommand(vcsEnvironment.refreshStatus, {
    reportFailure: false,
  });
  const sidebarThreadSortOrder = useClientSettings((settings) => settings.sidebarThreadSortOrder);
  const confirmThreadDelete = useClientSettings((settings) => settings.confirmThreadDelete);
  const clearComposerDraftForThread = useComposerDraftStore((store) => store.clearDraftThread);
  const clearProjectDraftThreadById = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadById,
  );
  const clearTerminalUiState = useTerminalUiStateStore((state) => state.clearTerminalUiState);
  const clearRightPanelState = useRightPanelStore((state) => state.removeThread);
  const clearDiffPanelState = useDiffPanelStore((state) => state.removeThread);
  const router = useRouter();
  const handleNewThread = useNewThreadHandler();
  // Keep a ref so archiveThread can call handleNewThread without appearing in
  // its dependency array — handleNewThread is inherently unstable (depends on
  // the projects list) and would otherwise cascade new references into every
  // sidebar row via archiveThread → attemptArchiveThread.
  const handleNewThreadRef = useRef(handleNewThread);
  handleNewThreadRef.current = handleNewThread;

  const resolveThreadTarget = useCallback((target: ScopedThreadRef) => {
    const thread = readThreadShell(target);
    if (!thread) {
      return null;
    }
    return {
      thread,
      threadRef: target,
    };
  }, []);
  const getCurrentRouteThreadRef = useCallback(() => {
    const currentRouteParams = router.state.matches[router.state.matches.length - 1]?.params ?? {};
    return resolveThreadRouteRef(currentRouteParams);
  }, [router]);

  const archiveThread = useCallback(
    async (target: ScopedThreadRef) => {
      const resolved = resolveThreadTarget(target);
      if (!resolved) return AsyncResult.success(undefined);
      const { thread, threadRef } = resolved;
      if (thread.session?.status === "running" && thread.session.activeTurnId != null) {
        return AsyncResult.failure(
          Cause.fail(
            new ThreadArchiveBlockedError({
              environmentId: threadRef.environmentId,
              threadId: threadRef.threadId,
            }),
          ),
        );
      }

      const currentRouteThreadRef = getCurrentRouteThreadRef();
      const shouldNavigateToDraft =
        currentRouteThreadRef?.threadId === threadRef.threadId &&
        currentRouteThreadRef.environmentId === threadRef.environmentId;
      const archiveResult = await archiveThreadMutation({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId },
      });
      if (archiveResult._tag === "Failure") {
        return archiveResult;
      }

      if (shouldNavigateToDraft) {
        const navigationResult = await settlePromise(() =>
          handleNewThreadRef.current(scopeProjectRef(thread.environmentId, thread.projectId)),
        );
        if (navigationResult._tag === "Failure") {
          return navigationResult;
        }
        refreshArchivedThreadsForEnvironment(threadRef.environmentId);
        return archiveResult;
      }

      refreshArchivedThreadsForEnvironment(threadRef.environmentId);
      return archiveResult;
    },
    [archiveThreadMutation, getCurrentRouteThreadRef, resolveThreadTarget],
  );

  const unarchiveThread = useCallback(
    async (target: ScopedThreadRef) => {
      const result = await unarchiveThreadMutation({
        environmentId: target.environmentId,
        input: { threadId: target.threadId },
      });
      if (result._tag === "Success") {
        refreshArchivedThreadsForEnvironment(target.environmentId);
      }
      return result;
    },
    [unarchiveThreadMutation],
  );

  const deleteThread = useCallback(
    async (target: ScopedThreadRef, opts: { deletedThreadKeys?: ReadonlySet<string> } = {}) => {
      const resolved = resolveThreadTarget(target);
      if (!resolved) {
        // Thread not in main store (e.g. archived thread) — dispatch delete directly.
        const result = await deleteThreadMutation({
          environmentId: target.environmentId,
          input: { threadId: target.threadId },
        });
        if (result._tag === "Success") {
          refreshArchivedThreadsForEnvironment(target.environmentId);
        }
        return result;
      }
      const { thread, threadRef } = resolved;
      const threads = readEnvironmentThreadRefs(threadRef.environmentId).flatMap((ref) => {
        const shell = readThreadShell(ref);
        return shell === null ? [] : [shell];
      });
      const threadProject = readProject({
        environmentId: threadRef.environmentId,
        projectId: thread.projectId,
      });
      const deletedIds =
        opts.deletedThreadKeys && opts.deletedThreadKeys.size > 0
          ? new Set<ThreadId>(
              [...opts.deletedThreadKeys].flatMap((threadKey) => {
                const ref = parseScopedThreadKey(threadKey);
                return ref && ref.environmentId === threadRef.environmentId ? [ref.threadId] : [];
              }),
            )
          : undefined;
      const survivingThreads =
        deletedIds && deletedIds.size > 0
          ? threads.filter((entry) => entry.id === threadRef.threadId || !deletedIds.has(entry.id))
          : threads;
      const orphanedWorktreePath = getOrphanedWorktreePathForThread(
        survivingThreads,
        threadRef.threadId,
      );
      const displayWorktreePath = orphanedWorktreePath
        ? formatWorktreePathForDisplay(orphanedWorktreePath)
        : null;
      const canDeleteWorktree = orphanedWorktreePath !== null && threadProject !== null;
      const localApi = readLocalApi();
      let shouldDeleteWorktree = false;
      if (canDeleteWorktree && localApi) {
        const confirmationResult = await settlePromise(() =>
          localApi.dialogs.confirm(
            [
              "This thread is the only one linked to this worktree:",
              displayWorktreePath ?? orphanedWorktreePath,
              "",
              "Delete the worktree too?",
            ].join("\n"),
          ),
        );
        if (confirmationResult._tag === "Failure") {
          return confirmationResult;
        }
        shouldDeleteWorktree = confirmationResult.value;
      }

      const deletedThreadIds = deletedIds ?? new Set<ThreadId>();
      const currentRouteThreadRef = getCurrentRouteThreadRef();
      const shouldNavigateToFallback =
        currentRouteThreadRef?.threadId === threadRef.threadId &&
        currentRouteThreadRef.environmentId === threadRef.environmentId;
      const fallbackThreadId = getFallbackThreadIdAfterDelete({
        threads,
        deletedThreadId: threadRef.threadId,
        deletedThreadIds,
        sortOrder: sidebarThreadSortOrder,
      });
      let cleanupFailure:
        | Awaited<ReturnType<typeof removeWorktree>>
        | Awaited<ReturnType<typeof refreshVcsStatus>>
        | null = null;
      const shouldRemoveOrphanedWorktree =
        shouldDeleteWorktree && orphanedWorktreePath !== null && threadProject !== null;
      const deleteResult = await runThreadDeletionLifecycle({
        ...(thread.session && thread.session.status !== "stopped"
          ? {
              stopSession: async () => {
                await stopThreadSession({
                  environmentId: threadRef.environmentId,
                  input: { threadId: threadRef.threadId },
                });
              },
            }
          : {}),
        closeTerminalState: async () => {
          await closeTerminal({
            environmentId: threadRef.environmentId,
            input: { threadId: threadRef.threadId, deleteHistory: true },
          });
        },
        deleteThreadRecord: async () => {
          const result = await deleteThreadMutation({
            environmentId: threadRef.environmentId,
            input: { threadId: threadRef.threadId },
          });
          if (result._tag === "Success") {
            refreshArchivedThreadsForEnvironment(threadRef.environmentId);
          }
          return { deleted: result._tag === "Success", result };
        },
        clearLocalThreadState: () => {
          clearDeletedThreadState({
            threadRef,
            projectRef: scopeProjectRef(threadRef.environmentId, thread.projectId),
            actions: {
              clearComposerDraftForThread,
              clearProjectDraftThreadById,
              clearTerminalUiState,
              clearRightPanelState,
              clearDiffPanelState,
            },
          });
        },
        ...(shouldRemoveOrphanedWorktree
          ? {
              removeOrphanedWorktree: async () => {
                const removeResult = await removeWorktree({
                  environmentId: threadRef.environmentId,
                  input: {
                    cwd: threadProject.workspaceRoot,
                    path: orphanedWorktreePath,
                    force: true,
                  },
                });
                const refreshResult =
                  removeResult._tag === "Success"
                    ? await refreshVcsStatus({
                        environmentId: threadRef.environmentId,
                        input: { cwd: threadProject.workspaceRoot },
                      })
                    : null;
                cleanupFailure =
                  removeResult._tag === "Failure"
                    ? removeResult
                    : refreshResult?._tag === "Failure"
                      ? refreshResult
                      : null;
                if (cleanupFailure) {
                  throw squashAtomCommandFailure(cleanupFailure);
                }
              },
              onWorktreeRemovalError: (error: unknown) => {
                const message =
                  error instanceof Error ? error.message : "Unknown error removing worktree.";
                console.error("Failed to remove orphaned worktree after thread deletion", {
                  threadId: threadRef.threadId,
                  projectCwd: threadProject.workspaceRoot,
                  worktreePath: orphanedWorktreePath,
                  error,
                });
                toastManager.add(
                  stackedThreadToast({
                    type: "error",
                    title: "Thread deleted, but worktree removal failed",
                    description: `Could not remove ${displayWorktreePath ?? orphanedWorktreePath}. ${message}`,
                  }),
                );
              },
            }
          : {}),
        ...(shouldNavigateToFallback
          ? {
              navigateToFallback: async () => {
                const fallbackThread = fallbackThreadId
                  ? readThreadShell(scopeThreadRef(threadRef.environmentId, fallbackThreadId))
                  : null;
                const navigationResult = await settlePromise(() =>
                  fallbackThread
                    ? router.navigate({
                        to: "/$environmentId/$threadId",
                        params: buildThreadRouteParams(
                          scopeThreadRef(fallbackThread.environmentId, fallbackThread.id),
                        ),
                        replace: true,
                      })
                    : router.navigate({ to: "/", replace: true }),
                );
                if (navigationResult._tag === "Failure") {
                  return navigationResult;
                }
                return undefined;
              },
            }
          : {}),
      });
      return cleanupFailure ?? deleteResult;
    },
    [
      clearComposerDraftForThread,
      clearDiffPanelState,
      clearProjectDraftThreadById,
      clearRightPanelState,
      clearTerminalUiState,
      closeTerminal,
      deleteThreadMutation,
      getCurrentRouteThreadRef,
      refreshVcsStatus,
      removeWorktree,
      router,
      resolveThreadTarget,
      sidebarThreadSortOrder,
      stopThreadSession,
    ],
  );

  const confirmAndDeleteThread = useCallback(
    async (target: ScopedThreadRef) => {
      const localApi = readLocalApi();
      const resolved = resolveThreadTarget(target);

      if (confirmThreadDelete && localApi) {
        const title = resolved?.thread.title ?? "this thread";
        const confirmationResult = await settlePromise(() =>
          localApi.dialogs.confirm(
            [
              `Delete thread "${title}"?`,
              "This permanently clears conversation history for this thread.",
            ].join("\n"),
          ),
        );
        if (confirmationResult._tag === "Failure") {
          return confirmationResult;
        }
        if (!confirmationResult.value) {
          return AsyncResult.success(undefined);
        }
      }

      return deleteThread(target);
    },
    [confirmThreadDelete, deleteThread, resolveThreadTarget],
  );

  return useMemo(
    () => ({
      archiveThread,
      unarchiveThread,
      deleteThread,
      confirmAndDeleteThread,
    }),
    [archiveThread, confirmAndDeleteThread, deleteThread, unarchiveThread],
  );
}
