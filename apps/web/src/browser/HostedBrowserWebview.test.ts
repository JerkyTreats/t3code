import {
  DEFAULT_CLIENT_SETTINGS,
  EnvironmentId,
  FILL_PREVIEW_VIEWPORT,
  ThreadId,
  type ClientSettings,
  type DesktopPreviewBridge,
} from "@t3tools/contracts";
import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getClientSettings: vi.fn<() => Promise<ClientSettings | null>>(),
  setClientSettings: vi.fn<(settings: ClientSettings) => Promise<void>>(),
  createTab: vi.fn<DesktopPreviewBridge["createTab"]>(),
  closeTab: vi.fn<DesktopPreviewBridge["closeTab"]>(),
  setZoomFactor: vi.fn<(tabId: string, zoomFactor: number) => Promise<void>>(),
  setColorScheme: vi.fn<DesktopPreviewBridge["setColorScheme"]>(),
  registerWebview: vi.fn<DesktopPreviewBridge["registerWebview"]>(),
  getPreviewConfig: vi.fn<DesktopPreviewBridge["getPreviewConfig"]>(),
  activeRecordings: new Set<string>(),
}));

vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({ persistence: mocks }),
}));

vi.mock("~/components/preview/previewBridge", () => ({
  previewBridge: {
    createTab: mocks.createTab,
    closeTab: mocks.closeTab,
    registerWebview: mocks.registerWebview,
    setZoomFactor: mocks.setZoomFactor,
    setColorScheme: mocks.setColorScheme,
    getPreviewConfig: mocks.getPreviewConfig,
  },
}));

vi.mock("~/components/preview/usePreviewBridge", () => ({
  usePreviewBridge: () => undefined,
}));

vi.mock("./browserRecording", () => ({
  useActiveBrowserRecordingTabIds: () => mocks.activeRecordings,
  stopBrowserRecording: async () => null,
}));

import {
  __resetClientSettingsPersistenceForTests,
  __setClientSettingsForTests,
} from "~/hooks/useSettings";
import { useBrowserSurfaceStore } from "./browserSurfaceStore";
import {
  applyPreviewServerSnapshot,
  readThreadPreviewState,
  resetPreviewStateForTests,
  setPendingPreviewRestoration,
  removePreviewThread,
} from "~/previewStateStore";
import { HostedBrowserWebview, restorePreviewPresentation } from "./HostedBrowserWebview";

let renderer: ReactTestRenderer | undefined;

