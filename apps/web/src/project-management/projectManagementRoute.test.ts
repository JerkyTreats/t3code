import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectManagementRouteTarget,
  parseProjectManagementRouteTarget,
  projectManagementRouteSearch,
} from "./projectManagementRoute";

describe("project management route helpers", () => {
  it("defaults unknown search to management view", () => {
    expect(projectManagementRouteSearch("other")).toEqual({ view: "management" });
    expect(projectManagementRouteSearch("inference")).toEqual({ view: "inference" });
  });

  it("preserves environment identity in route targets", () => {
    const target = parseProjectManagementRouteTarget({
      environmentId: "env-remote",
      projectId: "project-1",
      view: "inference",
    });

    expect(target).toEqual({
      environmentId: "env-remote",
      projectId: "project-1",
      view: "inference",
    });
  });

  it("builds management targets by default", () => {
    expect(
      buildProjectManagementRouteTarget({
        environmentId: "env-local" as never,
        projectId: "project-1" as never,
      }),
    ).toEqual({
      environmentId: "env-local",
      projectId: "project-1",
      view: "management",
    });
  });
});
