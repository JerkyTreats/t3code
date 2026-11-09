import { describe, expect, it } from "vite-plus/test";

import { canvasSurfaceCardOf, canvasSurfaceRefOf } from "./canvasSurfaceCard.ts";

describe("canvasSurfaceRefOf", () => {
  it.each([
    ["a workspace file", { kind: "file", relativePath: "src/a.ts", revealLine: 3 }, true],
    [
      "a file with a bad line, kept without it",
      { kind: "file", relativePath: "a.ts", revealLine: 0 },
      true,
    ],
    ["a host path", { kind: "file", relativePath: "/home/user/a.ts" }, true],
    ["a home path", { kind: "file", relativePath: "~/a.ts" }, true],
    ["a drive path", { kind: "file", relativePath: "C:\\a.ts" }, true],
    ["a path out of the workspace", { kind: "file", relativePath: "src/../../a.ts" }, false],
    [
      "a preview with its url",
      { kind: "preview", tabId: "t1", url: "http://localhost:3000" },
      true,
    ],
    ["a new preview before its first page", { kind: "preview", tabId: "t1", url: "" }, true],
    ["a preview without a tab", { kind: "preview", url: "http://localhost:3000" }, false],
    ["a terminal group", { kind: "terminal", resourceId: "default" }, true],
    ["a terminal without a group", { kind: "terminal" }, false],
    ["the files browser", { kind: "files", folderTrail: "src/app" }, true],
    [
      "a pull request",
      { kind: "pull-request", projectId: "p", repository: "acme/app", number: 4 },
      true,
    ],
    [
      "a pull request with a bad number",
      { kind: "pull-request", projectId: "p", repository: "acme/app", number: 1.5 },
      false,
    ],
    ["the diff", { kind: "diff" }, true],
    ["the linked pull requests", { kind: "pull-requests" }, true],
    ["a side chat", { kind: "side-chat", threadId: "side-1" }, true],
    ["a side chat without its thread", { kind: "side-chat" }, false],
    ["a device before one is picked", { kind: "device" }, true],
    ["an unknown kind", { kind: "explorer" }, false],
  ])("%s", (_name, value, valid) => {
    expect(canvasSurfaceRefOf(value) !== null).toBe(valid);
  });

  it("keeps only the fields a ref names", () => {
    expect(
      canvasSurfaceRefOf({ kind: "file", relativePath: "a.ts", revealLine: -1, extra: true }),
    ).toEqual({ kind: "file", relativePath: "a.ts" });
    // A device without a usable target falls back to the picker rather than a broken stream.
    expect(
      canvasSurfaceRefOf({
        kind: "device",
        target: { hostId: "h", deviceId: "d", platform: "web" },
      }),
    ).toEqual({ kind: "device" });
    expect(canvasSurfaceRefOf({ kind: "files", folderTrail: "../outside" })).toEqual({
      kind: "files",
    });
  });

  it("keeps a terminal group's active terminal inside the group", () => {
    expect(
      canvasSurfaceRefOf({
        kind: "terminal",
        resourceId: "t1",
        terminalIds: ["t1", "t2", "t2", ""],
        activeTerminalId: "t9",
        splitDirection: "vertical",
      }),
    ).toEqual({
      kind: "terminal",
      resourceId: "t1",
      terminalIds: ["t1", "t2"],
      activeTerminalId: "t1",
      splitDirection: "vertical",
    });
  });
});

describe("canvasSurfaceCardOf", () => {
  it("reads a surface card and names it by its ref when no title was stored", () => {
    expect(
      canvasSurfaceCardOf({ kind: "surface", surface: { kind: "file", relativePath: "src/a.ts" } }),
    ).toEqual({
      kind: "surface",
      surface: { kind: "file", relativePath: "src/a.ts" },
      title: "a.ts",
    });
    expect(canvasSurfaceCardOf({ kind: "markdown", text: "# Notes" })).toBeNull();
    expect(canvasSurfaceCardOf({ kind: "surface", surface: { kind: "explorer" } })).toBeNull();
  });
});
