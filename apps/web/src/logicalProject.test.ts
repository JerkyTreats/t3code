import { describe, expect, it } from "vitest";
import {
  deriveLogicalProjectGroups,
  deriveLogicalProjectLabel,
  normalizeLogicalProjectRootPath,
  type LogicalProjectInput,
} from "./logicalProject";

function project(input: LogicalProjectInput): LogicalProjectInput {
  return input;
}

describe("normalizeLogicalProjectRootPath", () => {
  it("normalizes worktree child paths to the concrete project root", () => {
    expect(normalizeLogicalProjectRootPath("/repo/app/.worktrees/feature")).toBe("/repo/app");
    expect(normalizeLogicalProjectRootPath("/repo/app/worktrees/feature")).toBe("/repo/app");
  });

  it("keeps ordinary project paths concrete", () => {
    expect(normalizeLogicalProjectRootPath("/repo/app")).toBe("/repo/app");
    expect(normalizeLogicalProjectRootPath("/repo/app-feature")).toBe("/repo/app-feature");
  });
});

describe("deriveLogicalProjectLabel", () => {
  it("uses the root basename", () => {
    expect(deriveLogicalProjectLabel("/repo/app")).toBe("app");
  });
});

describe("deriveLogicalProjectGroups", () => {
  it("keeps projects separate when grouping is disabled", () => {
    const groups = deriveLogicalProjectGroups({
      grouping: "none",
      projects: [
        project({ id: "one", name: "One", cwd: "/repo/app" }),
        project({ id: "two", name: "Two", cwd: "/repo/app/.worktrees/two" }),
      ],
    });

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.grouped === false)).toBe(true);
  });

  it("groups worktree children without changing concrete projects", () => {
    const groups = deriveLogicalProjectGroups({
      grouping: "directory",
      projects: [
        project({ id: "base", name: "Base", cwd: "/repo/app" }),
        project({ id: "feature", name: "Feature", cwd: "/repo/app/.worktrees/feature" }),
        project({ id: "other", name: "Other", cwd: "/repo/other" }),
      ],
    });

    expect(groups.map((group) => group.label)).toEqual(["app", "other"]);
    expect(groups[0]?.projects.map((entry) => entry.id)).toEqual(["base", "feature"]);
    expect(groups[0]?.grouped).toBe(true);
    expect(groups[1]?.grouped).toBe(false);
  });
});
