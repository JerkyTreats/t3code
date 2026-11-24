import { msg } from "gt-react";
import { errorDisplayMessage, thrownErrorMessage } from "@t3tools/client-runtime/errors";
import { m } from "~/i18n/messages";
import type { ToolCallDiffTarget } from "../../diffPanelStore";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { ThreadPreviewState } from "../../previewStateStore";
import { formatFilePathForClipboard } from "@t3tools/client-runtime/media-actions";
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";
import { useStableCallback } from "../../hooks/useStableCallback";
import { type ScopedThreadRef, type RunId, type PreviewSessionSnapshot } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { sideThreadComposer, sideThreadKindOf } from "@t3tools/client-runtime/side-thread";
import { readThreadShell } from "../../state/entities";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useDiffPanelStore } from "../../diffPanelStore";
import { type ThreadPanelPresentation } from "../../rightPanelLayout";
import {
  selectActiveRightPanelSurface,
  selectThreadPanelOpen,
  type RightPanelSurface,
  useRightPanelStore,
} from "../../rightPanelStore";
import { requestWorkspaceContentFocus, requestWorkspaceFocus } from "../../lib/workspaceFocus";
import { previewStateLifetimeIsCurrent, setActivePreviewTab } from "../../previewStateStore";
import { isBrowserSettingsReadError } from "../../browser/openFileInPreview";
import { addBrowserSurface } from "../preview/addBrowserSurface";
import { dispatchPreviewAction } from "../preview/previewActionBus";
import { closeFocusedPreviewSurface } from "../preview/closeFocusedPreviewSurface";
import { reopenClosedPreviewSession } from "../preview/reopenClosedPreviewSession";
import {
  guardPreviewHostMutation,
  isPreviewHostRouteCurrent,
  usePreviewHostActions,
} from "../preview/previewHostActions";
import { useRouter } from "@tanstack/react-router";
import { focusActivePanelTerminal, focusTerminal } from "../../lib/terminalFocus";
import { floatDeviceSurface } from "../preview/agentOpenedPreviews";
import { browserMiniPlayerSource, usePreviewMiniPlayerStore } from "../../previewMiniPlayerStore";
import type { threadPullRequestPanelTarget } from "../pullRequest/pullRequestDetail.logic";
import type { useDeviceState } from "../../state/device";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { openDeviceSetupDialog } from "./ChatOverlayHosts";
import { previewEnvironment } from "../../state/preview";
import { useAtomCommand } from "../../state/use-atom-command";
import type { ChatShortcutCommands } from "./useChatShortcuts";
interface RightPanelActionsInput {
  readonly activeThreadRef: ScopedThreadRef | null;
  readonly activeProject: EnvironmentProject | null;
  readonly activeRightPanelSurface: RightPanelSurface | null;
  readonly activePreviewState: ThreadPreviewState;
  readonly deviceState: ReturnType<typeof useDeviceState>["state"];
  readonly deviceStateLoaded: boolean;
  readonly pullRequestPanelTarget: ReturnType<typeof threadPullRequestPanelTarget> | null;
  readonly threadPanelPresentation: ThreadPanelPresentation;
  readonly isServerThread: boolean;
  /** A side chat pane; the main view already answers preview bus actions. */
  readonly embedded: boolean;
  /** The thread has a diff to show: a Git folder, or turns that changed tracked repositories. */
  readonly diffAvailable: boolean;
  readonly browserAvailable: boolean;
  readonly canOperatePreview: boolean;
  readonly diffOpen: boolean;
  readonly previewPanelOpen: boolean;
  readonly rightPanelOpen: boolean;
  readonly canMaximizeRightPanel: boolean;
  readonly rightPanelMaximized: boolean;
  readonly supportsPullRequests: boolean;
  readonly pullRequestsSurfaceAvailable: boolean;
  readonly gitCwd: string | null;
  readonly activeProjectCwd: string | null;
  readonly onDiffPanelOpen: (() => void) | undefined;
  readonly closeRightPanelSurface: (surface: RightPanelSurface) => Promise<boolean>;
}

/**
 * Opening, closing, and arranging the right panel's surfaces: browser, diff, files, pull
 * requests, device, and terminal tabs.
 */
