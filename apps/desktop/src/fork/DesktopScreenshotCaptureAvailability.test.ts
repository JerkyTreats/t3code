// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  isDesktopScreenshotCaptureAvailable,
  listDesktopScreenshotCaptureAdapters,
  resolveDesktopScreenshotCaptureAdapter,
  type DesktopScreenshotCaptureHost,
} from "./DesktopScreenshotCaptureAvailability.ts";

function host(
  executablePaths: ReadonlyArray<string>,
  platform: NodeJS.Platform = "linux",
): DesktopScreenshotCaptureHost {
  const executables = new Set(executablePaths);
  return {
    platform,
    homeDirectory: "/home/tester",
    pathValue: ["/opt/bin", "/usr/bin"].join(NodePath.delimiter),
    isExecutable: (filePath) => executables.has(filePath),
  };
}

describe("desktop screenshot capture availability", () => {
  it("returns absolute adapters in the required priority order", () => {
    expect(
      listDesktopScreenshotCaptureAdapters(
        host([
          "/home/tester/.local/share/omarchy/bin/omarchy-capture-screenshot",
          "/opt/bin/omarchy-capture-screenshot",
          "/usr/bin/grimblast",
          "/usr/bin/hyprshot",
          "/usr/bin/grim",
          "/usr/bin/slurp",
          "/usr/bin/import",
        ]),
      ),
    ).toEqual([
      {
        kind: "omarchy",
        command: "/home/tester/.local/share/omarchy/bin/omarchy-capture-screenshot",
      },
      { kind: "grimblast", command: "/usr/bin/grimblast" },
      { kind: "hyprshot", command: "/usr/bin/hyprshot" },
      {
        kind: "grim-slurp",
        grimCommand: "/usr/bin/grim",
        slurpCommand: "/usr/bin/slurp",
      },
      { kind: "grim", command: "/usr/bin/grim" },
      { kind: "import", command: "/usr/bin/import" },
    ]);
  });

  it("uses a PATH Omarchy adapter when the local installation is absent", () => {
    expect(
      resolveDesktopScreenshotCaptureAdapter(host(["/opt/bin/omarchy-cmd-screenshot"])),
    ).toEqual({ kind: "omarchy", command: "/opt/bin/omarchy-cmd-screenshot" });
  });

  it("uses grim fullscreen after the region pair when both are available", () => {
    expect(listDesktopScreenshotCaptureAdapters(host(["/usr/bin/grim", "/usr/bin/slurp"]))).toEqual(
      [
        {
          kind: "grim-slurp",
          grimCommand: "/usr/bin/grim",
          slurpCommand: "/usr/bin/slurp",
        },
        { kind: "grim", command: "/usr/bin/grim" },
      ],
    );
  });

  it("fails closed outside Linux and when no executable adapter exists", () => {
    expect(isDesktopScreenshotCaptureAvailable(host(["/usr/bin/grim"], "darwin"))).toBe(false);
    expect(isDesktopScreenshotCaptureAvailable(host(["/usr/bin/spectacle"]))).toBe(false);
  });
});
