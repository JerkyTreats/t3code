import {
  DEFAULT_PREVIEW_APPEARANCE,
  DEFAULT_PREVIEW_ZOOM_FACTOR,
  DEFAULT_CLIENT_SETTINGS,
  EnvironmentId,
  ThreadId,
} from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { closeTab, createTab, stopBrowserRecording } = vi.hoisted(() => ({
  closeTab: vi.fn<(tabId: string) => Promise<void>>(async () => undefined),
  createTab: vi.fn<() => Promise<void>>(),
  stopBrowserRecording: vi.fn(async () => null),
}));

vi.mock("~/components/preview/previewBridge", () => ({
  previewBridge: { closeTab, createTab },
}));

vi.mock("./browserRecording", () => ({
  stopBrowserRecording,
}));

import * as browserDefaults from "./browserDefaults";
import { acquireDesktopTab } from "./desktopTabLifetime";
import { __setClientSettingsForTests } from "~/hooks/useSettings";

const DEFAULT_TAB_STATE = {
  zoomFactor: DEFAULT_PREVIEW_ZOOM_FACTOR,
  colorScheme: DEFAULT_PREVIEW_APPEARANCE,
};
import { previewRuntimeTabId } from "./previewRuntimeTabId";

describe("desktopTabLifetime", () => {
  beforeEach(() => {
    __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
    closeTab.mockClear();
    createTab.mockClear();
    stopBrowserRecording.mockClear();
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("passes native server identity alongside captured restored presentation", async () => {
    vi.useFakeTimers();
    createTab.mockResolvedValueOnce(undefined);
    const serverTab = { threadId: "thread-native", tabId: "tab-native" };
    const lease = acquireDesktopTab(
      "runtime-native",
      { zoomFactor: 1.5, colorScheme: "dark" },
      serverTab,
    );
    await lease.ready;
    expect(createTab).toHaveBeenCalledExactlyOnceWith("runtime-native", {
      zoomFactor: 1.5,
      colorScheme: "dark",
      serverTab,
    });
    lease.release();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("keeps identical server tab ids from two environments in separate desktop slots", async () => {
    vi.useFakeTimers();
    createTab.mockResolvedValue(undefined);
    const tabA = previewRuntimeTabId(
      {
        environmentId: EnvironmentId.make("environment-a"),
        threadId: ThreadId.make("thread-a"),
      },
      "epoch-a",
      "tab_1",
    );
    const tabB = previewRuntimeTabId(
      {
        environmentId: EnvironmentId.make("environment-b"),
        threadId: ThreadId.make("thread-b"),
      },
      "epoch-b",
      "tab_1",
    );

    const first = acquireDesktopTab(tabA);
    const second = acquireDesktopTab(tabB);
    await Promise.all([first.ready, second.ready]);

    expect(createTab).toHaveBeenCalledWith(tabA, DEFAULT_TAB_STATE);
    expect(createTab).toHaveBeenCalledWith(tabB, DEFAULT_TAB_STATE);
    expect(createTab).toHaveBeenCalledTimes(2);

    first.release();
    second.release();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("stops recording before closing the final desktop tab lease", async () => {
    vi.useFakeTimers();
    let resolveStop: (() => void) | undefined;
    stopBrowserRecording.mockReturnValueOnce(
      new Promise<null>((resolve) => {
        resolveStop = () => resolve(null);
      }),
    );
    createTab.mockResolvedValueOnce(undefined);

    const lease = acquireDesktopTab("tab_recording_cleanup");
    await lease.ready;
    lease.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(stopBrowserRecording).toHaveBeenCalledWith("tab_recording_cleanup");
    expect(closeTab).not.toHaveBeenCalled();

    resolveStop?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(closeTab).toHaveBeenCalledWith("tab_recording_cleanup");
  });

  it("waits for an in-flight close before recreating a reacquired tab", async () => {
    vi.useFakeTimers();
    let resolveClose: (() => void) | undefined;
    createTab.mockResolvedValue(undefined);
    closeTab.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveClose = resolve;
      }),
    );

    const initial = acquireDesktopTab("tab_close_reacquire");
    await initial.ready;
    initial.release();
    await vi.advanceTimersByTimeAsync(0);

    expect(closeTab).toHaveBeenCalledWith("tab_close_reacquire");

    const reacquired = acquireDesktopTab("tab_close_reacquire");
    expect(createTab).toHaveBeenCalledTimes(1);

    resolveClose?.();
    await reacquired.ready;
    expect(createTab).toHaveBeenCalledTimes(2);
  });
  it("captures presentation before delayed settings and preserves an existing shared lease", async () => {
    vi.useFakeTimers();
    let finishSettings!: (
      value: Awaited<ReturnType<typeof browserDefaults.resolveBrowserDefaults>>,
    ) => void;
    const defaults = await browserDefaults.resolveBrowserDefaults();
    vi.spyOn(browserDefaults, "resolveBrowserDefaults").mockReturnValueOnce(
      new Promise((resolve) => {
        finishSettings = resolve;
      }),
    );
    createTab.mockResolvedValue(undefined);
    const restoration = { zoomFactor: 1.75, colorScheme: "dark" as const };
    const first = acquireDesktopTab("tab_captured_restoration", restoration);
    restoration.zoomFactor = 2;
    const second = acquireDesktopTab("tab_captured_restoration", {
      zoomFactor: 3,
      colorScheme: "light",
    });
    finishSettings(defaults);
    await first.ready;
    expect(first.ready).toBe(second.ready);
    expect(createTab).toHaveBeenCalledExactlyOnceWith("tab_captured_restoration", {
      zoomFactor: 1.75,
      colorScheme: "dark",
    });
    first.release();
    second.release();
    await vi.advanceTimersByTimeAsync(0);
  });
});
