// @effect-diagnostics nodeBuiltinImport:off globalConsole:off -- Standalone workflow policy scanner reports directly to the host shell.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { parse } from "yaml";

export const SERVER_IMAGE_WORKFLOW_PATH = ".github/workflows/build-t3code-server-image.yml";
export const SERVER_IMAGE_DOCKERFILE_PATH = "docker/t3code-server.Dockerfile";
export const SERVER_IMAGE_DOCKERIGNORE_PATH = ".dockerignore";
export const SERVER_IMAGE_REPOSITORY = "JerkyTreats/t3code";
export const SERVER_IMAGE_NAME = "ghcr.io/jerkytreats/t3code-server";
export const CHECKOUT_ACTION = "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803";
export const SETUP_NODE_ACTION = "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38";
export const SETUP_BUILDX_ACTION =
  "docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c";
export const LOGIN_ACTION = "docker/login-action@dbcb813823bdd20940b903addbd779551569679f";
export const SCANNER_DEPENDENCY_BOOTSTRAP =
  "corepack pnpm install --frozen-lockfile --ignore-scripts --filter @t3tools/scripts";

const NODE_BASE =
  "node:24-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848";
const EXPECTED_JOB_GUARD = [
  "github.repository == 'JerkyTreats/t3code'",
  "github.ref == 'refs/heads/main'",
  "(github.event_name == 'push' || github.event_name == 'workflow_dispatch')",
].join(" && ");

const REQUIRED_PUSH_PATHS = [
  ".dockerignore",
  ".github/workflows/build-t3code-server-image.yml",
  "apps/server/**",
  "apps/web/**",
  "assets/**",
  "docker/t3code-server.Dockerfile",
  "package.json",
  "packages/**",
  "patches/**",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/**",
  "tsconfig.base.json",
  "vite.config.ts",
] as const;

const REQUIRED_DOCKERIGNORE_ENTRIES = [
  "**/.agents",
  "**/.alchemy",
  "**/.bun",
  "**/.cache",
  "**/.claude",
  "**/.codex",
  "**/.cursor",
  "**/.electron-runtime",
  "**/.env",
  "**/.env.*",
  "**/.gstack",
  "**/.idea",
  "**/.ledger",
  "**/.macroscope",
  "**/.npmrc",
  "**/.plans",
  "**/.pnpmrc",
  "**/.repos",
  "**/.t3",
  "**/.tanstack",
  "**/.turbo",
  "**/.vercel",
  "**/.vite-plus",
  "**/.vitest-*",
  "**/.vscode",
  "**/.git",
  "**/dist",
  "**/node_modules",
  "apps/server/userdata",
] as const;

const REQUIRED_EXCLUDED_DOCKER_CONTEXT_PATHS = [
  "apps/web/.codex/instructions.md",
  "apps/web/.env.local",
  "packages/example/.npmrc",
  "apps/server/.t3/userdata/example",
] as const;

const REQUIRED_INCLUDED_DOCKER_CONTEXT_PATHS = [
  "package.json",
  "pnpm-workspace.yaml",
  "apps/server/src/bin.ts",
  "apps/web/package.json",
  "docker/t3code-server.Dockerfile",
  "packages/shared/src/git.ts",
  "pnpm-lock.yaml",
  "scripts/server-image-smoke.ts",
] as const;

