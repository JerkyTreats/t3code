// @effect-diagnostics nodeBuiltinImport:off
import { assert, it } from "@effect/vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertReleaseWorkflowSafety } from "./release-workflow-safety.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function makeWorkflowFixture(): string {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "release-workflow-safety-"));
  cpSync(join(repositoryRoot, ".github"), join(temporaryRoot, ".github"), {
    recursive: true,
  });
  return temporaryRoot;
}

function replaceWorkflowSource(
  repositoryFixture: string,
  workflowFile: string,
  expected: string,
  replacement: string,
): void {
  const workflowPath = join(repositoryFixture, ".github", "workflows", workflowFile);
  const source = readFileSync(workflowPath, "utf8");
  assert.include(source, expected);
  writeFileSync(workflowPath, source.replace(expected, replacement));
}

it("accepts the retained origin-only release workflow set", () => {
  assert.doesNotThrow(() => assertReleaseWorkflowSafety(repositoryRoot));
});

it("rejects an upstream write target in a retained workflow", () => {
  const temporaryRoot = makeWorkflowFixture();
  try {
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

it("rejects a server image job without the exact origin guard", () => {
  const temporaryRoot = makeWorkflowFixture();
  try {
    replaceWorkflowSource(
      temporaryRoot,
      "build-t3code-server-image.yml",
      "    if: github.repository == 'JerkyTreats/t3code'\n",
      "",
    );
    assert.throws(
      () => assertReleaseWorkflowSafety(temporaryRoot),
      /must use the exact origin-only guard/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

it("rejects a mobile production job without the exact origin guard", () => {
  const temporaryRoot = makeWorkflowFixture();
  try {
    replaceWorkflowSource(
      temporaryRoot,
      "mobile-eas-production.yml",
      "    if: github.repository == 'JerkyTreats/t3code'\n",
      "",
    );
    assert.throws(
      () => assertReleaseWorkflowSafety(temporaryRoot),
      /must use the exact origin-only guard/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

it("rejects a permissive suffix on an origin guard", () => {
  const temporaryRoot = makeWorkflowFixture();
  try {
    replaceWorkflowSource(
      temporaryRoot,
      "build-t3code-server-image.yml",
      "    if: github.repository == 'JerkyTreats/t3code'\n",
      "    if: github.repository == 'JerkyTreats/t3code' || true\n",
    );
    assert.throws(
      () => assertReleaseWorkflowSafety(temporaryRoot),
      /must use the exact origin-only guard/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

it("rejects workflow-level package write permission", () => {
  const temporaryRoot = makeWorkflowFixture();
  try {
    replaceWorkflowSource(
      temporaryRoot,
      "build-t3code-server-image.yml",
      "permissions:\n  contents: read\n",
      "permissions:\n  contents: read\n  packages: write\n",
    );
    assert.throws(
      () => assertReleaseWorkflowSafety(temporaryRoot),
      /must not grant write permission at workflow scope/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

it("rejects an extra unguarded hosted mutation job", () => {
  const temporaryRoot = makeWorkflowFixture();
  try {
    const workflowPath = join(
      temporaryRoot,
      ".github",
      "workflows",
      "build-t3code-server-image.yml",
    );
    writeFileSync(
      workflowPath,
      `${readFileSync(workflowPath, "utf8")}
  publish-extra:
    runs-on: ubuntu-24.04
    permissions:
      packages: write
    steps:
      - run: docker push ghcr.io/example/image:latest
`,
    );
    assert.throws(
      () => assertReleaseWorkflowSafety(temporaryRoot),
      /Server image workflow jobs keys must be exactly/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

it("rejects an alternate mobile production trigger", () => {
  const temporaryRoot = makeWorkflowFixture();
  try {
    replaceWorkflowSource(
      temporaryRoot,
      "mobile-eas-production.yml",
      "on:\n  workflow_dispatch:\n",
      "on:\n  workflow_dispatch:\n  repository_dispatch:\n",
    );
    assert.throws(
      () => assertReleaseWorkflowSafety(temporaryRoot),
      /Mobile production workflow triggers keys must be exactly/,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
