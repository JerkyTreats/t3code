// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { parse } from "yaml";

import {
  CHECKOUT_ACTION as SERVER_IMAGE_CHECKOUT_ACTION,
  LOGIN_ACTION as SERVER_IMAGE_LOGIN_ACTION,
  SCANNER_DEPENDENCY_BOOTSTRAP,
  SETUP_BUILDX_ACTION as SERVER_IMAGE_SETUP_BUILDX_ACTION,
  SETUP_NODE_ACTION as SERVER_IMAGE_SETUP_NODE_ACTION,
} from "./server-image-workflow-safety.ts";

export const EXACT_ORIGIN_REPOSITORY = "JerkyTreats/t3code";
export const EXACT_ORIGIN_URL = "https://github.com/JerkyTreats/t3code.git";
export const EXACT_SERVER_IMAGE = "ghcr.io/jerkytreats/t3code-server";

const DESKTOP_VALIDATION_WORKFLOW = "desktop-artifact-validation.yml";
const SERVER_IMAGE_WORKFLOW = "build-t3code-server-image.yml";
const EXACT_SERVER_IMAGE_JOB_GUARD = [
  "github.repository == 'JerkyTreats/t3code'",
  "github.ref == 'refs/heads/main'",
  "(github.event_name == 'push' || github.event_name == 'workflow_dispatch')",
].join(" && ");
const CHECKOUT_ACTION = "actions/checkout@v6";
const CHECKOUT_ACTIONS = new Set([CHECKOUT_ACTION, SERVER_IMAGE_CHECKOUT_ACTION]);
const SETUP_APT_MIRRORS_ACTION = "./.github/actions/setup-apt-mirrors";
const SETUP_APT_MIRRORS_ACTION_FILE = ".github/actions/setup-apt-mirrors/action.yml";
const SETUP_APT_MIRRORS_ACTION_SHA256 =
  "332e294c658c807066e06cb9ef497c6b57eb54b3f9e881d90e231532cbab81ad";