const EXPECTED_PROMOTION_SOURCE = `set -euo pipefail

archive="\${{ steps.candidate.outputs.archive_path }}"
candidate_digest="\${{ steps.candidate.outputs.digest }}"
build_tag="\${{ steps.candidate.outputs.build_tag }}"
skopeo_image="quay.io/skopeo/stable@sha256:8d25aabcf965e267b6a6ad02ff8da5512f77de1490063625093ff564797e88bc"
skopeo=(
  docker run --rm
  --platform linux/amd64
  --volume "\${archive}:/candidate.oci:ro"
  --volume "\${HOME}/.docker/config.json:/auth.json:ro"
  "\${skopeo_image}"
)

inspect_remote() {
  local target="$1"
  local error_file="\${RUNNER_TEMP}/t3code-skopeo-inspect-\${target##*:}.err"
  local remote_digest
  if remote_digest="$("\${skopeo[@]}" inspect --authfile /auth.json --format '{{.Digest}}' "docker://\${target}" 2>"\${error_file}")"; then
    unlink "\${error_file}"
    printf '%s\\n' "\${remote_digest}"
    return 0
  fi
  if grep -Eq 'manifest unknown|name unknown' "\${error_file}"; then
    unlink "\${error_file}"
    return 1
  fi
  head -c 4096 "\${error_file}" >&2
  unlink "\${error_file}"
  return 2
}

verify_remote() {
  local target="$1"
  local remote_digest
  remote_digest="$(inspect_remote "\${target}")"
  if test "\${remote_digest}" != "\${candidate_digest}"; then
    echo "Published digest mismatch for \${target}." >&2
    exit 1
  fi
}

promote_immutable() {
  local target="$1"
  local remote_digest
  local inspect_status
  if remote_digest="$(inspect_remote "\${target}")"; then
    if test "\${remote_digest}" != "\${candidate_digest}"; then
      echo "Refusing to overwrite divergent immutable tag \${target}." >&2
      exit 1
    fi
    return 0
  else
    inspect_status=$?
  fi
  if test "\${inspect_status}" -ne 1; then
    exit "\${inspect_status}"
  fi
  "\${skopeo[@]}" copy --all --preserve-digests --dest-authfile /auth.json \\
    oci-archive:/candidate.oci "docker://\${target}"
  verify_remote "\${target}"
}

promote_immutable "\${IMAGE_NAME}:\${build_tag}"
promote_immutable "\${IMAGE_NAME}:sha-\${GITHUB_SHA}"
"\${skopeo[@]}" copy --all --preserve-digests --dest-authfile /auth.json \\
  oci-archive:/candidate.oci "docker://\${IMAGE_NAME}:main"
verify_remote "\${IMAGE_NAME}:main"
`;

const EXPECTED_DOCKERFILE_INSTRUCTIONS = [
  `FROM ${NODE_BASE} AS build`,
  "ENV PNPM_HOME=/pnpm",
  'ENV PATH="${PNPM_HOME}:${PATH}"',
  "WORKDIR /app",
  "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates=20250419~deb12u1 g++=4:12.2.0-3 git=1:2.39.5-0+deb12u3 make=4.3-4.1 python3=3.11.2-1+b1 && rm -rf /var/lib/apt/lists/* && corepack enable",
  "COPY . .",
  "RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile",
  "RUN pnpm exec vp run --filter t3 build",
  "RUN pnpm deploy --filter t3 --prod --legacy /out && cp -R apps/server/dist /out/dist",
  `FROM ${NODE_BASE} AS runtime`,
  "ENV NODE_ENV=production",
  "ENV T3CODE_HOST=0.0.0.0",
  "ENV T3CODE_PORT=3773",
  "ENV T3CODE_NO_BROWSER=1",
  "ENV T3CODE_HOME=/data",
  "ENV CODEX_HOME=/data/codex",
  "ENV TMPDIR=/tmp",
  "WORKDIR /app",
  "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates=20250419~deb12u1 git=1:2.39.5-0+deb12u3 openssh-client=1:9.2p1-2+deb12u10 && rm -rf /var/lib/apt/lists/* && mkdir -p /data/codex /workspace && chown -R node:node /data /workspace",
  "COPY --from=build --chown=node:node /out/ ./",
  "ADD --checksum=sha256:d28b4fd4bd9f07ea71083d0cc40c579595cebbd4c10bc8ca98a6d385432e7255 https://registry.npmjs.org/@openai/codex/-/codex-0.147.0.tgz /tmp/codex.tgz",
  "ADD --checksum=sha256:c969740cf8297e4c31905cd551efeb2c99af5080c12c236bdf825598b250139a https://registry.npmjs.org/@openai/codex/-/codex-0.147.0-linux-x64.tgz /tmp/codex-linux-x64.tgz",
  'RUN mkdir -p /opt/codex/node_modules/@openai/codex /opt/codex/node_modules/@openai/codex-linux-x64 && tar -xzf /tmp/codex.tgz --strip-components=1 -C /opt/codex/node_modules/@openai/codex && tar -xzf /tmp/codex-linux-x64.tgz --strip-components=1 -C /opt/codex/node_modules/@openai/codex-linux-x64 && ln -s /opt/codex/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex && test "$(codex --version)" = "codex-cli 0.147.0" && rm /tmp/codex.tgz /tmp/codex-linux-x64.tgz',
  "USER node",
  "EXPOSE 3773",
  'VOLUME ["/data", "/workspace"]',
  'CMD ["node", "dist/bin.mjs", "serve", "--host", "0.0.0.0", "--port", "3773", "--base-dir", "/data", "/workspace"]',
] as const;

