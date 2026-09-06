// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalTimers:off globalConsole:off globalDate:off -- Standalone Docker smoke owns host process, UTC labels, readiness, signal, artifact, and cleanup lifecycles.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const MAX_CAPTURE_BYTES = 64_000;
const DEFAULT_READINESS_ATTEMPTS = 120;
const DEFAULT_READINESS_INTERVAL_MS = 500;
const COMMAND_ABORT_GRACE_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 5_000;

export const SERVER_IMAGE_PLATFORM = "linux/amd64";
export const SERVER_IMAGE_DOCKERFILE = "docker/t3code-server.Dockerfile";
export const SERVER_IMAGE_SOURCE = "https://github.com/JerkyTreats/t3code";
export const CODEX_CLI_VERSION = "0.147.0";
export const SKOPEO_IMAGE =
  "quay.io/skopeo/stable@sha256:8d25aabcf965e267b6a6ad02ff8da5512f77de1490063625093ff564797e88bc";
export const SBOM_GENERATOR_IMAGE =
  "docker.io/docker/buildkit-syft-scanner@sha256:79e7b013cbec16bbb436f312819a49a4a57752b2270c1a9332ae1a10fcc82a68";

type SmokeSignal = "SIGINT" | "SIGTERM";

export interface SmokeCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SmokeCommandRunner {
  readonly run: (
    command: string,
    args: ReadonlyArray<string>,
    options: {
      readonly cwd: string;
      readonly inherit?: boolean;
      readonly signal?: AbortSignal | undefined;
    },
  ) => Promise<SmokeCommandResult>;
}

export interface ServerImageSmokeDependencies {
  readonly commandRunner: SmokeCommandRunner;
  readonly fetchReady: (url: string, signal?: AbortSignal | undefined) => Promise<boolean>;
  readonly sleep: (milliseconds: number, signal?: AbortSignal | undefined) => Promise<void>;
  readonly now: () => Date;
}

export interface ServerImageSmokeOptions {
  readonly repositoryRoot?: string;
  readonly resourceSuffix?: string;
  readonly readinessAttempts?: number;
  readonly readinessIntervalMs?: number;
  readonly artifactDirectory?: string;
  readonly retainArtifact?: boolean;
  readonly signal?: AbortSignal | undefined;
  readonly revision?: string;
  readonly buildTag?: string;
}

export interface ServerImageSmokeResult {
  readonly archivePath: string;
  readonly buildTag: string;
  readonly created: string;
  readonly digest: string;
}

export interface SmokeSignalSource {
  readonly add: (signal: SmokeSignal, handler: () => void) => void;
  readonly remove: (signal: SmokeSignal, handler: () => void) => void;
}

export class ServerImageSmokeInterruptedError extends Error {
  readonly signal: SmokeSignal;

  constructor(signal: SmokeSignal) {
    super(`Server image smoke interrupted by ${signal} after bounded cleanup.`);
    this.name = "ServerImageSmokeInterruptedError";
    this.signal = signal;
  }
}

function appendBounded(current: string, chunk: Uint8Array | string): string {
  return `${current}${chunk.toString()}`.slice(-MAX_CAPTURE_BYTES);
}

export const defaultSmokeCommandRunner: SmokeCommandRunner = {
  run: (command, args, options) =>
    new Promise((resolve, reject) => {
      const inherit = options.inherit === true;
      const child = NodeChildProcess.spawn(command, [...args], {
        cwd: options.cwd,
        shell: false,
        stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let abortTimer: NodeJS.Timeout | undefined;

      const removeAbortListener = () => {
        options.signal?.removeEventListener("abort", handleAbort);
        if (abortTimer !== undefined) clearTimeout(abortTimer);
      };
      const handleAbort = () => {
        child.kill("SIGTERM");
        abortTimer = setTimeout(() => child.kill("SIGKILL"), COMMAND_ABORT_GRACE_MS);
        abortTimer.unref();
      };

      if (!inherit) {
        child.stdout?.on("data", (chunk: Uint8Array) => {
          stdout = appendBounded(stdout, chunk);
        });
        child.stderr?.on("data", (chunk: Uint8Array) => {
          stderr = appendBounded(stderr, chunk);
        });
      }
      child.once("error", (error) => {
        removeAbortListener();
        reject(error);
      });
      child.once("close", (exitCode) => {
        removeAbortListener();
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });
      if (options.signal?.aborted) {
        handleAbort();
      } else {
        options.signal?.addEventListener("abort", handleAbort, { once: true });
      }
    }),
};

function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    const handleAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Server image smoke aborted."));
    };
    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

const defaultDependencies: ServerImageSmokeDependencies = {
  commandRunner: defaultSmokeCommandRunner,
  fetchReady: async (url, signal) => {
    try {
      const timeout = AbortSignal.timeout(2_000);
      const response = await fetch(url, {
        signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
      });
      return response.ok;
    } catch {
      return false;
    }
  },
  sleep: abortableSleep,
  now: () => new Date(),
};

const processSignalSource: SmokeSignalSource = {
  add: (signal, handler) => process.on(signal, handler),
  remove: (signal, handler) => process.off(signal, handler),
};

function validateResourceSuffix(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{7,47}$/u.test(value)) {
    throw new Error("Server image smoke resource suffix is invalid.");
  }
  return value;
}

