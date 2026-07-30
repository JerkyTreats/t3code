import { describe, expect, it } from "vite-plus/test";

import {
  canPreloadBrowsePath,
  createBrowseNavigationCoordinator,
  filterFilesystemBrowseEntries,
  resolveFilesystemBrowsePath,
} from "./filesystem.ts";

describe("filesystem browse path", () => {
  it("projects query state for Unix and platform-gated Windows paths", () => {
    expect(resolveFilesystemBrowsePath("~/code/t3")).toEqual({
      isBrowsing: true,
      directoryPath: "~/code/",
      filterQuery: "t3",
      parentPath: "~/",
      canBrowseUp: true,
    });
    expect(resolveFilesystemBrowsePath("C:\\code\\t3", "Linux").isBrowsing).toBe(false);
    expect(resolveFilesystemBrowsePath("C:\\code\\t3", "Windows").isBrowsing).toBe(true);
    expect(resolveFilesystemBrowsePath("~/code/", "Linux", false).isBrowsing).toBe(false);
  });

  it("filters hidden entries and resolves an exact entry", () => {
    const entries = [
      { name: ".cache", fullPath: "/home/test/.cache" },
      { name: "Code", fullPath: "/home/test/Code" },
      { name: "codex", fullPath: "/home/test/codex" },
    ];
    expect(filterFilesystemBrowseEntries(entries, "co")).toEqual({
      visibleEntries: entries.slice(1),
      exactEntry: null,
    });
    expect(filterFilesystemBrowseEntries(entries, ".").visibleEntries).toEqual(entries.slice(0, 1));
    expect(filterFilesystemBrowseEntries(entries, "Code").exactEntry).toEqual(entries[1]);
  });
});

describe("filesystem browse navigation coordinator", () => {
  it("commits only the latest completed navigation", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    const first = Promise.withResolvers<boolean>();
    const second = Promise.withResolvers<boolean>();
    const commits: string[] = [];
    const firstRun = coordinator.run(
      () => first.promise,
      () => commits.push("first"),
    );
    const secondRun = coordinator.run(
      () => second.promise,
      () => commits.push("second"),
    );

    second.resolve(true);
    await expect(secondRun).resolves.toBe(true);
    first.resolve(true);
    await expect(firstRun).resolves.toBe(false);
    expect(commits).toEqual(["second"]);
  });

  it("invalidates pending navigation and preloads connected environments only", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    const pending = Promise.withResolvers<boolean>();
    const run = coordinator.run(
      () => pending.promise,
      () => {
        throw new Error("stale commit");
      },
    );
    coordinator.invalidate();
    pending.resolve(true);
    await expect(run).resolves.toBe(false);
    expect(canPreloadBrowsePath("connected")).toBe(true);
    expect(canPreloadBrowsePath("reconnecting")).toBe(false);
    expect(canPreloadBrowsePath(null)).toBe(false);
  });

  it("does not commit a failed preload", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    let committed = false;
    await expect(
      coordinator.run(
        () => Promise.resolve(false),
        () => {
          committed = true;
        },
      ),
    ).resolves.toBe(false);
    expect(committed).toBe(false);
  });
});