type UnknownRecord = Record<string, unknown>;

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a mapping.`);
  }
  return value as UnknownRecord;
}

function requireArray(value: unknown, label: string): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) throw new Error(`${label} must be a sequence.`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function requireExactKeys(
  value: unknown,
  expectedKeys: ReadonlyArray<string>,
  label: string,
): void {
  const actualKeys = Object.keys(requireRecord(value, label)).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expected)) {
    throw new Error(`${label} must contain exactly the approved keys.`);
  }
}

function requireExactPermissions(
  value: unknown,
  expected: Readonly<Record<string, string>>,
  label: string,
): void {
  const actualEntries = Object.entries(requireRecord(value, label)).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`${label} permissions do not match the required least-privilege grant.`);
  }
}

function requireStringArray(value: unknown, label: string): ReadonlyArray<string> {
  return requireArray(value, label).map((entry, index) =>
    requireString(entry, `${label} entry ${index}`),
  );
}

function normalizeExpression(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim();
}

function parseWorkflow(source: string): UnknownRecord {
  try {
    return requireRecord(parse(source), "Server image workflow");
  } catch (cause) {
    throw new Error("Server image workflow is not valid YAML.", { cause });
  }
}

function requireExactStep(
  steps: ReadonlyArray<unknown>,
  index: number,
  expected: UnknownRecord,
): UnknownRecord {
  const step = requireRecord(steps[index], `Server image build step ${index}`);
  requireExactKeys(step, Object.keys(expected), `Server image build step ${index}`);
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === "object" && value !== null) continue;
    if (step[key] !== value) {
      throw new Error(`Server image build step ${index} must use the exact approved ${key}.`);
    }
  }
  return step;
}

export function assertServerImageWorkflowSource(source: string): void {
  const workflow = parseWorkflow(source);
  requireExactKeys(
    workflow,
    ["concurrency", "env", "jobs", "name", "on", "permissions"],
    "Server image workflow",
  );
  if (workflow.name !== "Build T3 Code Server Image") {
    throw new Error("Server image workflow name must remain exact.");
  }
  requireExactKeys(workflow.on, ["push", "workflow_dispatch"], "Server image triggers");
  const triggers = requireRecord(workflow.on, "Server image triggers");
  const dispatch = triggers.workflow_dispatch;
  if (
    dispatch !== null &&
    !(
      typeof dispatch === "object" &&
      dispatch !== null &&
      !Array.isArray(dispatch) &&
      Object.keys(dispatch).length === 0
    )
  ) {
    throw new Error("Server image manual dispatch must not accept inputs.");
  }
  const push = requireRecord(triggers.push, "Server image push trigger");
  requireExactKeys(push, ["branches", "paths"], "Server image push trigger");
  if (JSON.stringify(requireStringArray(push.branches, "Server image branches")) !== '["main"]') {
    throw new Error("Server image workflow must push from exact main only.");
  }
  if (
    JSON.stringify(requireStringArray(push.paths, "Server image paths")) !==
    JSON.stringify(REQUIRED_PUSH_PATHS)
  ) {
    throw new Error("Server image workflow paths must be the exact build input set.");
  }
  requireExactPermissions(workflow.permissions, { contents: "read" }, "Server image workflow");

  const concurrency = requireRecord(workflow.concurrency, "Server image concurrency");
  requireExactKeys(concurrency, ["cancel-in-progress", "group"], "Server image concurrency");
  if (
    concurrency.group !== "t3code-server-image-main" ||
    concurrency["cancel-in-progress"] !== false
  ) {
    throw new Error("Server image workflow must serialize exact main promotion.");
  }

  const environment = requireRecord(workflow.env, "Server image environment");
  requireExactKeys(environment, ["IMAGE_NAME"], "Server image environment");
  if (environment.IMAGE_NAME !== SERVER_IMAGE_NAME) {
    throw new Error(`Server image namespace must be exactly ${SERVER_IMAGE_NAME}.`);
  }

  const jobs = requireRecord(workflow.jobs, "Server image jobs");
  requireExactKeys(jobs, ["build"], "Server image jobs");
  const job = requireRecord(jobs.build, "Server image build job");
  requireExactKeys(
    job,
    ["if", "name", "permissions", "runs-on", "steps", "timeout-minutes"],
    "Server image build job",
  );
  if (
    job.name !== "Build, verify, and publish server image" ||
    job["runs-on"] !== "ubuntu-24.04" ||
    job["timeout-minutes"] !== 60
  ) {
    throw new Error("Server image build job must use the exact bounded runner contract.");
  }
  if (
    normalizeExpression(requireString(job.if, "Server image build guard")) !== EXPECTED_JOB_GUARD
  ) {
    throw new Error("Server image build job must use the exact origin and main-ref guard.");
  }
  requireExactPermissions(
    job.permissions,
    { contents: "read", packages: "write" },
    "Server image build job",
  );

  const steps = requireArray(job.steps, "Server image build steps");
  if (steps.length !== 9) {
    throw new Error("Server image workflow must contain exactly nine approved steps.");
  }
  const checkout = requireExactStep(steps, 0, {
    name: "Checkout",
    uses: CHECKOUT_ACTION,
    with: {},
  });
  const checkoutWith = requireRecord(checkout.with, "Server image checkout inputs");
  requireExactKeys(checkoutWith, ["persist-credentials"], "Server image checkout inputs");
  if (checkoutWith["persist-credentials"] !== false) {
    throw new Error("Server image checkout must disable persisted credentials.");
  }
  const setupNode = requireExactStep(steps, 1, {
    name: "Set up pinned Node.js",
    uses: SETUP_NODE_ACTION,
    with: {},
  });
  const setupNodeWith = requireRecord(setupNode.with, "Server image Node setup inputs");
  requireExactKeys(setupNodeWith, ["node-version-file"], "Server image Node setup inputs");
  if (setupNodeWith["node-version-file"] !== "package.json") {
    throw new Error("Server image Node setup must use the repository engine contract.");
  }
  requireExactStep(steps, 2, {
    name: "Install scanner dependencies without lifecycle scripts",
    run: SCANNER_DEPENDENCY_BOOTSTRAP,
  });
  requireExactStep(steps, 3, {
    name: "Verify global release authority",
    run: "node scripts/lib/release-workflow-safety.ts",
  });
  requireExactStep(steps, 4, {
    name: "Verify image publication policy",
    run: "node scripts/lib/server-image-workflow-safety.ts",
  });
  requireExactStep(steps, 5, {
    name: "Set up Docker Buildx",
    uses: SETUP_BUILDX_ACTION,
  });
  requireExactStep(steps, 6, {
    name: "Build and smoke exact candidate artifact",
    id: "candidate",
    run: "node scripts/server-image-smoke.ts",
  });
  const login = requireExactStep(steps, 7, {
    name: "Log in to GHCR",
    uses: LOGIN_ACTION,
    with: {},
  });
  const loginWith = requireRecord(login.with, "Server image login inputs");
  requireExactKeys(loginWith, ["password", "registry", "username"], "Server image login inputs");
  if (
    loginWith.registry !== "ghcr.io" ||
    loginWith.username !== "${{ github.actor }}" ||
    loginWith.password !== "${{ secrets.GITHUB_TOKEN }}"
  ) {
    throw new Error("Server image login must use only the exact GHCR GitHub token authority.");
  }
  requireExactStep(steps, 8, {
    name: "Promote verified candidate without rebuilding",
    shell: "bash",
    run: EXPECTED_PROMOTION_SOURCE,
  });
}

function parseDockerfileInstructions(source: string): ReadonlyArray<string> {
  const instructions: string[] = [];
  let pending = "";
  for (const rawLine of source.replaceAll("\r\n", "\n").split("\n")) {
    const trimmed = rawLine.trim();
    if (pending.length === 0 && (trimmed.length === 0 || trimmed.startsWith("#"))) continue;
    if (trimmed.includes("<<")) {
      throw new Error("Server image Dockerfile must not use heredoc instructions.");
    }
    if (trimmed.endsWith("\\")) {
      pending += `${trimmed.slice(0, -1).trim()} `;
      continue;
    }
    const instruction = `${pending}${trimmed}`.replaceAll(/\s+/gu, " ").trim();
    pending = "";
    if (!/^[A-Z]+\s/u.test(instruction)) {
      throw new Error("Server image Dockerfile contains an invalid instruction.");
    }
    instructions.push(instruction);
  }
  if (pending.length > 0) {
    throw new Error("Server image Dockerfile has an unterminated continuation.");
  }
  return instructions;
}

export function assertServerImageDockerfileSource(source: string): void {
  const instructions = parseDockerfileInstructions(source);
  if (JSON.stringify(instructions) !== JSON.stringify(EXPECTED_DOCKERFILE_INSTRUCTIONS)) {
    throw new Error(
      "Server image Dockerfile instructions must exactly match the pinned build and runtime contract.",
    );
  }
}

function normalizeDockerContextPath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .replace(/^\.\//u, "")
    .replaceAll(/\/{2,}/gu, "/");
}

function assertSupportedDockerignoreEntry(entry: string): void {
  const segments = entry.split("/");
  if (
    entry.startsWith("/") ||
    entry.endsWith("/") ||
    entry.includes("\\") ||
    entry.includes("?") ||
    entry.includes("[") ||
    entry.includes("]") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsupported Docker ignore pattern ${entry}.`);
  }
}

