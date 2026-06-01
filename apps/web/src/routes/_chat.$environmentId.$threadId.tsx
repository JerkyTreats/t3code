import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { projectScriptCwd } from "@t3tools/shared/projectScripts";
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";

import ChatView from "../components/ChatView";
import { PlanConversationDocument } from "../components/PlanConversationDocument";
import { threadHasStarted } from "../components/ChatView.logic";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../composerDraftStore";
import {
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../rightPanelLayout";
import { selectEnvironmentState, selectThreadExistsByRef, useStore } from "../store";
import { createThreadSelectorByRef } from "../storeSelectors";
import { getThreadFromEnvironmentState } from "../threadDerivation";
import { resolveThreadRouteRef, buildThreadRouteParams } from "../threadRoutes";
import { RightPanelSheet } from "../components/RightPanelSheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";
import { GitPanelRouteAdapter } from "../components/git-panel/GitPanelRouteAdapter";
import { FilesConversationDocument } from "../components/files-panel/FilesConversationDocument";
import { FilesPanelRouteAdapter } from "../components/files-panel/FilesPanelRouteAdapter";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(24rem,34vw,36rem)";
const DIFF_INLINE_SIDEBAR_MIN_WIDTH = 22 * 16;
const DIFF_INLINE_SIDEBAR_MAX_WIDTH = 256 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

const LazyDiffPanel = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
        <DiffPanel mode={props.mode} />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
};

