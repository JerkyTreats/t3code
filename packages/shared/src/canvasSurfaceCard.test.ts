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
    ["a host path", { kind: "file", relativePath: "/home/user/a.ts" }, false],
    ["a home path", { kind: "file", relativePath: "~/a.ts" }, false],
    ["a drive path", { kind: "file", relativePath: "C:\\a.ts" }, false],
    ["a path out of the workspace", { kind: "file", relativePath: "src/../../a.ts" }, false],
    [
      "a preview with its url",
      { kind: "preview", tabId: "t1", url: "http://localhost:3000" },
      true,
    ],
    ["a preview without a url", { kind: "preview", tabId: "t1", url: "" }, false],
    ["a terminal group", { kind: "terminal", resourceId: "default" }, true],
    ["a terminal without a group", { kind: "terminal" }, false],
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
    ["a diff, not placeable yet", { kind: "diff" }, false],
  ])("%s", (_name, value, valid) => {
    expect(canvasSurfaceRefOf(value) !== null).toBe(valid);
  });

  it("keeps only the fields a ref names", () => {
    expect(
      canvasSurfaceRefOf({ kind: "file", relativePath: "a.ts", revealLine: -1, extra: true }),
    ).toEqual({ kind: "file", relativePath: "a.ts" });
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
    expect(canvasSurfaceCardOf({ kind: "surface", surface: { kind: "device" } })).toBeNull();
  });
});
