import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  DesktopEnvironmentBootstrapSchema,
  DesktopScreenshotCaptureSchema,
  DesktopSystemThemeSchema,
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

describe("desktop IPC fork contracts", () => {
  const decodeDesktopScreenshotCapture = Schema.decodeUnknownSync(DesktopScreenshotCaptureSchema);
  const decodeDesktopSystemTheme = Schema.decodeUnknownSync(DesktopSystemThemeSchema);

  it("accepts Omarchy screenshot capture payloads", () => {
    const decoded = decodeDesktopScreenshotCapture({
      name: "screenshot.png",
      mimeType: "image/png",
      sizeBytes: 12,
      dataUrl: "data:image/png;base64,AAAA",
    });

    expect(decoded.mimeType).toBe("image/png");
    expect(decoded.name).toBe("screenshot.png");
  });

  it("accepts Omarchy system theme payloads", () => {
    const decoded = decodeDesktopSystemTheme({
      source: "omarchy",
      name: "Tokyo Night",
      mode: "dark",
      colors: {
        background: "#1a1b26",
        foreground: "#c0caf5",
        accent: "#7aa2f7",
      },
    });

    expect(decoded.source).toBe("omarchy");
    expect(decoded.colors.accent).toBe("#7aa2f7");
  });

  it("rejects generic system theme sources", () => {
    expect(() =>
      decodeDesktopSystemTheme({
        source: "system",
        name: "System",
        mode: "dark",
        colors: {
          background: "#000000",
          foreground: "#ffffff",
          accent: "#ffffff",
        },
      }),
    ).toThrow();
  });
});