export function useRightPanelActions(input: RightPanelActionsInput) {
  const {
    closeRightPanelSurface,
    activeThreadRef,
    activeProject,
    activeRightPanelSurface,
    activePreviewState,
    deviceState,
    deviceStateLoaded,
    pullRequestPanelTarget,
    threadPanelPresentation,
    isServerThread,
    embedded,
    diffAvailable,
    browserAvailable,
    canOperatePreview,
    diffOpen,
    previewPanelOpen,
    rightPanelOpen,
    canMaximizeRightPanel,
    rightPanelMaximized,
    supportsPullRequests,
    pullRequestsSurfaceAvailable,
    gitCwd,
    activeProjectCwd,
    onDiffPanelOpen,
  } = input;

  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const resizePreview = useAtomCommand(previewEnvironment.resize, "preview viewport resize");
  const adjustPreview = useAtomCommand(previewEnvironment.adjust, "preview appearance restore");
  const router = useRouter();
  // Preview actions are admitted against the live route, which can move before this host rerenders.
  const isCurrentPreviewHost = () =>
    isPreviewHostRouteCurrent(activeThreadRef, router.state.matches.at(-1)?.params ?? {});
  const onToggleDiff = () => {
    if (!isServerThread) {
      return;
    }
    if (!diffOpen) {
      onDiffPanelOpen?.();
    }
    if (activeThreadRef) {
      useRightPanelStore.getState().toggle(activeThreadRef, "diff");
    }
  };
  const onToggleDiffStable = useStableCallback(onToggleDiff);
  /**
   * `place` mounts the new tab somewhere else than the panel, such as a canvas card;
   * `duplicateFrom` opens a copy of that browser tab beside it.
   */
  const createBrowserSurface = (
    profileId?: string,
    options: {
      readonly place?: (tabId: string) => void;
      readonly duplicateFrom?: PreviewSessionSnapshot;
    } = {},
  ) => {
    if (!activeThreadRef || !canOperatePreview || !isCurrentPreviewHost() || !browserAvailable)
      return;
    const sameLifetime = previewStateLifetimeIsCurrent(activeThreadRef);
    void addBrowserSurface({
      threadRef: activeThreadRef,
      openPreview: guardPreviewHostMutation(
        openPreview,
        () => sameLifetime() && isCurrentPreviewHost(),
        sameLifetime,
      ),
      ...(profileId === undefined ? {} : { profileId }),
      ...(options.place === undefined ? {} : { place: options.place }),
      ...(options.duplicateFrom === undefined ? {} : { duplicateFrom: options.duplicateFrom }),
    }).then((result) => {
      if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
      const error = squashAtomCommandFailure(result);
      if (isBrowserSettingsReadError(error)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: m(msg("Unable to open browser")),
            description: errorDisplayMessage(error, m) ?? error.message,
          }),
        );
      }
    });
  };
  const duplicateBrowserSurface = (surface: RightPanelSurface) => {
    if (surface.kind !== "preview" || !surface.resourceId) return;
    const snapshot = activePreviewState.sessions[surface.resourceId];
    if (snapshot) createBrowserSurface(undefined, { duplicateFrom: snapshot });
  };
  const duplicateBrowserSurfaceStable = useStableCallback(duplicateBrowserSurface);
  const createBrowserSurfaceStable = useStableCallback(createBrowserSurface);
  const addDiffSurface = () => {
    if (!activeThreadRef || !isServerThread || !diffAvailable) return;
    useDiffPanelStore.getState().selectGitScope(activeThreadRef, "branch");
    useRightPanelStore.getState().open(activeThreadRef, "diff");
    onDiffPanelOpen?.();
  };
  const addDiffSurfaceStable = useStableCallback(addDiffSurface);
  const openChangesFromThreadPanel = () => {
    addDiffSurface();
  };
  const openChangesFromThreadPanelStable = useStableCallback(openChangesFromThreadPanel);
  const addFilesSurface = () => {
    if (!activeThreadRef || !activeProject) return;
    useRightPanelStore.getState().open(activeThreadRef, "files");
  };
  const addFilesSurfaceStable = useStableCallback(addFilesSurface);
  const addPullRequestsSurface = () => {
    if (!activeThreadRef || !pullRequestsSurfaceAvailable) return;
    useRightPanelStore.getState().open(activeThreadRef, "pull-requests");
  };
  const addPullRequestsSurfaceStable = useStableCallback(addPullRequestsSurface);
  const addDeviceSurface = () => {
    if (!activeThreadRef) return;
    if (!deviceState.onboardingCompleted || deviceState.hostStatus === "disabled") {
      openDeviceSetupDialog(scopedThreadKey(activeThreadRef));
      return;
    }
    useRightPanelStore.getState().open(activeThreadRef, "device");
  };
  const addDeviceSurfaceStable = useStableCallback(addDeviceSurface);
  const openFileSurface = (relativePath: string) => {
    if (!activeThreadRef || !activeProject) return;
    useRightPanelStore.getState().openFile(activeThreadRef, relativePath);
  };
  const openFileSurfaceStable = useStableCallback(openFileSurface);
  const closePreviewPanel = () => {
    if (activeThreadRef) {
      if (activeRightPanelSurface?.kind === "preview" && activeRightPanelSurface.resourceId) {
        usePreviewMiniPlayerStore
          .getState()
          .open(activeThreadRef, browserMiniPlayerSource(activeRightPanelSurface.resourceId));
      } else if (activeRightPanelSurface?.kind === "device" && activeRightPanelSurface.target) {
        floatDeviceSurface(
          activeThreadRef,
          { kind: "device", ...activeRightPanelSurface.target },
          deviceStateLoaded ? deviceState : null,
        );
      }
      useRightPanelStore.getState().setMaximized(activeThreadRef, false);
      useRightPanelStore.getState().close(activeThreadRef);
    }
  };
  const closePreviewPanelStable = useStableCallback(closePreviewPanel);
  const togglePreviewPanel = () => {
    if (!activeThreadRef || !browserAvailable) return;
    if (previewPanelOpen) {
      closePreviewPanel();
      return;
    }
    if (!canOperatePreview) return;
    const activeTabId = activePreviewState.activeTabId;
    if (activeTabId) {
      useRightPanelStore.getState().openBrowser(activeThreadRef, activeTabId);
    } else {
      createBrowserSurface();
    }
  };
  const togglePreviewPanelStable = useStableCallback(togglePreviewPanel);
  const activateRightPanelSurface = (surface: RightPanelSurface) => {
    if (!activeThreadRef) return;
    useRightPanelStore.getState().activateSurface(activeThreadRef, surface.id);
    if (surface.kind === "preview" && surface.resourceId) {
      setActivePreviewTab(activeThreadRef, surface.resourceId);
    }
    if (surface.kind === "terminal") {
      focusTerminal(activeThreadRef, surface.activeTerminalId);
    }
    if (surface.kind === "thread") {
      const kind = sideThreadKindOf(
        readThreadShell(scopeThreadRef(activeThreadRef.environmentId, surface.threadId)),
      );
      // A thread with no composer, or one not known yet, takes focus as any other tab does.
      requestWorkspaceFocus(
        kind !== null && sideThreadComposer(kind) === "composer"
          ? {
              area: "panel",
              selector: `[data-side-chat-pane="${CSS.escape(surface.threadId)}"] [data-workspace-area="composer"] [contenteditable="true"]`,
            }
          : { area: "panel" },
      );
    }
    if (surface.kind === "diff" && !diffOpen) {
      onDiffPanelOpen?.();
    }
  };
  const activateRightPanelSurfaceStable = useStableCallback(activateRightPanelSurface);
  const toggleRightPanel = () => {
    if (!activeThreadRef) return;
    if (rightPanelOpen) {
      closePreviewPanel();
      return;
    }
    useRightPanelStore.getState().toggleVisibility(activeThreadRef);
    focusActivePanelTerminal(activeThreadRef);
  };
  const toggleRightPanelStable = useStableCallback(toggleRightPanel);
  const toggleThreadPanel = () => {
    if (!activeThreadRef) return;
    const store = useRightPanelStore.getState();
    if (threadPanelPresentation === "inline") {
      const open = selectThreadPanelOpen(
        store.threadPanelVisibilityByThreadKey,
        activeThreadRef,
        "inline",
      );
      if (!open) requestWorkspaceFocus({ area: "details" });
      else if (document.activeElement?.closest('[data-workspace-area="details"]'))
        requestWorkspaceContentFocus();
    }
    store.toggleThreadPanel(activeThreadRef, threadPanelPresentation);
  };
  const toggleThreadPanelStable = useStableCallback(toggleThreadPanel);
  const toggleRightPanelMaximized = () => {
    if (!canMaximizeRightPanel || !activeThreadRef) return;
    if (!rightPanelMaximized) requestWorkspaceFocus({ area: "panel" });
    useRightPanelStore.getState().setMaximized(activeThreadRef, !rightPanelMaximized);
  };
  const toggleRightPanelMaximizedStable = useStableCallback(toggleRightPanelMaximized);
  const moveRightPanelSurface = (surfaceId: string, toIndex: number) => {
    if (activeThreadRef)
      useRightPanelStore.getState().moveSurface(activeThreadRef, surfaceId, toIndex);
  };
  const moveRightPanelSurfaceStable = useStableCallback(moveRightPanelSurface);
  const copyRightPanelFilePath = (relativePath: string) => {
    if (typeof window === "undefined" || !navigator.clipboard?.writeText) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: m(msg("Failed to copy path")),
          description: m(msg("Clipboard API unavailable.")),
        }),
      );
      return;
    }

    const clipboardPath = formatFilePathForClipboard(
      relativePath,
      resolvePathLinkTarget(relativePath, gitCwd ?? activeProjectCwd ?? ""),
    );
    void navigator.clipboard.writeText(clipboardPath).then(undefined, (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: m(msg("Failed to copy path")),
          description: thrownErrorMessage(error, m) ?? m(msg("An error occurred.")),
        }),
      );
    });
  };
  const copyRightPanelFilePathStable = useStableCallback(copyRightPanelFilePath);
  const addPullRequestSurface = () => {
    if (!supportsPullRequests || activeThreadRef === null || pullRequestPanelTarget === null)
      return;
    useRightPanelStore.getState().openPullRequest(activeThreadRef, pullRequestPanelTarget);
  };
  const addPullRequestSurfaceStable = useStableCallback(addPullRequestSurface);
  const onOpenTurnDiff = (runId: RunId, filePath?: string) => {
    if (!isServerThread || !activeThreadRef) return;
    useDiffPanelStore.getState().selectTurn(activeThreadRef, runId, filePath);
    useRightPanelStore.getState().open(activeThreadRef, "diff");
    onDiffPanelOpen?.();
  };
  const onOpenToolDiffStable = useStableCallback((target: ToolCallDiffTarget) => {
    if (!isServerThread || !activeThreadRef) return;
    useDiffPanelStore.getState().selectToolCall(activeThreadRef, target);
    useRightPanelStore.getState().open(activeThreadRef, "diff");
    onDiffPanelOpen?.();
  });
  const onOpenTurnDiffStable = useStableCallback(onOpenTurnDiff);
  const syncActivePreviewSurface = () => {
    if (!activeThreadRef) return;
    const nextActiveSurface = selectActiveRightPanelSurface(
      useRightPanelStore.getState().byThreadKey,
      activeThreadRef,
    );
    if (nextActiveSurface?.kind === "preview" && nextActiveSurface.resourceId) {
      setActivePreviewTab(activeThreadRef, nextActiveSurface.resourceId);
    }
  };
  // A side chat pane is embedded; the main view already answers preview bus actions.
  usePreviewHostActions({
    threadRef: activeThreadRef,
    isCurrent: () => !embedded && isCurrentPreviewHost(),
    toggle: togglePreviewPanelStable,
    create: () => createBrowserSurface(),
    close: async () => {
      if (!activeThreadRef) return;
      await closeFocusedPreviewSurface({
        threadRef: activeThreadRef,
        closeSurface: closeRightPanelSurface,
        syncActivePreview: syncActivePreviewSurface,
        focusUrl: () => dispatchPreviewAction("focus-url"),
      });
    },
    reopen: async () => {
      if (!activeThreadRef) return;
      const sameLifetime = previewStateLifetimeIsCurrent(activeThreadRef);
      const isCurrent = () => sameLifetime() && isCurrentPreviewHost();
      await reopenClosedPreviewSession({
        threadRef: activeThreadRef,
        openPreview: guardPreviewHostMutation(openPreview, isCurrent),
        resizePreview: guardPreviewHostMutation(resizePreview, sameLifetime),
        adjustPreview: guardPreviewHostMutation(adjustPreview, sameLifetime),
        canFocus: isCurrentPreviewHost,
      });
    },
    onError: (error) =>
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: m(msg("Browser action failed")),
          description:
            error instanceof Error ? error.message : m(msg("The browser action could not finish.")),
        }),
      ),
  });

  const shortcuts = {
    "rightPanel.toggle": () => toggleRightPanel(),
    "rightPanel.toggleMaximized": ({ event }) => {
      if (!event.repeat) toggleRightPanelMaximized();
    },
    "threadPanel.toggle": () => toggleThreadPanel(),
    "rightPanel.close": ({ event }) => {
      if (!activeRightPanelSurface) return false;
      if (!event.repeat) void closeRightPanelSurface(activeRightPanelSurface);
    },
    "diff.toggle": () => onToggleDiff(),
  } satisfies ChatShortcutCommands;

  return {
    shortcuts,
    activateRightPanelSurfaceStable,
    addDeviceSurfaceStable,
    addDiffSurfaceStable,
    addFilesSurfaceStable,
    addPullRequestSurfaceStable,
    addPullRequestsSurfaceStable,
    closePreviewPanelStable,
    copyRightPanelFilePathStable,
    createBrowserSurface,
    createBrowserSurfaceStable,
    duplicateBrowserSurfaceStable,
    moveRightPanelSurfaceStable,
    onOpenToolDiffStable,
    onOpenTurnDiffStable,
    onToggleDiffStable,
    openChangesFromThreadPanelStable,
    openFileSurfaceStable,
    toggleRightPanelMaximizedStable,
    toggleRightPanelStable,
    toggleThreadPanelStable,
  };
}
