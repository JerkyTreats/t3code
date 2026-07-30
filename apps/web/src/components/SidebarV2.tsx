import { useAtomValue } from "@effect/atom-react";
import {
  scopeProjectRef,
  scopeThreadRef,
  scopedThreadKey,
} from "@t3tools/client-runtime/environment";
import { effectiveSettled } from "@t3tools/client-runtime/state/thread-settled";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EllipsisIcon,
  FolderPlusIcon,
  PanelRightOpenIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Link, useParams, useRouter } from "@tanstack/react-router";

import { useClientSettings } from "../hooks/useSettings";
import { useOpenAddProjectCommandPalette } from "../commandPaletteContext";
import { useSettlementNow } from "../hooks/useSettlementNow";
import { useThreadActions } from "../hooks/useThreadActions";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { readLocalApi } from "../localApi";
import { getProjectOrderKey, selectProjectGroupingSettings } from "../logicalProject";
import { openConcreteProjectLauncher } from "../project-management/openProjectLauncher";
import { useRightPanelStore } from "../rightPanelStore";
import { readThreadShell, useProjects, useServerConfigs, useThreadShells } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { projectEnvironment } from "../state/projects";
import { useEnvironmentQuery } from "../state/query";
import { primaryServerKeybindingsAtom } from "../state/server";
import { threadEnvironment } from "../state/threads";
import { vcsEnvironment } from "../state/vcs";
import { useAtomCommand } from "../state/use-atom-command";
import { useComposerDraftStore } from "../composerDraftStore";
import { useDiffPanelStore } from "../diffPanelStore";
import { useLocallyKnownProjectThreadMembershipReader } from "../lib/archivedThreadsState";
import { runProjectDeletionLifecycle } from "../lib/threadDeletionWorkflow";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { buildThreadRouteParams, resolveThreadRouteTarget } from "../threadRoutes";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { legacyProjectCwdPreferenceKey, useUiStateStore } from "../uiStateStore";
import { cn, isMacPlatform } from "../lib/utils";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { resolveShortcutCommand, threadTraversalDirectionFromCommand } from "../keybindings";
import { isTerminalFocused } from "../lib/terminalFocus";
import {
  buildSidebarProjectSnapshots,
  type SidebarProjectGroupMember,
} from "../sidebarProjectGrouping";
import type { SidebarThreadSummary } from "../types";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  buildProjectRemovalConfirmation,
  createDeferredSidebarV2ActivationController,
  getSidebarV2ConcreteProjectTargets,
  groupSidebarV2VcsProbes,
  isTrailingDoubleClick,
  orderItemsByPreferredIds,
  paginateSidebarV2Threads,
  pruneSidebarV2ChangeRequestStates,
  resolveAdjacentThreadId,
  resolveProjectRemovalConsentBlocker,
  resolveProjectRemovalMembershipBlocker,
  resolveSidebarV2ProjectStatusIndicator,
  resolveSidebarV2BulkSettleTargets,
  resolveSidebarV2ChangeRequestState,
  resolveSidebarV2RowKeyAction,
  resolveThreadStatusPill,
  sidebarV2VcsProbedThreadKeys,
  SIDEBAR_V2_ACTIVE_PAGE_SIZE,
  SIDEBAR_V2_SETTLED_INITIAL_COUNT,
  SIDEBAR_V2_SETTLED_PAGE_SIZE,
  sortProjectGroupsForSidebarV2,
  sortSettledThreadsForSidebarV2,
  sortThreadsForSidebarV2,
} from "./Sidebar.logic";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  useSidebar,
} from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { toastManager } from "./ui/toast";

const ACTIVE_PAGE_SIZE = SIDEBAR_V2_ACTIVE_PAGE_SIZE;

function compactTimeLabel(timestamp: string): string {
  const label = formatRelativeTimeLabel(timestamp);
  if (label === "just now") return "now";
  return label.endsWith(" ago") ? label.slice(0, -4) : label;
}

function projectRefKey(environmentId: string, projectId: string): string {
  return `${environmentId}:${projectId}`;
}

function threadTimestamp(thread: SidebarThreadSummary): string {
  return thread.latestUserMessageAt ?? thread.updatedAt;
}

interface ThreadRowProps {
  thread: SidebarThreadSummary;
  project: SidebarProjectGroupMember | null;
  projectLabel: string;
  active: boolean;
  settlementSupported: boolean;
  settled: boolean;
  orderedThreadKeys: readonly string[];
  onNavigate: (threadRef: ScopedThreadRef) => void;
  onRename: (thread: SidebarThreadSummary) => void;
  onSettle: (threadRef: ScopedThreadRef) => void;
  onUnsettle: (threadRef: ScopedThreadRef) => void;
  onDelete: (threadRef: ScopedThreadRef) => void;
}

