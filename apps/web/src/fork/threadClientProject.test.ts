import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { findThreadClientProject, resolveThreadClientProject } from "./threadClientProject";

const environmentId = EnvironmentId.make("primary");
const projectId = ProjectId.make("requested-project");
const workingDirectory = "/workspace/requested";
const project = {
  environmentId,
  id: projectId,
  workspaceRoot: workingDirectory,
} as EnvironmentProject;
const projectRef = { environmentId, projectId };

describe("Thread working directory project owner", () => {
  it("matches the server's canonical spelling without changing the activation path", async () => {
    const requested = "/workspace/unused/../requested//./";
    expect(findThreadClientProject(environmentId, requested, [project])).toEqual(projectRef);
    const createProject = vi.fn(async () => projectId);
    expect(
      await resolveThreadClientProject(environmentId, requested, {
        readProjects: () => [],
        createProject,
        waitForProject: async () => project,
      }),
    ).toEqual(projectRef);
    expect(createProject).toHaveBeenCalledWith(environmentId, requested);
    const root = { ...project, workspaceRoot: "/" };
    expect(findThreadClientProject(environmentId, "/../../", [root])).toEqual(projectRef);
    const backslash = { ...project, workspaceRoot: "/workspace/a\\b" };
    expect(findThreadClientProject(environmentId, "/workspace/a\\b/", [backslash])).toEqual(
      projectRef,
    );
  });

  it("preserves significant trailing space when the server normalizes the original path", async () => {
    const requested = "/workspace/requested /.";
    const projected = { ...project, workspaceRoot: "/workspace/requested " };
    const createProject = vi.fn(async () => projectId);
    expect(
      await resolveThreadClientProject(environmentId, requested, {
        readProjects: () => [],
        createProject,
        waitForProject: async () => projected,
      }),
    ).toEqual(projectRef);
    expect(createProject).toHaveBeenCalledWith(environmentId, requested);
    expect(findThreadClientProject(environmentId, requested, [project])).toBeNull();
    expect(findThreadClientProject(environmentId, requested, [projected])).toEqual(projectRef);
  });

  it("uses only the exact directory in the primary environment", () => {
    const projects = [
      { ...project, environmentId: EnvironmentId.make("remote") },
      { ...project, workspaceRoot: "/workspace/other" },
    ];
    expect(findThreadClientProject(environmentId, workingDirectory, projects)).toBeNull();
    expect(
      findThreadClientProject(environmentId, workingDirectory, [...projects, project]),
    ).toEqual(projectRef);
  });

  it("reuses an exact existing project without creating one", async () => {
    const createProject = vi.fn(async () => projectId);
    const waitForProject = vi.fn(async () => project);
    expect(
      await resolveThreadClientProject(environmentId, workingDirectory, {
        readProjects: () => [project],
        createProject,
        waitForProject,
      }),
    ).toEqual(projectRef);
    expect(createProject).not.toHaveBeenCalled();
    expect(waitForProject).not.toHaveBeenCalled();
  });

  it("creates an absent exact project and waits for its shell projection", async () => {
    const createProject = vi.fn(async () => projectId);
    const waitForProject = vi.fn(async () => project);
    expect(
      await resolveThreadClientProject(environmentId, workingDirectory, {
        readProjects: () => [],
        createProject,
        waitForProject,
      }),
    ).toEqual(projectRef);
    expect(createProject).toHaveBeenCalledWith(environmentId, workingDirectory);
    expect(waitForProject).toHaveBeenCalledWith(projectRef);
  });

  it("accepts the exact concurrent winner after the server rejects duplicate creation", async () => {
    let projects: EnvironmentProject[] = [];
    const createProject = vi.fn(async () => {
      projects = [project];
      throw new Error("The project root already exists.");
    });
    expect(
      await resolveThreadClientProject(environmentId, workingDirectory, {
        readProjects: () => projects,
        createProject,
        waitForProject: vi.fn(),
      }),
    ).toEqual(projectRef);
  });

  it("keeps a failed create recoverable without choosing another project", async () => {
    const error = new Error("The requested directory is unavailable.");
    const dependencies = {
      readProjects: () => [{ ...project, workspaceRoot: "/workspace/other" }],
      createProject: vi.fn(async () => {
        throw error;
      }),
      waitForProject: vi.fn(),
    };
    await expect(
      resolveThreadClientProject(environmentId, workingDirectory, dependencies),
    ).rejects.toBe(error);
    expect(dependencies.waitForProject).not.toHaveBeenCalled();
  });

  it("rejects a created project whose projected scope differs", async () => {
    for (const projected of [
      { ...project, environmentId: EnvironmentId.make("remote") },
      { ...project, workspaceRoot: "/workspace/other" },
      { ...project, id: ProjectId.make("other-project") },
    ]) {
      await expect(
        resolveThreadClientProject(environmentId, workingDirectory, {
          readProjects: () => [],
          createProject: vi.fn(async () => projectId),
          waitForProject: vi.fn(async () => projected),
        }),
      ).rejects.toThrow("does not match");
    }
  });
});