const UPSTREAM_TARGET_PATTERN = /(?:github\.com\/|ghcr\.io\/)?pingdotgg\/t3code/iu;
const DYNAMIC_CONTAINER_NAMESPACE_PATTERN = /ghcr\.io\/[^\s"']*\$\{\{/iu;
const ALLOWED_NON_PUBLICATION_ACTIONS = new Set([
  CHECKOUT_ACTION,
  "actions/setup-java@v5",
  "actions/upload-artifact@v7",
  "docker/setup-buildx-action@v4",
  "dtolnay/rust-toolchain@stable",
  "gradle/actions/setup-gradle@v5",
  "reactivecircus/android-emulator-runner@v2",
  "voidzero-dev/setup-vp@v1",
]);
const SERVER_IMAGE_ACTIONS = new Set([
  SERVER_IMAGE_CHECKOUT_ACTION,
  SERVER_IMAGE_SETUP_NODE_ACTION,
  SERVER_IMAGE_SETUP_BUILDX_ACTION,
  SERVER_IMAGE_LOGIN_ACTION,
]);
const SERVER_IMAGE_MUTATION_RUN_DIGESTS = new Set([
  "fe60c3cfdc5a06d53de3ff52f19335571fb0808798b51cf8e2d30937edca11f5",
]);
const READ_ONLY_RUN_SOURCES = new Set([
  "brew bundle install --file apps/mobile/Brewfile",
  "cargo fmt --manifest-path native/resource-monitor/Cargo.toml -- --check",
  "cargo test --locked --manifest-path native/resource-monitor/Cargo.toml",
  "node scripts/lib/release-workflow-safety.ts",
  "node scripts/lib/server-image-workflow-safety.ts",
  "node scripts/server-image-smoke.ts",
  "node apps/desktop/scripts/verify-preload-bundle.mjs",
  "pnpm test:quattro",
  SCANNER_DEPENDENCY_BOOTSTRAP,
  'pnpm screenshots:mobile --platform android --appearance "${{ inputs.appearance }}" --theme "${{ inputs.theme }}" --validate-only',
  'pnpm screenshots:mobile --platform ios --appearance "${{ inputs.appearance }}" --theme "${{ inputs.theme }}"',
  'pnpm screenshots:mobile --platform ios --appearance "${{ inputs.appearance }}" --theme "${{ inputs.theme }}" --validate-only',
  "vp check",
  "vp run knip:check",
  "vp run --filter @t3tools/desktop ensure:electron",
  "vp run --filter t3 test --shard ${{ matrix.shard }}/${{ strategy.job-total }}",
  "vp run --parallel --concurrency-limit 4 --filter '!t3' --filter '!@t3tools/monorepo' test",
  "vp run build:desktop",
  "vp run dist:desktop:linux",
  "vp run lint:mobile",
  "vp run test",
  "vpr typecheck",
]);
// Multiline shell is accepted only by an exact content digest. This keeps the
// authority review local to this file without normalizing away shell meaning.
const READ_ONLY_MULTILINE_RUN_DIGESTS = new Set([
  "61c74164d6e160a58476fd65fd77914e251ad283a867569e84b6296f911a6d37",
  "12f50fd48fe1355d32721674cd800dd7912bf534e580c45b6d0a11bd0d41570d",
  "2a059c00011fff2b1effb058f4f92e9419396d0107fd4cbb2e3ed511fbb20e97",
  "4ad23a42ff8d14b1398124690c5189f96bd6b1929d5c4d15fe2801b9dfb58063",
  "561c8d57a245511ff11fa46021af2b82cc873b5766473aac2a38eaa06cd96631",
  "76bdb625389dce3b048dcae9939ff4665dd08cdb6298a8a4ae93725b29a0779e",
  "9e8ce5b6a87f21e71f416a33e2943750bfc7ff805b2688e3c1d876fd05a97fe4",
  "9a410ff05fb86ac2a617cbd3f90869391c4793aca5544d0ebb5e6aed6c3a76c4",
  "c840f9379680838474a53e132533f7a8181b20351d6f742d1f5d81ccb829e85e",
  "dced7f3ba925453ca9a6f7a4f288e3a31659661fc48457128e36f2ba4005be17",
  "dd8f468b7c48185308e9fe2854ba5146a2ce41d96105c338c2ab2a75bd1a6257",
  "afc5bf24b4f6c3ca8a44268d757d011e4e019405d4d16609af4b5bf3680ab41a",
  "e7f6223a07c059b512271135e03dc4a830ef815c375ce0e5dc70ba7084f52660",
  "f4b1bb27f25f1dd05c1561c913f12c1423ccd17a98f6b6b21b55db641877374d",
]);
const FORBIDDEN_COMMAND_PATTERNS = [
  /\bgit\s+push\b/iu,
  /\bgh\s+(?:api|release|workflow)\b/iu,
  /\b(?:docker|podman|buildah|oras)\s+(?:buildx\s+\S+\s+--push|push)\b/iu,
  /\bskopeo\s+copy\b/iu,
  /\bcrane\s+(?:copy|push)\b/iu,
  /\bcurl\b[^\n]*(?:ghcr\.io|\/v2\/)/iu,
  /\b(?:npm|pnpm)\s+publish\b/iu,
  /\bvp\s+(?:pm\s+)?publish\b/iu,
  /\bvercel(?:@[^\s]+)?\s+(?:deploy|alias)\b/iu,
  /\beas\s+(?:build|submit|update)\b/iu,
  /\bdeploy\s+--stage\b/iu,
  /notify-discord-release/iu,
  /packaging\/aur\/scripts\/release/iu,
] as const;
const GITHUB_API_MUTATION_PATTERN =
  /github\.rest\.[A-Za-z0-9_]+\.(?:add|cancel|create|delete|dismiss|lock|merge|remove|request|set|submit|unlock|update)[A-Za-z0-9_]*/u;

type UnknownRecord = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(message);
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(`${label} must be a mapping.`);
  }
  return value as UnknownRecord;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    return fail(`${label} must be a string.`);
  }
  return value;
}

function parseWorkflow(source: string, workflowFile: string): UnknownRecord {
  try {
    return requireRecord(parse(source), workflowFile);
  } catch (cause) {
    throw new Error(`${workflowFile} is not a valid workflow mapping.`, { cause });
  }
}

