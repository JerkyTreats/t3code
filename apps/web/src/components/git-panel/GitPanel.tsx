import {
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type GitHubIssue,
  type GitMergeBranchesResult,
  type ProjectId,
  type SourceControlProviderKind,
  type SourceControlPublishRepositoryResult,
  ThreadId,
} from "@t3tools/contracts";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CloudUploadIcon,
  GitCommitIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  RefreshCcwIcon,
  UploadCloudIcon,
} from "lucide-react";
import { GitHubIcon } from "../Icons";
import {
  buildMenuItems,
  type GitActionMenuItem,
  resolveDefaultBranchActionDialogCopy,
} from "../GitActionsControl.logic";
import { useAppSettings } from "~/appSettings";
import { deriveWorkspaceStatusInfo, resolveDefaultMergeSourceBranch } from "./GitPanel.logic";
import { resolveEffectiveEnvMode } from "../BranchToolbar.logic";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import {
  githubCreateIssueMutationOptions,
  githubCloseIssueMutationOptions,
  githubIssuesQueryOptions,
  githubLoginMutationOptions,
  githubReopenIssueMutationOptions,
  githubStatusQueryOptions,
  invalidateGitHubQueries,
} from "~/lib/githubReactQuery";
import { resolveGitHubIssueWorkflowState } from "~/githubIssueWorkflow";
import {
  gitAbortMergeMutationOptions,
  gitBranchesQueryOptions,
  gitCreateWorktreeMutationOptions,
  gitInitMutationOptions,
  gitMergeBranchesMutationOptions,
  gitMutationKeys,
  gitPullMutationOptions,
  gitRemoveWorktreeMutationOptions,
  gitRunStackedActionMutationOptions,
  gitStatusQueryOptions,
  invalidateGitQueries,
} from "~/lib/gitReactQuery";
import {
  buildIssueResolutionPrompt,
  buildIssueThreadTitle,
  buildIssueWorkspaceBranchName,
} from "~/githubIssueThreads";
import { cn, newCommandId, newMessageId, newThreadId } from "~/lib/utils";
import { preferredTerminalEditor, resolvePathLinkTarget } from "~/terminal-links";
import {
  readNativeApi,
  supportsCurrentNativeApiGitHub,
  supportsCurrentNativeApiGitMerge,
  supportsCurrentNativeApiSourceControl,
} from "~/nativeApi";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useStore } from "~/store";
import { useTerminalStateStore } from "~/terminalStateStore";
import { GitHubAuthSection } from "./GitHubAuthSection";
import { GitHubCreateIssueDialog } from "./GitHubCreateIssueDialog";
import { GitHubLinkedIssueSection } from "./GitHubLinkedIssueSection";
import { GitHubIssuesSection } from "./GitHubIssuesSection";
import { GitSyncSection } from "./GitSyncSection";
import { GitStatusDot } from "./GitStatusDot";
import { GitWorkspaceSection } from "./GitWorkspaceSection";
import { GitCommitDialog } from "./GitCommitDialog";
import { GitDefaultBranchDialog } from "./GitDefaultBranchDialog";
import { GitPromoteDialog } from "./GitPromoteDialog";
import { GitPanelSection } from "./GitPanelSection";
import { ProjectPanel } from "../ProjectPanel";
import { useGitPanelGitHubActions } from "./useGitPanelGitHubActions";
import { useGitPanelMergeActions } from "./useGitPanelMergeActions";
import {
  type PendingDefaultBranchAction,
  useGitPanelStackedActions,
} from "./useGitPanelStackedActions";
import { useGitPanelThreadRouting } from "./useGitPanelThreadRouting";
import { useGitPanelWorkspaceActions } from "./useGitPanelWorkspaceActions";
import {
  sourceControlDiscoveryQueryOptions,
  sourceControlPublishRepositoryMutationOptions,
} from "~/lib/sourceControlReactQuery";
import { PublishRepositoryDialog } from "./PublishRepositoryDialog";

interface GitPanelProps {
  activeProjectId?: ProjectId | null;
  workspaceCwd: string | null;
  repoCwd: string | null;
  repoRoot: string | null;
  activeThreadId: ThreadId | null;
  panelVariant?: "page" | "sidepanel";
}