function deferred<A>() {
  let resolve!: (value: A) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<A>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  __resetClientSettingsPersistenceForTests();
  useBrowserSurfaceStore.setState({ activityByTabId: {}, byTabId: {} });
  mocks.getClientSettings.mockReset();
  mocks.setClientSettings.mockReset().mockResolvedValue(undefined);
  resetPreviewStateForTests();
  mocks.setZoomFactor.mockReset().mockResolvedValue(undefined);
  mocks.setColorScheme.mockReset().mockResolvedValue(undefined);
  mocks.createTab.mockReset().mockResolvedValue(undefined);
  mocks.closeTab.mockReset().mockResolvedValue(undefined);
  mocks.registerWebview.mockReset().mockResolvedValue(undefined);
  mocks.getPreviewConfig.mockReset().mockResolvedValue({
    partition: "persist:t3-preview-work",
    webPreferences: "contextIsolation=yes",
    preloadUrl: null,
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("navigator", { platform: "Linux" });
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.useFakeTimers();
  await act(() => renderer?.unmount());
  renderer = undefined;
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  __resetClientSettingsPersistenceForTests();
  useBrowserSurfaceStore.setState({ activityByTabId: {}, byTabId: {} });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("restorePreviewPresentation", () => {
  it("waits for a late desktop tab lease before applying restoration", async () => {
    let markReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const restore = vi.fn(async () => undefined);
    const restoring = restorePreviewPresentation({ ready, restore });

    await Promise.resolve();
    expect(restore).not.toHaveBeenCalled();
    markReady?.();

    await expect(restoring).resolves.toBe(true);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("retries a transient bridge failure and then succeeds", async () => {
    const restore = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("bridge not ready"))
      .mockResolvedValue(undefined);
    const retry = vi.fn(async () => undefined);

    await expect(
      restorePreviewPresentation({ ready: Promise.resolve(), restore, retry }),
    ).resolves.toBe(true);
    expect(restore).toHaveBeenCalledTimes(2);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("HostedBrowserWebview restoration lifecycle", () => {
  it.each([false, true])(
    "waits for real tab creation and guest registration with stale=%s",
    async (stale) => {
      __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
      const creation = deferred<void>();
      const registration = deferred<void>();
      mocks.createTab.mockReturnValueOnce(creation.promise);
      mocks.registerWebview.mockReturnValueOnce(registration.promise);
      const threadRef = {
        environmentId: EnvironmentId.make("restore-test"),
        threadId: ThreadId.make(stale ? "stale" : "current"),
      };
      const tabId = "server-tab";
      const runtimeTabId = stale ? "runtime-stale" : "runtime-current";
      const restoration = { zoomFactor: 1.75, colorScheme: "dark" as const };
      applyPreviewServerSnapshot(threadRef, {
        threadId: threadRef.threadId,
        tabId,
        navStatus: { _tag: "Idle" },
        canGoBack: false,
        canGoForward: false,
        updatedAt: "2026-09-05T00:00:00.000Z",
      });
      setPendingPreviewRestoration(threadRef, tabId, restoration);
      const guest = Object.assign(new EventTarget(), { getWebContentsId: () => 41 });
      await act(() => {
        renderer = create(
          createElement(HostedBrowserWebview, {
            threadRef,
            tabId,
            runtimeTabId,
            initialUrl: null,
            viewport: FILL_PREVIEW_VIEWPORT,
            pictureInPicture: false,
            profileId: "retained-profile",
            zoomFactor: 1,
            restoration,
          }),
          {
            createNodeMock: (element) =>
              element.type === "webview"
                ? guest
                : { scrollLeft: 0, scrollTop: 0, scrollTo: () => undefined },
          },
        );
      });
      expect(mocks.createTab).toHaveBeenCalledWith(runtimeTabId, restoration);
      expect(mocks.registerWebview).not.toHaveBeenCalled();
      expect(mocks.setZoomFactor).not.toHaveBeenCalled();
      await act(async () => {
        creation.resolve();
        await creation.promise;
      });
      expect(mocks.registerWebview).toHaveBeenCalledWith(runtimeTabId, 41);
      expect(mocks.setZoomFactor).not.toHaveBeenCalled();
      if (stale) removePreviewThread(threadRef);
      await act(async () => {
        registration.resolve();
        await registration.promise;
      });
      if (stale) {
        expect(mocks.setZoomFactor).not.toHaveBeenCalled();
        expect(mocks.setColorScheme).not.toHaveBeenCalled();
      } else {
        expect(mocks.setZoomFactor).toHaveBeenCalledExactlyOnceWith(runtimeTabId, 1.75);
        expect(mocks.setColorScheme).toHaveBeenCalledExactlyOnceWith(runtimeTabId, "dark");
        expect(readThreadPreviewState(threadRef).pendingRestorations).toEqual({});
      }
    },
  );
  it.each([false, true])(
    "restores a late pending response without resetting the lease, stale during zoom=%s",
    async (stale) => {
      __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
      const threadRef = {
        environmentId: EnvironmentId.make("late-restore"),
        threadId: ThreadId.make(stale ? "stale" : "current"),
      };
      const tabId = "late-server-tab";
      const runtimeTabId = stale ? "late-stale" : "late-current";
      const zoom = deferred<void>();
      mocks.setZoomFactor.mockReturnValueOnce(zoom.promise);
      const props = {
        threadRef,
        tabId,
        runtimeTabId,
        initialUrl: null,
        viewport: FILL_PREVIEW_VIEWPORT,
        pictureInPicture: false,
        profileId: undefined,
        zoomFactor: 1,
      };
      const guest = Object.assign(new EventTarget(), { getWebContentsId: () => 42 });
      applyPreviewServerSnapshot(threadRef, {
        threadId: threadRef.threadId,
        tabId,
        navStatus: { _tag: "Idle" },
        canGoBack: false,
        canGoForward: false,
        updatedAt: "2026-09-05T00:00:00.000Z",
      });
      await act(() => {
        renderer = create(createElement(HostedBrowserWebview, props), {
          createNodeMock: (element) =>
            element.type === "webview"
              ? guest
              : { scrollLeft: 0, scrollTop: 0, scrollTo: () => undefined },
        });
      });
      expect(mocks.registerWebview).toHaveBeenCalledWith(runtimeTabId, 42);
      const restoration = { zoomFactor: 1.5, colorScheme: "light" as const };
      setPendingPreviewRestoration(threadRef, tabId, restoration);
      await act(() => {
        renderer?.update(createElement(HostedBrowserWebview, { ...props, restoration }));
      });
      expect(mocks.createTab).toHaveBeenCalledOnce();
      expect(mocks.setZoomFactor).toHaveBeenCalledWith(runtimeTabId, 1.5);
      const replacement = { zoomFactor: 2, colorScheme: "dark" as const };
      if (stale) setPendingPreviewRestoration(threadRef, tabId, replacement);
      await act(async () => {
        zoom.resolve();
        await zoom.promise;
      });
      if (stale) {
        expect(mocks.setColorScheme).not.toHaveBeenCalled();
        expect(readThreadPreviewState(threadRef).pendingRestorations[tabId]).toBe(replacement);
      } else {
        expect(mocks.setColorScheme).toHaveBeenCalledWith(runtimeTabId, "light");
        expect(readThreadPreviewState(threadRef).pendingRestorations).toEqual({});
      }
    },
  );
});
