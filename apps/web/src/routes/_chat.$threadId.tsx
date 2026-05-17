import { ThreadId } from "@t3tools/contracts";
import { projectScriptCwd } from "@t3tools/shared/projectScripts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import ChatView from "../components/ChatView";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import {
  DiffPanelExpandedProvider,
  useDiffPanelExpanded,
} from "../components/DiffPanelExpandedContext";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  type ChatPanelRouteSearch,
  parseChatPanelRouteSearch,
  stripChatPanelSearchParams,
} from "../chatPanelRouteSearch";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStore } from "../store";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";
import { GitPanelRouteAdapter } from "../components/git-panel/GitPanelRouteAdapter";
import { FilesConversationDocument } from "../components/files-panel/FilesConversationDocument";
import { FilesPanelRouteAdapter } from "../components/files-panel/FilesPanelRouteAdapter";
import { PlanConversationDocument } from "../components/PlanConversationDocument";
import { findProposedPlanByReference } from "../session-logic";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)";
const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(24rem,34vw,36rem)";
const DIFF_INLINE_SIDEBAR_MIN_WIDTH = 22 * 16;
const DIFF_INLINE_SIDEBAR_MAX_WIDTH = 36 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

const DiffPanelSheet = (props: {
  children: ReactNode;
  diffOpen: boolean;
  onCloseDiff: () => void;
}) => {
  return (
    <Sheet
      open={props.diffOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onCloseDiff();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(42vw,28rem)] min-w-80 max-w-[28rem] p-0 max-[760px]:w-[min(88vw,24rem)] max-[760px]:min-w-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

const DiffLoadingFallback = (props: {
  mode: DiffPanelMode;
  showPanelTab?: boolean | undefined;
}) => {
  return (
    <DiffPanelShell
      mode={props.mode}
      header={<DiffPanelHeaderSkeleton />}
      showPanelTab={props.showPanelTab}
    >
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

const LazyDiffPanel = (props: { mode: DiffPanelMode; showPanelTab?: boolean | undefined }) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense
        fallback={<DiffLoadingFallback mode={props.mode} showPanelTab={props.showPanelTab} />}
      >
        <DiffPanel mode={props.mode} showPanelTab={props.showPanelTab} />
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
        {renderDiffContent ? <LazyDiffPanel mode="sidebar" showPanelTab={diffOpen} /> : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

function ChatThreadRouteContent() {
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const navigate = useNavigate();
  const { panelExpanded, setPanelExpanded } = useDiffPanelExpanded();
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const threads = useStore((store) => store.threads);
  const projects = useStore((store) => store.projects);
  const activeThread = useStore((store) => store.threads.find((thread) => thread.id === threadId));
  const threadExists = useStore((store) => store.threads.some((thread) => thread.id === threadId));
  const draftThreadExists = useComposerDraftStore((store) =>
    Object.hasOwn(store.draftThreadsByThreadId, threadId),
  );
  const routeThreadExists = threadExists || draftThreadExists;
  const diffOpen = search.panel === "diff";
  const gitOpen = search.panel === "git";
  const filesOpen = search.panel === "files";
  const expandedFilesDocument = filesOpen && search.docExpanded === "1" && !!search.docPath;
  const planPreviewOpen = search.planPreview === "1" && !!search.planThreadId && !!search.planId;
  const planPreviewThread = useMemo(
    () => threads.find((thread) => thread.id === search.planThreadId),
    [search.planThreadId, threads],
  );
  const planPreviewProject = useMemo(
    () => projects.find((project) => project.id === planPreviewThread?.projectId),
    [planPreviewThread?.projectId, projects],
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
  const planPreviewPlan = useMemo(
    () =>
      planPreviewOpen
        ? findProposedPlanByReference({
            threads,
            threadId: search.planThreadId,
            planId: search.planId,
          })
        : null,
    [planPreviewOpen, search.planId, search.planThreadId, threads],
  );
  const shouldUseDiffSheet = useMediaQuery(DIFF_INLINE_LAYOUT_MEDIA_QUERY);
  // TanStack Router keeps active route components mounted across param-only navigations
  // unless remountDeps are configured, so this stays warm across thread switches.
  const [hasOpenedDiff, setHasOpenedDiff] = useState(diffOpen);
  const [hasOpenedGit, setHasOpenedGit] = useState(gitOpen);
  const [hasOpenedFiles, setHasOpenedFiles] = useState(filesOpen);
  const closeDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => stripChatPanelSearchParams(previous),
    });
  }, [navigate, threadId]);
  const openDiff = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => {
        const rest = stripChatPanelSearchParams(previous);
        return { ...rest, panel: "diff", diffView: "diff" };
      },
    });
  }, [navigate, threadId]);
  const closeGit = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => stripChatPanelSearchParams(previous),
    });
  }, [navigate, threadId]);
  const openGit = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => {
        const rest = stripChatPanelSearchParams(previous);
        return { ...rest, panel: "git" };
      },
    });
  }, [navigate, threadId]);
  const closeFiles = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => stripChatPanelSearchParams(previous),
    });
  }, [navigate, threadId]);
  const openFiles = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => {
        const rest = stripChatPanelSearchParams(previous);
        return { ...rest, panel: "files" };
      },
    });
  }, [navigate, threadId]);
  const selectDocumentPath = useCallback(
    (pathValue: string) => {
      void navigate({
        to: "/$threadId",
        params: { threadId },
        search: (previous) => {
          const rest = stripChatPanelSearchParams(previous);
          return {
            ...rest,
            panel: "files",
            docPath: pathValue,
            docExpanded: "1" as const,
          };
        },
      });
    },
    [navigate, threadId],
  );
  const expandDocument = useCallback(() => {
    if (!search.docPath) {
      return;
    }
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => ({
        ...stripChatPanelSearchParams(previous),
        panel: "files",
        docPath: search.docPath,
        docExpanded: "1" as const,
      }),
    });
  }, [navigate, search.docPath, threadId]);
  const collapseDocument = useCallback(() => {
    if (!search.docPath) {
      return;
    }
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => ({
        ...stripChatPanelSearchParams(previous),
        panel: "files",
        docPath: search.docPath,
      }),
    });
  }, [navigate, search.docPath, threadId]);
  const closePlanPreview = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      search: (previous) => stripChatPanelSearchParams(previous),
    });
  }, [navigate, threadId]);
  const navigateDocumentPath = useCallback(
    (relativePath: string) => {
      void navigate({
        to: "/$threadId",
        params: { threadId },
        search: (previous) => ({
          ...stripChatPanelSearchParams(previous),
          panel: "files",
          docPath: relativePath,
          docExpanded: expandedFilesDocument ? "1" : undefined,
        }),
      });
    },
    [expandedFilesDocument, navigate, threadId],
  );
  const navigatePlanPreviewPath = useCallback(
    (relativePath: string) => {
      void navigate({
        to: "/$threadId",
        params: { threadId },
        search: (previous) => ({
          ...stripChatPanelSearchParams(previous),
          panel: "files",
          docPath: relativePath,
          docExpanded: "1" as const,
        }),
      });
    },
    [navigate, threadId],
  );
  const selectDiffExplorerFile = useCallback(
    (pathValue: string) => {
      const targetTurnId = search.diffTurnId ?? activeThread?.latestTurn?.turnId ?? null;
      if (!targetTurnId) {
        return;
      }
      void navigate({
        to: "/$threadId",
        params: { threadId },
        search: (previous) => ({
          ...stripChatPanelSearchParams(previous),
          panel: "diff",
          diffTurnId: targetTurnId,
          diffFilePath: pathValue,
          diffView: "preview",
        }),
      });
    },
    [activeThread?.latestTurn?.turnId, navigate, search.diffTurnId, threadId],
  );

  useEffect(() => {
    if (diffOpen) {
      setHasOpenedDiff(true);
    }
  }, [diffOpen]);
  useEffect(() => {
    if (gitOpen) {
      setHasOpenedGit(true);
    }
  }, [gitOpen]);
  useEffect(() => {
    if (filesOpen) {
      setHasOpenedFiles(true);
    }
  }, [filesOpen]);

  const shouldRenderDiffContent = diffOpen || hasOpenedDiff;
  const shouldRenderGitContent = gitOpen || hasOpenedGit;
  const shouldRenderFilesContent = filesOpen || hasOpenedFiles;

  useEffect(() => {
    if (!diffOpen || shouldUseDiffSheet || gitOpen || filesOpen || planPreviewOpen) {
      setPanelExpanded(false);
    }
  }, [diffOpen, filesOpen, gitOpen, planPreviewOpen, setPanelExpanded, shouldUseDiffSheet]);

  useEffect(() => {
    if (!bootstrapComplete) {
      return;
    }

    if (!routeThreadExists) {
      void navigate({ to: "/", replace: true });
      return;
    }
  }, [bootstrapComplete, navigate, routeThreadExists, threadId]);

  if (!bootstrapComplete || !routeThreadExists) {
    return null;
  }

  const conversationPanel =
    planPreviewOpen && search.planThreadId ? (
      <PlanConversationDocument
        proposedPlan={planPreviewPlan}
        planThreadId={search.planThreadId}
        workspaceCwd={planPreviewWorkspaceCwd}
        onNavigateToPath={navigatePlanPreviewPath}
        onCollapse={closePlanPreview}
      />
    ) : expandedFilesDocument && search.docPath ? (
      <FilesConversationDocument
        threadId={threadId}
        docPath={search.docPath}
        onNavigateToPath={navigateDocumentPath}
        onCollapseDocument={collapseDocument}
      />
    ) : panelExpanded &&
      !gitOpen &&
      !filesOpen &&
      !shouldUseDiffSheet &&
      shouldRenderDiffContent ? (
      <LazyDiffPanel mode="conversation" />
    ) : null;

  if (!gitOpen && !filesOpen && !shouldUseDiffSheet) {
    return (
      <>
        <SidebarInset className="h-dvh  min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
          <ChatView threadId={threadId} conversationPanel={conversationPanel} />
        </SidebarInset>
        {panelExpanded ? (
          <FilesPanelRouteAdapter
            threadId={threadId}
            open
            onCloseFiles={() => setPanelExpanded(false)}
            onOpenFiles={() => setPanelExpanded(true)}
            renderContent={shouldRenderDiffContent}
            docPath={search.diffFilePath ?? null}
            expandedDocument
            showPreview={false}
            useExplorerChrome
            onSelectFile={selectDiffExplorerFile}
            onExpandDocument={() => undefined}
          />
        ) : (
          <DiffPanelInlineSidebar
            diffOpen={diffOpen}
            onCloseDiff={closeDiff}
            onOpenDiff={openDiff}
            renderDiffContent={shouldRenderDiffContent}
          />
        )}
      </>
    );
  }

  return (
    <>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
        <ChatView threadId={threadId} conversationPanel={conversationPanel} />
      </SidebarInset>
      {gitOpen ? (
        <GitPanelRouteAdapter
          threadId={threadId}
          gitOpen={gitOpen}
          onCloseGit={closeGit}
          onOpenGit={openGit}
          renderGitContent={shouldRenderGitContent}
        />
      ) : filesOpen ? (
        <FilesPanelRouteAdapter
          threadId={threadId}
          open={filesOpen}
          onCloseFiles={closeFiles}
          onOpenFiles={openFiles}
          renderContent={shouldRenderFilesContent}
          docPath={search.docPath ?? null}
          expandedDocument={expandedFilesDocument}
          onSelectFile={selectDocumentPath}
          onExpandDocument={expandDocument}
        />
      ) : (
        <DiffPanelSheet diffOpen={diffOpen} onCloseDiff={closeDiff}>
          {shouldRenderDiffContent ? <LazyDiffPanel mode="sheet" /> : null}
        </DiffPanelSheet>
      )}
    </>
  );
}

function ChatThreadRouteView() {
  return (
    <DiffPanelExpandedProvider>
      <ChatThreadRouteContent />
    </DiffPanelExpandedProvider>
  );
}

export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseChatPanelRouteSearch(search),
  search: {
    middlewares: [
      retainSearchParams<ChatPanelRouteSearch>([
        "panel",
        "diffTurnId",
        "diffFilePath",
        "diffView",
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