function validateRevision(value: string): string {
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error("Server image smoke revision must be a full lowercase Git commit.");
  }
  return value;
}

function validateBuildTag(value: string): string {
  if (!/^[a-z0-9][a-z0-9.-]{7,127}$/u.test(value)) {
    throw new Error("Server image smoke build tag is invalid.");
  }
  return value;
}

function commandDescription(command: string, args: ReadonlyArray<string>): string {
  return [command, ...args.slice(0, 3)].join(" ");
}

async function runRequired(
  dependencies: ServerImageSmokeDependencies,
  repositoryRoot: string,
  command: string,
  args: ReadonlyArray<string>,
  options: {
    readonly inherit?: boolean;
    readonly signal?: AbortSignal | undefined;
  } = {},
): Promise<SmokeCommandResult> {
  const result = await dependencies.commandRunner.run(command, args, {
    cwd: repositoryRoot,
    ...options,
  });
  if (result.exitCode !== 0) {
    throw new Error(`Server image smoke command failed: ${commandDescription(command, args)}.`);
  }
  return result;
}

async function assertResourceAbsent(
  dependencies: ServerImageSmokeDependencies,
  repositoryRoot: string,
  kind: "container" | "image" | "volume",
  name: string,
  signal?: AbortSignal,
): Promise<void> {
  const result = await dependencies.commandRunner.run("docker", [kind, "inspect", name], {
    cwd: repositoryRoot,
    signal,
  });
  if (result.exitCode === 0) {
    throw new Error(`Server image smoke refused a pre-existing ${kind} resource.`);
  }
}

async function assertPathAbsent(path: string): Promise<void> {
  try {
    await NodeFSP.stat(path);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error("Server image smoke refused a pre-existing candidate archive.");
}

function parseImageUser(stdout: string): string {
  let decoded: unknown;
  try {
    decoded = JSON.parse(stdout.trim());
  } catch (cause) {
    throw new Error("Server image smoke could not decode the configured runtime user.", { cause });
  }
  if (typeof decoded !== "string") {
    throw new Error("Server image smoke found an invalid configured runtime user.");
  }
  const normalized = decoded.trim().toLowerCase();
  if (normalized.length === 0 || /^(?:root|0+)(?::|$)/u.test(normalized)) {
    throw new Error("Server image runtime user must be explicitly non-root.");
  }
  return normalized;
}

function parseDigest(stdout: string): string {
  const digest = stdout.trim();
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new Error("Server image smoke could not resolve the exact candidate digest.");
  }
  return digest;
}

function parsePublishedPort(stdout: string): number {
  const matches = [...stdout.matchAll(/127\.0\.0\.1:(\d+)/gu)];
  if (matches.length !== 1) {
    throw new Error("Server image smoke could not resolve the loopback test port.");
  }
  const port = Number(matches[0]?.[1]);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("Server image smoke resolved an invalid loopback test port.");
  }
  return port;
}

async function waitForReadiness(
  dependencies: ServerImageSmokeDependencies,
  url: string,
  attempts: number,
  intervalMs: number,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    signal?.throwIfAborted();
    if (await dependencies.fetchReady(url, signal)) return;
    if (attempt + 1 < attempts) {
      await dependencies.sleep(intervalMs, signal);
    }
  }
  throw new Error("Server image did not become ready within the bounded smoke window.");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Server image smoke failed.";
}

