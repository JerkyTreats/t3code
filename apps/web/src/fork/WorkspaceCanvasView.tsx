import {
  AuthOrchestrationOperateScope,
  AuthPreviewOperateScope,
  AuthTerminalOperateScope,
  DEFAULT_SERVER_SETTINGS,
  type AssistantCitation,
  type EnvironmentId,
  type ModelSelection,
  type ProjectId,
  type RuntimeMode,
  type ScopedThreadRef,
  type ThreadId,
  type ThreadPullRequestLink,
  type WorkspaceCanvasId,
  type WorkspaceCanvasRecord,
  workspaceCanvasThreadId,
} from "@t3tools/contracts";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { FrameIcon, Maximize2Icon, MessageSquarePlusIcon, PencilIcon } from "lucide-react";
import { lazy, type RefObject, Suspense, useEffect, useRef, useState } from "react";
import { T, useGT } from "gt-react";
import { m } from "~/i18n/messages";

import type { ChatComposerHandle } from "../components/chat/ChatComposer";
import { useDiffPanelStore } from "../diffPanelStore";
import { RightPanelSurfaceContent } from "../components/chat/RightPanelSurfaceContent";
import { addBrowserSurface } from "../components/preview/addBrowserSurface";
import { useThreadTerminalActions } from "../components/terminal/useThreadTerminalActions";
import { Button } from "../components/ui/button";
import { SidebarInset } from "../components/ui/sidebar";
import { toastManager } from "../components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { isElectron } from "../env";
import { useStableCallback } from "../hooks/useStableCallback";
import type { AssistantCitationSourceAnchor } from "../lib/assistantTextSelection";
import { resolveNewThreadModelSelection } from "@t3tools/shared/usageLimits";
import { resolveProjectDefaultProviderModelSelection } from "../providerInstances";
import { cn, newThreadId } from "../lib/utils";
import { type RightPanelSurface } from "../rightPanelStore";
import { useProject, waitForThreadShell } from "../state/entities";
import { previewEnvironment } from "../state/preview";
import { serverEnvironment } from "../state/server";
import { useEnvironmentScope } from "../state/session";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { useEnvironmentWorkspaceCanvases, workspaceCanvasRename } from "../state/workspaceCanvas";
import {
  nextDefaultName,
  useBoardChats,
  useCanvasAnchorsStore,
  useFocusedChat,
  type WorkspaceBoardActions,
} from "./canvasAnchors";
import {
  canvasSurfaceCardOfRef,
  type PanelSurfaceCard,
  placeSurfaceOnCanvas,
} from "./canvasSurfaceCards";
import { createTurnBoard } from "./turnBoard";
import { forgetDeletedBoard } from "./workspaceCanvasBoards";

const ExcalidrawBoard = lazy(() => import("./ExcalidrawBoard"));

const EMPTY_PULL_REQUESTS: ReadonlyArray<ThreadPullRequestLink> = [];
const EMPTY_PENDING_FILES: ReadonlySet<string> = new Set();
const EMPTY_PREVIEW_URLS: ReadonlyArray<string> = [];

/**
 * One chat's composer handle, shared by the cards that show the chat. Only one of them is live at
 * a time, but they can mount and unmount in separate commits, so unmounting one does not clear
 * the handle while another still holds it.
 */
function sharedComposerHandle(): RefObject<ChatComposerHandle | null> {
  let mounted = 0;
  let latest: ChatComposerHandle | null = null;
  return {
    get current() {
      return mounted > 0 ? latest : null;
    },
    set current(handle) {
      if (handle === null) {
        mounted = Math.max(0, mounted - 1);
      } else {
        mounted += 1;
        latest = handle;
      }
    },
  };
}

export function WorkspaceCanvasView(props: {
  readonly environmentId: EnvironmentId;
  readonly canvasId: WorkspaceCanvasId;
}) {
  const { environmentId, canvasId } = props;
  const boardKey = `${environmentId}:${canvasId}`;
  return (
    <SidebarInset className="flex h-dvh min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspaceCanvasBoard key={boardKey} environmentId={environmentId} canvasId={canvasId} />
    </SidebarInset>
  );
}

