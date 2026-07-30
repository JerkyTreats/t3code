// @effect-diagnostics nodeBuiltinImport:off
import * as Path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  isDesktopScreenshotCaptureAvailable,
  type DesktopScreenshotCaptureHost,
} from "./DesktopScreenshotCaptureAvailability.ts";

function linuxHost(executablePaths: ReadonlyArray<string>): DesktopScreenshotCaptureHost {
  const executables = new Set(executablePaths);
  return {
    platform: "linux",
    homeDirectory: "/home/tester",
    pathValue: ["/usr/local/bin", "/usr/bin"].join(Path.delimiter),
    isExecutable: (filePath) => executables.has(filePath),
  };
}

describe("isDesktopScreenshotCaptureAvailable", () => {
  it("detects a supported Omarchy adapter on Linux", () => {
    expect(
      isDesktopScreenshotCaptureAvailable(
        linuxHost(["/home/tester/.local/share/omarchy/bin/omarchy-capture-screenshot"]),
      ),
    ).toBe(true);
  });

  it("detects a supported PATH adapter on Linux", () => {
    expect(isDesktopScreenshotCaptureAvailable(linuxHost(["/usr/bin/grimblast"]))).toBe(true);
  });

  it("rejects a Linux host with no supported capture adapter", () => {
    expect(isDesktopScreenshotCaptureAvailable(linuxHost(["/usr/bin/spectacle"]))).toBe(false);
  });
});
