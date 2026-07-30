// @effect-diagnostics nodeBuiltinImport:off
import { open, opendir } from "node:fs/promises";
import nodePath from "node:path";
import type { ServerProviderSkill } from "@t3tools/contracts";
import { parseDocument } from "yaml";

const MAX_SKILLS_PER_ROOT = 64;
const MAX_SKILL_FILE_BYTES = 256 * 1024;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function readBoundedSkillFile(path: string): Promise<string | undefined> {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(MAX_SKILL_FILE_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await file.read(buffer, bytesRead, buffer.length - bytesRead, null);
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    if (bytesRead > MAX_SKILL_FILE_BYTES) return undefined;
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}

async function readSkillsRoot(
  root: string,
  scope: "user" | "project",
): Promise<ReadonlyArray<ServerProviderSkill>> {
  try {
    const directory = await opendir(root, { bufferSize: 16 });
    const skills: ServerProviderSkill[] = [];
    let inspectedEntries = 0;
    for await (const entry of directory) {
      inspectedEntries++;
      if (inspectedEntries > MAX_SKILLS_PER_ROOT) break;
      if (!entry.isDirectory()) continue;
      const skillPath = nodePath.join(root, entry.name, "SKILL.md");
      try {
        const source = await readBoundedSkillFile(skillPath);
        if (!source?.startsWith("---")) continue;
        const closing = source.indexOf("\n---", 3);
        if (closing < 0) continue;
        const document = parseDocument(source.slice(3, closing));
        if (document.errors.length > 0) continue;
        const metadata = document.toJS() as unknown;
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue;
        const record = metadata as Record<string, unknown>;
        const name = text(record.name) ?? entry.name;
        const description = text(record.description);
        const displayName = text(record["display-name"]) ?? text(record.displayName);
        const shortDescription = text(record["short-description"]) ?? text(record.shortDescription);
        skills.push({
          name,
          path: skillPath,
          scope,
          enabled: true,
          ...(description ? { description } : {}),
          ...(displayName ? { displayName } : {}),
          ...(shortDescription ? { shortDescription } : {}),
        });
      } catch {
        // A malformed or unreadable skill cannot make provider probing fail.
      }
    }
    return skills;
  } catch {
    return [];
  }
}

export async function discoverClaudeSkills(input: {
  readonly homePath: string;
  readonly cwd: string;
}): Promise<ReadonlyArray<ServerProviderSkill>> {
  const [userSkills, projectSkills] = await Promise.all([
    readSkillsRoot(nodePath.join(input.homePath, ".claude", "skills"), "user"),
    readSkillsRoot(nodePath.join(input.cwd, ".claude", "skills"), "project"),
  ]);
  const byName = new Map(userSkills.map((skill) => [skill.name.toLowerCase(), skill]));
  for (const skill of projectSkills) byName.set(skill.name.toLowerCase(), skill);
  return [...byName.values()];
}