function WorkspaceCanvasBoard(props: {
  readonly environmentId: EnvironmentId;
  readonly canvasId: WorkspaceCanvasId;
}) {
  const { environmentId, canvasId } = props;
  const gt = useGT();
  const navigate = useNavigate();
  const { canvases, loaded, failed } = useEnvironmentWorkspaceCanvases(environmentId);
  const canvasRecord: WorkspaceCanvasRecord | null =
    canvases.find((candidate) => candidate.id === canvasId) ?? null;
  const projectId: ProjectId | null = canvasRecord?.projectId ?? null;
  const project = useProject(projectId ? scopeProjectRef(environmentId, projectId) : null);

  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const serverSettings = serverConfig?.settings ?? DEFAULT_SERVER_SETTINGS;
  const canOperate = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const canOperatePreview = useEnvironmentScope(environmentId, AuthPreviewOperateScope);

  const boardThreadId = workspaceCanvasThreadId(canvasId);
  const boardKey = `${environmentId}:${boardThreadId}`;
  const boardThreadRef: ScopedThreadRef = scopeThreadRef(environmentId, boardThreadId);

  // Spineless board: a real TurnBoard whose card list is always empty so zero turn boxes exist.
  const [turnBoard] = useState(() => createTurnBoard());
  // A callback ref, so the layer reaches the board whenever it mounts, including after the
  // canvas first rendered as not found because the list did not have it yet.
  // Stable, so a re-render does not detach and re-attach the layer.
  const publishLayer = useStableCallback((node: HTMLDivElement | null) => {
    turnBoard.publish(node, []);
    return () => turnBoard.publish(null, []);
  });

  const boardActionsRef = useRef<WorkspaceBoardActions | null>(null);
  const composerHandlesRef = useRef(new Map<string, RefObject<ChatComposerHandle | null>>());

  // The board and the sidebar share one focused chat pin: Cite and the focus ring follow it.
  const pinnedChats = useBoardChats(boardKey);
  const activeChatThreadId = useFocusedChat(boardKey);
  const focusChat = (threadId: ThreadId) =>
    useCanvasAnchorsStore.getState().focusChat(boardKey, threadId);

  const composerHandleForThread = useStableCallback(
    (threadId: string): RefObject<ChatComposerHandle | null> => {
      let handle = composerHandlesRef.current.get(threadId);
      if (!handle) {
        handle = sharedComposerHandle();
        composerHandlesRef.current.set(threadId, handle);
      }
      return handle;
    },
  );

  const createThread = useOrchestrationCommand(threadEnvironment.create, { reportFailure: false });
  const renameCanvas = useAtomCommand(workspaceCanvasRename, { reportFailure: false });
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const terminalActions = useThreadTerminalActions(
    boardThreadRef,
    projectId === null ? null : scopeProjectRef(environmentId, projectId),
  );
  const creatingChatRef = useRef(false);

  const resolveDefaultChatConfig = (): {
    readonly modelSelection: ModelSelection;
    readonly runtimeMode: RuntimeMode;
  } | null => {
    const providers = serverConfig?.providers ?? [];
    const settings = resolveProjectSettings(serverSettings, projectId, project);
    const configured = settings.settings.defaultModelSelection ?? null;
    const resolved = resolveNewThreadModelSelection({
      defaultSelection:
        configured ??
        (projectId !== null
          ? resolveProjectDefaultProviderModelSelection(providers, serverSettings, projectId)
          : null),
      fallbackSelection: serverSettings.fallbackModelSelection ?? null,
      providers,
      settings: serverSettings,
      projectId,
      now: Date.now(),
    });
    const picked = resolved.selection ?? configured;
    if (picked !== null) {
      return {
        modelSelection: picked,
        runtimeMode: settings.settings.defaultRuntimeMode,
      };
    }
    for (const provider of providers) {
      const model = provider.models[0];
      if (model) {
        return {
          modelSelection: { instanceId: provider.instanceId, model: model.slug },
          runtimeMode: settings.settings.defaultRuntimeMode,
        };
      }
    }
    return null;
  };

  const createAndPlaceChatPin = useStableCallback(
    async (at?: { readonly x: number; readonly y: number }) => {
      if (!canOperate || projectId === null || creatingChatRef.current) return;
      const config = resolveDefaultChatConfig();
      if (config === null) {
        toastManager.add({
          type: "error",
          title: gt("No AI provider configured"),
          description: gt("Configure a provider in Settings before creating a chat pin."),
        });
        return;
      }
      // A promise's finally, not try/finally, which React Compiler cannot compile.
      const create = async () => {
        const threadId = newThreadId();
        const title = nextDefaultName(
          "Chat",
          pinnedChats.map((chat) => chat.title),
        );
        const result = await createThread({
          environmentId,
          input: {
            threadId,
            projectId,
            title,
            modelSelection: config.modelSelection,
            runtimeMode: config.runtimeMode,
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt: new Date().toISOString(),
          },
        });
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add({
              type: "error",
              title: gt("Could not create chat pin"),
              description: thrownErrorMessage(error, m) ?? gt("An error occurred."),
            });
          }
          return;
        }
        await waitForThreadShell(scopeThreadRef(environmentId, threadId));
        const elementId = boardActionsRef.current?.placeChatPin({ threadId, title }, at) ?? null;
        if (elementId === null) {
          placeSurfaceOnCanvas(
            boardThreadRef,
            canvasSurfaceCardOfRef({ kind: "side-chat", threadId }),
            at ? { at } : { inView: true },
          );
        }
        focusChat(threadId);
      };
      creatingChatRef.current = true;
      await create().finally(() => {
        creatingChatRef.current = false;
      });
    },
  );

  // The sidebar's "+ chat pin" creates through this view, whether or not the lazy board has mounted.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- connects this canvas's chat creation action to the sidebar store
  useEffect(() => {
    useCanvasAnchorsStore
      .getState()
      .setChatPinCreator(
        boardKey,
        canOperate && projectId !== null ? () => void createAndPlaceChatPin() : null,
      );
  }, [boardKey, canOperate, createAndPlaceChatPin, projectId]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- forgets this canvas's focused chat pin and chat pin action when the view unmounts
  useEffect(() => () => useCanvasAnchorsStore.getState().releaseView(boardKey), [boardKey]);

  // A canvas deleted elsewhere drops its pending local saves, as deleting it here does. Only one
  // that was listed counts: a canvas just created can open before the list has it.
  const listedRef = useRef(false);
  const listed = canvasRecord !== null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tells the board module that this canvas no longer exists
  useEffect(() => {
    if (listed) listedRef.current = true;
    else if (loaded && listedRef.current) forgetDeletedBoard(boardKey);
  }, [boardKey, listed, loaded]);

  const handleCite = useStableCallback(
    (citation: AssistantCitation, sourceAnchor: AssistantCitationSourceAnchor): boolean => {
      if (activeChatThreadId === null) {
        toastManager.add({
          type: "info",
          title: gt("No chat pin on this canvas"),
          description: gt("Create or pin a chat on this canvas to cite into it."),
        });
        return false;
      }
      const handle = composerHandlesRef.current.get(activeChatThreadId)?.current;
      if (!handle) {
        toastManager.add({
          type: "info",
          title: gt("Focus a chat pin first"),
          description: gt("Click a chat pin so its composer is live, then cite again."),
        });
        return false;
      }
      return handle.citeAssistantText(citation, sourceAnchor);
    },
  );

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const startEditingTitle = () => {
    if (!canOperate || !canvasRecord) return;
    setTitleDraft(canvasRecord.title);
    setEditingTitle(true);
  };
  const commitTitle = async () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!canvasRecord || trimmed.length === 0 || trimmed === canvasRecord.title) return;
    const result = await renameCanvas({
      environmentId,
      input: { canvasId, title: trimmed },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not rename canvas"),
        description: thrownErrorMessage(error, m) ?? gt("An error occurred."),
      });
    }
  };

  const launchTerminalAt = useStableCallback((at: { readonly x: number; readonly y: number }) => {
    const cwd = project?.workspaceRoot;
    if (!cwd || !canOperateTerminal) return;
    const launched = terminalActions.launchTerminal({
      location: { cwd, worktreePath: null },
      place: (resourceId) => {
        placeSurfaceOnCanvas(
          boardThreadRef,
          canvasSurfaceCardOfRef({ kind: "terminal", resourceId }),
          { at },
        );
      },
    });
    if (launched) void launched.result;
  });

  // A pinned chat's code block runs in a new terminal card beside the chat's card.
  const runShellCommandInCard = useStableCallback((card: PanelSurfaceCard, command: string) => {
    const cwd = project?.workspaceRoot;
    if (!cwd || !canOperateTerminal) return;
    const launched = terminalActions.launchTerminal({
      location: { cwd, worktreePath: null },
      place: (resourceId) => card.place({ kind: "terminal", resourceId }),
    });
    if (!launched) return;
    void launched.result.then((opened) => {
      if (opened._tag === "Success")
        void terminalActions.writeToTerminal(launched.terminalId, `${command}\r`);
    });
  });

  const launchBrowserAt = useStableCallback((at: { readonly x: number; readonly y: number }) => {
    if (!canOperatePreview) return;
    void addBrowserSurface({
      threadRef: boardThreadRef,
      openPreview,
      place: (tabId) => {
        placeSurfaceOnCanvas(boardThreadRef, canvasSurfaceCardOfRef({ kind: "preview", tabId }), {
          at,
        });
      },
    });
  });

  const newSurfaces = [
    {
      label: gt("New chat"),
      available: canOperate && projectId !== null,
      place: (at: { readonly x: number; readonly y: number }) => {
        void createAndPlaceChatPin(at);
      },
    },
    {
      label: gt("New frame"),
      available: true,
      place: (at: { readonly x: number; readonly y: number }) => {
        boardActionsRef.current?.addFrame(at);
      },
    },
    {
      label: gt("Files"),
      available: project !== null,
      place: (at: { readonly x: number; readonly y: number }) => {
        placeSurfaceOnCanvas(boardThreadRef, canvasSurfaceCardOfRef({ kind: "files" }), { at });
      },
    },
    {
      label: gt("New terminal"),
      available: project !== null && canOperateTerminal,
      place: launchTerminalAt,
    },
    {
      label: gt("New browser"),
      available: canOperatePreview,
      place: launchBrowserAt,
    },
  ];

  const keybindings = serverConfig?.keybindings ?? [];
  const availableEditors = serverConfig?.availableEditors ?? [];
  const supportsPullRequests = serverConfig?.environment.capabilities.pullRequests === true;
  const issuesSupported = serverConfig?.environment.capabilities.issues === true;

  const renderCardSurface = useStableCallback(
    (surface: RightPanelSurface, card: PanelSurfaceCard) => (
      <RightPanelSurfaceContent
        threadRef={boardThreadRef}
        environmentId={environmentId}
        surface={surface}
        card={card}
        activeSurfaceId={null}
        visible
        composerDraftTarget={
          activeChatThreadId !== null
            ? scopeThreadRef(environmentId, activeChatThreadId)
            : boardThreadRef
        }
        keybindings={keybindings}
        configuredPreviewUrls={EMPTY_PREVIEW_URLS}
        workspaceMutationId={null}
        workspaceRevision={null}
        getShortcutContext={() => ({
          terminalFocus: false,
          terminalOpen: false,
          previewFocus: false,
          previewOpen: false,
          rightPanelOpen: false,
          diffOpen: false,
          composerFocus: false,
          isWeb: !isElectron,
          isDesktop: isElectron,
        })}
        onSendAnnotation={() => {}}
        onCloseSurface={() => card.close()}
        sideChatParentPanel={{
          hostRef: boardThreadRef,
          // The canvas's diff card shows the focused pin's diffs, so the chat is focused and its
          // tool call selected, as its own panel's diff tab would.
          openToolDiff: (target) => {
            const chatThreadId = surface.kind === "thread" ? surface.threadId : target.threadId;
            focusChat(chatThreadId);
            useDiffPanelStore
              .getState()
              .selectToolCall(scopeThreadRef(environmentId, chatThreadId), target);
            card.place({ kind: "diff" });
          },
          runShellCommand: (command) => runShellCommandInCard(card, command),
        }}
        composerHandleForThread={composerHandleForThread}
        diffThreadRef={
          activeChatThreadId !== null ? scopeThreadRef(environmentId, activeChatThreadId) : null
        }
        terminal={{
          launchContext: project?.workspaceRoot
            ? { cwd: project.workspaceRoot, worktreePath: null }
            : null,
          keybindings,
          onAddTerminalContext: () => {},
          onSplitTerminal: () => {},
          onSplitTerminalVertical: () => {},
          onNewTerminal: () => {},
          onActiveTerminalChange: () => {},
          onCloseTerminal: () => {},
        }}
        pullRequest={{
          capabilityKnown: serverConfig !== null,
          supported: supportsPullRequests,
          projectId,
          pullRequests: EMPTY_PULL_REQUESTS,
          linkedPullRequest: null,
          branchPullRequest: null,
          onBack: undefined,
        }}
        issuesSupported={issuesSupported}
        files={{
          projectId: project?.id,
          projectName: project?.title ?? null,
          workspaceRoot: project?.workspaceRoot,
          availableEditors,
          pendingSurfaceIds: EMPTY_PENDING_FILES,
          onOpenFile: (relativePath) => card.show({ kind: "file", relativePath }),
          onPendingChange: () => {},
        }}
      />
    ),
  );

  if (failed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">
          <T>Canvases are unavailable</T>
        </p>
        <p className="text-xs text-muted-foreground">
          <T>This server could not list its workspace canvases. It may need an update.</T>
        </p>
        <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/" })}>
          <T>Go home</T>
        </Button>
      </div>
    );
  }

  if (loaded && canvasRecord === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium">
          <T>Canvas not found</T>
        </p>
        <p className="text-xs text-muted-foreground">
          <T>This workspace canvas may have been deleted.</T>
        </p>
        <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/" })}>
          <T>Go home</T>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="board-chrome pointer-events-none relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background"
      data-board-root="true"
      data-workspace-canvas={canvasId}
    >
      <Suspense fallback={null}>
        <ExcalidrawBoard
          key={boardKey}
          draft={false}
          storageId={boardKey}
          turnBoard={turnBoard}
          canvasThread={boardThreadRef}
          workspaceMode
          onBoardActions={(actions) => {
            boardActionsRef.current = actions;
          }}
          renderPanelSurface={renderCardSurface}
          newSurfaces={newSurfaces}
          onCite={handleCite}
        />
      </Suspense>

      <header
        data-chat-header
        className={cn(
          "relative flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center justify-between gap-2 px-4 [&>*]:pointer-events-auto",
          isElectron && "drag-region",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {editingTitle ? (
            <input
              type="text"
              autoFocus
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitTitle();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setEditingTitle(false);
                }
              }}
              aria-label={gt("Canvas title")}
              className="h-7 w-56 rounded-md border border-border bg-background/95 px-2 text-sm font-medium outline-none focus:ring-1 focus:ring-inset focus:ring-ring"
            />
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={startEditingTitle}
                    disabled={!canOperate || !canvasRecord}
                    className="group inline-flex min-w-0 items-center gap-1.5 rounded-md bg-background/85 px-2 py-1 text-sm font-medium text-foreground backdrop-blur-xs transition-colors hover:bg-accent/70 disabled:cursor-default"
                  >
                    <span className="truncate">
                      {canvasRecord?.title ?? gt("Workspace canvas")}
                    </span>
                    {canOperate && canvasRecord ? (
                      <PencilIcon className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                    ) : null}
                  </button>
                }
              />
              {canOperate && canvasRecord ? (
                <TooltipPopup side="bottom">
                  <T>Click to rename canvas</T>
                </TooltipPopup>
              ) : null}
            </Tooltip>
          )}
          {project ? (
            <span className="hidden truncate rounded-md border border-border/70 bg-background/80 px-2 py-0.5 text-2xs text-muted-foreground backdrop-blur-xs sm:inline-block">
              {project.title}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="xs"
                  variant="glass"
                  disabled={!canOperate || projectId === null}
                  onClick={() => void createAndPlaceChatPin()}
                >
                  <MessageSquarePlusIcon className="size-3.5" />
                  <T>New chat</T>
                </Button>
              }
            />
            <TooltipPopup side="bottom">
              <T>Drop a new peer chat pin on this canvas</T>
            </TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="xs"
                  variant="glass"
                  onClick={() => boardActionsRef.current?.addFrame()}
                >
                  <FrameIcon className="size-3.5" />
                  <T>Frame</T>
                </Button>
              }
            />
            <TooltipPopup side="bottom">
              <T>Add a named spatial zone frame</T>
            </TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="glass"
                  aria-label={gt("Zoom to fit")}
                  onClick={() => boardActionsRef.current?.zoomToFit()}
                >
                  <Maximize2Icon className="size-3.5" />
                </Button>
              }
            />
            <TooltipPopup side="bottom">
              <T>Zoom to fit canvas</T>
            </TooltipPopup>
          </Tooltip>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div
          data-chat-canvas
          className="relative flex min-h-0 flex-1"
          data-assistant-citation-viewport
        >
          <div className="board-chat-card pointer-events-none">
            <div ref={publishLayer} className="turn-layer" data-turn-layer />
          </div>
        </div>
      </div>
    </div>
  );
}