const SidebarV2ThreadRow = memo(function SidebarV2ThreadRow(props: ThreadRowProps) {
  const {
    active,
    onDelete,
    onNavigate,
    onRename,
    onSettle,
    onUnsettle,
    orderedThreadKeys,
    project,
    projectLabel,
    settled,
    settlementSupported,
    thread,
  } = props;
  const threadRef = useMemo(
    () => scopeThreadRef(thread.environmentId, thread.id),
    [thread.environmentId, thread.id],
  );
  const threadKey = scopedThreadKey(threadRef);
  const lastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const markThreadUnread = useUiStateStore((state) => state.markThreadUnread);
  const selected = useThreadSelectionStore((state) => state.selectedThreadKeys.has(threadKey));
  const toggleThread = useThreadSelectionStore((state) => state.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((state) => state.rangeSelectTo);
  const setAnchor = useThreadSelectionStore((state) => state.setAnchor);
  const status = resolveThreadStatusPill({
    thread: {
      ...thread,
      lastVisitedAt,
    },
  });
  const unread = status?.label === "Completed";
  const activationControllerRef = useRef(createDeferredSidebarV2ActivationController());

  useEffect(() => () => activationControllerRef.current.dispose(), []);

  const activate = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (isTrailingDoubleClick(event.detail)) {
        activationControllerRef.current.cancel();
        event.preventDefault();
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        activationControllerRef.current.cancel();
        event.preventDefault();
        toggleThread(threadKey);
        return;
      }
      if (event.shiftKey) {
        activationControllerRef.current.cancel();
        event.preventDefault();
        rangeSelectTo(threadKey, orderedThreadKeys);
        return;
      }
      activationControllerRef.current.schedule(() => {
        setAnchor(threadKey);
        onNavigate(threadRef);
      });
    },
    [onNavigate, orderedThreadKeys, rangeSelectTo, setAnchor, threadKey, threadRef, toggleThread],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const nextKey = resolveAdjacentThreadId({
          threadIds: orderedThreadKeys,
          currentThreadId: threadKey,
          direction: event.key === "ArrowDown" ? "next" : "previous",
        });
        const nextElement = nextKey
          ? document.querySelector<HTMLButtonElement>(
              `[data-sidebar-v2-thread-key="${CSS.escape(nextKey)}"]`,
            )
          : null;
        if (nextElement) {
          event.preventDefault();
          nextElement.focus();
        }
        return;
      }
      const action = resolveSidebarV2RowKeyAction(event);
      if (action === null) return;
      event.preventDefault();
      if (action === "range-selection") {
        rangeSelectTo(threadKey, orderedThreadKeys);
        return;
      }
      if (action === "toggle-selection") {
        toggleThread(threadKey);
        return;
      }
      setAnchor(threadKey);
      onNavigate(threadRef);
    },
    [onNavigate, orderedThreadKeys, rangeSelectTo, setAnchor, threadKey, threadRef, toggleThread],
  );

  const handleLifecycle = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (settled) {
        onUnsettle(threadRef);
      } else {
        onSettle(threadRef);
      }
    },
    [onSettle, onUnsettle, settled, threadRef],
  );

  return (
    <li
      className={cn(
        "group/v2-row relative rounded-lg border transition-colors",
        active
          ? "border-primary/35 bg-primary/8 shadow-[inset_2px_0_0_var(--color-primary)]"
          : selected
            ? "border-primary/25 bg-primary/6"
            : "border-border/60 bg-card/45 hover:border-border hover:bg-accent/45",
      )}
      data-thread-item
    >
      <button
        type="button"
        data-sidebar-v2-thread-key={threadKey}
        className="flex w-full min-w-0 cursor-pointer flex-col gap-1.5 px-3 py-2.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={activate}
        onDoubleClick={(event) => {
          activationControllerRef.current.cancel();
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          onRename(thread);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          {status ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 text-[10px] font-medium",
                status.colorClass,
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  status.dotClass,
                  status.pulse && "animate-pulse",
                )}
              />
              {status.label}
            </span>
          ) : (
            <span className="text-[10px] font-medium text-muted-foreground/55">
              {settled ? "Settled" : "Ready"}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/55">
            {compactTimeLabel(threadTimestamp(thread))}
          </span>
        </span>
        <span className="flex w-full min-w-0 items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              unread || active ? "font-medium text-foreground" : "text-foreground/78",
            )}
          >
            {thread.title}
          </span>
          {unread ? (
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="Unread" />
          ) : null}
        </span>
        <span className="flex w-full min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground/60">
          {project ? (
            <ProjectFavicon
              environmentId={project.environmentId}
              cwd={project.workspaceRoot}
              className="size-3 shrink-0"
            />
          ) : null}
          <span className="min-w-0 truncate">{projectLabel}</span>
          {thread.branch ? (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate font-mono">{thread.branch}</span>
            </>
          ) : null}
        </span>
      </button>
      <div className="absolute right-1.5 top-1.5 flex items-center rounded-md border border-border/70 bg-background/95 opacity-0 shadow-sm transition-opacity group-hover/v2-row:opacity-100 group-focus-within/v2-row:opacity-100">
        {settlementSupported ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={settled ? "Return thread to active" : "Settle thread"}
                  className="inline-flex size-6 cursor-pointer items-center justify-center rounded-l-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={handleLifecycle}
                />
              }
            >
              {settled ? <Undo2Icon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
            </TooltipTrigger>
            <TooltipPopup side="top">{settled ? "Return to active" : "Settle thread"}</TooltipPopup>
          </Tooltip>
        ) : null}
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label="Thread actions"
                className="inline-flex size-6 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={(event) => event.stopPropagation()}
              />
            }
          >
            <EllipsisIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup side="right" align="start">
            <MenuItem onClick={() => onRename(thread)}>Rename</MenuItem>
            <MenuItem onClick={() => markThreadUnread(threadKey, thread.latestTurn?.completedAt)}>
              Mark unread
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => onDelete(threadRef)}>
              <Trash2Icon />
              Delete
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </li>
  );
});

