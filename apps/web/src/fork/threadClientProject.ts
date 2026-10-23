import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ProjectId, ScopedProjectRef } from "@t3tools/contracts";

// Match the primary Linux server's path.resolve on trimmed absolute input.
// Activation bytes remain untouched; only project identity uses this spelling.
function projectDirectory(workingDirectory: string): string {
  const segments: string[] = [];
  for (const segment of workingDirectory.trim().split("/")) {
    if (segment === "..") segments.pop();
    else if (segment !== "" && segment !== ".") segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

export function findThreadClientProject(
  environmentId: EnvironmentId,
  workingDirectory: string,
  projects: readonly EnvironmentProject[],
): ScopedProjectRef | null {
  const workspaceRoot = projectDirectory(workingDirectory);
  const project = projects.find(
    (candidate) =>
      candidate.environmentId === environmentId && candidate.workspaceRoot === workspaceRoot,
  );
  return project ? scopeProjectRef(environmentId, project.id) : null;
}

export async function resolveThreadClientProject(
  environmentId: EnvironmentId,
  workingDirectory: string,
  dependencies: {
    readonly readProjects: () => readonly EnvironmentProject[];
    readonly createProject: (
      environmentId: EnvironmentId,
      workingDirectory: string,
    ) => Promise<ProjectId>;
    readonly waitForProject: (projectRef: ScopedProjectRef) => Promise<EnvironmentProject>;
  },
): Promise<ScopedProjectRef> {
  const workspaceRoot = projectDirectory(workingDirectory);
  const find = () =>
    findThreadClientProject(environmentId, workingDirectory, dependencies.readProjects());
  const existing = find();
  if (existing) return existing;

  let projectId: ProjectId;
  try {
    projectId = await dependencies.createProject(environmentId, workingDirectory);
  } catch (error) {
    // The server rejects duplicate roots atomically. A competing window may
    // have created this project; only its exact primary scope can satisfy us.
    const concurrent = find();
    if (concurrent) return concurrent;
    throw error;
  }
  const projectRef = scopeProjectRef(environmentId, projectId);
  const project = await dependencies.waitForProject(projectRef);
  if (
    project.environmentId !== environmentId ||
    project.id !== projectId ||
    project.workspaceRoot !== workspaceRoot
  ) {
    throw new Error("The project does not match the requested working directory.");
  }
  return projectRef;
}
