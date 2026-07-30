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
    let rejected = 0;
    await expect(
      coordinator.run(
        () => Promise.resolve(false),
        () => {
          committed = true;
        },
        () => {
          rejected += 1;
        },
      ),
    ).resolves.toBe(false);
    expect(committed).toBe(false);
    expect(rejected).toBe(1);
  });

  it("keeps the URL clone branch on repository input when destination preload fails", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    let cloneStep = "repository";
    await coordinator.run(
      () => Promise.resolve(false),
      () => {
        cloneStep = "confirm";
      },
    );
    expect(cloneStep).toBe("repository");
  });

  it("does not let stale clone preload completion replace the latest confirmation", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    const first = Promise.withResolvers<boolean>();
    const second = Promise.withResolvers<boolean>();
    let repository = "repository";
    const firstRun = coordinator.run(
      () => first.promise,
      () => {
        repository = "first";
      },
    );
    const secondRun = coordinator.run(
      () => second.promise,
      () => {
        repository = "second";
      },
    );

    second.resolve(true);
    await expect(secondRun).resolves.toBe(true);
    first.resolve(true);
    await expect(firstRun).resolves.toBe(false);
    expect(repository).toBe("second");
  });

  it("silences a stale failed preload while reporting the current failure once", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    const stale = Promise.withResolvers<boolean>();
    const current = Promise.withResolvers<boolean>();
    const failures: string[] = [];
    const staleRun = coordinator.run(
      () => stale.promise,
      () => undefined,
      () => failures.push("stale"),
    );
    const currentRun = coordinator.run(
      () => current.promise,
      () => undefined,
      () => failures.push("current"),
    );

    stale.resolve(false);
    await expect(staleRun).resolves.toBe(false);
    current.resolve(false);
    await expect(currentRun).resolves.toBe(false);
    expect(failures).toEqual(["current"]);
  });

  it("lets repository lookup stop before preload after navigation invalidation", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    const lookup = Promise.withResolvers<void>();
    let preloaded = false;
    let confirmed = false;
    const run = coordinator.run(
      async (isCurrent) => {
        await lookup.promise;
        if (!isCurrent()) return false;
        preloaded = true;
        return true;
      },
      () => {
        confirmed = true;
      },
    );

    coordinator.invalidate();
    lookup.resolve();
    await expect(run).resolves.toBe(false);
    expect(preloaded).toBe(false);
    expect(confirmed).toBe(false);
  });

  it("commits the provider clone branch after current lookup and preload complete", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    let repository: string | null = null;
    let confirmed: string | null = null;
    await expect(
      coordinator.run(
        async (isCurrent) => {
          repository = "owner/repository";
          if (!isCurrent()) return false;
          return true;
        },
        () => {
          confirmed = repository;
        },
      ),
    ).resolves.toBe(true);
    expect(confirmed).toBe("owner/repository");
  });

  it("reports a current provider lookup failure once and silences a stale one", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    const staleLookup = Promise.withResolvers<boolean>();
    const failures: string[] = [];
    const staleRun = coordinator.run(
      () => staleLookup.promise,
      () => undefined,
      () => failures.push("stale lookup"),
    );
    const currentRun = coordinator.run(
      () => Promise.resolve(false),
      () => undefined,
      () => failures.push("current lookup"),
    );

    await expect(currentRun).resolves.toBe(false);
    staleLookup.resolve(false);
    await expect(staleRun).resolves.toBe(false);
    expect(failures).toEqual(["current lookup"]);
  });

  it("does not let a stale lookup release the current lookup spinner", async () => {
    const coordinator = createBrowseNavigationCoordinator();
    const staleLookup = Promise.withResolvers<boolean>();
    const currentLookup = Promise.withResolvers<boolean>();
    let spinnerOwner: string | null = "stale";
    const staleRun = coordinator.run(
      () => staleLookup.promise,
      () => {
        spinnerOwner = null;
      },
      () => {
        spinnerOwner = null;
      },
    );
    spinnerOwner = "current";
    const currentRun = coordinator.run(
      () => currentLookup.promise,
      () => {
        spinnerOwner = null;
      },
      () => {
        spinnerOwner = null;
      },
    );

    staleLookup.resolve(false);
    await expect(staleRun).resolves.toBe(false);
    expect(spinnerOwner).toBe("current");
    currentLookup.resolve(false);
    await expect(currentRun).resolves.toBe(false);
    expect(spinnerOwner).toBeNull();
  });
});
