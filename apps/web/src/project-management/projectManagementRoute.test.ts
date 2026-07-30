import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectManagementRouteTarget,
  parseProjectManagementRouteTarget,
  projectIdentityMatchesManagementTarget,
  projectManagementRouteSearch,
  projectManagementTargetKey,
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

  it("keys redirect ownership by exact target and view", () => {
    const base = {
      environmentId: "env-local" as never,
      projectId: "project-1" as never,
      view: "management" as const,
    };

    expect(projectManagementTargetKey(base)).not.toBe(
      projectManagementTargetKey({ ...base, environmentId: "env-remote" as never }),
    );
    expect(projectManagementTargetKey(base)).not.toBe(
      projectManagementTargetKey({ ...base, view: "inference" }),
    );
  });

  it("matches projects by environment and project identity", () => {
    const target = {
      environmentId: "env-local" as never,
      projectId: "project-1" as never,
    };

    expect(
      projectIdentityMatchesManagementTarget(
        { environmentId: target.environmentId, id: target.projectId },
        target,
      ),
    ).toBe(true);
    expect(
      projectIdentityMatchesManagementTarget(
        { environmentId: "env-remote" as never, id: target.projectId },
        target,
      ),
    ).toBe(false);
    expect(projectIdentityMatchesManagementTarget(null, target)).toBe(false);
  });
});
