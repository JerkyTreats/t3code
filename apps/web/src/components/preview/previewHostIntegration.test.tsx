import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  ThreadId,
  type DesktopPreviewBrowserActionEvent,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { AsyncResult } from "effect/unstable/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  router: {
    state: { matches: [{ params: { environmentId: "host-env", threadId: "host-thread" } }] },
  },
  command: "preview.new",
  desktopListener: null as ((event: DesktopPreviewBrowserActionEvent) => void) | null,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => mocks.router,
  createFileRoute: () => (config: unknown) => config,
  redirect: vi.fn(),
  Outlet: () => null,
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => [] }));
vi.mock("~/hooks/useSettings", () => ({
  useClientSettings: () => ({}),
  useLegacySidebarEnabled: () => false,
}));
vi.mock("~/hooks/useHandleNewThread", () => ({
  useHandleNewThread: () => ({
    routeThreadRef: mocks.router.state.matches[0]!.params,
    handleNewThread: vi.fn(),
  }),
}));
vi.mock("~/state/entities", () => ({ useProjects: () => [] }));
vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => "host-env" }));
vi.mock("~/logicalProject", () => ({ selectProjectGroupingSettings: vi.fn() }));
vi.mock("~/sidebarProjectGrouping", () => ({ buildSidebarProjectSnapshots: () => [] }));
vi.mock("~/state/server", () => ({ primaryServerKeybindingsAtom: {} }));
vi.mock("~/keybindings", () => ({ resolveShortcutCommand: () => mocks.command }));
vi.mock("~/lib/chatThreadActions", () => ({ startNewThreadFromContext: vi.fn() }));
vi.mock("~/lib/terminalFocus", () => ({ isTerminalFocused: () => false }));
vi.mock("~/components/ui/toast", () => ({
  stackedThreadToast: (value: unknown) => value,
  toastManager: { add: vi.fn() },
}));

import { ChatRouteGlobalShortcuts } from "~/routes/_chat";
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
class FocusElement {
  isConnected = true;
  tagName = "INPUT";
  dataset: Record<string, string> = { threadKey: scopedThreadKey(ref) };
  closest(selector: string) {
    return selector === "[data-thread-key]" || selector === "[data-preview-panel-mode]"
      ? this
      : null;
  }
}
let renderer: ReactTestRenderer | undefined;
let element: FocusElement;
let target: EventTarget;
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

beforeEach(() => {
  resetPreviewStateForTests();
  useRightPanelStore.setState({ byThreadKey: {} });
  mocks.router.state.matches[0]!.params = { environmentId: "host-env", threadId: "host-thread" };
  mocks.command = "preview.new";
  createTab.mockClear();
  reopen.mockClear();
  confirm.mockReset().mockResolvedValue(true);
  closeMutation.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  element = new FocusElement();
  target = new EventTarget();
  vi.stubGlobal("HTMLElement", FocusElement);
  vi.stubGlobal("document", { activeElement: element, querySelector: () => null });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(target, {
      desktopBridge: {
        preview: {},
        onPreviewBrowserAction: (listener: typeof mocks.desktopListener) => {
          mocks.desktopListener = listener;
          return () => {
            mocks.desktopListener = null;
          };
        },
      },
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  reconcilePreviewServerSessions(ref, { serverEpoch: "epoch", revision: 1, sessions: [snapshot] });
  useRightPanelStore.getState().openBrowser(ref, "tab");
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(() => {
    renderer = create(
      <>
        <ChatRouteGlobalShortcuts />
        <Host />
      </>,
    );
  });
}
async function key(command: string) {
  mocks.command = command;
  const event = new Event("keydown", { cancelable: true });
  await act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("preview route and current chat host", () => {
  it("routes focused new and reopen but rejects a misconfigured shortcut outside the preview", async () => {
    await mount();
    expect((await key("preview.new")).defaultPrevented).toBe(true);
    expect(createTab).toHaveBeenCalledOnce();
    await key("preview.reopenClosed");
    expect(reopen).toHaveBeenCalledOnce();
    element.dataset.threadKey = "wrong-thread";
    expect((await key("preview.new")).defaultPrevented).toBe(false);
    expect(createTab).toHaveBeenCalledOnce();
  });

  it("uses live router, epoch and guest identity before admitting native actions", async () => {
    await mount();
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
    element.tagName = "WEBVIEW";
    element.dataset.previewTab = tabId;
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
      await mount();
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
      await mount();
      mocks.command = "preview.close";
      // Both events run in the same React batch, without awaiting the first close or a rerender.
      await act(() => {
        target.dispatchEvent(new Event("keydown", { cancelable: true }));
        target.dispatchEvent(new Event("keydown", { cancelable: true }));
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