// =============================================================================
// Keyboard Shortcut Hint
// =============================================================================

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/50 bg-muted/50 px-1 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function GitPanel({
  activeProjectId: activeProjectIdOverride = null,
  workspaceCwd,
  repoCwd,
  repoRoot,
  activeThreadId,
  panelVariant = "page",
}: GitPanelProps) {
  const supportsGitMerge = supportsCurrentNativeApiGitMerge();
  const supportsGitHub = supportsCurrentNativeApiGitHub();
  const supportsSourceControl = supportsCurrentNativeApiSourceControl();
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const setThreadBranchAction = useStore((store) => store.setThreadBranch);
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const clearComposerDraftForThread = useComposerDraftStore((store) => store.clearDraftThread);
  const clearProjectDraftThreadById = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadById,
  );
  const clearTerminalState = useTerminalStateStore((store) => store.clearTerminalState);
  const activeServerThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads],
  );
  const activeDraftThread = useComposerDraftStore((store) =>
    activeThreadId ? store.getDraftThread(activeThreadId) : null,
  );
  const getDraftThreadByProjectId = useComposerDraftStore(
    (store) => store.getDraftThreadByProjectId,
  );
  const setProjectDraftThreadId = useComposerDraftStore((store) => store.setProjectDraftThreadId);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const setPrompt = useComposerDraftStore((store) => store.setPrompt);
  const activeProjectId =
    activeProjectIdOverride ??
    activeServerThread?.projectId ??
    activeDraftThread?.projectId ??
    null;
  const hasServerThread = activeServerThread !== null;
  const activeThreadBranch = activeServerThread?.branch ?? activeDraftThread?.branch ?? null;
  const activeWorktreePath =
    activeServerThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null;
  const effectiveEnvMode = resolveEffectiveEnvMode({
    activeWorktreePath,
    hasServerThread,
    draftThreadEnvMode: activeDraftThread?.envMode,
  });
  const threadToastData = useMemo(
    () => (activeThreadId ? { threadId: activeThreadId } : undefined),
    [activeThreadId],
  );
  const queryClient = useQueryClient();
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const [issueState, setIssueState] = useState<"open" | "closed" | "all">("open");
  const [isCreateIssueDialogOpen, setIsCreateIssueDialogOpen] = useState(false);
  const [pendingDefaultBranchAction, setPendingDefaultBranchAction] =
    useState<PendingDefaultBranchAction | null>(null);
  const [mergeSourceBranch, setMergeSourceBranch] = useState("");
  const [lastMergeResult, setLastMergeResult] = useState<GitMergeBranchesResult | null>(null);
  const [mergeExpanded] = useState(false);
  const [promotionTargetBranch] = useState<string | null>(null);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishResult, setPublishResult] = useState<SourceControlPublishRepositoryResult | null>(
    null,
  );
  const [resolvingIssueNumber, setResolvingIssueNumber] = useState<number | null>(null);
  const primaryWorkspaceStatusCwd =
    workspaceCwd !== null && repoRoot !== null && workspaceCwd !== repoRoot ? repoRoot : null;
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  const { data: gitStatus = null, error: gitStatusError } = useQuery(
    gitStatusQueryOptions(workspaceCwd),
  );
  const { data: primaryWorkspaceStatus = null, error: primaryWorkspaceStatusError } = useQuery(
    gitStatusQueryOptions(primaryWorkspaceStatusCwd),
  );

  const { data: branchList = null } = useQuery(gitBranchesQueryOptions(workspaceCwd));
  const githubStatusQuery = useQuery(githubStatusQueryOptions(repoCwd));
  const sourceControlDiscoveryQuery = useQuery({
    ...sourceControlDiscoveryQueryOptions(),
    enabled: supportsSourceControl,
  });
  const isRepo = branchList?.isRepo ?? true;
  const currentBranch = branchList?.branches.find((branch) => branch.current)?.name ?? null;
  const isGitStatusOutOfSync =
    !!gitStatus?.branch && !!currentBranch && gitStatus.branch !== currentBranch;

  useEffect(() => {
    if (!isGitStatusOutOfSync) return;
    void invalidateGitQueries(queryClient);
  }, [isGitStatusOutOfSync, queryClient]);

  const gitStatusForActions = isGitStatusOutOfSync ? null : gitStatus;

  const initMutation = useMutation(gitInitMutationOptions({ cwd: workspaceCwd, queryClient }));
  const loginMutation = useMutation(githubLoginMutationOptions({ cwd: repoCwd, queryClient }));
  const createIssueMutation = useMutation(
    githubCreateIssueMutationOptions({ cwd: repoCwd, queryClient }),
  );
  const closeIssueMutation = useMutation(
    githubCloseIssueMutationOptions({ cwd: repoCwd, queryClient }),
  );
  const reopenIssueMutation = useMutation(
    githubReopenIssueMutationOptions({ cwd: repoCwd, queryClient }),
  );
  const createWorktreeMutation = useMutation(gitCreateWorktreeMutationOptions({ queryClient }));
  const removeWorktreeMutation = useMutation(gitRemoveWorktreeMutationOptions({ queryClient }));

  const githubIssuesQuery = useQuery(
    githubIssuesQueryOptions({
      cwd: repoCwd,
      state: issueState,
      limit: 10,
      enabled:
        githubStatusQuery.data?.installed === true &&
        githubStatusQuery.data?.authenticated === true &&
        githubStatusQuery.data?.repo !== null,
    }),
  );
  const isGitHubAuthenticated = supportsGitHub && githubStatusQuery.data?.authenticated === true;

  const runImmediateGitActionMutation = useMutation(
    gitRunStackedActionMutationOptions({
      cwd: workspaceCwd,
      queryClient,
      model: settings.textGenerationModel ?? null,
    }),
  );
  const pullMutation = useMutation(gitPullMutationOptions({ cwd: workspaceCwd, queryClient }));
  const mergeBranchesMutation = useMutation(
    gitMergeBranchesMutationOptions({ cwd: workspaceCwd, queryClient }),
  );
  const abortMergeMutation = useMutation(
    gitAbortMergeMutationOptions({ cwd: workspaceCwd, queryClient }),
  );
  const publishRepositoryMutation = useMutation(
    sourceControlPublishRepositoryMutationOptions({ cwd: workspaceCwd, queryClient }),
  );

  const isRunStackedActionRunning =
    useIsMutating({ mutationKey: gitMutationKeys.runStackedAction(workspaceCwd) }) > 0;
  const isPullRunning = useIsMutating({ mutationKey: gitMutationKeys.pull(workspaceCwd) }) > 0;
  const isMergeRunning =
    useIsMutating({ mutationKey: gitMutationKeys.mergeBranches(workspaceCwd) }) > 0;
  const isAbortMergeRunning =
    useIsMutating({ mutationKey: gitMutationKeys.abortMerge(workspaceCwd) }) > 0;
  const isGitActionRunning = isRunStackedActionRunning || isPullRunning;
  const localBranches = useMemo(
    () => (branchList?.branches ?? []).filter((branch) => !branch.isRemote),
    [branchList?.branches],
  );
  const defaultBranch = useMemo(
    () => localBranches.find((branch) => branch.isDefault)?.name ?? null,
    [localBranches],
  );
  const activeWorkspaceBranch = gitStatusForActions?.branch ?? currentBranch;
  const issueThreadRuntimeMode =
    activeServerThread?.runtimeMode ?? activeDraftThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE;
  const issueThreadInteractionMode =
    activeServerThread?.interactionMode ??
    activeDraftThread?.interactionMode ??
    DEFAULT_PROVIDER_INTERACTION_MODE;
  const activeWorkspaceBranchMeta = useMemo(
    () => localBranches.find((branch) => branch.name === activeWorkspaceBranch) ?? null,
    [activeWorkspaceBranch, localBranches],
  );
  const activeThreadIssueLink = activeServerThread?.issueLink ?? null;
  const isPrimaryWorkspace = repoRoot !== null && workspaceCwd === repoRoot;
  const activeWorkspaceMerge =
    gitStatusForActions?.merge ?? ({ inProgress: false, conflictedFiles: [] } as const);
  const activeWorkspaceHasConflicts = activeWorkspaceMerge.conflictedFiles.length > 0;
  const isDefaultBranch = useMemo(() => {
    const branchName = gitStatusForActions?.branch;
    if (!branchName) return false;
    const current = branchList?.branches.find((branch) => branch.name === branchName);
    return current?.isDefault ?? (branchName === "main" || branchName === "master");
  }, [branchList?.branches, gitStatusForActions?.branch]);
  const detectedTargetBranch = gitStatusForActions?.pr?.baseBranch ?? defaultBranch;
  // User can override the promotion target; fall back to detected
  const activeTargetBranch = promotionTargetBranch ?? detectedTargetBranch;
  const statusInfo = useMemo(
    () =>
      deriveWorkspaceStatusInfo({
        hasConflicts: activeWorkspaceHasConflicts,
        mergeInProgress: activeWorkspaceMerge.inProgress,
        hasChanges: gitStatusForActions?.hasWorkingTreeChanges ?? false,
      }),
    [
      activeWorkspaceHasConflicts,
      activeWorkspaceMerge.inProgress,
      gitStatusForActions?.hasWorkingTreeChanges,
    ],
  );

  const gitActionMenuItems = useMemo(
    () => buildMenuItems(gitStatusForActions, isGitActionRunning),
    [gitStatusForActions, isGitActionRunning],
  );
  const issueWorkflowsByNumber = useMemo(() => {
    const repoNameWithOwner = githubStatusQuery.data?.repo?.nameWithOwner ?? null;
    const workflows = new Map<number, ReturnType<typeof resolveGitHubIssueWorkflowState>>();
    for (const issue of githubIssuesQuery.data?.issues ?? []) {
      workflows.set(
        issue.number,
        resolveGitHubIssueWorkflowState({
          issue,
          repoNameWithOwner,
          threads,
          activeThreadId,
          activeIssueLink: activeThreadIssueLink,
          activePr: gitStatusForActions?.pr ?? null,
        }),
      );
    }
    return workflows;
  }, [
    activeThreadId,
    activeThreadIssueLink,
    gitStatusForActions?.pr,
    githubIssuesQuery.data?.issues,
    githubStatusQuery.data?.repo?.nameWithOwner,
    threads,
  ]);
  const canMarkIssueResolved = useMemo(() => {
    if (!activeThreadIssueLink || activeThreadIssueLink.state !== "open") {
      return false;
    }
    if (gitStatusForActions?.pr?.state === "open") {
      return false;
    }
    if (gitStatusForActions?.hasWorkingTreeChanges) {
      return false;
    }
    const latestTurnState = activeServerThread?.latestTurn?.state ?? null;
    return latestTurnState !== "running";
  }, [
    activeServerThread?.latestTurn?.state,
    activeThreadIssueLink,
    gitStatusForActions?.hasWorkingTreeChanges,
    gitStatusForActions?.pr?.state,
  ]);
  const pendingDefaultBranchActionCopy = pendingDefaultBranchAction
    ? resolveDefaultBranchActionDialogCopy({
        action: pendingDefaultBranchAction.action,
        branchName: pendingDefaultBranchAction.branchName,
        includesCommit: pendingDefaultBranchAction.includesCommit,
      })
    : null;

  useEffect(() => {
    const branchNames = localBranches.map((branch) => branch.name);
    const nextSourceBranch = resolveDefaultMergeSourceBranch({
      branchNames,
      activeWorkspaceBranch,
      activeTargetBranch,
      currentMergeSourceBranch: mergeSourceBranch,
    });
    if (nextSourceBranch !== mergeSourceBranch) {
      setMergeSourceBranch(nextSourceBranch);
    }
  }, [activeTargetBranch, activeWorkspaceBranch, localBranches, mergeSourceBranch]);

  useEffect(() => {
    if (
      lastMergeResult &&
      (lastMergeResult.targetWorktreePath !== workspaceCwd ||
        lastMergeResult.targetBranch !== activeWorkspaceBranch)
    ) {
      setLastMergeResult(null);
    }
  }, [activeWorkspaceBranch, lastMergeResult, workspaceCwd]);

  const openPathInEditor = useCallback(
    (targetPath: string) => {
      const api = readNativeApi();
      if (!api) {
        toastManager.add({
          type: "error",
          title: "Editor unavailable",
          data: threadToastData,
        });
        return;
      }
      void api.shell.openInEditor(targetPath, preferredTerminalEditor()).catch((error) => {
        toastManager.add({
          type: "error",
          title: "Failed to open",
          description: error instanceof Error ? error.message : "An error occurred.",
          data: threadToastData,
        });
      });
    },
    [threadToastData],
  );

  const navigateToThread = useCallback(
    async (threadId: ThreadId) => {
      if (threadId !== activeThreadId) {
        await navigate({
          to: "/$threadId",
          params: { threadId },
        });
      }
    },
    [activeThreadId, navigate],
  );
  const deleteActiveThreadAfterTeardown = useCallback(
    async (input?: { navigateHome?: boolean }) => {
      const api = readNativeApi();
      if (!api || !activeThreadId || !activeProjectId) {
        return;
      }

      await api.orchestration.dispatchCommand({
        type: "thread.delete",
        commandId: newCommandId(),
        threadId: activeThreadId,
      });
      clearComposerDraftForThread(activeThreadId);
      clearProjectDraftThreadById(activeProjectId, activeThreadId);
      clearTerminalState(activeThreadId);

      if (input?.navigateHome !== false) {
        await navigate({ to: "/", replace: true });
      }

      const snapshot = await api.orchestration.getSnapshot().catch(() => null);
      if (snapshot) {
        syncServerReadModel(snapshot);
      }
    },
    [
      activeProjectId,
      activeThreadId,
      clearComposerDraftForThread,
      clearProjectDraftThreadById,
      clearTerminalState,
      navigate,
      syncServerReadModel,
    ],
  );
  const syncActiveIssueLinkState = useCallback(
    async (nextState: "open" | "closed") => {
      const api = readNativeApi();
      if (!api || !activeThreadId || !activeThreadIssueLink) {
        return;
      }

      await api.orchestration.dispatchCommand({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId: activeThreadId,
        issueLink: {
          ...activeThreadIssueLink,
          state: nextState,
        },
      });
      const snapshot = await api.orchestration.getSnapshot();
      syncServerReadModel(snapshot);
    },
    [activeThreadId, activeThreadIssueLink, syncServerReadModel],
  );
  const updateActiveIssueState = useCallback(
    async (nextState: "open" | "closed") => {
      if (!repoCwd || !activeThreadIssueLink) {
        return;
      }

      try {
        if (nextState === "closed") {
          await closeIssueMutation.mutateAsync({
            issueNumber: activeThreadIssueLink.number,
            repo: activeThreadIssueLink.repoNameWithOwner,
          });
        } else {
          await reopenIssueMutation.mutateAsync({
            issueNumber: activeThreadIssueLink.number,
            repo: activeThreadIssueLink.repoNameWithOwner,
          });
        }

        await syncActiveIssueLinkState(nextState);
        toastManager.add({
          type: "success",
          title:
            nextState === "closed"
              ? `Marked issue #${activeThreadIssueLink.number} resolved`
              : `Reopened issue #${activeThreadIssueLink.number}`,
          data: threadToastData,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title:
            nextState === "closed"
              ? `Could not resolve issue #${activeThreadIssueLink.number}`
              : `Could not reopen issue #${activeThreadIssueLink.number}`,
          description: error instanceof Error ? error.message : "An error occurred.",
          data: threadToastData,
        });
      }
    },
    [
      activeThreadIssueLink,
      closeIssueMutation,
      repoCwd,
      reopenIssueMutation,
      syncActiveIssueLinkState,
      threadToastData,
    ],
  );
  const createIssue = useCallback(
    async (input: { title: string; body: string }) => {
      try {
        const result = await createIssueMutation.mutateAsync({
          title: input.title,
          body: input.body.length > 0 ? input.body : null,
          ...(githubStatusQuery.data?.repo?.nameWithOwner
            ? { repo: githubStatusQuery.data.repo.nameWithOwner }
            : {}),
        });

        setIssueState((current) => (current === "closed" ? "open" : current));
        setIsCreateIssueDialogOpen(false);
        toastManager.add({
          type: "success",
          title: `Created issue #${result.number}`,
          description: result.title,
          data: threadToastData,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not create issue",
          description: error instanceof Error ? error.message : "An error occurred.",
          data: threadToastData,
        });
      }
    },
    [createIssueMutation, githubStatusQuery.data?.repo?.nameWithOwner, threadToastData],
  );
  const startIssueWorkspaceThread = useCallback(
    async (issue: GitHubIssue) => {
      const api = readNativeApi();
      if (!api || !repoCwd || !activeProject) {
        toastManager.add({
          type: "error",
          title: "Issue workspaces unavailable",
          description: "Open a project backed thread before starting an issue workspace.",
          data: threadToastData,
        });
        return;
      }

      const localBranchNames = localBranches.map((branch) => branch.name);
      const repoDefaultBranch = githubStatusQuery.data?.repo?.defaultBranch ?? null;
      const baseBranch =
        repoDefaultBranch && localBranchNames.includes(repoDefaultBranch)
          ? repoDefaultBranch
          : (defaultBranch ?? activeWorkspaceBranch ?? null);

      if (!baseBranch) {
        toastManager.add({
          type: "error",
          title: "No base branch available",
          description: "Fetch or create a base branch before starting an issue workspace.",
          data: threadToastData,
        });
        return;
      }

      const threadId = newThreadId();
      const createdAt = new Date().toISOString();
      const branchName = buildIssueWorkspaceBranchName(issue, localBranchNames);
      const prompt = buildIssueResolutionPrompt({
        issue,
        baseBranch,
        repoNameWithOwner: githubStatusQuery.data?.repo?.nameWithOwner ?? null,
      });
      const issueLink = githubStatusQuery.data?.repo?.nameWithOwner
        ? {
            repoNameWithOwner: githubStatusQuery.data.repo.nameWithOwner,
            number: issue.number,
            title: issue.title,
            url: issue.url,
            state: issue.state,
          }
        : null;
      const title = buildIssueThreadTitle(issue);
      const modelSelection = activeServerThread?.modelSelection ??
        activeProject.defaultModelSelection ?? {
          provider: activeServerThread?.session?.provider ?? "codex",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
        };

      setResolvingIssueNumber(issue.number);

      let createdThread = false;
      let worktreePath: string | null = null;
      try {
        const worktreeResult = await createWorktreeMutation.mutateAsync({
          cwd: repoCwd,
          branch: baseBranch,
          newBranch: branchName,
          path: null,
        });
        worktreePath = worktreeResult.worktree.path;

        await api.orchestration.dispatchCommand({
          type: "thread.create",
          commandId: newCommandId(),
          threadId,
          projectId: activeProject.id,
          title,
          modelSelection,
          runtimeMode: issueThreadRuntimeMode,
          interactionMode: issueThreadInteractionMode,
          branch: worktreeResult.worktree.branch,
          worktreePath: worktreeResult.worktree.path,
          issueLink,
          createdAt,
        });
        createdThread = true;

        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: prompt,
            attachments: [],
          },
          modelSelection,
          runtimeMode: issueThreadRuntimeMode,
          interactionMode: issueThreadInteractionMode,
          createdAt,
        });

        const snapshot = await api.orchestration.getSnapshot();
        syncServerReadModel(snapshot);
        await navigateToThread(threadId);
        toastManager.add({
          type: "success",
          title: `Started issue workspace for #${issue.number}`,
          description: worktreeResult.worktree.branch,
          data: { threadId },
        });
      } catch (error) {
        if (createdThread) {
          await api.orchestration
            .dispatchCommand({
              type: "thread.delete",
              commandId: newCommandId(),
              threadId,
            })
            .catch(() => undefined);
        }
        if (worktreePath) {
          await removeWorktreeMutation
            .mutateAsync({
              cwd: repoCwd,
              path: worktreePath,
              force: true,
            })
            .catch(() => undefined);
        }
        await api.orchestration
          .getSnapshot()
          .then((snapshot) => {
            syncServerReadModel(snapshot);
          })
          .catch(() => undefined);
        toastManager.add({
          type: "error",
          title: `Could not start issue workspace for #${issue.number}`,
          description:
            error instanceof Error
              ? error.message
              : "An error occurred while creating the issue workspace.",
          data: threadToastData,
        });
      } finally {
        setResolvingIssueNumber(null);
      }
    },
    [
      activeProject,
      activeServerThread?.modelSelection,
      activeServerThread?.session?.provider,
      activeWorkspaceBranch,
      createWorktreeMutation,
      defaultBranch,
      githubStatusQuery.data?.repo?.defaultBranch,
      githubStatusQuery.data?.repo?.nameWithOwner,
      issueThreadInteractionMode,
      issueThreadRuntimeMode,
      localBranches,
      navigateToThread,
      removeWorktreeMutation,
      repoCwd,
      syncServerReadModel,
      threadToastData,
    ],
  );
  const { focusDraftThread, focusPrimaryWorkspaceDraft, persistThreadWorkspaceContext } =
    useGitPanelThreadRouting({
      activeDraftThreadProjectId: activeDraftThread?.projectId ?? null,
      activeDraftThreadWorktreePath: activeDraftThread?.worktreePath ?? null,
      activeProjectId,
      activeServerThread: activeServerThread !== null,
      activeThreadId,
      activeThreadBranch,
      activeWorkspaceBranch,
      activeWorktreePath,
      effectiveEnvMode,
      getDraftThreadByProjectId,
      hasServerThread,
      navigateToThread,
      setDraftThreadContext,
      setProjectDraftThreadId,
      setThreadBranchAction,
    });
  const invalidateQueries = useCallback(async () => {
    await invalidateGitQueries(queryClient);
  }, [queryClient]);
  const { createDedicatedWorkspace, closeDedicatedWorkspace, openPrimaryWorkspaceResolutionDraft } =
    useGitPanelWorkspaceActions({
      clearActiveThreadTerminalState: () => {
        if (activeThreadId) {
          clearTerminalState(activeThreadId);
        }
      },
      activeServerThreadSessionStatus: activeServerThread?.session?.status ?? null,
      activeThreadBranch,
      activeThreadId,
      activeWorkspaceBranch,
      deleteActiveThreadAfterTeardown,
      focusDraftThread,
      focusPrimaryWorkspaceDraft,
      invalidateQueries,
      isPrimaryWorkspace,
      persistThreadWorkspaceContext,
      primaryWorkspaceStatus,
      repoCwd,
      repoRoot,
      removeWorktree: removeWorktreeMutation.mutateAsync,
      repoWorkspaceCwd: workspaceCwd,
      createWorktree: createWorktreeMutation.mutateAsync,
      setPrompt,
      threadToastData,
    });
  const { runMergeFromBranch, runLocalMerge, abortActiveMerge, createResolveConflictDraft } =
    useGitPanelMergeActions({
      activeTargetBranch,
      activeThreadId,
      activeWorkspaceBranch,
      conflictedFiles: activeWorkspaceMerge.conflictedFiles,
      lastMergeResult,
      mergeSourceBranch,
      mergeBranches: mergeBranchesMutation.mutateAsync,
      abortMerge: abortMergeMutation.mutateAsync,
      setLastMergeResult,
      setPrompt,
      threadToastData,
      workspaceCwd,
    });

  const openExistingPr = useCallback(async () => {
    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Link unavailable",
        data: threadToastData,
      });
      return;
    }
    const prUrl = gitStatusForActions?.pr?.state === "open" ? gitStatusForActions.pr.url : null;
    if (!prUrl) {
      toastManager.add({
        type: "error",
        title: "No open PR",
        data: threadToastData,
      });
      return;
    }
    void api.shell.openExternal(prUrl).catch((err) => {
      toastManager.add({
        type: "error",
        title: "Failed to open PR",
        description: err instanceof Error ? err.message : "An error occurred.",
        data: threadToastData,
      });
    });
  }, [gitStatusForActions?.pr?.state, gitStatusForActions?.pr?.url, threadToastData]);

  const {
    runGitActionWithToast,
    continuePendingDefaultBranchAction,
    checkoutNewBranchAndRunAction,
    checkoutFeatureBranchAndContinuePendingAction,
  } = useGitPanelStackedActions({
    gitStatusForActions,
    isDefaultBranch,
    issueLink: activeThreadIssueLink,
    onCloseIssue: async () => {
      await updateActiveIssueState("closed");
    },
    pendingDefaultBranchAction,
    runImmediateGitAction: runImmediateGitActionMutation.mutateAsync,
    setPendingDefaultBranchAction,
    threadToastData,
  });

  const runDialogActionOnNewBranch = useCallback(
    (commitMessage: string) => {
      if (!isCommitDialogOpen) return;

      setIsCommitDialogOpen(false);

      checkoutNewBranchAndRunAction({
        action: "commit",
        ...(commitMessage ? { commitMessage } : {}),
      });
    },
    [checkoutNewBranchAndRunAction, isCommitDialogOpen],
  );

  const openDialogForMenuItem = useCallback(
    (item: GitActionMenuItem) => {
      if (item.disabled) return;
      if (item.kind === "open_pr") {
        void openExistingPr();
        return;
      }
      if (item.dialogAction === "push") {
        void runGitActionWithToast({ action: "commit_push", forcePushOnlyProgress: true });
        return;
      }
      if (item.dialogAction === "create_pr") {
        void runGitActionWithToast({ action: "commit_push_pr" });
        return;
      }
      setIsCommitDialogOpen(true);
    },
    [openExistingPr, runGitActionWithToast, setIsCommitDialogOpen],
  );

  const runPromoteAction = useCallback(() => {
    if (!activeTargetBranch) return;
    setIsPromoteDialogOpen(false);
    void runGitActionWithToast({
      action: "promote",
      targetBranch: activeTargetBranch,
    });
  }, [activeTargetBranch, runGitActionWithToast]);

  const runDialogAction = useCallback(
    (commitMessage: string) => {
      if (!isCommitDialogOpen) return;

      setIsCommitDialogOpen(false);
      void runGitActionWithToast({
        action: "commit",
        ...(commitMessage ? { commitMessage } : {}),
      });
    },
    [isCommitDialogOpen, runGitActionWithToast],
  );

  const openChangedFileInEditor = useCallback(
    (filePath: string) => {
      if (!workspaceCwd) {
        toastManager.add({
          type: "error",
          title: "Editor unavailable",
          data: threadToastData,
        });
        return;
      }
      openPathInEditor(resolvePathLinkTarget(filePath, workspaceCwd));
    },
    [openPathInEditor, threadToastData, workspaceCwd],
  );

  const pullLatest = useCallback(() => {
    const promise = pullMutation.mutateAsync();
    toastManager.promise(promise, {
      loading: { title: "Pulling...", data: threadToastData },
      success: (result) => ({
        title: result.status === "pulled" ? "Pulled" : "Up to date",
        description:
          result.status === "pulled"
            ? `Updated from ${result.upstreamBranch ?? "upstream"}`
            : undefined,
        data: threadToastData,
      }),
      error: (err) => ({
        title: "Pull failed",
        description: err instanceof Error ? err.message : "An error occurred.",
        data: threadToastData,
      }),
    });
    void promise.catch(() => undefined);
  }, [pullMutation, threadToastData]);

  const publishRepository = useCallback(
    (input: {
      provider: Exclude<SourceControlProviderKind, "unknown">;
      repository: string;
      visibility: "private" | "public";
      remoteName: string;
      protocol: "ssh" | "https";
    }) => {
      if (!workspaceCwd) return;
      const promise = publishRepositoryMutation
        .mutateAsync({
          cwd: workspaceCwd,
          provider: input.provider,
          repository: input.repository,
          visibility: input.visibility,
          remoteName: input.remoteName,
          protocol: input.protocol,
        })
        .then((result) => {
          setPublishResult(result);
          return result;
        });
      toastManager.promise(promise, {
        loading: { title: "Publishing repository...", data: threadToastData },
        success: (result) => ({
          title: result.status === "pushed" ? "Repository published" : "Remote added",
          description: result.repository.nameWithOwner,
          data: threadToastData,
        }),
        error: (error) => ({
          title: "Publish failed",
          description: error instanceof Error ? error.message : "An error occurred.",
          data: threadToastData,
        }),
      });
      void promise.catch(() => undefined);
    },
    [publishRepositoryMutation, threadToastData, workspaceCwd],
  );

  const commitItem = gitActionMenuItems.find((item) => item.id === "commit") ?? null;
  const prItem = gitActionMenuItems.find((item) => item.id === "pr") ?? null;
  const githubRepoUrl = githubStatusQuery.data?.repo?.url ?? null;
  const { issuesDisabled, openExternalUrl, runAuthAction } = useGitPanelGitHubActions({
    isGitHubAuthenticated,
    githubRepoUrl,
    issuesErrorMessage: githubIssuesQuery.error?.message ?? null,
    login: () => loginMutation.mutate(),
    refetchStatus: async () => {
      const result = await githubStatusQuery.refetch();
      return {
        data: result.data,
        error: result.error ?? null,
      };
    },
    threadToastData,
  });
  const pullEnabled =
    !!gitStatusForActions &&
    gitStatusForActions.branch !== null &&
    !gitStatusForActions.hasWorkingTreeChanges &&
    gitStatusForActions.behindCount > 0 &&
    !isGitActionRunning;
  const commitPushAvailable =
    !!gitStatusForActions &&
    gitStatusForActions.branch !== null &&
    !isGitActionRunning &&
    (gitStatusForActions.hasWorkingTreeChanges || gitStatusForActions.aheadCount > 0);
  const publishAvailable =
    supportsSourceControl &&
    isRepo &&
    !!gitStatusForActions &&
    gitStatusForActions.branch !== null &&
    gitStatusForActions.hasOriginRemote === false &&
    !isGitActionRunning;
  const commitPushDisabledReason = !gitStatusForActions
    ? "Status unavailable"
    : gitStatusForActions.branch === null
      ? "Detached HEAD"
      : isGitActionRunning
        ? "Action in progress"
        : !(gitStatusForActions.hasWorkingTreeChanges || gitStatusForActions.aheadCount > 0)
          ? "Nothing to push"
          : null;
  if (!workspaceCwd) return null;

  return (
    <>
      <ProjectPanel
        variant={panelVariant}
        header={
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <GitHubIcon className="size-4" />
              <span className="text-sm font-medium">Git</span>
              {githubStatusQuery.data?.repo?.nameWithOwner && (
                <span className="text-xs text-muted-foreground">
                  {githubStatusQuery.data.repo.nameWithOwner}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {githubStatusQuery.data?.authenticated ? (
                <Badge variant="success" size="sm">
                  <GitStatusDot level="success" className="mr-0.5" />
                  gh
                </Badge>
              ) : githubStatusQuery.data?.installed ? (
                <Badge variant="warning" size="sm">
                  Auth needed
                </Badge>
              ) : (
                <Badge variant="outline" size="sm">
                  No gh
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  void invalidateGitQueries(queryClient);
                  void invalidateGitHubQueries(queryClient);
                }}
                aria-label="Refresh"
              >
                <RefreshCcwIcon
                  className={cn(
                    "size-3.5",
                    (githubStatusQuery.isFetching || githubIssuesQuery.isFetching) &&
                      "animate-spin",
                  )}
                />
              </Button>
            </div>
          </div>
        }
      >
        {/* ============================================================ */}
        {/* PRIMARY ACTION ZONE - Only for primary workspace */}
        {/* ============================================================ */}
        {!isRepo ? (
          <Button
            variant="default"
            size="sm"
            disabled={initMutation.isPending}
            onClick={() => initMutation.mutate()}
            className="w-full"
          >
            {initMutation.isPending ? "Initializing..." : "Initialize Git"}
          </Button>
        ) : isPrimaryWorkspace ? (
          <div className="space-y-2">
            {publishAvailable && (
              <Button
                variant="default"
                size="default"
                onClick={() => {
                  setPublishResult(null);
                  setIsPublishDialogOpen(true);
                }}
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <UploadCloudIcon className="size-4" />
                  Publish repository
                </span>
              </Button>
            )}
            <Button
              variant="default"
              size="default"
              disabled={!commitPushAvailable}
              onClick={() => {
                void runGitActionWithToast({ action: "commit_push" });
              }}
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <CloudUploadIcon className="size-4" />
                Commit &amp; Push
              </span>
              <Kbd>⌘⇧P</Kbd>
            </Button>

            {commitPushDisabledReason && (
              <p className="text-center text-xs text-muted-foreground">
                {commitPushDisabledReason}
              </p>
            )}

            {/* Secondary actions row */}
            <div className="grid grid-cols-4 gap-1.5">
              <Button
                variant="outline"
                size="xs"
                disabled={!commitItem || commitItem.disabled}
                onClick={() => {
                  if (commitItem) openDialogForMenuItem(commitItem);
                }}
                className="justify-center"
              >
                <GitCommitIcon className="size-3.5" />
                Commit
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={!pullEnabled}
                onClick={pullLatest}
                className="justify-center"
              >
                <RefreshCcwIcon className="size-3.5" />
                Pull
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={
                  !activeTargetBranch ||
                  isDefaultBranch ||
                  isGitActionRunning ||
                  !gitStatusForActions ||
                  activeWorkspaceHasConflicts
                }
                onClick={() => setIsPromoteDialogOpen(true)}
                className="justify-center"
              >
                <GitMergeIcon className="size-3.5" />
                Promote
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={!prItem || prItem.disabled}
                onClick={() => {
                  if (prItem) openDialogForMenuItem(prItem);
                }}
                className="justify-center"
              >
                <GitPullRequestIcon className="size-3.5" />
                {prItem?.kind === "open_pr" ? "View PR" : "PR"}
              </Button>
            </div>
            {supportsSourceControl && gitStatusForActions?.hasOriginRemote === false && (
              <Button
                variant="outline"
                size="xs"
                disabled={!publishAvailable}
                onClick={() => {
                  setPublishResult(null);
                  setIsPublishDialogOpen(true);
                }}
                className="w-full justify-center"
              >
                <UploadCloudIcon className="size-3.5" />
                Publish
              </Button>
            )}

            {/* Status hints */}
            {gitStatusForActions?.branch === null && (
              <p className="text-center text-xs text-warning-foreground">
                Detached HEAD — checkout a branch
              </p>
            )}
            {isGitStatusOutOfSync && (
              <p className="text-center text-xs text-muted-foreground">Syncing...</p>
            )}
            {gitStatusError && (
              <p className="text-center text-xs text-destructive-foreground">
                {gitStatusError.message}
              </p>
            )}
          </div>
        ) : null}

        {/* ============================================================ */}
        {/* WORKSPACE SECTION */}
        {/* ============================================================ */}
        {isRepo && (
          <GitWorkspaceSection
            workspaceCwd={workspaceCwd}
            repoCwd={repoCwd}
            activeProjectId={activeProjectId}
            activeThreadId={activeThreadId}
            activeThreadBranch={activeThreadBranch}
            activeWorkspaceBranch={activeWorkspaceBranch}
            activeWorkspaceBranchMeta={activeWorkspaceBranchMeta}
            activeTargetBranch={activeTargetBranch}
            gitStatus={gitStatusForActions}
            primaryWorkspaceStatus={primaryWorkspaceStatus}
            primaryWorkspaceStatusErrorMessage={primaryWorkspaceStatusError?.message ?? null}
            isPrimaryWorkspace={isPrimaryWorkspace}
            hasConflicts={activeWorkspaceHasConflicts}
            mergeInProgress={activeWorkspaceMerge.inProgress}
            isGitActionRunning={isGitActionRunning}
            isMerging={isMergeRunning}
            isCreatingWorktree={createWorktreeMutation.isPending}
            isRemovingWorktree={removeWorktreeMutation.isPending}
            statusInfo={statusInfo}
            onOpenWorkspace={() => openPathInEditor(workspaceCwd)}
            onCreateDedicatedWorkspace={createDedicatedWorkspace}
            onOpenCommitDialog={() => {
              if (commitItem) {
                openDialogForMenuItem(commitItem);
              }
            }}
            onSyncFromTarget={() => {
              if (activeTargetBranch) {
                void runMergeFromBranch(activeTargetBranch);
              }
            }}
            onCloseWorkspace={() => closeDedicatedWorkspace(false)}
            onDiscardAndCloseWorkspace={() => closeDedicatedWorkspace(true)}
            onPreparePrimaryCheckout={openPrimaryWorkspaceResolutionDraft}
          />
        )}

        {/* ============================================================ */}
        {/* SYNC SECTION - Pull changes INTO this workspace */}
        {/* ============================================================ */}
        {isRepo && localBranches.length > 1 && supportsGitMerge && (
          <GitSyncSection
            localBranches={localBranches}
            activeWorkspaceBranch={activeWorkspaceBranch}
            mergeSourceBranch={mergeSourceBranch}
            onMergeSourceBranchChange={setMergeSourceBranch}
            gitStatus={gitStatusForActions}
            mergeState={activeWorkspaceMerge}
            hasConflicts={activeWorkspaceHasConflicts}
            isMergeRunning={isMergeRunning}
            isAbortMergeRunning={isAbortMergeRunning}
            activeThreadId={activeThreadId}
            lastMergeResult={lastMergeResult}
            defaultOpen={mergeExpanded}
            onRunLocalMerge={runLocalMerge}
            onCreateResolveConflictDraft={createResolveConflictDraft}
            onAbortActiveMerge={abortActiveMerge}
          />
        )}

        {isRepo && localBranches.length > 1 && !supportsGitMerge && (
          <GitPanelSection title="Sync" collapsible defaultOpen={mergeExpanded}>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Merge and conflict workflows stay fork owned. The current upstream RPC transport does
              not expose that adapter yet.
            </div>
          </GitPanelSection>
        )}

        {/* ============================================================ */}
        {/* GITHUB AUTH SECTION */}
        {/* ============================================================ */}
        {supportsGitHub ? (
          <>
            <GitHubAuthSection
              accountLogin={githubStatusQuery.data?.accountLogin ?? null}
              installed={githubStatusQuery.data?.installed === true}
              authenticated={isGitHubAuthenticated}
              isFetching={githubStatusQuery.isFetching}
              isAuthenticating={loginMutation.isPending}
              githubRepoUrl={githubRepoUrl}
              errorMessage={loginMutation.error?.message ?? null}
              onAuthAction={runAuthAction}
              onOpenRepo={() => {
                if (githubRepoUrl) {
                  void openExternalUrl(githubRepoUrl);
                }
              }}
            />

            <GitHubLinkedIssueSection
              visible={activeThreadIssueLink !== null}
              issueLink={activeThreadIssueLink}
              activePr={gitStatusForActions?.pr ?? null}
              canMarkIssueResolved={canMarkIssueResolved}
              isClosingIssue={closeIssueMutation.isPending}
              isReopeningIssue={reopenIssueMutation.isPending}
              onOpenIssue={(url) => {
                void openExternalUrl(url);
              }}
              onOpenPullRequest={(url) => {
                void openExternalUrl(url);
              }}
              onCloseIssue={() => {
                void updateActiveIssueState("closed");
              }}
              onReopenIssue={() => {
                void updateActiveIssueState("open");
              }}
            />

            <GitHubIssuesSection
              visible={
                githubStatusQuery.data?.authenticated === true &&
                githubStatusQuery.data?.repo !== null
              }
              canCreateIssue={!issuesDisabled}
              issueState={issueState}
              onCreateIssue={() => {
                createIssueMutation.reset();
                setIsCreateIssueDialogOpen(true);
              }}
              onIssueStateChange={setIssueState}
              isCreatingIssue={createIssueMutation.isPending}
              isLoading={githubIssuesQuery.isLoading}
              isFetching={githubIssuesQuery.isFetching}
              issuesDisabled={issuesDisabled}
              errorMessage={githubIssuesQuery.error?.message ?? null}
              issues={githubIssuesQuery.data?.issues ?? []}
              workflowsByIssueNumber={issueWorkflowsByNumber}
              onOpenIssue={(url) => {
                void openExternalUrl(url);
              }}
              onContinueIssueThread={(threadId) => {
                void navigateToThread(threadId);
              }}
              onOpenPullRequest={(url) => {
                void openExternalUrl(url);
              }}
              onResolveIssue={(issue) => {
                void startIssueWorkspaceThread(issue);
              }}
              resolvingIssueNumber={resolvingIssueNumber}
            />
          </>
        ) : (
          <GitPanelSection title="GitHub">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              GitHub issue and auth flows remain fork owned. The current upstream RPC transport does
              not expose that adapter yet.
            </div>
          </GitPanelSection>
        )}
      </ProjectPanel>

      <GitHubCreateIssueDialog
        open={isCreateIssueDialogOpen}
        repoNameWithOwner={githubStatusQuery.data?.repo?.nameWithOwner ?? null}
        isSubmitting={createIssueMutation.isPending}
        errorMessage={createIssueMutation.error?.message ?? null}
        onOpenChange={(open) => {
          if (!open) {
            createIssueMutation.reset();
          }
          setIsCreateIssueDialogOpen(open);
        }}
        onSubmit={(input) => {
          void createIssue(input);
        }}
      />

      <GitCommitDialog
        open={isCommitDialogOpen}
        branchName={gitStatusForActions?.branch ?? null}
        isDefaultBranch={isDefaultBranch}
        workingTree={gitStatusForActions?.workingTree ?? null}
        onOpenChange={setIsCommitDialogOpen}
        onOpenFile={openChangedFileInEditor}
        onSubmit={runDialogAction}
        onSubmitNewBranch={runDialogActionOnNewBranch}
      />

      <GitDefaultBranchDialog
        open={pendingDefaultBranchAction !== null}
        copy={pendingDefaultBranchActionCopy}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDefaultBranchAction(null);
          }
        }}
        onContinue={continuePendingDefaultBranchAction}
        onCreateBranch={checkoutFeatureBranchAndContinuePendingAction}
      />

      <GitPromoteDialog
        open={isPromoteDialogOpen}
        sourceBranch={activeWorkspaceBranch}
        targetBranch={activeTargetBranch}
        hasWorkingTreeChanges={gitStatusForActions?.hasWorkingTreeChanges ?? false}
        onOpenChange={setIsPromoteDialogOpen}
        onPromote={runPromoteAction}
      />

      <PublishRepositoryDialog
        open={isPublishDialogOpen}
        discovery={sourceControlDiscoveryQuery.data ?? null}
        isSubmitting={publishRepositoryMutation.isPending}
        errorMessage={publishRepositoryMutation.error?.message ?? null}
        result={publishResult}
        onOpenChange={setIsPublishDialogOpen}
        onSubmit={publishRepository}
        onOpenRepository={(url) => {
          void openExternalUrl(url);
        }}
      />
    </>
  );
}