function dockerBasenamePatternMatches(pattern: string, basename: string): boolean {
  const wildcardCount = pattern.split("*").length - 1;
  if (wildcardCount === 0) return basename === pattern;
  if (wildcardCount !== 1) {
    throw new Error(`Unsupported Docker ignore basename pattern ${pattern}.`);
  }
  if (pattern === "*") return true;
  if (pattern.startsWith("*")) return basename.endsWith(pattern.slice(1));
  if (pattern.endsWith("*")) return basename.startsWith(pattern.slice(0, -1));
  throw new Error(`Unsupported Docker ignore basename pattern ${pattern}.`);
}

function dockerignoreEntryExcludesPath(entry: string, path: string): boolean {
  assertSupportedDockerignoreEntry(entry);
  const normalizedEntry = entry;
  const normalizedPath = normalizeDockerContextPath(path).replace(/\/$/u, "");
  if (normalizedEntry.startsWith("**/")) {
    const basenamePattern = normalizedEntry.slice(3);
    if (basenamePattern.includes("/")) {
      throw new Error(`Unsupported recursive Docker ignore pattern ${entry}.`);
    }
    return normalizedPath
      .split("/")
      .some((segment) => dockerBasenamePatternMatches(basenamePattern, segment));
  }
  if (!normalizedEntry.includes("/")) {
    return dockerBasenamePatternMatches(normalizedEntry, normalizedPath.split("/")[0] ?? "");
  }
  if (normalizedEntry.includes("*")) {
    throw new Error(`Unsupported Docker ignore pattern ${entry}.`);
  }
  return normalizedPath === normalizedEntry || normalizedPath.startsWith(`${normalizedEntry}/`);
}

