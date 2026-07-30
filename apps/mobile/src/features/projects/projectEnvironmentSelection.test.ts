import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveProjectEnvironmentFromParam } from "./projectEnvironmentSelection";

const environments = [
  {
    environmentId: EnvironmentId.make("environment-first"),
    label: "First",
  },
  {
    environmentId: EnvironmentId.make("environment-requested"),
    label: "Requested",
  },
];

describe("mobile project environment selection", () => {
  it("uses the first environment only when the route parameter is absent", () => {
    expect(resolveProjectEnvironmentFromParam(environments, undefined)).toEqual(environments[0]);
    expect(resolveProjectEnvironmentFromParam(environments, "environment-requested")).toEqual(
      environments[1],
    );
  });

  it("keeps an explicit stale environment unavailable instead of targeting another environment", () => {
    const environment = resolveProjectEnvironmentFromParam(environments, "environment-removed");
    const invokedOperations: string[] = [];
    for (const operation of [
      "repository-lookup",
      "destination-preload",
      "clone",
      "project-create",
    ]) {
      if (environment !== null) {
        invokedOperations.push(`${operation}:${environment.environmentId}`);
      }
    }

    expect(environment).toBeNull();
    expect(invokedOperations).toEqual([]);
  });

  it("does not recover a stale first array value from later route values", () => {
    expect(
      resolveProjectEnvironmentFromParam(environments, [
        "environment-removed",
        "environment-requested",
      ]),
    ).toBeNull();
  });
});
