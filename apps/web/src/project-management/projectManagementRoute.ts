import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import type {
  ProjectManagementRouteTarget,
  ProjectManagementRouteView,
} from "./projectManagementTypes";

export function parseProjectManagementRouteView(value: unknown): ProjectManagementRouteView {
  return value === "inference" ? "inference" : "management";
}

export function buildProjectManagementRouteTarget(input: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly view?: ProjectManagementRouteView | null;
}): ProjectManagementRouteTarget {
  return {
    environmentId: input.environmentId,
    projectId: input.projectId,
    view: input.view ?? "management",
  };
}

export function parseProjectManagementRouteTarget(input: {
  readonly environmentId: string;
  readonly projectId: string;
  readonly view?: unknown;
}): ProjectManagementRouteTarget {
  return buildProjectManagementRouteTarget({
    environmentId: EnvironmentId.make(input.environmentId),
    projectId: ProjectId.make(input.projectId),
    view: parseProjectManagementRouteView(input.view),
  });
}

export function projectManagementRouteSearch(view: unknown): {
  readonly view: ProjectManagementRouteView;
} {
  return {
    view: parseProjectManagementRouteView(view),
  };
}