function referencesCredentialContext(expression: string): boolean {
  return (
    /\bsecrets\b/iu.test(expression) ||
    (/\bgithub\b/iu.test(expression) && /\btoken\b/iu.test(expression))
  );
}

function credentialExpressions(source: string): ReadonlyArray<string> {
  return [...source.matchAll(/\$\{\{([\s\S]*?)\}\}/gu)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(referencesCredentialContext);
}

function credentialConditions(value: unknown): ReadonlyArray<string> {
  if (Array.isArray(value)) {
    return value.flatMap(credentialConditions);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, nested]) => {
    if (key === "if" && typeof nested === "string" && referencesCredentialContext(nested)) {
      return [nested];
    }
    return credentialConditions(nested);
  });
}

function permissionsEntries(
  value: unknown,
  label: string,
): ReadonlyArray<readonly [string, string]> {
  if (value === undefined) return [];
  if (value === "read-all") return [["*", "read"]];
  if (value === "write-all") return [["*", "write"]];
  const permissions = requireRecord(value, label);
  return Object.entries(permissions).map(([name, permission]) => [
    name,
    requireString(permission, `${label}.${name}`),
  ]);
}

function hasWritePermission(value: unknown, label: string): boolean {
  return permissionsEntries(value, label).some(([, permission]) => permission === "write");
}

