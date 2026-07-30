// @effect-diagnostics nodeBuiltinImport:off
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { discoverClaudeSkills } from "./ClaudeSkills.ts";

async function writeSkill(root: string, directory: string, frontmatter: string) {
  const skillDirectory = nodePath.join(root, ".claude", "skills", directory);
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(nodePath.join(skillDirectory, "SKILL.md"), `---\n${frontmatter}\n---\nBody\n`);
}

describe("discoverClaudeSkills", () => {
  it("lets a project skill override a same-name user skill", async () => {
    const homePath = await mkdtemp(nodePath.join(tmpdir(), "t3-claude-home-"));
    const cwd = await mkdtemp(nodePath.join(tmpdir(), "t3-claude-project-"));
    await writeSkill(homePath, "review", "name: review\ndescription: User review");
    await writeSkill(cwd, "review", "name: review\ndescription: Project review");

    expect(await discoverClaudeSkills({ homePath, cwd })).toEqual([
      expect.objectContaining({
        name: "review",
        description: "Project review",
        scope: "project",
      }),
    ]);
  });

  it("skips malformed skills and unreadable roots", async () => {
    const homePath = await mkdtemp(nodePath.join(tmpdir(), "t3-claude-home-"));
    const cwd = await mkdtemp(nodePath.join(tmpdir(), "t3-claude-project-"));
    await writeSkill(cwd, "broken", "name: [");

    expect(await discoverClaudeSkills({ homePath, cwd })).toEqual([]);
  });

  it("bounds directory iteration to the first skill entries", async () => {
    const homePath = await mkdtemp(nodePath.join(tmpdir(), "t3-claude-home-"));
    const cwd = await mkdtemp(nodePath.join(tmpdir(), "t3-claude-project-"));
    for (let index = 0; index < 70; index++) {
      await writeSkill(cwd, `skill-${index.toString().padStart(2, "0")}`, `name: skill-${index}`);
    }

    expect(await discoverClaudeSkills({ homePath, cwd })).toHaveLength(64);
  });

  it("skips a skill file larger than the bounded read limit", async () => {
    const homePath = await mkdtemp(nodePath.join(tmpdir(), "t3-claude-home-"));
    const cwd = await mkdtemp(nodePath.join(tmpdir(), "t3-claude-project-"));
    await writeSkill(cwd, "oversized", `name: oversized\ndescription: ${"x".repeat(256 * 1024)}`);

    expect(await discoverClaudeSkills({ homePath, cwd })).toEqual([]);
  });
});
