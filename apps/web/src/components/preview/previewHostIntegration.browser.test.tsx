import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  ThreadId,
  type DesktopPreviewBrowserActionEvent,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";

const mocks = vi.hoisted(() => ({
  router: {
    state: { matches: [{ params: { environmentId: "host-env", threadId: "host-thread" } }] },
  },
  command: "preview.new",
  canOperate: true,
  desktopListener: null as ((event: DesktopPreviewBrowserActionEvent) => void) | null,
}));
vi.mock(import("@tanstack/react-router"), async (original) => ({
  ...(await original()),
  useRouter: (() => mocks.router) as never,
}));
vi.mock(import("@effect/atom-react"), async (original) => ({
  ...(await original()),
  useAtomValue: (() => []) as never,
}));
vi.mock(import("~/hooks/useSettings"), async (original) => ({
  ...(await original()),
  useClientSettings: (() => ({})) as never,
  useLegacySidebarEnabled: () => false,
}));
vi.mock(import("~/hooks/useHandleNewThread"), async (original) => ({
  ...(await original()),
  useHandleNewThread: (() => ({
    routeThreadRef: mocks.router.state.matches[0]!.params,
    handleNewThread: vi.fn(),
  })) as never,
}));
vi.mock(import("~/hooks/useScratchProject"), async (original) => ({
  ...(await original()),
  useScratchProject: (() => ({
    scratchEnvironmentId: null,
    startScratchThread: vi.fn(),
  })) as never,
}));
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useProjects: () => [],
}));
vi.mock(import("~/state/environments"), async (original) => ({
  ...(await original()),
  usePrimaryEnvironmentId: (() => "host-env") as never,
}));
vi.mock(import("~/sidebarProjectGrouping"), async (original) => ({
  ...(await original()),
  buildSidebarProjectSnapshots: () => [],
}));
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentScope: () => mocks.canOperate,
  readEnvironmentScope: () => mocks.canOperate,
}));
vi.mock(import("~/keybindings"), async (original) => ({
  ...(await original()),
  resolveShortcutCommand: (() => mocks.command) as never,
}));
vi.mock(import("~/lib/chatThreadActions"), async (original) => ({
  ...(await original()),
  startNewThreadFromContext: vi.fn(),
}));
vi.mock(import("~/lib/terminalFocus"), async (original) => ({
  ...(await original()),
  isTerminalFocused: () => false,
}));

import { ChatRouteGlobalShortcuts } from "~/routes/_chat";
import { subscribePreviewAction } from "./previewActionBus";
import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import {
  applyPreviewDesktopState,
  readThreadPreviewState,
  setActivePreviewTab,
  reconcilePreviewServerSessions,
  resetPreviewStateForTests,
} from "~/previewStateStore";
import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { closeFocusedPreviewSurface } from "./closeFocusedPreviewSurface";
import {
  confirmPreviewHostClose,
  closeConfirmedPreviewHostSurface,
  usePreviewHostActions,
} from "./previewHostActions";

const ref: ScopedThreadRef = {
  environmentId: EnvironmentId.make("host-env"),
  threadId: ThreadId.make("host-thread"),
};
const snapshot = {
  threadId: ref.threadId,
  tabId: "tab",
  navStatus: { _tag: "Idle" as const },
  canGoBack: false,
  canGoForward: false,
  updatedAt: "2026-09-05T00:00:00.000Z",
};
let panel: HTMLDivElement;
let element: HTMLInputElement;
const createTab = vi.fn();
const reopen = vi.fn(async () => undefined);
const confirm = vi.fn(async () => true);
const closeMutation = vi.fn<
  Parameters<typeof closeConfirmedPreviewHostSurface<Error>>[0]["closePreview"]
>(async () => AsyncResult.success(undefined));
function Host() {
  const isCurrent = () => mocks.router.state.matches[0]?.params.threadId === ref.threadId;
  usePreviewHostActions({
    threadRef: ref,
    isCurrent,
    toggle: vi.fn(),
    create: createTab,
    reopen,
    close: () =>
      closeFocusedPreviewSurface({
        threadRef: ref,
        syncActivePreview: vi.fn(),
        focusUrl: vi.fn(),
        closeSurface: (surface) =>
          confirmPreviewHostClose({
            threadRef: ref,
            surfaces: [surface],
            isCurrent,
            confirm,
            close: () =>
              surface.kind === "preview"
                ? closeConfirmedPreviewHostSurface({
                    threadRef: ref,
                    surface,
                    closePreview: closeMutation,
                  })
                : Promise.resolve(false),
          }),
      }),
    onError: (error) => {
      throw error;
    },
  });
  return null;
}