async function readGitRevision(
  dependencies: ServerImageSmokeDependencies,
  repositoryRoot: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await runRequired(dependencies, repositoryRoot, "git", ["rev-parse", "HEAD"], {
    signal,
  });
  return validateRevision(result.stdout.trim());
}

export async function runServerImageSmoke(
  options: ServerImageSmokeOptions = {},
  dependencies: ServerImageSmokeDependencies = defaultDependencies,
): Promise<ServerImageSmokeResult> {
  const repositoryRoot =
    options.repositoryRoot ??
    NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
  const suffix = validateResourceSuffix(
    options.resourceSuffix ?? NodeCrypto.randomUUID().replaceAll("-", ""),
  );
  const readinessAttempts = options.readinessAttempts ?? DEFAULT_READINESS_ATTEMPTS;
  const readinessIntervalMs = options.readinessIntervalMs ?? DEFAULT_READINESS_INTERVAL_MS;
  if (!Number.isInteger(readinessAttempts) || readinessAttempts <= 0) {
    throw new Error("Server image smoke readiness attempts must be a positive integer.");
  }
  if (!Number.isInteger(readinessIntervalMs) || readinessIntervalMs < 0) {
    throw new Error("Server image smoke readiness interval must be a non-negative integer.");
  }

  const ownsArtifactDirectory = options.artifactDirectory === undefined;
  const artifactDirectory =
    options.artifactDirectory ??
    (await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-server-image-")));
  if (!NodePath.isAbsolute(artifactDirectory)) {
    throw new Error("Server image smoke artifact directory must be absolute.");
  }
  const archivePath = NodePath.join(artifactDirectory, `t3code-server-${suffix}.oci.tar`);
  const imageName = `t3code-server-smoke:${suffix}`;
  const containerName = `t3code-server-smoke-${suffix}`;
  const inspectContainerName = `${containerName}-inspect`;
  const importContainerName = `${containerName}-import`;
  const dataVolume = `t3code-server-data-${suffix}`;
  const workspaceVolume = `t3code-server-workspace-${suffix}`;
  const created = dependencies
    .now()
    .toISOString()
    .replace(/\.\d{3}Z$/u, "Z");
  const revision = validateRevision(
    options.revision ??
      process.env.GITHUB_SHA ??
      (await readGitRevision(dependencies, repositoryRoot, options.signal)),
  );
  const buildTag = validateBuildTag(options.buildTag ?? `smoke-${suffix}`);
  let resourcesReserved = false;
  let imageLoaded = false;
  let containerCreated = false;
  const createdVolumes: string[] = [];
  let primaryError: unknown;
  let digest = "";

  try {
    await Promise.all([
      assertResourceAbsent(dependencies, repositoryRoot, "image", imageName, options.signal),
      assertResourceAbsent(
        dependencies,
        repositoryRoot,
        "container",
        containerName,
        options.signal,
      ),
      assertResourceAbsent(
        dependencies,
        repositoryRoot,
        "container",
        inspectContainerName,
        options.signal,
      ),
      assertResourceAbsent(
        dependencies,
        repositoryRoot,
        "container",
        importContainerName,
        options.signal,
      ),
      assertResourceAbsent(dependencies, repositoryRoot, "volume", dataVolume, options.signal),
      assertResourceAbsent(dependencies, repositoryRoot, "volume", workspaceVolume, options.signal),
      assertPathAbsent(archivePath),
    ]);
    resourcesReserved = true;

    await runRequired(
      dependencies,
      repositoryRoot,
      "docker",
      [
        "buildx",
        "build",
        "--platform",
        SERVER_IMAGE_PLATFORM,
        "--file",
        SERVER_IMAGE_DOCKERFILE,
        "--tag",
        imageName,
        "--label",
        `org.opencontainers.image.created=${created}`,
        "--label",
        `org.opencontainers.image.revision=${revision}`,
        "--label",
        `org.opencontainers.image.source=${SERVER_IMAGE_SOURCE}`,
        "--label",
        `org.opencontainers.image.version=${buildTag}`,
        "--output",
        `type=oci,dest=${archivePath}`,
        "--attest",
        `type=sbom,generator=${SBOM_GENERATOR_IMAGE}`,
        "--attest",
        "type=provenance,mode=max",
        ".",
      ],
      { inherit: true, signal: options.signal },
    );

    const digestResult = await runRequired(
      dependencies,
      repositoryRoot,
      "docker",
      [
        "run",
        "--rm",
        "--name",
        inspectContainerName,
        "--platform",
        SERVER_IMAGE_PLATFORM,
        "--volume",
        `${archivePath}:/candidate.oci:ro`,
        SKOPEO_IMAGE,
        "inspect",
        "--format",
        "{{.Digest}}",
        "oci-archive:/candidate.oci",
      ],
      { signal: options.signal },
    );
    digest = parseDigest(digestResult.stdout);

    await runRequired(
      dependencies,
      repositoryRoot,
      "docker",
      [
        "run",
        "--rm",
        "--name",
        importContainerName,
        "--platform",
        SERVER_IMAGE_PLATFORM,
        "--volume",
        "/var/run/docker.sock:/var/run/docker.sock",
        "--volume",
        `${archivePath}:/candidate.oci:ro`,
        SKOPEO_IMAGE,
        "copy",
        "oci-archive:/candidate.oci",
        `docker-daemon:${imageName}`,
      ],
      { signal: options.signal },
    );
    imageLoaded = true;

    const userResult = await runRequired(
      dependencies,
      repositoryRoot,
      "docker",
      ["image", "inspect", "--format", "{{json .Config.User}}", imageName],
      { signal: options.signal },
    );
    parseImageUser(userResult.stdout);

    for (const volumeName of [dataVolume, workspaceVolume]) {
      await runRequired(
        dependencies,
        repositoryRoot,
        "docker",
        ["volume", "create", "--label", `t3code.server-image-smoke=${suffix}`, volumeName],
        { signal: options.signal },
      );
      createdVolumes.push(volumeName);
    }

    await runRequired(
      dependencies,
      repositoryRoot,
      "docker",
      [
        "run",
        "--detach",
        "--name",
        containerName,
        "--label",
        `t3code.server-image-smoke=${suffix}`,
        "--read-only",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,noexec,size=64m",
        "--mount",
        `type=volume,src=${dataVolume},dst=/data`,
        "--mount",
        `type=volume,src=${workspaceVolume},dst=/workspace`,
        "--publish",
        "127.0.0.1::3773",
        imageName,
      ],
      { signal: options.signal },
    );
    containerCreated = true;

    const portResult = await runRequired(
      dependencies,
      repositoryRoot,
      "docker",
      ["port", containerName, "3773/tcp"],
      { signal: options.signal },
    );
    const port = parsePublishedPort(portResult.stdout);
    await waitForReadiness(
      dependencies,
      `http://127.0.0.1:${port}/`,
      readinessAttempts,
      readinessIntervalMs,
      options.signal,
    );

    await runRequired(
      dependencies,
      repositoryRoot,
      "docker",
      [
        "exec",
        containerName,
        "sh",
        "-ceu",
        [
          'test "$(id -u)" -ne 0',
          'test "$CODEX_HOME" = /data/codex',
          'test "$(command -v codex)" = /usr/local/bin/codex',
          `test "$(codex --version)" = "codex-cli ${CODEX_CLI_VERSION}"`,
          "test -f /data/userdata/state.sqlite",
          "touch /data/codex/.t3-server-image-codex-smoke",
          "touch /data/userdata/.t3-server-image-smoke",
          "touch /workspace/.t3-server-image-smoke",
          "rm /data/codex/.t3-server-image-codex-smoke /data/userdata/.t3-server-image-smoke /workspace/.t3-server-image-smoke",
        ].join("\n"),
      ],
      { signal: options.signal },
    );
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors: unknown[] = [];
  const cleanup = async (args: ReadonlyArray<string>, required: boolean) => {
    try {
      const result = await dependencies.commandRunner.run("docker", args, {
        cwd: repositoryRoot,
        signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
      });
      if (required && result.exitCode !== 0) {
        cleanupErrors.push(new Error(`Cleanup failed: ${commandDescription("docker", args)}.`));
      }
    } catch (error) {
      if (required) cleanupErrors.push(error);
    }
  };

  if (resourcesReserved) {
    await cleanup(["rm", "--force", inspectContainerName], false);
    await cleanup(["rm", "--force", importContainerName], false);
    await cleanup(["rm", "--force", containerName], containerCreated);
    for (const volumeName of [workspaceVolume, dataVolume]) {
      await cleanup(["volume", "rm", "--force", volumeName], createdVolumes.includes(volumeName));
    }
    await cleanup(["image", "rm", "--force", imageName], imageLoaded);
  }

  const keepArtifact = primaryError === undefined && options.retainArtifact === true;
  if (!keepArtifact) {
    try {
      await NodeFSP.unlink(archivePath);
    } catch (error) {
      if (
        !(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      ) {
        cleanupErrors.push(error);
      }
    }
  }
  if (ownsArtifactDirectory) {
    try {
      await NodeFSP.rmdir(artifactDirectory);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (primaryError !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new Error(
        `${errorMessage(primaryError)} Cleanup also failed for ${cleanupErrors.length} resource actions.`,
        { cause: primaryError },
      );
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new Error(
      `Server image smoke cleanup failed for ${cleanupErrors.length} resource actions.`,
    );
  }

  return { archivePath, buildTag, created, digest };
}

export async function runServerImageSmokeWithSignals(
  options: ServerImageSmokeOptions = {},
  dependencies: ServerImageSmokeDependencies = defaultDependencies,
  signalSource: SmokeSignalSource = processSignalSource,
): Promise<ServerImageSmokeResult> {
  const controller = new AbortController();
  let interruptedBy: SmokeSignal | undefined;
  const handlers = new Map<SmokeSignal, () => void>();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handler = () => {
      if (interruptedBy !== undefined) return;
      interruptedBy = signal;
      controller.abort(new ServerImageSmokeInterruptedError(signal));
    };
    handlers.set(signal, handler);
    signalSource.add(signal, handler);
  }

  try {
    const result = await runServerImageSmoke(
      {
        ...options,
        signal:
          options.signal === undefined
            ? controller.signal
            : AbortSignal.any([options.signal, controller.signal]),
      },
      dependencies,
    );
    if (interruptedBy !== undefined) throw new ServerImageSmokeInterruptedError(interruptedBy);
    return result;
  } catch (error) {
    if (interruptedBy !== undefined) throw new ServerImageSmokeInterruptedError(interruptedBy);
    throw error;
  } finally {
    for (const [signal, handler] of handlers) signalSource.remove(signal, handler);
  }
}

async function appendWorkflowOutputs(result: ServerImageSmokeResult): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath === undefined || !NodePath.isAbsolute(outputPath)) {
    throw new Error("Server image smoke requires an absolute GITHUB_OUTPUT in GitHub Actions.");
  }
  await NodeFSP.appendFile(
    outputPath,
    `archive_path=${result.archivePath}\nbuild_tag=${result.buildTag}\ncreated=${result.created}\ndigest=${result.digest}\n`,
    "utf8",
  );
}

if (import.meta.main) {
  if (process.argv.length !== 2) {
    throw new Error("Server image smoke does not accept publication or target arguments.");
  }
  const inGitHubActions = process.env.GITHUB_ACTIONS === "true";
  const runnerTemp = process.env.RUNNER_TEMP;
  if (inGitHubActions && (runnerTemp === undefined || !NodePath.isAbsolute(runnerTemp))) {
    throw new Error("Server image smoke requires an absolute RUNNER_TEMP in GitHub Actions.");
  }
  const artifactDirectory = inGitHubActions ? runnerTemp : undefined;
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
  const buildTag =
    inGitHubActions && runId !== undefined && runAttempt !== undefined
      ? validateBuildTag(`build-${runId}-${runAttempt}`)
      : undefined;

  try {
    const result =
      artifactDirectory === undefined
        ? await runServerImageSmokeWithSignals()
        : await runServerImageSmokeWithSignals({
            artifactDirectory,
            retainArtifact: true,
            ...(buildTag === undefined ? {} : { buildTag }),
          });
    if (inGitHubActions) await appendWorkflowOutputs(result);
    console.log(
      `Server image artifact ${result.digest} passed the non-root runtime and Codex provider smoke.`,
    );
  } catch (error) {
    if (error instanceof ServerImageSmokeInterruptedError) {
      console.error(error.message);
      process.exitCode = error.signal === "SIGINT" ? 130 : 143;
    } else {
      throw error;
    }
  }
}
