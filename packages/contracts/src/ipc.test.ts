import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  DesktopEnvironmentBootstrapSchema,
  DesktopPreviewSetZoomFactorInputSchema,
  DesktopSystemThemeSchema,
  DesktopScreenshotCaptureSchema,
  DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES,
  DesktopPreviewBrowserActionEventSchema,
} from "./ipc.ts";

describe("DesktopEnvironmentBootstrapSchema", () => {
  const decode = Schema.decodeUnknownSync(DesktopEnvironmentBootstrapSchema);

  it("preserves the concrete running distro separately from the backend id", () => {
    expect(
      decode({
        id: "wsl:default",
        label: "WSL (Ubuntu)",
        runningDistro: "Ubuntu",
        httpBaseUrl: "http://127.0.0.1:3774/",
        wsBaseUrl: "ws://127.0.0.1:3774/",
      }),
    ).toEqual({
      id: "wsl:default",
      label: "WSL (Ubuntu)",
      runningDistro: "Ubuntu",
      httpBaseUrl: "http://127.0.0.1:3774/",
      wsBaseUrl: "ws://127.0.0.1:3774/",
    });
  });

  it("allows non-running and non-WSL bootstraps to report no running distro", () => {
    expect(
      decode({
        id: "primary",
        label: "Windows",
        runningDistro: null,
        httpBaseUrl: null,
        wsBaseUrl: null,
      }).runningDistro,
    ).toBeNull();
  });
});

describe("local desktop adapter contracts", () => {
  const theme = {
    source: "omarchy",
    name: "Synthetic",
    mode: "dark",
    colors: { background: "#101010", foreground: "#eeeeee", accent: "#55aaff" },
  };

  it("accepts bounded local themes and rejects unsupported or incomplete envelopes", () => {
    const decode = Schema.decodeUnknownSync(DesktopSystemThemeSchema);
    expect(decode(theme)).toEqual(theme);
    for (const invalid of [
      { ...theme, source: "remote" },
      { ...theme, mode: "system" },
      { ...theme, name: "x".repeat(129) },
      { ...theme, colors: { background: "#000000" } },
      { ...theme, colors: { ...theme.colors, "invalid key": "#fff" } },
      { ...theme, colors: { ...theme.colors, accent: "x".repeat(257) } },
      {
        ...theme,
        colors: {
          ...theme.colors,
          ...Object.fromEntries(Array.from({ length: 62 }, (_, i) => [`color${i}`, "#fff"])),
        },
      },
    ])
      expect(() => decode(invalid)).toThrow();
  });

  it("keeps capture bytes bounded separately from preview capture", () => {
    const decode = Schema.decodeUnknownSync(DesktopScreenshotCaptureSchema);
    const data = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const artifact = { name: "capture.png", mimeType: "image/png", data };
    expect(decode(artifact)).toEqual(artifact);
    expect(() => decode({ ...artifact, data: new Uint8Array() })).toThrow();
    expect(() => decode({ ...artifact, mimeType: "image/jpeg" })).toThrow();
    const oversized = new Uint8Array(DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES + 1);
    oversized.set(data);
    expect(() => decode({ ...artifact, data: oversized })).toThrow();
  });

  it("admits only declared guest actions with a concrete runtime tab", () => {
    const decode = Schema.decodeUnknownSync(DesktopPreviewBrowserActionEventSchema);
    for (const action of [
      "preview.new",
      "preview.close",
      "preview.reopenClosed",
      "preview.focusUrl",
    ]) {
      expect(decode({ action, tabId: "epoch:thread:tab" })).toEqual({
        action,
        tabId: "epoch:thread:tab",
      });
    }
    for (const invalid of [
      { action: "preview.refresh", tabId: "tab" },
      { action: "preview.close", tabId: "" },
      { action: "preview.close", tabId: " tab " },
    ])
      expect(() => decode(invalid)).toThrow();
  });
});

describe("exact preview zoom restoration input", () => {
  it("requires a concrete tab and finite positive zoom", () => {
    const decode = Schema.decodeUnknownSync(DesktopPreviewSetZoomFactorInputSchema);
    expect(decode({ tabId: "runtime:tab", zoomFactor: 1.25 })).toEqual({
      tabId: "runtime:tab",
      zoomFactor: 1.25,
    });
    for (const zoomFactor of [0, -1, NaN, Infinity])
      expect(() => decode({ tabId: "tab", zoomFactor })).toThrow();
    expect(() => decode({ tabId: "", zoomFactor: 1 })).toThrow();
  });
});