function setup(): Disposable {
  resetPreviewStateForTests();
  useRightPanelStore.setState({ byThreadKey: {} });
  mocks.router.state.matches[0]!.params = { environmentId: "host-env", threadId: "host-thread" };
  mocks.command = "preview.new";
  mocks.canOperate = true;
  createTab.mockClear();
  reopen.mockClear();
  confirm.mockReset().mockResolvedValue(true);
  closeMutation.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  // A focused field inside this thread's preview panel.
  panel = document.createElement("div");
  panel.dataset.threadKey = scopedThreadKey(ref);
  panel.dataset.previewPanelMode = "";
  element = document.createElement("input");
  panel.append(element);
  document.body.append(panel);
  element.focus();
  setDesktopBridge({
    preview: {},
    onPreviewBrowserAction: (listener: typeof mocks.desktopListener) => {
      mocks.desktopListener = listener;
      return () => {
        mocks.desktopListener = null;
      };
    },
  });
  reconcilePreviewServerSessions(ref, { serverEpoch: "epoch", revision: 1, sessions: [snapshot] });
  useRightPanelStore.getState().openBrowser(ref, "tab");
  return {
    [Symbol.dispose]() {
      panel.remove();
      setDesktopBridge(undefined);
      resetPreviewStateForTests();
    },
  };
}
// The Electron bridge is a window property; a browser has none.
function setDesktopBridge(bridge: unknown) {
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    writable: true,
    value: bridge,
  });
}
const hosts = () => (
  <>
    <ChatRouteGlobalShortcuts />
    <Host />
  </>
);
function mount() {
  return render(hosts(), { router: false });
}
async function key(command: string) {
  mocks.command = command;
  const event = new KeyboardEvent("keydown", { cancelable: true });
  await act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("preview route and current chat host", () => {
  it("rejects preview mutations when the current grant cannot operate previews", async () => {
    using _state = setup();
    mocks.canOperate = false;
    await using _view = await mount();
    await key("preview.new");
    await key("preview.reopenClosed");
    await key("preview.close");
    expect(createTab).not.toHaveBeenCalled();
    expect(reopen).not.toHaveBeenCalled();
    expect(closeMutation).not.toHaveBeenCalled();
  });

  it("routes focused new and reopen but rejects a misconfigured shortcut outside the preview", async () => {
    using _state = setup();
    await using _view = await mount();
    expect((await key("preview.new")).defaultPrevented).toBe(true);
    expect(createTab).toHaveBeenCalledOnce();
    await key("preview.reopenClosed");
    expect(reopen).toHaveBeenCalledOnce();
    panel.dataset.threadKey = "wrong-thread";
    expect((await key("preview.new")).defaultPrevented).toBe(false);
    expect(createTab).toHaveBeenCalledOnce();
  });

  it.each(["web", "streamed"] as const)(
    "preserves upstream preview actions but rejects native tab commands in %s previews",
    async (runtime) => {
      using _state = setup();
      if (runtime === "web") setDesktopBridge(undefined);
      else
        reconcilePreviewServerSessions(ref, {
          serverEpoch: "epoch",
          revision: 2,
          sessions: [{ ...snapshot, runtime: "server" }],
        });
      const actions = vi.fn();
      const unsubscribe = subscribePreviewAction(actions);
      try {
        await using view = await mount();
        for (const command of ["preview.new", "preview.close", "preview.reopenClosed"]) {
          expect((await key(command)).defaultPrevented).toBe(false);
        }
        expect(createTab).not.toHaveBeenCalled();
        expect(reopen).not.toHaveBeenCalled();
        expect(closeMutation).not.toHaveBeenCalled();
        for (const [command, action] of [
          ["preview.refresh", "refresh"],
          ["preview.focusUrl", "focus-url"],
          ["preview.zoomIn", "zoom-in"],
          ["preview.zoomOut", "zoom-out"],
          ["preview.resetZoom", "reset-zoom"],
        ]) {
          expect((await key(command!)).defaultPrevented).toBe(true);
          expect(actions).toHaveBeenLastCalledWith(action);
        }
        actions.mockClear();
        mocks.canOperate = false;
        await view.rerender(hosts());
        await key("preview.refresh");
        expect(actions).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
      }
    },
  );

  it("uses live router, epoch and guest identity before admitting native actions", async () => {
    using _state = setup();
    await using _view = await mount();
    const tabId = previewRuntimeTabId(ref, "epoch", "tab");
    await act(() => {
      mocks.desktopListener?.({ action: "preview.new", tabId });
    });
    expect(createTab).toHaveBeenCalledOnce();
    mocks.router.state.matches[0]!.params.threadId = "another-thread";
    await act(() => {
      mocks.desktopListener?.({ action: "preview.new", tabId });
    });
    expect(createTab).toHaveBeenCalledOnce();
    mocks.router.state.matches[0]!.params.threadId = "host-thread";
    reconcilePreviewServerSessions(ref, {
      serverEpoch: "new-epoch",
      revision: 1,
      sessions: [snapshot],
    });
    await act(() => {
      mocks.desktopListener?.({ action: "preview.new", tabId });
    });
    expect(createTab).toHaveBeenCalledOnce();
    const guest = document.createElement("webview");
    guest.tabIndex = 0;
    guest.dataset.previewTab = tabId;
    panel.append(guest);
    guest.focus();
    await act(() => {
      mocks.desktopListener?.({
        action: "preview.new",
        tabId: previewRuntimeTabId(ref, "new-epoch", "tab"),
      });
    });
    expect(createTab).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "records a user close only after agent confirmation=%s",
    async (accepted) => {
      using _state = setup();
      applyPreviewDesktopState(ref, "tab", {
        hasWebContents: true,
        canGoBack: false,
        canGoForward: false,
        loading: false,
        zoomFactor: 1,
        pictureInPicture: false,
        colorScheme: "system",
        audioMuted: false,
        audible: false,
        controller: "agent",
        favicon: null,
      });
      confirm.mockResolvedValue(accepted);
      await using _view = await mount();
      await key("preview.close");
      expect(confirm).toHaveBeenCalledOnce();
      expect(closeMutation).toHaveBeenCalledTimes(accepted ? 1 : 0);
      expect(readThreadPreviewState(ref).closedTabs).toHaveLength(accepted ? 1 : 0);
      if (accepted) expect(readThreadPreviewState(ref).closedTabs[0]?.status).toBe("closed");
    },
  );
  it.each([
    { tabCount: 2, firstFails: false },
    { tabCount: 2, firstFails: true },
    { tabCount: 3, firstFails: false },
    { tabCount: 3, firstFails: true },
  ])(
    "closes two distinct focused tabs from $tabCount before either reply settles, first fails=$firstFails",
    async ({ tabCount, firstFails }) => {
      using _state = setup();
      // Panel order and server recency deliberately choose different successors after third.
      const sessions = [
        { ...snapshot, updatedAt: "2026-09-05T00:00:02.000Z" },
        { ...snapshot, tabId: "second", updatedAt: "2026-09-05T00:00:01.000Z" },
        { ...snapshot, tabId: "third", updatedAt: "2026-09-05T00:00:03.000Z" },
      ].slice(0, tabCount);
      const firstClosed = sessions[tabCount - 1]!.tabId;
      const secondClosed = sessions[tabCount - 2]!.tabId;
      reconcilePreviewServerSessions(ref, {
        serverEpoch: "epoch",
        revision: 2,
        sessions,
      });
      for (const session of sessions.slice(1))
        useRightPanelStore.getState().openBrowser(ref, session.tabId);
      setActivePreviewTab(ref, firstClosed);
      let firstDone!: (result: AtomCommandResult<void, Error>) => void;
      let secondDone!: (result: AtomCommandResult<void, Error>) => void;
      closeMutation
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              firstDone = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              secondDone = resolve;
            }),
        );
      await using _view = await mount();
      mocks.command = "preview.close";
      // Both events run in the same React batch, without awaiting the first close or a rerender.
      await act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true }));
        window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true }));
      });
      expect(closeMutation).toHaveBeenCalledTimes(2);
      expect(closeMutation.mock.calls.map((args) => args[0])).toMatchObject([
        { input: { tabId: firstClosed } },
        { input: { tabId: secondClosed } },
      ]);
      const selected = selectActiveRightPanelSurface(
        useRightPanelStore.getState().byThreadKey,
        ref,
      );
      expect(selected?.kind === "preview" ? selected.resourceId : null).toBe(
        tabCount === 3 ? "tab" : null,
      );
      expect(readThreadPreviewState(ref).activeTabId).toBe(tabCount === 3 ? "tab" : null);
      expect(readThreadPreviewState(ref).closedTabs.map((entry) => entry.tabId)).toEqual([
        secondClosed,
        firstClosed,
      ]);
      expect(readThreadPreviewState(ref).closedTabs.map((entry) => entry.status)).toEqual([
        "pending",
        "pending",
      ]);
      await act(() => {
        secondDone(AsyncResult.success(undefined));
      });
      await act(() => {
        firstDone(
          firstFails
            ? AsyncResult.failure(Cause.fail(new Error("close failed")))
            : AsyncResult.success(undefined),
        );
      });
      const state = readThreadPreviewState(ref);
      expect(state.closedTabs.map((entry) => entry.tabId)).toEqual(
        firstFails ? [secondClosed] : [secondClosed, firstClosed],
      );
      expect(Boolean(state.sessions[firstClosed])).toBe(firstFails);
      if (firstFails) {
        expect(state.activeTabId).toBe(firstClosed);
        expect(
          selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, ref),
        ).toMatchObject({
          kind: "preview",
          resourceId: firstClosed,
        });
        expect(
          useRightPanelStore
            .getState()
            .byThreadKey[scopedThreadKey(ref)]?.surfaces.some(
              (surface) => surface.kind === "preview" && surface.resourceId === firstClosed,
            ),
        ).toBe(true);
      }
    },
  );
});
