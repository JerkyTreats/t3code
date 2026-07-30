// @effect-diagnostics nodeBuiltinImport:off
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RETAINED_WORKFLOW_FILES = [
  "build-desktop-artifacts.yml",
  "build-t3code-server-image.yml",
  "ci.yml",
  "mobile-eas-production.yml",
] as const;

const FORBIDDEN_UPSTREAM_TARGETS = [
  /pingdotgg/iu,
  /github\.com\/pingdotgg/iu,
  /ghcr\.io\/pingdotgg/iu,
] as const;

function requireSource(source: string, expected: string, label: string): void {
  if (!source.includes(expected)) {
    throw new Error(`${label} is missing required origin-only source: ${expected}`);
  }
}

export function assertReleaseWorkflowSafety(repositoryRoot: string): void {
  const workflowDirectory = join(repositoryRoot, ".github", "workflows");
  const workflowFiles = readdirSync(workflowDirectory)
    .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
    .sort();
  const expectedWorkflowFiles = [...RETAINED_WORKFLOW_FILES].sort();

  if (JSON.stringify(workflowFiles) !== JSON.stringify(expectedWorkflowFiles)) {
    throw new Error(
      `Retained workflow set changed. Expected ${expectedWorkflowFiles.join(", ")}, received ${workflowFiles.join(", ")}.`,
    );
  }

  for (const workflowFile of workflowFiles) {
    const source = readFileSync(join(workflowDirectory, workflowFile), "utf8");
    for (const forbiddenTarget of FORBIDDEN_UPSTREAM_TARGETS) {
      if (forbiddenTarget.test(source)) {
        throw new Error(`${workflowFile} contains forbidden upstream target ${forbiddenTarget}.`);
      }
    }
  }

  const desktopWorkflow = readFileSync(
    join(workflowDirectory, "build-desktop-artifacts.yml"),
    "utf8",
  );
  requireSource(
    desktopWorkflow,
    "github.repository == 'JerkyTreats/t3code'",
    "Desktop release workflow",
  );
  requireSource(desktopWorkflow, "permissions:\n  contents: read", "Desktop release workflow");
  requireSource(
    desktopWorkflow,
    "publish-release:\n    name: Publish desktop release assets\n    if:",
    "Desktop release workflow",
  );
  requireSource(
    desktopWorkflow,
    "    permissions:\n      contents: write",
    "Desktop release workflow",
  );
  requireSource(
    desktopWorkflow,
    'export T3CODE_DESKTOP_VERSION="${RELEASE_TAG#v}"',
    "Desktop release workflow",
  );
  requireSource(desktopWorkflow, 'if [[ "${#appimages[@]}" -ne 1 ]]', "Desktop release workflow");
  requireSource(
    desktopWorkflow,
    'pnpm test:desktop-artifact-smoke "${appimages[0]}"',
    "Desktop release workflow",
  );

  const serverImageWorkflow = readFileSync(
    join(workflowDirectory, "build-t3code-server-image.yml"),
    "utf8",
  );
  requireSource(
    serverImageWorkflow,
    "IMAGE_NAME: ghcr.io/jerkytreats/t3code-server",
    "Server image workflow",
  );

  const mobileWorkflow = readFileSync(join(workflowDirectory, "mobile-eas-production.yml"), "utf8");
  requireSource(mobileWorkflow, "workflow_dispatch:", "Mobile production workflow");
  if (/^\s{2}(push|schedule):/mu.test(mobileWorkflow)) {
    throw new Error("Mobile production workflow must remain manual-only.");
  }
}
