import {
  AuthPreviewOperateScope,
  type EnvironmentId,
  type KeybindingCommand,
} from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { isPreviewAvailableFor } from "../browser/previewRuntime";
import { isCommandPaletteOpen, openCommandPalette } from "../commandPaletteBus";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  dispatchPreviewAction,
  isNativePreviewTabCommand,
  previewActionForFocusedCommand,
} from "../components/preview/previewActionBus";
import {
  previewDesktopActionForCurrentHost,
  readFocusedPreviewHost,
} from "../components/preview/previewHostActions";
import { isAppModalPage } from "../components/sidebar/mainAppLocation";
import { createNewThreadHandler, resolveDefaultProjectRef } from "../hooks/useHandleNewThread";
import { createScratchProjectActions } from "../hooks/useScratchProject";
import { getClientSettings } from "../hooks/useSettings";
import { startNewThreadFromContext } from "../lib/chatThreadActions";
import { isPreviewFocused } from "../lib/previewFocus";
import { selectProjectGroupingSettings } from "../logicalProject";
import { selectActiveRightPanel, useRightPanelStore } from "../rightPanelStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { buildSidebarProjectSnapshots } from "../sidebarProjectGrouping";
import { readProjects, readThreadShell } from "../state/entities";
import { environmentPresentations } from "../state/presentation";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { readEnvironmentScope } from "../state/session";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { useUiStateStore } from "../uiStateStore";
import { type CommandHandler, registerCommands } from "./dispatcher";

const CHAT_ROUTE_ID = "/_chat";

/**
 * New-thread and preview commands, live while a chat route is showing and no
 * modal page (Settings, Usage) covers it. Everything is read at event time, so
 * the scope is registered once instead of re-registering on every store change.
 */
