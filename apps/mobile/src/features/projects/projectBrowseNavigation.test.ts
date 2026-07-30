import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  createProjectDestinationNavigationCoordinator,
  createProjectFolderNavigationCoordinator,
} from "./projectBrowseNavigation";

describe("mobile project destination navigation ownership", () => {
  it("rejects an old transition when environment identity changes during preload", async () => {
    const coordinator = createProjectDestinationNavigationCoordinator();
    const preload = Promise.withResolvers<boolean>();
    const navigatedEnvironments: string[] = [];
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-old"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: "/old/projects",
      repositoryQuery: "owner/repository",
    });
    const transition = coordinator.run(
      () => preload.promise,
      () => {
        navigatedEnvironments.push("environment-old");
      },
    );

    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-new"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: "/old/projects",
      repositoryQuery: "owner/repository",
    });
    preload.resolve(true);

    await expect(transition).resolves.toBe(false);
    expect(navigatedEnvironments).toEqual([]);
  });

  it("rejects an old transition when the route source changes", async () => {
    const coordinator = createProjectDestinationNavigationCoordinator();
    const lookup = Promise.withResolvers<boolean>();
    let navigated = false;
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: "/projects",
      repositoryQuery: "owner/repository",
    });
    const transition = coordinator.run(
      () => lookup.promise,
      () => {
        navigated = true;
      },
    );

    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "url",
      connectionPhase: "connected",
      baseDirectory: "/projects",
      repositoryQuery: "owner/repository",
    });
    lookup.resolve(true);

    await expect(transition).resolves.toBe(false);
    expect(navigated).toBe(false);
  });

  it("rejects an old transition when the environment starts reconnecting", async () => {
    const coordinator = createProjectDestinationNavigationCoordinator();
    const preload = Promise.withResolvers<boolean>();
    let navigated = false;
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: "/projects",
      repositoryQuery: "owner/repository",
    });
    const transition = coordinator.run(
      () => preload.promise,
      () => {
        navigated = true;
      },
    );

    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "github",
      connectionPhase: "reconnecting",
      baseDirectory: "/projects",
      repositoryQuery: "owner/repository",
    });
    preload.resolve(true);

    await expect(transition).resolves.toBe(false);
    expect(navigated).toBe(false);
  });

  it("rejects an old transition after a late base-directory update", async () => {
    const coordinator = createProjectDestinationNavigationCoordinator();
    const lookup = Promise.withResolvers<boolean>();
    let navigated = false;
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: null,
      repositoryQuery: "owner/repository",
    });
    const transition = coordinator.run(
      () => lookup.promise,
      () => {
        navigated = true;
      },
    );

    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: "/configured/projects",
      repositoryQuery: "owner/repository",
    });
    lookup.resolve(true);

    await expect(transition).resolves.toBe(false);
    expect(navigated).toBe(false);
  });

  it("rejects an old transition when repository input changes during lookup", async () => {
    const coordinator = createProjectDestinationNavigationCoordinator();
    const lookup = Promise.withResolvers<boolean>();
    let navigated = false;
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: "/projects",
      repositoryQuery: "owner/old-repository",
    });
    const transition = coordinator.run(
      () => lookup.promise,
      () => {
        navigated = true;
      },
    );

    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: "/projects",
      repositoryQuery: "owner/new-repository",
    });
    lookup.resolve(true);

    await expect(transition).resolves.toBe(false);
    expect(navigated).toBe(false);
  });

  it("rejects an old transition when repository input changes during preload", async () => {
    const coordinator = createProjectDestinationNavigationCoordinator();
    const lookup = Promise.withResolvers<boolean>();
    const preload = Promise.withResolvers<boolean>();
    const preloadStarted = Promise.withResolvers<void>();
    let navigated = false;
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: "/projects",
      repositoryQuery: "owner/old-repository",
    });
    const transition = coordinator.run(
      async () => {
        await lookup.promise;
        preloadStarted.resolve();
        return preload.promise;
      },
      () => {
        navigated = true;
      },
    );

    lookup.resolve(true);
    await preloadStarted.promise;
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      source: "github",
      connectionPhase: "connected",
      baseDirectory: "/projects",
      repositoryQuery: "owner/new-repository",
    });
    preload.resolve(true);

    await expect(transition).resolves.toBe(false);
    expect(navigated).toBe(false);
  });
});

describe("mobile project folder navigation ownership", () => {
  it("rejects a pending folder transition when the visible path changes", async () => {
    const coordinator = createProjectFolderNavigationCoordinator();
    const preload = Promise.withResolvers<boolean>();
    let committed = false;
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      connectionPhase: "connected",
      platform: "Linux",
      pathInput: "/projects/",
    });
    const transition = coordinator.run(
      () => preload.promise,
      () => {
        committed = true;
      },
    );

    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-1"),
      connectionPhase: "connected",
      platform: "Linux",
      pathInput: "/other/",
    });
    preload.resolve(true);

    await expect(transition).resolves.toBe(false);
    expect(committed).toBe(false);
  });

  it("rejects a pending folder transition when environment identity changes", async () => {
    const coordinator = createProjectFolderNavigationCoordinator();
    const preload = Promise.withResolvers<boolean>();
    const commits: string[] = [];
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-old"),
      connectionPhase: "connected",
      platform: "Linux",
      pathInput: "/projects/",
    });
    const transition = coordinator.run(
      () => preload.promise,
      () => {
        commits.push("environment-old");
      },
    );

    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-new"),
      connectionPhase: "connected",
      platform: "Linux",
      pathInput: "/projects/",
    });
    preload.resolve(true);

    await expect(transition).resolves.toBe(false);
    expect(commits).toEqual([]);
  });
});