const DiffPanelInlineSidebar = (props: {
  diffOpen: boolean;
  onCloseDiff: () => void;
  onOpenDiff: () => void;
  renderDiffContent: boolean;
}) => {
  const { diffOpen, onCloseDiff, onOpenDiff, renderDiffContent } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenDiff();
        return;
      }
      onCloseDiff();
    },
    [onCloseDiff, onOpenDiff],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const composerForm = document.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      wrapper.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      if (previousSidebarWidth.length > 0) {
        wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
      } else {
        wrapper.style.removeProperty("--sidebar-width");
      }

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={diffOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": DIFF_INLINE_DEFAULT_WIDTH } as React.CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-card text-foreground"
        resizable={{
          maxWidth: DIFF_INLINE_SIDEBAR_MAX_WIDTH,
          minWidth: DIFF_INLINE_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {renderDiffContent ? <LazyDiffPanel mode="sidebar" /> : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const search = Route.useSearch();
  const bootstrapComplete = useStore(
    (store) => selectEnvironmentState(store, threadRef?.environmentId ?? null).bootstrapComplete,
  );
  const serverThread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));
  const threadExists = useStore((store) => selectThreadExistsByRef(store, threadRef));
  const environmentHasServerThreads = useStore(
    (store) => selectEnvironmentState(store, threadRef?.environmentId ?? null).threadIds.length > 0,
  );
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) {
      return false;
    }
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const routeThreadExists = threadExists || draftThreadExists;
  const filesThread = serverThread ?? draftThread ?? null;
  const serverThreadStarted = threadHasStarted(serverThread);
  const environmentHasAnyThreads = environmentHasServerThreads || environmentHasDraftThreads;
  const diffOpen = search.diff === "1";
  const gitOpen = search.git === "1";
  const filesOpen = search.files === "1";
  const expandedFilesDocument = filesOpen && search.docExpanded === "1" && !!search.docPath;
  const planPreviewOpen = search.planPreview === "1" && !!search.planThreadId && !!search.planId;
  const shouldUseDiffSheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const planPreviewThread = useStore(
    useMemo(
      () => (store) =>
        search.planThreadId
          ? getThreadFromEnvironmentState(
              selectEnvironmentState(store, threadRef?.environmentId ?? null),
              search.planThreadId,
            )
          : undefined,
      [search.planThreadId, threadRef?.environmentId],
    ),
  );
  const planPreviewProject = useStore((store) =>
    planPreviewThread
      ? selectEnvironmentState(store, planPreviewThread.environmentId).projectById[
          planPreviewThread.projectId
        ]
      : undefined,
  );
  const planPreviewPlan = useMemo(
    () =>
      planPreviewOpen
        ? (planPreviewThread?.proposedPlans.find((plan) => plan.id === search.planId) ?? null)
        : null,
    [planPreviewOpen, planPreviewThread?.proposedPlans, search.planId],
  );
  const planPreviewWorkspaceCwd = useMemo(
    () =>
      planPreviewProject
        ? projectScriptCwd({
            project: { cwd: planPreviewProject.cwd },
            worktreePath: planPreviewThread?.worktreePath ?? null,
          })
        : undefined,
    [planPreviewProject, planPreviewThread?.worktreePath],
  );
  const filesProject = useStore((store) =>
    filesThread
      ? selectEnvironmentState(store, filesThread.environmentId).projectById[filesThread.projectId]
      : undefined,
  );
  const filesWorkspaceCwd = useMemo(
    () =>
      filesProject
        ? projectScriptCwd({
            project: { cwd: filesProject.cwd },
            worktreePath: filesThread?.worktreePath ?? null,
          })
        : null,
    [filesProject, filesThread?.worktreePath],
  );
  const currentThreadKey = threadRef ? `${threadRef.environmentId}:${threadRef.threadId}` : null;
  const [diffPanelMountState, setDiffPanelMountState] = useState(() => ({
    threadKey: currentThreadKey,
    hasOpenedDiff: diffOpen,
  }));
  const hasOpenedDiff =
    diffPanelMountState.threadKey === currentThreadKey
      ? diffPanelMountState.hasOpenedDiff
      : diffOpen;
  const [gitPanelMountState, setGitPanelMountState] = useState(() => ({
    threadKey: currentThreadKey,
    hasOpenedGit: gitOpen,
  }));
  const hasOpenedGit =
    gitPanelMountState.threadKey === currentThreadKey ? gitPanelMountState.hasOpenedGit : gitOpen;
  const [filesPanelMountState, setFilesPanelMountState] = useState(() => ({
    threadKey: currentThreadKey,
    hasOpenedFiles: filesOpen,
  }));
  const hasOpenedFiles =
    filesPanelMountState.threadKey === currentThreadKey
      ? filesPanelMountState.hasOpenedFiles
      : filesOpen;
  const markDiffOpened = useCallback(() => {
    setDiffPanelMountState((previous) => {
      if (previous.threadKey === currentThreadKey && previous.hasOpenedDiff) {
        return previous;
      }
      return {
        threadKey: currentThreadKey,
        hasOpenedDiff: true,
      };
    });
  }, [currentThreadKey]);
  const closeDiff = useCallback(() => {
    if (!threadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: { diff: undefined },
    });
  }, [navigate, threadRef]);
  const openDiff = useCallback(() => {
    if (!threadRef) {
      return;
    }
    markDiffOpened();
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, diff: "1" };
      },
    });
  }, [markDiffOpened, navigate, threadRef]);
  const markGitOpened = useCallback(() => {
    setGitPanelMountState((previous) => {
      if (previous.threadKey === currentThreadKey && previous.hasOpenedGit) {
        return previous;
      }
      return {
        threadKey: currentThreadKey,
        hasOpenedGit: true,
      };
    });
  }, [currentThreadKey]);
  const closeGit = useCallback(() => {
    if (!threadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: { git: undefined },
    });
  }, [navigate, threadRef]);
  const openGit = useCallback(() => {
    if (!threadRef) {
      return;
    }
    markGitOpened();
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, git: "1" };
      },
    });
  }, [markGitOpened, navigate, threadRef]);
  const markFilesOpened = useCallback(() => {
    setFilesPanelMountState((previous) => {
      if (previous.threadKey === currentThreadKey && previous.hasOpenedFiles) {
        return previous;
      }
      return {
        threadKey: currentThreadKey,
        hasOpenedFiles: true,
      };
    });
  }, [currentThreadKey]);
  const closeFiles = useCallback(() => {
    if (!threadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: { files: undefined, docPath: undefined, docExpanded: undefined },
    });
  }, [navigate, threadRef]);
  const openFiles = useCallback(() => {
    if (!threadRef) {
      return;
    }
    markFilesOpened();
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, files: "1" };
      },
    });
  }, [markFilesOpened, navigate, threadRef]);
  const selectDocumentPath = useCallback(
    (pathValue: string) => {
      if (!threadRef) {
        return;
      }
      markFilesOpened();
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
        search: (previous) => {
          const rest = stripDiffSearchParams(previous);
          return {
            ...rest,
            files: "1" as const,
            docPath: pathValue,
            docExpanded: "1" as const,
          };
        },
      });
    },
    [markFilesOpened, navigate, threadRef],
  );
  const expandDocument = useCallback(() => {
    if (!threadRef || !search.docPath) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => ({
        ...stripDiffSearchParams(previous),
        files: "1" as const,
        docPath: search.docPath,
        docExpanded: "1" as const,
      }),
    });
  }, [navigate, search.docPath, threadRef]);
  const collapseDocument = useCallback(() => {
    if (!threadRef || !search.docPath) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: (previous) => ({
        ...stripDiffSearchParams(previous),
        files: "1" as const,
        docPath: search.docPath,
      }),
    });
  }, [navigate, search.docPath, threadRef]);
  const openPlanPreview = useCallback(
    (input: {
      planThreadId: NonNullable<DiffRouteSearch["planThreadId"]>;
      planId: NonNullable<DiffRouteSearch["planId"]>;
    }) => {
      if (!threadRef) {
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
        search: (previous) => {
          const rest = stripDiffSearchParams(previous);
          return {
            ...rest,
            planPreview: "1" as const,
            planThreadId: input.planThreadId,
            planId: input.planId,
          };
        },
      });
    },
    [navigate, threadRef],
  );
  const closePlanPreview = useCallback(() => {
    if (!threadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(threadRef),
      search: { planPreview: undefined, planThreadId: undefined, planId: undefined },
    });
  }, [navigate, threadRef]);

  useEffect(() => {
    if (!threadRef || !bootstrapComplete) {
      return;
    }

    if (!routeThreadExists && environmentHasAnyThreads) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, environmentHasAnyThreads, navigate, routeThreadExists, threadRef]);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted || !draftThread?.promotedTo) {
      return;
    }
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread?.promotedTo, serverThreadStarted, threadRef]);

  if (!threadRef || !bootstrapComplete || !routeThreadExists) {
    return null;
  }

  const shouldRenderDiffContent = diffOpen || hasOpenedDiff;
  const shouldRenderGitContent = gitOpen || hasOpenedGit;
  const shouldRenderFilesContent = filesOpen || hasOpenedFiles;
  const chatContent =
    planPreviewOpen && search.planThreadId ? (
      <PlanConversationDocument
        environmentId={threadRef.environmentId}
        proposedPlan={planPreviewPlan}
        planThreadId={search.planThreadId}
        workspaceCwd={planPreviewWorkspaceCwd}
        onCollapse={closePlanPreview}
      />
    ) : expandedFilesDocument && search.docPath ? (
      <ChatView
        environmentId={threadRef.environmentId}
        threadId={threadRef.threadId}
        onDiffPanelOpen={markDiffOpened}
        onOpenProposedPlanPreview={openPlanPreview}
        onOpenMarkdownFilePreview={selectDocumentPath}
        reserveTitleBarControlInset={!diffOpen && !filesOpen}
        routeKind="server"
        conversationPanel={
          <FilesConversationDocument
            environmentId={threadRef.environmentId}
            cwd={filesWorkspaceCwd}
            docPath={search.docPath}
            onCollapseDocument={collapseDocument}
          />
        }
      />
    ) : (
      <ChatView
        environmentId={threadRef.environmentId}
        threadId={threadRef.threadId}
        onDiffPanelOpen={markDiffOpened}
        onOpenProposedPlanPreview={openPlanPreview}
        onOpenMarkdownFilePreview={selectDocumentPath}
        reserveTitleBarControlInset={!diffOpen && !filesOpen}
        routeKind="server"
      />
    );

  if (gitOpen) {
    return (
      <>
        <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
          {chatContent}
        </SidebarInset>
        <GitPanelRouteAdapter
          threadRef={threadRef}
          gitOpen={gitOpen}
          onCloseGit={closeGit}
          onOpenGit={openGit}
          renderGitContent={shouldRenderGitContent}
        />
      </>
    );
  }

  if (filesOpen) {
    return (
      <>
        <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
          {chatContent}
        </SidebarInset>
        <FilesPanelRouteAdapter
          environmentId={threadRef.environmentId}
          cwd={filesWorkspaceCwd}
          open={filesOpen}
          onCloseFiles={closeFiles}
          onOpenFiles={openFiles}
          renderContent={shouldRenderFilesContent}
          docPath={search.docPath ?? null}
          expandedDocument={expandedFilesDocument}
          onSelectFile={selectDocumentPath}
          onExpandDocument={expandDocument}
        />
      </>
    );
  }

  if (!shouldUseDiffSheet) {
    return (
      <>
        <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
          {chatContent}
        </SidebarInset>
        <DiffPanelInlineSidebar
          diffOpen={diffOpen}
          onCloseDiff={closeDiff}
          onOpenDiff={openDiff}
          renderDiffContent={shouldRenderDiffContent}
        />
      </>
    );
  }

  return (
    <>
      <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
        {chatContent}
      </SidebarInset>
      <RightPanelSheet open={diffOpen} onClose={closeDiff}>
        {shouldRenderDiffContent ? <LazyDiffPanel mode="sheet" /> : null}
      </RightPanelSheet>
    </>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [
      retainSearchParams<DiffRouteSearch>([
        "diff",
        "git",
        "files",
        "diffTurnId",
        "diffFilePath",
        "docPath",
        "docExpanded",
        "planPreview",
        "planThreadId",
        "planId",
      ]),
    ],
  },
  component: ChatThreadRouteView,
});
