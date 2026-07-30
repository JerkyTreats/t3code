// @effect-diagnostics nodeBuiltinImport:off
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

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

type UnknownRecord = Record<string, unknown>;

function requireSource(source: string, expected: string, label: string): void {
  if (!source.includes(expected)) {
    throw new Error(`${label} is missing required origin-only source: ${expected}`);
  }
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a mapping.`);
  }
  return value as UnknownRecord;
}

function parseWorkflow(source: string, workflowFile: string): UnknownRecord {
  try {
    return requireRecord(parse(source), workflowFile);
  } catch (cause) {
    throw new Error(`${workflowFile} is not a valid workflow mapping.`, { cause });
  }
}

function requireExactKeys(
  value: unknown,
  expectedKeys: ReadonlyArray<string>,
  label: string,
): void {
  const actualKeys = Object.keys(requireRecord(value, label)).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} keys must be exactly ${expected.join(", ")}; received ${actualKeys.join(", ")}.`,
    );
  }
}

function requireExactPermissions(
  value: unknown,
  expected: Readonly<Record<string, string>> | undefined,
  label: string,
): void {
  if (expected === undefined) {
    if (value !== undefined) {
      throw new Error(`${label} must not declare workflow permissions.`);
    }
    return;
  }
  const actual = requireRecord(value, label);
  const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`${label} permissions do not match the required least-privilege grant.`);
  }
}

function hasWritePermission(value: unknown): boolean {
  if (value === "write-all") return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).some((permission) => permission === "write");
}

function hasHostedMutationCommand(job: UnknownRecord): boolean {
  const source = JSON.stringify(job);
  return [
    /docker\/build-push-action@/u,
    /softprops\/action-gh-release@/u,
    /\beas (build|submit|update)\b/u,
    /\b(docker|podman) push\b/u,
    /\bgh release (create|delete|edit|upload)\b/u,
  ].some((pattern) => pattern.test(source));
}

