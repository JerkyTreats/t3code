// @effect-diagnostics nodeBuiltinImport:off
import { assert, it } from "@effect/vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertReleaseWorkflowSafety } from "./release-workflow-safety.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

it("accepts the retained origin-only release workflow set", () => {
  assert.doesNotThrow(() => assertReleaseWorkflowSafety(repositoryRoot));
});

it("rejects an upstream write target in a retained workflow", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "release-workflow-safety-"));
  try {
    cpSync(join(repositoryRoot, ".github"), join(temporaryRoot, ".github"), {
      recursive: true,
    });
    const desktopWorkflowPath = join(
      temporaryRoot,
      ".github",
      "workflows",
      "build-desktop-artifacts.yml",
    );
    const upstreamTarget = ["pingdotgg", "t3code"].join("/");
    writeFileSync(
      desktopWorkflowPath,
      `${readFileSync(desktopWorkflowPath, "utf8")}\n# ${upstreamTarget}\n`,
    );

    assert.throws(() => assertReleaseWorkflowSafety(temporaryRoot), /forbidden upstream target/);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