const SidebarV2ChangeRequestMonitor = memo(function SidebarV2ChangeRequestMonitor(props: {
  environmentId: SidebarThreadSummary["environmentId"];
  cwd: string;
  threads: readonly SidebarThreadSummary[];
  onChange: (states: ReadonlyMap<string, "open" | "closed" | "merged" | null>) => void;
}) {
  const { cwd, environmentId, onChange, threads } = props;
  const gitStatus = useEnvironmentQuery(
    vcsEnvironment.status({
      environmentId,
      input: { cwd },
    }),
  );
  const states = useMemo(
    () =>
      new Map(
        threads.map((thread) => [
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          resolveSidebarV2ChangeRequestState({
            threadBranch: thread.branch,
            status: gitStatus.data,
          }),
        ]),
      ),
    [gitStatus.data, threads],
  );

  useEffect(() => {
    onChange(states);
  }, [onChange, states]);

  return null;
});

export default function SidebarV2() {
  const projects = useProjects();
  const threads = useThreadShells();
  const serverConfigs = useServerConfigs();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const archivedEnvironmentIds = useMemo(
    () => environments.map((environment) => environment.environmentId),
    [environments],
  );
  const { readProjectMembership, refreshEnvironment: refreshArchivedEnvironment } =
    useLocallyKnownProjectThreadMembershipReader(archivedEnvironmentIds);
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeThreadKey =
    routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null;
  const settlementNow = useSettlementNow();
  const autoSettleAfterDays = useClientSettings((settings) => settings.sidebarAutoSettleAfterDays);
  const projectSortOrder = useClientSettings((settings) => settings.sidebarProjectSortOrder);
  const threadSortOrder = useClientSettings((settings) => settings.sidebarThreadSortOrder);
  const confirmThreadDelete = useClientSettings((settings) => settings.confirmThreadDelete);
  const groupingSettings = useClientSettings(selectProjectGroupingSettings);
  const projectOrder = useUiStateStore((state) => state.projectOrder);
  const threadLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadKeys = useThreadSelectionStore((state) => state.selectedThreadKeys);
  const removeFromSelection = useThreadSelectionStore((state) => state.removeFromSelection);
  const clearComposerDraftForThread = useComposerDraftStore((state) => state.clearDraftThread);
  const clearProjectDraftThreadById = useComposerDraftStore(
    (state) => state.clearProjectDraftThreadById,
  );
  const clearTerminalUiState = useTerminalUiStateStore((state) => state.clearTerminalUiState);
  const clearRightPanelState = useRightPanelStore((state) => state.removeThread);
  const clearDiffPanelState = useDiffPanelStore((state) => state.removeThread);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const openAddProjectCommandPalette = useOpenAddProjectCommandPalette();
  const { deleteThread } = useThreadActions();
  const createProjectThread = useNewThreadHandler();
  const settleThread = useAtomCommand(threadEnvironment.settle, { reportFailure: false });
  const unsettleThread = useAtomCommand(threadEnvironment.unsettle, { reportFailure: false });
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const deleteProject = useAtomCommand(projectEnvironment.delete, { reportFailure: false });
  const [projectScopeKey, setProjectScopeKey] = useState<string | null>(null);
  const [activeVisibleCount, setActiveVisibleCount] = useState(ACTIVE_PAGE_SIZE);
  const [settledVisibleCount, setSettledVisibleCount] = useState(SIDEBAR_V2_SETTLED_INITIAL_COUNT);
  const [settledExpanded, setSettledExpanded] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SidebarThreadSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [projectRenameTarget, setProjectRenameTarget] = useState<SidebarProjectGroupMember | null>(
    null,
  );
  const [projectRenameTitle, setProjectRenameTitle] = useState("");
  const [changeRequestStateByKey, setChangeRequestStateByKey] = useState<
    ReadonlyMap<string, "open" | "closed" | "merged">
  >(() => new Map());
  const orderedProjects = useMemo(
    () =>
      orderItemsByPreferredIds({
        items: projects,
        preferredIds: projectOrder,
        getId: getProjectOrderKey,
        getPreferenceIds: (project) => [
          getProjectOrderKey(project),
          legacyProjectCwdPreferenceKey(project.workspaceRoot),
        ],
      }),
    [projectOrder, projects],
  );
  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const unsortedProjectGroups = useMemo(
    () =>
      buildSidebarProjectSnapshots({
        projects: projectSortOrder === "manual" ? orderedProjects : projects,
        settings: groupingSettings,
        primaryEnvironmentId,
        resolveEnvironmentLabel: (environmentId) => environmentLabelById.get(environmentId) ?? null,
      }),
    [
      environmentLabelById,
      groupingSettings,
      orderedProjects,
      primaryEnvironmentId,
      projectSortOrder,
      projects,
    ],
  );
  const projectGroups = useMemo(
    () =>
      sortProjectGroupsForSidebarV2({
        projects: unsortedProjectGroups,
        threads,
        sortOrder: projectSortOrder,
      }),
    [projectSortOrder, threads, unsortedProjectGroups],
  );
  const scopedProject = useMemo(
    () =>
      projectScopeKey === null
        ? null
        : (projectGroups.find((group) => group.projectKey === projectScopeKey) ?? null),
    [projectGroups, projectScopeKey],
  );
  const scopedProjectRefs = useMemo(
    () =>
      scopedProject === null
        ? null
        : new Set(
            scopedProject.memberProjectRefs.map((projectRef) =>
              projectRefKey(projectRef.environmentId, projectRef.projectId),
            ),
          ),
    [scopedProject],
  );

  useEffect(() => {
    if (projectScopeKey !== null && scopedProject === null) {
      setProjectScopeKey(null);
    }
    clearSelection();
    setActiveVisibleCount(ACTIVE_PAGE_SIZE);
    setSettledVisibleCount(SIDEBAR_V2_SETTLED_INITIAL_COUNT);
  }, [clearSelection, projectScopeKey, scopedProject]);

  const projectMemberByRef = useMemo(
    () =>
      new Map(
        projectGroups.flatMap((group) =>
          group.memberProjects.map(
            (member) => [projectRefKey(member.environmentId, member.id), member] as const,
          ),
        ),
      ),
    [projectGroups],
  );
  const projectLabelByRef = useMemo(
    () =>
      new Map(
        projectGroups.flatMap((group) =>
          group.memberProjects.map(
            (member) =>
              [projectRefKey(member.environmentId, member.id), group.displayName] as const,
          ),
        ),
      ),
    [projectGroups],
  );
  const supportsSettlement = useCallback(
    (environmentId: SidebarThreadSummary["environmentId"]) =>
      serverConfigs.get(environmentId)?.environment.capabilities.threadSettlement === true,
    [serverConfigs],
  );
  const visibleThreads = useMemo(
    () =>
      threads.filter(
        (thread) =>
          thread.archivedAt === null &&
          (scopedProjectRefs === null ||
            scopedProjectRefs.has(projectRefKey(thread.environmentId, thread.projectId))),
      ),
    [scopedProjectRefs, threads],
  );
  const vcsProbeGroups = useMemo(
    () =>
      groupSidebarV2VcsProbes({
        threads: visibleThreads,
        projectCwd: (thread) =>
          projectMemberByRef.get(projectRefKey(thread.environmentId, thread.projectId))
            ?.workspaceRoot ?? null,
      }),
    [projectMemberByRef, visibleThreads],
  );
  const probedThreadKeys = useMemo(
    () => sidebarV2VcsProbedThreadKeys(vcsProbeGroups),
    [vcsProbeGroups],
  );
  useEffect(() => {
    setChangeRequestStateByKey((current) =>
      pruneSidebarV2ChangeRequestStates(current, probedThreadKeys),
    );
  }, [probedThreadKeys]);
  const partition = useMemo(() => {
    const active: SidebarThreadSummary[] = [];
    const settled: SidebarThreadSummary[] = [];
    for (const thread of visibleThreads) {
      if (
        supportsSettlement(thread.environmentId) &&
        effectiveSettled(thread, {
          now: settlementNow,
          autoSettleAfterDays,
          changeRequestState:
            changeRequestStateByKey.get(
              scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
            ) ?? null,
        })
      ) {
        settled.push(thread);
      } else {
        active.push(thread);
      }
    }
    return {
      active: sortThreadsForSidebarV2(active),
      settled: sortSettledThreadsForSidebarV2(settled),
    };
  }, [
    autoSettleAfterDays,
    changeRequestStateByKey,
    settlementNow,
    supportsSettlement,
    visibleThreads,
  ]);
  const activeRouteThread =
    routeThreadKey === null
      ? null
      : (partition.active.find(
          (thread) =>
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === routeThreadKey,
        ) ?? null);
  const activePage = paginateSidebarV2Threads({
    threads: partition.active,
    visibleCount: activeVisibleCount,
    activeThread: activeRouteThread,
  });
  const settledRouteThread =
    routeThreadKey === null
      ? null
      : (partition.settled.find(
          (thread) =>
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === routeThreadKey,
        ) ?? null);
  const settledPage = paginateSidebarV2Threads({
    threads: partition.settled,
    visibleCount: settledVisibleCount,
    activeThread: settledRouteThread,
  });
  const showSettledRows = settledExpanded || settledRouteThread !== null;
  const orderedThreadKeys = useMemo(
    () =>
      [...activePage.visibleThreads, ...(showSettledRows ? settledPage.visibleThreads : [])].map(
        (thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    [activePage.visibleThreads, settledPage.visibleThreads, showSettledRows],
  );
  const threadByKey = useMemo(
    () =>
      new Map(
        visibleThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [visibleThreads],
  );
  const selectedTargets = useMemo(
    () =>
      resolveSidebarV2BulkSettleTargets({
        threads: partition.active,
        selectedThreadKeys,
        now: settlementNow,
        supportsSettlement,
      }),
    [partition.active, selectedThreadKeys, settlementNow, supportsSettlement],
  );
  const projectStatusByKey = useMemo(
    () =>
      new Map(
        projectGroups.map(
          (group) =>
            [
              group.projectKey,
              resolveSidebarV2ProjectStatusIndicator({
                threads,
                projectRefs: group.memberProjectRefs,
                lastVisitedAtByThreadKey: threadLastVisitedAtById,
              }),
            ] as const,
        ),
      ),
    [projectGroups, threadLastVisitedAtById, threads],
  );
  const projectActionGroups = scopedProject ? [scopedProject] : projectGroups;
  const newThreadMembers = getSidebarV2ConcreteProjectTargets({
    groups: projectGroups,
    scopedProjectKey: scopedProject?.projectKey ?? null,
  }).map((member) => ({
    group:
      projectActionGroups.find((group) =>
        group.memberProjects.some(
          (candidate) => candidate.physicalProjectKey === member.physicalProjectKey,
        ),
      ) ?? projectActionGroups[0]!,
    member,
  }));

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      clearSelection();
      if (isMobile) setOpenMobile(false);
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, router, setOpenMobile],
  );
  const handleChangeRequestStates = useCallback(
    (states: ReadonlyMap<string, "open" | "closed" | "merged" | null>) => {
      setChangeRequestStateByKey((current) => {
        const next = new Map(current);
        let changed = false;
        for (const [threadKey, state] of states) {
          if ((current.get(threadKey) ?? null) === state) continue;
          changed = true;
          if (state === null) {
            next.delete(threadKey);
          } else {
            next.set(threadKey, state);
          }
        }
        return changed ? next : current;
      });
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isTerminalFocused() || isModelPickerOpen()) {
        return;
      }
      const command = resolveShortcutCommand(event, keybindings, {
        platform: isMacPlatform(navigator.platform) ? "mac" : "other",
        context: {
          terminalFocus: false,
          terminalOpen: false,
          modelPickerOpen: false,
        },
      });
      const direction = threadTraversalDirectionFromCommand(command);
      if (direction === null) return;
      const targetKey = resolveAdjacentThreadId({
        threadIds: orderedThreadKeys,
        currentThreadId: routeThreadKey,
        direction,
      });
      const target = targetKey ? threadByKey.get(targetKey) : null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      navigateToThread(scopeThreadRef(target.environmentId, target.id));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybindings, navigateToThread, orderedThreadKeys, routeThreadKey, threadByKey]);

  const reportCommandFailure = useCallback((title: string, result: unknown) => {
    if (
      result &&
      typeof result === "object" &&
      "_tag" in result &&
      result._tag === "Failure" &&
      !isAtomCommandInterrupted(result as never)
    ) {
      const error = squashAtomCommandFailure(result as never);
      toastManager.add({
        type: "error",
        title,
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  }, []);

  const handleSettle = useCallback(
    async (threadRef: ScopedThreadRef) => {
      const result = await settleThread({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId },
      });
      reportCommandFailure("Failed to settle thread", result);
    },
    [reportCommandFailure, settleThread],
  );
  const handleUnsettle = useCallback(
    async (threadRef: ScopedThreadRef) => {
      const result = await unsettleThread({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId },
      });
      reportCommandFailure("Failed to return thread to active", result);
    },
    [reportCommandFailure, unsettleThread],
  );
  const handleBulkSettle = useCallback(async () => {
    const settledKeys: string[] = [];
    for (const thread of selectedTargets) {
      const result = await settleThread({
        environmentId: thread.environmentId,
        input: { threadId: thread.id },
      });
      if (result._tag === "Success") {
        settledKeys.push(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)));
      } else {
        reportCommandFailure(`Failed to settle ${thread.title}`, result);
      }
    }
    removeFromSelection(settledKeys);
  }, [removeFromSelection, reportCommandFailure, selectedTargets, settleThread]);
  const handleDelete = useCallback(
    async (threadRef: ScopedThreadRef) => {
      const api = readLocalApi();
      if (confirmThreadDelete && api) {
        const thread = readThreadShell(threadRef);
        const confirmed = await api.dialogs.confirm(
          [
            `Delete thread "${thread?.title ?? "this thread"}"?`,
            "This permanently clears conversation history for this thread.",
          ].join("\n"),
        );
        if (!confirmed) return;
      }
      const result = await deleteThread(threadRef);
      reportCommandFailure("Failed to delete thread", result);
      if (result._tag === "Success") {
        removeFromSelection([scopedThreadKey(threadRef)]);
      }
    },
    [confirmThreadDelete, deleteThread, removeFromSelection, reportCommandFailure],
  );
  const submitRename = useCallback(async () => {
    if (!renameTarget) return;
    const title = renameTitle.trim();
    if (!title || title === renameTarget.title) {
      setRenameTarget(null);
      return;
    }
    const result = await updateThreadMetadata({
      environmentId: renameTarget.environmentId,
      input: {
        threadId: renameTarget.id,
        title,
      },
    });
    reportCommandFailure("Failed to rename thread", result);
    if (result._tag === "Success") setRenameTarget(null);
  }, [renameTarget, renameTitle, reportCommandFailure, updateThreadMetadata]);
  const submitProjectRename = useCallback(async () => {
    if (!projectRenameTarget) return;
    const title = projectRenameTitle.trim();
    if (!title || title === projectRenameTarget.title) {
      setProjectRenameTarget(null);
      return;
    }
    const result = await updateProject({
      environmentId: projectRenameTarget.environmentId,
      input: { projectId: projectRenameTarget.id, title },
    });
    reportCommandFailure("Failed to rename project", result);
    if (result._tag === "Success") setProjectRenameTarget(null);
  }, [projectRenameTarget, projectRenameTitle, reportCommandFailure, updateProject]);
  const handleRemoveProject = useCallback(
    async (member: SidebarProjectGroupMember) => {
      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
      const confirmedMembership = readProjectMembership(memberProjectRef);
      const membershipBlocker = resolveProjectRemovalMembershipBlocker({
        isLoading: confirmedMembership.isLoading,
        error: confirmedMembership.error,
      });
      if (membershipBlocker !== null) {
        toastManager.add({
          type: "error",
          title: membershipBlocker.title,
          description: membershipBlocker.description,
        });
        return;
      }
      const draftStore = useComposerDraftStore.getState();
      const projectDraftThread = draftStore.getDraftThreadByProjectRef(memberProjectRef);
      const api = readLocalApi();
      const confirmation = buildProjectRemovalConfirmation({
        projectTitle: member.title,
        workspaceRoot: member.workspaceRoot,
        linkedConversationCount: confirmedMembership.threadRefs.length,
      });
      const confirmed =
        api == null
          ? window.confirm(confirmation.browserMessage)
          : await api.dialogs.confirm(confirmation.dialogLines.join("\n"));
      if (!confirmed) return;
      const currentMembership = readProjectMembership(memberProjectRef);
      const consentBlocker = resolveProjectRemovalConsentBlocker({
        confirmedThreadKeys: confirmedMembership.threadRefs.map(scopedThreadKey),
        currentMembership: {
          threadKeys: currentMembership.threadRefs.map(scopedThreadKey),
          isLoading: currentMembership.isLoading,
          error: currentMembership.error,
        },
      });
      if (consentBlocker !== null) {
        toastManager.add({
          type: "warning",
          title: consentBlocker.title,
          description: consentBlocker.description,
        });
        return;
      }
      const readExactProjectThreadTargets = () =>
        readProjectMembership(memberProjectRef).threadRefs.map((threadRef) => ({
          threadRef,
          projectRef: memberProjectRef,
        }));
      const result = await runProjectDeletionLifecycle({
        readThreadTargets: readExactProjectThreadTargets,
        deleteProjectRecord: () =>
          deleteProject({
            environmentId: member.environmentId,
            input: {
              projectId: member.id,
              force: true,
            },
          }),
        didDeleteProject: (deleteResult) => deleteResult._tag === "Success",
        actions: {
          clearComposerDraftForThread,
          clearProjectDraftThreadById,
          clearTerminalUiState,
          clearRightPanelState,
          clearDiffPanelState,
          removeFromThreadSelection: (threadRefs) => {
            removeFromSelection(threadRefs.map(scopedThreadKey));
          },
        },
        onProjectDeleted: () => {
          refreshArchivedEnvironment(member.environmentId);
        },
      });
      reportCommandFailure("Failed to remove project", result);
      if (result._tag !== "Success") return;
      if (projectDraftThread) {
        draftStore.clearDraftThread(projectDraftThread.draftId);
      }
      draftStore.clearProjectDraftThreadId(memberProjectRef);
      if (projectScopeKey !== null) {
        const group = projectGroups.find((candidate) =>
          candidate.memberProjects.some(
            (candidateMember) =>
              candidateMember.environmentId === member.environmentId &&
              candidateMember.id === member.id,
          ),
        );
        if (group?.memberProjects.length === 1) setProjectScopeKey(null);
      }
    },
    [
      clearComposerDraftForThread,
      clearDiffPanelState,
      clearProjectDraftThreadById,
      clearRightPanelState,
      clearTerminalUiState,
      deleteProject,
      projectGroups,
      projectScopeKey,
      readProjectMembership,
      refreshArchivedEnvironment,
      removeFromSelection,
      reportCommandFailure,
    ],
  );
  const handleOpenProject = useCallback(
    async (member: SidebarProjectGroupMember) => {
      await openConcreteProjectLauncher({
        projectRef: scopeProjectRef(member.environmentId, member.id),
        threads,
        sortOrder: threadSortOrder,
        showLauncher: (threadRef) => useRightPanelStore.getState().showLauncher(threadRef),
        navigateToThread: async (threadRef) => {
          navigateToThread(threadRef);
        },
        createProjectThread: async (projectRef, beforeNavigate) => {
          await createProjectThread(projectRef, { beforeNavigate });
        },
      });
    },
    [createProjectThread, navigateToThread, threadSortOrder, threads],
  );
  const renderThreadRow = useCallback(
    (thread: SidebarThreadSummary, settled: boolean) => {
      const projectKey = projectRefKey(thread.environmentId, thread.projectId);
      return (
        <SidebarV2ThreadRow
          key={scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))}
          thread={thread}
          project={projectMemberByRef.get(projectKey) ?? null}
          projectLabel={projectLabelByRef.get(projectKey) ?? "Unknown project"}
          active={
            routeThreadKey === scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
          }
          settlementSupported={supportsSettlement(thread.environmentId)}
          settled={settled}
          orderedThreadKeys={orderedThreadKeys}
          onNavigate={navigateToThread}
          onRename={(target) => {
            setRenameTarget(target);
            setRenameTitle(target.title);
          }}
          onSettle={(threadRef) => void handleSettle(threadRef)}
          onUnsettle={(threadRef) => void handleUnsettle(threadRef)}
          onDelete={(threadRef) => void handleDelete(threadRef)}
        />
      );
    },
    [
      handleDelete,
      handleSettle,
      handleUnsettle,
      navigateToThread,
      orderedThreadKeys,
      projectLabelByRef,
      projectMemberByRef,
      routeThreadKey,
      supportsSettlement,
    ],
  );

  return (
    <>
      {vcsProbeGroups.map((group) => (
        <SidebarV2ChangeRequestMonitor
          key={`change-request:${group.key}`}
          environmentId={group.environmentId as SidebarThreadSummary["environmentId"]}
          cwd={group.cwd}
          threads={group.threads}
          onChange={handleChangeRequestStates}
        />
      ))}
      <SidebarHeader className="gap-2 border-b border-border/70 px-2.5 pb-2 pt-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="font-mono text-xs font-semibold tracking-[0.18em] text-foreground">
              T3 CODE
            </span>
            <span className="rounded border border-sky-500/25 bg-sky-500/8 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest text-sky-600 dark:text-sky-300">
              V2
            </span>
          </div>
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label="New thread"
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  disabled={newThreadMembers.length === 0}
                />
              }
            >
              <PlusIcon className="size-4" />
            </MenuTrigger>
            <MenuPopup align="end" className="w-64">
              <MenuGroupLabel>New thread in</MenuGroupLabel>
              {newThreadMembers.map(({ group, member }) => (
                <MenuItem
                  key={member.physicalProjectKey}
                  onClick={() =>
                    void createProjectThread(scopeProjectRef(member.environmentId, member.id))
                  }
                >
                  <ProjectFavicon
                    environmentId={member.environmentId}
                    cwd={member.workspaceRoot}
                    className="size-3.5"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {group.groupedProjectCount > 1
                      ? `${group.displayName} · ${member.environmentLabel ?? member.workspaceRoot}`
                      : member.title}
                  </span>
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        </div>
        <div className="flex items-center gap-1.5">
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-background/50 px-2 text-left text-xs text-foreground hover:bg-accent"
                />
              }
            >
              {scopedProject ? (
                <ProjectFavicon
                  environmentId={scopedProject.environmentId}
                  cwd={scopedProject.workspaceRoot}
                  className="size-3.5 shrink-0"
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate">
                {scopedProject?.displayName ?? "All projects"}
              </span>
              <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
            </MenuTrigger>
            <MenuPopup align="start" className="w-64">
              <MenuItem onClick={() => setProjectScopeKey(null)}>All projects</MenuItem>
              <MenuSeparator />
              {projectGroups.map((group) => {
                const status = projectStatusByKey.get(group.projectKey) ?? null;
                return (
                  <MenuGroup key={group.projectKey}>
                    <MenuItem onClick={() => setProjectScopeKey(group.projectKey)}>
                      <ProjectFavicon
                        environmentId={group.environmentId}
                        cwd={group.workspaceRoot}
                        className="size-3.5"
                      />
                      <span className="min-w-0 flex-1 truncate">{group.displayName}</span>
                      {status ? (
                        <span className={cn("text-[10px]", status.colorClass)}>{status.label}</span>
                      ) : null}
                    </MenuItem>
                    <MenuGroupLabel className="truncate">
                      {group.groupedProjectCount > 1
                        ? `${group.groupedProjectCount} concrete project entries`
                        : group.workspaceRoot}
                    </MenuGroupLabel>
                  </MenuGroup>
                );
              })}
            </MenuPopup>
          </Menu>
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Project actions"
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground"
                  disabled={projectGroups.length === 0}
                />
              }
            >
              <EllipsisIcon className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" className="w-64">
              {projectActionGroups.flatMap((group) =>
                group.memberProjects.map((member) => (
                  <MenuGroup key={member.physicalProjectKey}>
                    <MenuGroupLabel>
                      {group.groupedProjectCount > 1
                        ? `${group.displayName} · ${member.environmentLabel ?? member.workspaceRoot}`
                        : member.environmentLabel
                          ? `${member.title} · ${member.environmentLabel}`
                          : member.title}
                    </MenuGroupLabel>
                    <MenuItem onClick={() => void handleOpenProject(member)}>
                      <PanelRightOpenIcon />
                      Project panel
                    </MenuItem>
                    <MenuItem
                      onClick={() =>
                        void createProjectThread(scopeProjectRef(member.environmentId, member.id))
                      }
                    >
                      <PlusIcon />
                      New thread
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        setProjectRenameTarget(member);
                        setProjectRenameTitle(member.title);
                      }}
                    >
                      Rename
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        void navigator.clipboard.writeText(member.workspaceRoot);
                        toastManager.add({
                          type: "success",
                          title: "Path copied",
                          description: member.workspaceRoot,
                        });
                      }}
                    >
                      <CopyIcon />
                      Copy path
                    </MenuItem>
                    <MenuItem
                      variant="destructive"
                      onClick={() => void handleRemoveProject(member)}
                    >
                      <Trash2Icon />
                      Remove
                    </MenuItem>
                    <MenuSeparator />
                  </MenuGroup>
                )),
              )}
            </MenuPopup>
          </Menu>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {selectedThreadKeys.size > 0 ? (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/6 px-2.5 py-2">
            <span className="min-w-0 flex-1 text-xs text-foreground">
              {selectedThreadKeys.size} selected
            </span>
            <Button
              size="xs"
              variant="outline"
              disabled={selectedTargets.length === 0}
              onClick={() => void handleBulkSettle()}
            >
              <CheckIcon />
              Settle {selectedTargets.length}
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={clearSelection}>
              <Undo2Icon />
              <span className="sr-only">Clear selection</span>
            </Button>
          </div>
        ) : null}

        <SidebarGroup className="p-0">
          <div className="mb-1.5 flex items-center px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/65">
              Active
            </span>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/50">
              {partition.active.length}
            </span>
          </div>
          {activePage.visibleThreads.length > 0 ? (
            <ul className="grid gap-1.5">
              {activePage.visibleThreads.map((thread) => renderThreadRow(thread, false))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center">
              <p className="text-xs font-medium text-foreground/80">No active work</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Start a thread or return one from settled history.
              </p>
            </div>
          )}
          {activePage.hiddenCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1.5 w-full text-xs text-muted-foreground"
              onClick={() => setActiveVisibleCount((count) => count + ACTIVE_PAGE_SIZE)}
            >
              Show {Math.min(ACTIVE_PAGE_SIZE, activePage.hiddenCount)} more active
            </Button>
          ) : null}
        </SidebarGroup>

        {partition.settled.length > 0 ? (
          <SidebarGroup className="mt-3 border-t border-border/60 p-0 pt-2.5">
            <button
              type="button"
              className="mb-1.5 flex w-full cursor-pointer items-center px-1 text-left"
              onClick={() => setSettledExpanded((expanded) => !expanded)}
            >
              <ChevronRightIcon
                className={cn(
                  "mr-1 size-3 text-muted-foreground transition-transform",
                  showSettledRows && "rotate-90",
                )}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/65">
                Settled
              </span>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/50">
                {partition.settled.length}
              </span>
            </button>
            {showSettledRows ? (
              <>
                <ul className="grid gap-1.5">
                  {settledPage.visibleThreads.map((thread) => renderThreadRow(thread, true))}
                </ul>
                {settledPage.hiddenCount > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1.5 w-full text-xs text-muted-foreground"
                    onClick={() =>
                      setSettledVisibleCount((count) => count + SIDEBAR_V2_SETTLED_PAGE_SIZE)
                    }
                  >
                    Show {Math.min(SIDEBAR_V2_SETTLED_PAGE_SIZE, settledPage.hiddenCount)} more
                    settled
                  </Button>
                ) : null}
              </>
            ) : null}
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/70 p-2">
        <div className="grid grid-cols-2 gap-1.5">
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs text-muted-foreground"
                  disabled={newThreadMembers.length === 0}
                />
              }
            >
              <PlusIcon />
              New thread
            </MenuTrigger>
            <MenuPopup align="start" side="top" className="w-64">
              <MenuGroupLabel>New thread in</MenuGroupLabel>
              {newThreadMembers.map(({ group, member }) => (
                <MenuItem
                  key={member.physicalProjectKey}
                  onClick={() =>
                    void createProjectThread(scopeProjectRef(member.environmentId, member.id))
                  }
                >
                  <ProjectFavicon
                    environmentId={member.environmentId}
                    cwd={member.workspaceRoot}
                    className="size-3.5"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {group.groupedProjectCount > 1
                      ? `${group.displayName} · ${member.environmentLabel ?? member.workspaceRoot}`
                      : member.title}
                  </span>
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start text-xs text-muted-foreground"
            render={<Link to="/settings" />}
          >
            <SettingsIcon />
            Settings
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start text-xs text-muted-foreground"
          onClick={openAddProjectCommandPalette}
        >
          <FolderPlusIcon />
          Add project
        </Button>
      </SidebarFooter>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename thread</DialogTitle>
            <DialogDescription>
              Use a concise title that stays recognizable in the queue.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Input
              autoFocus
              aria-label="Thread title"
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitRename();
                }
              }}
            />
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitRename()}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={projectRenameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setProjectRenameTarget(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              The concrete project path and environment identity stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Input
              autoFocus
              aria-label="Project title"
              value={projectRenameTitle}
              onChange={(event) => setProjectRenameTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitProjectRename();
                }
              }}
            />
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitProjectRename()}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
