import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createProjectDestinationNavigationCoordinator } from "./projectDestinationNavigation";

describe("mobile project destination navigation ownership", () => {
  it("rejects an old transition when environment identity changes during preload", async () => {
    const coordinator = createProjectDestinationNavigationCoordinator();
    const preload = Promise.withResolvers<boolean>();
    const navigatedEnvironments: string[] = [];
    coordinator.updateContext({
      environmentId: EnvironmentId.make("environment-old"),
      source: "github",
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
    });
    lookup.resolve(true);

    await expect(transition).resolves.toBe(false);
    expect(navigated).toBe(false);
  });
});