function requireExactGuard(job: UnknownRecord, expectedGuard: string, label: string): void {
  if (job.if !== expectedGuard) {
    throw new Error(`${label} must use the exact origin-only guard: ${expectedGuard}`);
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

  const workflowSources = new Map<string, string>();
  const workflows = new Map<string, UnknownRecord>();
  for (const workflowFile of workflowFiles) {
    const source = readFileSync(join(workflowDirectory, workflowFile), "utf8");
    workflowSources.set(workflowFile, source);
    workflows.set(workflowFile, parseWorkflow(source, workflowFile));
    for (const forbiddenTarget of FORBIDDEN_UPSTREAM_TARGETS) {
      if (forbiddenTarget.test(source)) {
        throw new Error(`${workflowFile} contains forbidden upstream target ${forbiddenTarget}.`);
      }
    }
  }

  for (const [workflowFile, workflow] of workflows) {
    if (hasWritePermission(workflow.permissions)) {
      throw new Error(`${workflowFile} must not grant write permission at workflow scope.`);
    }
  }

  const desktopWorkflow =
    workflowSources.get("build-desktop-artifacts.yml") ??
    (() => {
      throw new Error("Desktop release workflow source is unavailable.");
    })();
  const desktopWorkflowObject = requireRecord(
    workflows.get("build-desktop-artifacts.yml"),
    "Desktop release workflow",
  );
  requireExactKeys(
    desktopWorkflowObject.on,
    ["push", "workflow_dispatch"],
    "Desktop release workflow triggers",
  );
  requireExactPermissions(
    desktopWorkflowObject.permissions,
    { contents: "read" },
    "Desktop release workflow",
  );
  const desktopJobs = requireRecord(desktopWorkflowObject.jobs, "Desktop release workflow jobs");
  requireExactKeys(
    desktopJobs,
    ["linux-appimage", "macos-dmg", "publish-release"],
    "Desktop release workflow jobs",
  );
  const desktopPublishJob = requireRecord(
    desktopJobs["publish-release"],
    "Desktop release publish job",
  );
  requireExactGuard(
    desktopPublishJob,
    "${{ github.repository == 'JerkyTreats/t3code' && github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') }}",
    "Desktop release publish job",
  );
  requireExactPermissions(
    desktopPublishJob.permissions,
    { contents: "write" },
    "Desktop release publish job",
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

  const serverImageWorkflow =
    workflowSources.get("build-t3code-server-image.yml") ??
    (() => {
      throw new Error("Server image workflow source is unavailable.");
    })();
  const serverImageWorkflowObject = requireRecord(
    workflows.get("build-t3code-server-image.yml"),
    "Server image workflow",
  );
  requireExactKeys(
    serverImageWorkflowObject.on,
    ["push", "workflow_dispatch"],
    "Server image workflow triggers",
  );
  requireExactPermissions(
    serverImageWorkflowObject.permissions,
    { contents: "read" },
    "Server image workflow",
  );
  const serverImageJobs = requireRecord(
    serverImageWorkflowObject.jobs,
    "Server image workflow jobs",
  );
  requireExactKeys(serverImageJobs, ["build"], "Server image workflow jobs");
  const serverImageBuildJob = requireRecord(
    serverImageJobs.build,
    "Server image workflow build job",
  );
  requireExactGuard(
    serverImageBuildJob,
    "github.repository == 'JerkyTreats/t3code'",
    "Server image workflow build job",
  );
  requireExactPermissions(
    serverImageBuildJob.permissions,
    { contents: "read", packages: "write" },
    "Server image workflow build job",
  );
  requireSource(
    serverImageWorkflow,
    "IMAGE_NAME: ghcr.io/jerkytreats/t3code-server",
    "Server image workflow",
  );
  requireSource(
    serverImageWorkflow,
    "build:\n    name: Build and push server image\n    if: github.repository == 'JerkyTreats/t3code'",
    "Server image workflow",
  );
  requireSource(serverImageWorkflow, "permissions:\n  contents: read", "Server image workflow");
  requireSource(
    serverImageWorkflow,
    "    permissions:\n      contents: read\n      packages: write",
    "Server image workflow",
  );

  const mobileWorkflow =
    workflowSources.get("mobile-eas-production.yml") ??
    (() => {
      throw new Error("Mobile production workflow source is unavailable.");
    })();
  const mobileWorkflowObject = requireRecord(
    workflows.get("mobile-eas-production.yml"),
    "Mobile production workflow",
  );
  requireExactKeys(
    mobileWorkflowObject.on,
    ["workflow_dispatch"],
    "Mobile production workflow triggers",
  );
  requireExactPermissions(
    mobileWorkflowObject.permissions,
    undefined,
    "Mobile production workflow",
  );
  const mobileJobs = requireRecord(mobileWorkflowObject.jobs, "Mobile production workflow jobs");
  requireExactKeys(mobileJobs, ["production"], "Mobile production workflow jobs");
  const mobileProductionJob = requireRecord(
    mobileJobs.production,
    "Mobile production workflow job",
  );
  requireExactGuard(
    mobileProductionJob,
    "github.repository == 'JerkyTreats/t3code'",
    "Mobile production workflow job",
  );
  requireExactPermissions(
    mobileProductionJob.permissions,
    { contents: "read" },
    "Mobile production workflow job",
  );
  requireSource(mobileWorkflow, "workflow_dispatch:", "Mobile production workflow");
  requireSource(
    mobileWorkflow,
    "production:\n    name: EAS Production ${{ inputs.mode }}\n    if: github.repository == 'JerkyTreats/t3code'",
    "Mobile production workflow",
  );
  requireSource(
    mobileWorkflow,
    "    permissions:\n      contents: read",
    "Mobile production workflow",
  );
  if (/^\s{2}(push|schedule):/mu.test(mobileWorkflow)) {
    throw new Error("Mobile production workflow must remain manual-only.");
  }

  const ciWorkflowObject = requireRecord(workflows.get("ci.yml"), "CI workflow");
  requireExactKeys(
    ciWorkflowObject.on,
    ["pull_request", "push", "workflow_dispatch"],
    "CI workflow triggers",
  );
  requireExactKeys(ciWorkflowObject.jobs, ["client-packages"], "CI workflow jobs");

  const mutationJobGuards = new Map([
    [
      "build-desktop-artifacts.yml:publish-release",
      "${{ github.repository == 'JerkyTreats/t3code' && github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v') }}",
    ],
    ["build-t3code-server-image.yml:build", "github.repository == 'JerkyTreats/t3code'"],
    ["mobile-eas-production.yml:production", "github.repository == 'JerkyTreats/t3code'"],
  ]);
  for (const [workflowFile, workflow] of workflows) {
    const jobs = requireRecord(workflow.jobs, `${workflowFile} jobs`);
    for (const [jobName, value] of Object.entries(jobs)) {
      const job = requireRecord(value, `${workflowFile} job ${jobName}`);
      if (hasWritePermission(job.permissions) || hasHostedMutationCommand(job)) {
        const expectedGuard = mutationJobGuards.get(`${workflowFile}:${jobName}`);
        if (expectedGuard === undefined) {
          throw new Error(`${workflowFile} job ${jobName} has an unapproved hosted mutation.`);
        }
        requireExactGuard(job, expectedGuard, `${workflowFile} job ${jobName}`);
      }
    }
  }
}
