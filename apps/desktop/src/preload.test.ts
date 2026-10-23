import type { DesktopBridge } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as Channels from "./ipc/channels.ts";

const host = vi.hoisted(() => ({
  expose: vi.fn<(name: string, bridge: unknown) => void>(),
  invoke: vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(),
  sendSync: vi.fn<(channel: string) => unknown>(),
  on: vi.fn(),
  removeListener: vi.fn(),
  clerk: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: host.expose },
  ipcRenderer: {
    invoke: host.invoke,
    sendSync: host.sendSync,
    on: host.on,
    removeListener: host.removeListener,
  },
}));
vi.mock("@clerk/electron/preload", () => ({ exposeClerkBridge: host.clerk }));

async function loadBridge() {
  await import("./preload.ts");
  expect(host.expose).toHaveBeenCalledOnce();
  expect(host.expose.mock.calls[0]?.[0]).toBe("desktopBridge");
  return host.expose.mock.calls[0]![1] as DesktopBridge;
}
const theme = {
  source: "omarchy",
  name: "Synthetic",
  mode: "dark",
  colors: { background: "#111111", foreground: "#eeeeee", accent: "#4499ee" },
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  host.sendSync.mockReturnValue(false);
  host.invoke.mockResolvedValue(null);
});

describe("local desktop capabilities in the actual preload", () => {
  it.each([false, null, undefined, "true"])(
    "omits native capture for unavailable probe %s",
    async (availability) => {
      host.sendSync.mockReturnValue(availability);
      const bridge = await loadBridge();
      expect(bridge.captureDesktopScreenshot).toBeUndefined();
      expect(bridge.preview?.captureScreenshot).toBeTypeOf("function");
    },
  );

  it("fails closed when capability probing throws", async () => {
    host.sendSync.mockImplementation(() => {
      throw new Error("Unavailable");
    });
    expect((await loadBridge()).captureDesktopScreenshot).toBeUndefined();
  });

  it("validates screenshot envelopes and preserves the separate preview capture route", async () => {
    host.sendSync.mockReturnValue(true);
    const bridge = await loadBridge();
    const capture = {
      name: "synthetic.png",
      mimeType: "image/png",
      data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    };
    host.invoke.mockResolvedValueOnce(capture);
    await expect(bridge.captureDesktopScreenshot!()).resolves.toEqual(capture);
    expect(host.invoke).toHaveBeenLastCalledWith(
      Channels.CAPTURE_DESKTOP_SCREENSHOT_CHANNEL,
      undefined,
    );
    host.invoke.mockResolvedValueOnce(null);
    await expect(bridge.captureDesktopScreenshot!()).resolves.toBeNull();
    host.invoke.mockResolvedValueOnce({ ...capture, data: new Uint8Array([1]) });
    await expect(bridge.captureDesktopScreenshot!()).rejects.toThrow();
    await bridge.preview!.captureScreenshot("runtime:tab");
    expect(host.invoke).toHaveBeenLastCalledWith(Channels.PREVIEW_CAPTURE_SCREENSHOT_CHANNEL, {
      tabId: "runtime:tab",
    });
  });

  it("uses one bounded decoder for initial themes and pushed updates, with teardown", async () => {
    const bridge = await loadBridge();
    host.invoke.mockResolvedValueOnce(theme);
    await expect(bridge.getSystemTheme!()).resolves.toEqual(theme);
    host.invoke.mockResolvedValueOnce({ ...theme, mode: "unknown" });
    await expect(bridge.getSystemTheme!()).rejects.toThrow();
    const listener = vi.fn();
    const stop = bridge.onSystemTheme!(listener);
    const receive = host.on.mock.calls.find(
      ([channel]) => channel === Channels.SYSTEM_THEME_CHANNEL,
    )![1];
    receive({}, theme);
    receive({}, { ...theme, colors: {} });
    receive({}, null);
    expect(listener.mock.calls).toEqual([[theme], [null]]);
    stop();
    expect(host.removeListener).toHaveBeenCalledWith(Channels.SYSTEM_THEME_CHANNEL, receive);
  });

  it("validates exact preview action events and forwards arbitrary zoom only through its typed route", async () => {
    const bridge = await loadBridge();
    const listener = vi.fn();
    const stop = bridge.onPreviewBrowserAction!(listener);
    const receive = host.on.mock.calls.find(
      ([channel]) => channel === Channels.PREVIEW_BROWSER_ACTION_CHANNEL,
    )![1];
    receive({}, { action: "preview.close", tabId: "runtime:tab" });
    receive({}, { action: "preview.close", tabId: "" });
    receive({}, { action: "preview.unknown", tabId: "runtime:tab" });
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      action: "preview.close",
      tabId: "runtime:tab",
    });
    stop();
    expect(host.removeListener).toHaveBeenCalledWith(
      Channels.PREVIEW_BROWSER_ACTION_CHANNEL,
      receive,
    );
    await bridge.preview!.setZoomFactor!("runtime:tab", 1.25);
    expect(host.invoke).toHaveBeenLastCalledWith(Channels.PREVIEW_SET_ZOOM_FACTOR_CHANNEL, {
      tabId: "runtime:tab",
      zoomFactor: 1.25,
    });
  });
});

describe("standalone preload and launcher contract", () => {
  it("uses no Clerk custom-scheme bridge on HTTPS and returns no local bootstraps", async () => {
    vi.stubGlobal("location", { protocol: "https:" });
    try {
      host.sendSync.mockReturnValue([]);
      const bridge = await loadBridge();
      expect(host.clerk).not.toHaveBeenCalled();
      expect(bridge.getLocalEnvironmentBootstraps()).toEqual([]);
      expect(host.invoke).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("decodes launcher activation and identifier-only completion responses", async () => {
    const bridge = await loadBridge();
    const activation = {
      activationId: "12345678-1234-4234-8234-1234567890ab",
      contractVersion: 1,
      workspace: "/workspace/project",
      action: "open",
      prompt: "Exact\ntext",
    };
    host.invoke.mockResolvedValueOnce(activation);
    expect(await bridge.takeLauncherActivation?.()).toEqual(activation);
    host.invoke.mockResolvedValueOnce(true);
    expect(
      await bridge.completeLauncherActivation?.({ activationId: activation.activationId as never }),
    ).toBe(true);
    expect(host.invoke.mock.calls.at(-1)).toEqual([
      Channels.COMPLETE_LAUNCHER_ACTIVATION_CHANNEL,
      { activationId: activation.activationId },
    ]);
    host.invoke.mockResolvedValueOnce({ ...activation, activationId: "bad" });
    await expect(bridge.takeLauncherActivation?.()).rejects.toThrow();
    expect(bridge.appActivation).toBeDefined();
  });
});
