import type { SidebarProjectGrouping } from "@t3tools/contracts/settings";

export interface LogicalProjectInput {
  id: string;
  name: string;
  cwd: string;
}

export interface LogicalProjectGroup<TProject> {
  id: string;
  label: string;
  rootPath: string;
  projects: TProject[];
  grouped: boolean;
}

const WORKTREE_SEGMENT_NAMES = new Set([".worktrees", "worktrees", "trees"]);

function trimTrailingSeparators(pathValue: string): string {
  let next = pathValue.trim().replaceAll("\\", "/");
  while (next.length > 1 && next.endsWith("/")) {
    next = next.slice(0, -1);
  }
  return next;
}

function basename(pathValue: string): string {
  const normalized = trimTrailingSeparators(pathValue);
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}

export function normalizeLogicalProjectRootPath(cwd: string): string {
  const normalized = trimTrailingSeparators(cwd);
  const segments = normalized.split("/");
  const worktreeIndex = segments.findIndex((segment) => WORKTREE_SEGMENT_NAMES.has(segment));
  if (worktreeIndex > 0) {
    const rootSegments = segments.slice(0, worktreeIndex);
    const root = rootSegments.join("/");
    return root.length > 0 ? root : "/";
  }
  return normalized;
}

export function deriveLogicalProjectLabel(rootPath: string): string {
  return basename(rootPath) || rootPath;
}

export function deriveLogicalProjectGroups<TProject>(input: {
  projects: readonly TProject[];
  grouping: SidebarProjectGrouping;
  getCwd?: (project: TProject) => string;
  getId?: (project: TProject) => string;
  getName?: (project: TProject) => string;
}): LogicalProjectGroup<TProject>[] {
  const getCwd = input.getCwd ?? ((project: TProject) => (project as LogicalProjectInput).cwd);
  const getId = input.getId ?? ((project: TProject) => (project as LogicalProjectInput).id);
  const getName = input.getName ?? ((project: TProject) => (project as LogicalProjectInput).name);
  if (input.grouping === "none") {
    return input.projects.map((project) => ({
      id: getId(project),
      label: getName(project),
      rootPath: getCwd(project),
      projects: [project],
      grouped: false,
    }));
  }

  const groupsByRoot = new Map<string, LogicalProjectGroup<TProject>>();
  for (const project of input.projects) {
    const rootPath = normalizeLogicalProjectRootPath(getCwd(project));
    const existing = groupsByRoot.get(rootPath);
    if (existing) {
      existing.projects.push(project);
      continue;
    }
    groupsByRoot.set(rootPath, {
      id: rootPath,
      label: deriveLogicalProjectLabel(rootPath),
      rootPath,
      projects: [project],
      grouped: false,
    });
  }

  return [...groupsByRoot.values()].map((group) => ({
    ...group,
    grouped: group.projects.length > 1,
  }));
}