export function installChatRouteCommands(router: AnyRouter): () => void {
  const handleNewThread = createNewThreadHandler(router);
  const scratch = createScratchProjectActions({
    environments: () =>
      [...appAtomRegistry.get(environmentPresentations.presentationsAtom)].map(
        ([environmentId, presentation]) => ({ ...presentation, environmentId }),
      ),
    registry: appAtomRegistry,
    handleNewThread,
  });

  const readRouteTarget = () => resolveThreadRouteTarget(router.state.matches.at(-1)?.params ?? {});
  const readRouteThreadRef = () => {
    const target = readRouteTarget();
    return target?.kind === "server" ? target.threadRef : null;
  };
  const readPreviewOpen = () => {
    const threadRef = readRouteThreadRef();
    // Store-only on purpose: the URL-aware arbitration lives in ChatView's
    // preview toggle, which the action bus reaches.
    return threadRef
      ? selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, threadRef) === "preview"
      : false;
  };
  const readThreadContext = () => {
    const target = readRouteTarget();
    const drafts = useComposerDraftStore.getState();
    const activeThread = target?.kind === "server" ? readThreadShell(target.threadRef) : null;
    const activeDraftThread = target
      ? target.kind === "server"
        ? drafts.getDraftThread(target.threadRef)
        : drafts.getDraftSession(target.draftId)
      : null;
    return {
      activeDraftThread,
      activeThread: activeThread ?? undefined,
      defaultProjectRef: resolveDefaultProjectRef(
        readProjects(),
        useUiStateStore.getState().projectOrder,
      ),
      handleNewThread,
    };
  };
  const readProjectGroupCount = () =>
    buildSidebarProjectSnapshots({
      projects: readProjects(),
      settings: selectProjectGroupingSettings(getClientSettings()),
      primaryEnvironmentId: appAtomRegistry.get(primaryEnvironmentIdAtom),
      resolveEnvironmentLabel: () => null,
    }).length;
  const canOperatePreview = (environmentId: EnvironmentId) =>
    readEnvironmentScope(environmentId, AuthPreviewOperateScope);

  const claim = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const startNewLocal: CommandHandler = (event) => {
    claim(event);
    void startNewThreadFromContext(readThreadContext());
  };

  // F23: browser commands act only on a focused preview; tab lifecycle needs a focused native guest.
  const previewCommand =
    (command: KeybindingCommand): CommandHandler =>
    (event) => {
      const threadRef = readRouteThreadRef();
      const action = previewActionForFocusedCommand(
        command,
        isNativePreviewTabCommand(command)
          ? readFocusedPreviewHost(threadRef) !== null
          : isPreviewFocused(),
      );
      if (!action) return false;
      claim(event);
      if (threadRef && canOperatePreview(threadRef.environmentId)) dispatchPreviewAction(action);
    };
  const isChatRouteActive = () =>
    router.state.matches.some((match) => match.routeId === CHAT_ROUTE_ID) &&
    !router.state.matches.some((match) => isAppModalPage(match.pathname)) &&
    !isCommandPaletteOpen();

  // Guest browser chords arrive as typed actions, already prevented inside the guest (F23).
  const stopDesktopPreviewActions =
    window.desktopBridge?.onPreviewBrowserAction?.((event) => {
      if (!isChatRouteActive()) return;
      // Read router state inside the native callback, including before the next React render.
      const threadRef = readRouteThreadRef();
      if (!threadRef || !canOperatePreview(threadRef.environmentId)) return;
      const action = previewDesktopActionForCurrentHost(event, threadRef);
      if (action) dispatchPreviewAction(action);
    }) ?? (() => {});

  const stopCommands = registerCommands(
    {
      "chat.newLocal": startNewLocal,
      "chat.newWithoutProject": (event) => {
        const { activeThread, activeDraftThread } = readThreadContext();
        const environmentId = scratch.scratchEnvironmentId(
          activeThread?.environmentId ??
            activeDraftThread?.environmentId ??
            appAtomRegistry.get(primaryEnvironmentIdAtom),
        );
        if (environmentId === null) return;
        claim(event);
        void scratch.startScratchThread(environmentId);
      },
      "chat.new": (event) => {
        // Pre-hydration settings are the defaults, where the legacy sidebar is off.
        if (!getClientSettings().legacySidebarEnabled && readProjectGroupCount() > 1) {
          claim(event);
          openCommandPalette({ open: "new-thread-in" });
          return;
        }
        startNewLocal(event);
      },
      "preview.toggle": (event) => {
        claim(event);
        const threadRef = readRouteThreadRef();
        if (!threadRef || (!canOperatePreview(threadRef.environmentId) && !readPreviewOpen())) {
          return;
        }
        if (!isPreviewAvailableFor(threadRef.environmentId)) {
          toastManager.add(
            stackedThreadToast({
              type: "info",
              title: "Preview is desktop-only",
              description: "Open T3 Code in the desktop app to use the in-app preview.",
            }),
          );
          return;
        }
        dispatchPreviewAction("toggle-panel");
      },
      "preview.new": previewCommand("preview.new"),
      "preview.close": previewCommand("preview.close"),
      "preview.reopenClosed": previewCommand("preview.reopenClosed"),
      "preview.refresh": previewCommand("preview.refresh"),
      "preview.focusUrl": previewCommand("preview.focusUrl"),
      "preview.zoomIn": previewCommand("preview.zoomIn"),
      "preview.zoomOut": previewCommand("preview.zoomOut"),
      "preview.resetZoom": previewCommand("preview.resetZoom"),
    },
    {
      when: isChatRouteActive,
      context: () => {
        const threadRef = readRouteThreadRef();
        return {
          nativePreviewFocus: readFocusedPreviewHost(threadRef) !== null,
          terminalOpen: threadRef
            ? selectThreadTerminalUiState(
                useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
                threadRef,
              ).terminalOpen
            : false,
          previewOpen: readPreviewOpen(),
        };
      },
      onKeyDown: (event) => {
        if (event.key !== "Escape") return false;
        const selection = useThreadSelectionStore.getState();
        if (selection.selectedThreadKeys.size === 0) return false;
        event.preventDefault();
        selection.clearSelection();
      },
    },
  );
  return () => {
    stopCommands();
    stopDesktopPreviewActions();
  };
}