function requireExactPermissions(
  value: unknown,
  expected: Readonly<Record<string, string>>,
  label: string,
): void {
  const actual = [...permissionsEntries(value, label)].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const wanted = Object.entries(expected).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} permissions must be exactly ${JSON.stringify(expected)}.`);
  }
}

function requireExplicitReadOnlyPermissions(value: unknown, label: string): void {
  if (value === undefined) {
    fail(`${label} must explicitly declare read-only or empty permissions.`);
  }
  const actual = [...permissionsEntries(value, label)].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const empty: ReadonlyArray<readonly [string, string]> = [];
  const contentsRead: ReadonlyArray<readonly [string, string]> = [["contents", "read"]];
  if (
    JSON.stringify(actual) !== JSON.stringify(empty) &&
    JSON.stringify(actual) !== JSON.stringify(contentsRead)
  ) {
    fail(`${label} must explicitly declare exactly contents read or empty permissions.`);
  }
}

function conditionHasExactOriginGuard(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const condition = value.trim().replace(/^\$\{\{\s*/u, "");
  return /^github\.repository\s*==\s*['"]JerkyTreats\/t3code['"]\s*(?:&&|$)/u.test(condition);
}

function conditionHasExactMainRefGuard(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /\bgithub\.ref\s*==\s*['"]refs\/heads\/main['"]/u.test(value);
}

function conditionIsExactServerImageGuard(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.replaceAll(/\s+/gu, " ").trim() === EXACT_SERVER_IMAGE_JOB_GUARD
  );
}

function workflowTriggers(workflow: UnknownRecord, label: string): UnknownRecord {
  return requireRecord(workflow.on, `${label}.on`);
}

function requireMainPushTrigger(workflow: UnknownRecord, label: string): void {
  const triggers = workflowTriggers(workflow, label);
  const push = requireRecord(triggers.push, `${label}.on.push`);
  const branches = push.branches;
  if (!Array.isArray(branches) || branches.length !== 1 || branches[0] !== "main") {
    fail(`${label} must target only the main branch.`);
  }
}

function assertNoUnauthorizedProductionTrigger(workflow: UnknownRecord, label: string): void {
  const triggers = workflowTriggers(workflow, label);
  const safeTriggers = new Set(["pull_request", "push", "workflow_dispatch"]);
  for (const trigger of Object.keys(triggers)) {
    if (!safeTriggers.has(trigger)) {
      fail(`${label} uses unauthorized privileged trigger ${trigger}.`);
    }
  }
  const push = triggers.push;
  if (push !== undefined && typeof push === "object" && push !== null && !Array.isArray(push)) {
    if ("tags" in push || "tags-ignore" in push) {
      fail(`${label} may not use tag publication triggers.`);
    }
  }
}

function assertCheckoutDoesNotPersistCredentials(step: UnknownRecord, label: string): void {
  if (typeof step.uses !== "string" || !CHECKOUT_ACTIONS.has(step.uses)) return;
  const withOptions = requireRecord(step.with, `${label}.with`);
  if (withOptions["persist-credentials"] !== false) {
    fail(`${label} must set checkout persist-credentials to false.`);
  }
  if ("token" in withOptions) {
    fail(`${label} may not override the checkout token.`);
  }
}

function runSourceDigest(source: string): string {
  return NodeCrypto.createHash("sha256").update(source).digest("hex");
}

function assertReviewedLocalAction(repositoryRoot: string, action: string, label: string): boolean {
  if (action !== SETUP_APT_MIRRORS_ACTION) return false;
  const actionDirectory = NodePath.join(repositoryRoot, ".github", "actions", "setup-apt-mirrors");
  const actionFile = NodePath.join(repositoryRoot, SETUP_APT_MIRRORS_ACTION_FILE);
  const directoryStat = NodeFS.lstatSync(actionDirectory);
  const actionStat = NodeFS.lstatSync(actionFile);
  const entries = NodeFS.readdirSync(actionDirectory).sort();
  if (
    !directoryStat.isDirectory() ||
    directoryStat.isSymbolicLink() ||
    !actionStat.isFile() ||
    actionStat.isSymbolicLink() ||
    JSON.stringify(entries) !== JSON.stringify(["action.yml"]) ||
    runSourceDigest(NodeFS.readFileSync(actionFile, "utf8")) !== SETUP_APT_MIRRORS_ACTION_SHA256
  ) {
    fail(`${label} local action content does not match the reviewed source.`);
  }
  return true;
}

function assertAllowedStep(
  step: UnknownRecord,
  label: string,
  isServerImageWriter: boolean,
  repositoryRoot: string,
): void {
  const hasAction = typeof step.uses === "string";
  const hasCommand = typeof step.run === "string";
  if (hasAction === hasCommand) {
    fail(`${label} must contain exactly one allowlisted action or command.`);
  }

  if (hasAction) {
    const action = step.uses as string;
    if (assertReviewedLocalAction(repositoryRoot, action, label)) {
      if (isServerImageWriter) {
        fail(`${label} may not use a local action in the image publication job.`);
      }
      return;
    }
    const allowed = isServerImageWriter
      ? SERVER_IMAGE_ACTIONS.has(action)
      : ALLOWED_NON_PUBLICATION_ACTIONS.has(action);
    if (!allowed) {
      fail(`${label} uses a workflow action that is not allowlisted: ${action}.`);
    }
    if (action === "reactivecircus/android-emulator-runner@v2") {
      const withOptions = requireRecord(step.with, `${label}.with`);
      if (
        withOptions.script !==
        'pnpm screenshots:mobile --platform android --appearance "${{ inputs.appearance }}" --theme "${{ inputs.theme }}"'
      ) {
        fail(`${label} uses a command-bearing action input that is not allowlisted.`);
      }
    }
    return;
  }

  const command = step.run as string;
  const digest = runSourceDigest(command);
  const isServerImageMutationRun =
    isServerImageWriter && SERVER_IMAGE_MUTATION_RUN_DIGESTS.has(digest);
  const forbiddenCommand = FORBIDDEN_COMMAND_PATTERNS.find((pattern) => pattern.test(command));
  if (forbiddenCommand && !isServerImageMutationRun) {
    fail(`${label} contains an unauthorized publication or deployment command.`);
  }
  if (GITHUB_API_MUTATION_PATTERN.test(command)) {
    fail(`${label} contains an unauthorized GitHub mutation command.`);
  }
  const allowed = command.includes("\n")
    ? READ_ONLY_MULTILINE_RUN_DIGESTS.has(digest) || isServerImageMutationRun
    : READ_ONLY_RUN_SOURCES.has(command);
  if (!allowed) {
    fail(`${label} uses a workflow command that is not allowlisted.`);
  }
}

function assertJobSafety(
  job: UnknownRecord,
  label: string,
  isServerImageWriter: boolean,
  repositoryRoot: string,
): void {
  if (isServerImageWriter) {
    requireExactPermissions(
      job.permissions,
      { contents: "read", packages: "write" },
      `${label}.permissions`,
    );
    if (!conditionIsExactServerImageGuard(job.if)) {
      fail(`${label} has F20 write permission without the exact publication guard.`);
    }
  } else {
    if (hasWritePermission(job.permissions, `${label}.permissions`)) {
      fail(`${label} has write permission outside the sole F20 image authority.`);
    }
    requireExplicitReadOnlyPermissions(job.permissions, `${label}.permissions`);
  }

  if ("uses" in job) {
    const secretDetail = job.secrets === "inherit" ? " with secrets inherit" : "";
    fail(`${label} uses an unauthorized reusable workflow job${secretDetail}.`);
  }

  if (!Array.isArray(job.steps)) return;
  for (const [index, rawStep] of job.steps.entries()) {
    const step = requireRecord(rawStep, `${label}.steps.${index}`);
    const stepLabel = `${label}.steps.${index}`;
    assertCheckoutDoesNotPersistCredentials(step, stepLabel);
    assertAllowedStep(step, stepLabel, isServerImageWriter, repositoryRoot);
  }
}

function assertDesktopValidationWorkflow(workflow: UnknownRecord, workflowFile: string): void {
  const label = workflowFile;
  const triggers = workflowTriggers(workflow, label);
  if (JSON.stringify(Object.keys(triggers).sort()) !== JSON.stringify(["push"])) {
    fail(`${label} must use only the push trigger.`);
  }
  requireMainPushTrigger(workflow, label);
  requireExactPermissions(workflow.permissions, { contents: "read" }, label);

  const jobs = requireRecord(workflow.jobs, `${label}.jobs`);
  const validate = requireRecord(jobs.validate, `${label}.jobs.validate`);
  if (!conditionHasExactOriginGuard(validate.if) || !conditionHasExactMainRefGuard(validate.if)) {
    fail(`${label}.jobs.validate must guard exact origin and exact main ref.`);
  }
  requireExactPermissions(validate.permissions, { contents: "read" }, `${label}.jobs.validate`);

  const source = JSON.stringify(workflow);
  if (/actions\/upload-artifact@/iu.test(source)) {
    fail(`${label} may not upload the validation artifact.`);
  }
  if (/\$\{\{\s*(?:secrets|github\.token)\b/iu.test(source)) {
    fail(`${label} may not consume credentials.`);
  }
}

function assertServerImageWorkflow(workflow: UnknownRecord, workflowFile: string): void {
  const label = workflowFile;
  const triggers = workflowTriggers(workflow, label);
  const triggerNames = Object.keys(triggers).sort();
  if (JSON.stringify(triggerNames) !== JSON.stringify(["push", "workflow_dispatch"])) {
    fail(`${label} triggers must be exactly push and workflow_dispatch.`);
  }
  requireMainPushTrigger(workflow, label);
  requireExactPermissions(workflow.permissions, { contents: "read" }, label);

  const workflowEnvironment = requireRecord(workflow.env, `${label}.env`);
  if (workflowEnvironment.IMAGE_NAME !== EXACT_SERVER_IMAGE) {
    fail(`${label} IMAGE_NAME must be the exact origin container namespace.`);
  }

  const jobs = requireRecord(workflow.jobs, `${label}.jobs`);
  const packageWriters = Object.entries(jobs).filter(([jobName, rawJob]) =>
    hasWritePermission(
      requireRecord(rawJob, `${label}.jobs.${jobName}`).permissions,
      `${label}.jobs.${jobName}.permissions`,
    ),
  );
  if (packageWriters.length !== 1) {
    fail(`${label} must have exactly one write-capable image job.`);
  }
  const [jobName, rawJob] = packageWriters[0] as [string, unknown];
  if (jobName !== "build") {
    fail(`${label} package publication authority must remain in the exact build job.`);
  }
  const imageJob = requireRecord(rawJob, `${label}.jobs.${jobName}`);
  if (!conditionIsExactServerImageGuard(imageJob.if)) {
    fail(`${label}.jobs.${jobName} must use the exact origin, main-ref, and event guard.`);
  }
  requireExactPermissions(
    imageJob.permissions,
    { contents: "read", packages: "write" },
    `${label}.jobs.${jobName}`,
  );

  const imageSteps = imageJob.steps;
  if (!Array.isArray(imageSteps)) {
    fail(`${label}.jobs.${jobName} must expose explicit image publication steps.`);
  }
  const mutationSteps = imageSteps.map((rawStep, index) =>
    requireRecord(rawStep, `${label}.jobs.${jobName}.steps.${index}`),
  );
  const loginSteps = mutationSteps.filter((step) => step.uses === SERVER_IMAGE_LOGIN_ACTION);
  const promotionSteps = mutationSteps.filter(
    (step) =>
      typeof step.run === "string" &&
      SERVER_IMAGE_MUTATION_RUN_DIGESTS.has(runSourceDigest(step.run)),
  );
  if (loginSteps.length !== 1 || promotionSteps.length !== 1) {
    fail(
      `${label} must contain one exact registry login and one exact artifact promotion command.`,
    );
  }
  const loginInputs = requireRecord(loginSteps[0]?.with, `${label} registry login inputs`);
  if (
    loginInputs.registry !== "ghcr.io" ||
    loginInputs.username !== "${{ github.actor }}" ||
    loginInputs.password !== "${{ secrets.GITHUB_TOKEN }}"
  ) {
    fail(`${label} registry login must use only the exact GHCR GitHub token authority.`);
  }
  const credentials = [
    ...credentialExpressions(JSON.stringify(workflow)),
    ...credentialConditions(workflow),
  ];
  if (credentials.length !== 1 || credentials[0] !== "secrets.GITHUB_TOKEN") {
    fail(`${label} must consume the approved GitHub token exactly once.`);
  }
}

export function assertReleaseWorkflowSafety(repositoryRoot: string): void {
  const workflowDirectory = NodePath.join(repositoryRoot, ".github", "workflows");
  const workflowFiles = NodeFS.readdirSync(workflowDirectory)
    .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
    .sort();

  for (const workflowFile of workflowFiles) {
    const source = NodeFS.readFileSync(NodePath.join(workflowDirectory, workflowFile), "utf8");
    const workflow = parseWorkflow(source, workflowFile);
    const isServerImageWorkflow = workflowFile === SERVER_IMAGE_WORKFLOW;

    if (UPSTREAM_TARGET_PATTERN.test(source)) {
      fail(`${workflowFile} contains the forbidden upstream repository target.`);
    }
    if (DYNAMIC_CONTAINER_NAMESPACE_PATTERN.test(source)) {
      fail(`${workflowFile} contains a dynamic container namespace.`);
    }
    if (hasWritePermission(workflow.permissions, `${workflowFile}.permissions`)) {
      fail(`${workflowFile} may not grant write permission at workflow scope.`);
    }
    requireExplicitReadOnlyPermissions(workflow.permissions, `${workflowFile}.permissions`);
    if (!isServerImageWorkflow) {
      assertNoUnauthorizedProductionTrigger(workflow, workflowFile);
    }
    if (
      !isServerImageWorkflow &&
      (credentialExpressions(source).length > 0 || credentialConditions(workflow).length > 0)
    ) {
      fail(`${workflowFile} may not consume repository or implicit GitHub credentials.`);
    }

    const jobs = requireRecord(workflow.jobs, `${workflowFile}.jobs`);
    for (const [jobName, rawJob] of Object.entries(jobs)) {
      assertJobSafety(
        requireRecord(rawJob, `${workflowFile}.jobs.${jobName}`),
        `${workflowFile}.jobs.${jobName}`,
        isServerImageWorkflow && jobName === "build",
        repositoryRoot,
      );
    }

    if (workflowFile === DESKTOP_VALIDATION_WORKFLOW) {
      assertDesktopValidationWorkflow(workflow, workflowFile);
    }
    if (isServerImageWorkflow) {
      assertServerImageWorkflow(workflow, workflowFile);
    }
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  NodeURL.pathToFileURL(NodePath.resolve(invokedPath)).href === import.meta.url
) {
  const repositoryRoot = NodePath.resolve(
    NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
    "..",
    "..",
  );
  assertReleaseWorkflowSafety(repositoryRoot);
}