export function assertServerImageDockerignoreSource(source: string): void {
  const entries = source
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith("#"));
  if (entries.some((entry) => entry.startsWith("!"))) {
    throw new Error("Server image Docker ignore must not contain negation rules.");
  }

  // Keep the executable proof to the Docker pattern forms used by this file so unsupported pattern
  // syntax fails closed instead of growing a second general-purpose Docker ignore engine.
  for (const entry of entries) dockerignoreEntryExcludesPath(entry, "package.json");
  for (const protectedPath of REQUIRED_EXCLUDED_DOCKER_CONTEXT_PATHS) {
    if (!entries.some((entry) => dockerignoreEntryExcludesPath(entry, protectedPath))) {
      throw new Error(`Server image Docker ignore must exclude ${protectedPath}.`);
    }
  }
  for (const requiredPath of REQUIRED_INCLUDED_DOCKER_CONTEXT_PATHS) {
    if (entries.some((entry) => dockerignoreEntryExcludesPath(entry, requiredPath))) {
      throw new Error(`Server image Docker ignore must include ${requiredPath}.`);
    }
  }
  const entrySet = new Set(entries);
  for (const requiredEntry of REQUIRED_DOCKERIGNORE_ENTRIES) {
    if (!entrySet.has(requiredEntry)) {
      throw new Error(`Server image Docker ignore is missing ${requiredEntry}.`);
    }
  }
}

export function assertServerImagePublicationSafety(repositoryRoot: string): void {
  const workflowSource = NodeFS.readFileSync(
    NodePath.join(repositoryRoot, SERVER_IMAGE_WORKFLOW_PATH),
    "utf8",
  );
  const dockerfileSource = NodeFS.readFileSync(
    NodePath.join(repositoryRoot, SERVER_IMAGE_DOCKERFILE_PATH),
    "utf8",
  );
  const dockerignoreSource = NodeFS.readFileSync(
    NodePath.join(repositoryRoot, SERVER_IMAGE_DOCKERIGNORE_PATH),
    "utf8",
  );

  assertServerImageWorkflowSource(workflowSource);
  assertServerImageDockerfileSource(dockerfileSource);
  assertServerImageDockerignoreSource(dockerignoreSource);
}

if (import.meta.main) {
  const repositoryRoot = NodePath.resolve(
    NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
    "..",
    "..",
  );
  assertServerImagePublicationSafety(repositoryRoot);
  console.log("Server image workflow safety passed.");
}
