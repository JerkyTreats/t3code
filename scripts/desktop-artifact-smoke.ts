#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
// @effect-diagnostics globalConsole:off
import { spawn } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCT_DESKTOP_ARTIFACT_SMOKE_MARKERS } from "@t3tools/shared/productIdentity";

const DEFAULT_STARTUP_TIMEOUT_MS = 90_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 20_000;
const MAX_CAPTURED_OUTPUT_BYTES = 2 * 1024 * 1024;
const APPIMAGE_SUFFIX = ".AppImage";

export const DESKTOP_ARTIFACT_SMOKE_MARKERS = PRODUCT_DESKTOP_ARTIFACT_SMOKE_MARKERS;

export interface DesktopArtifactSmokeOptions {
  readonly appImagePath: string;
  readonly startupTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly keepTemporaryDirectory?: boolean;
}

export interface DesktopArtifactSmokeResult {
  readonly appImagePath: string;
  readonly extractedRoot: string;
  readonly temporaryRoot: string;
  readonly output: string;
}

interface ProcessResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly output: string;
}

interface RunningProcess {
  readonly wait: Promise<ProcessResult>;
  readonly terminate: (gracePeriodMs?: number) => void;
  readonly forceTerminate: () => void;
}

interface LinuxProcessIdentity {
  readonly pid: number;
  readonly parentPid: number;
  readonly processGroupId: number;
}

function readLinuxProcessIdentities(): ReadonlyArray<LinuxProcessIdentity> {
  const identities: LinuxProcessIdentity[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/u.test(entry)) continue;
    try {
      const pid = Number(entry);
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      const commandEnd = stat.lastIndexOf(")");
      if (commandEnd < 0) continue;
      const fields = stat.slice(commandEnd + 2).split(" ");
      const parentPid = Number(fields[1]);
      const processGroupId = Number(fields[2]);
      if (
        Number.isSafeInteger(pid) &&
        Number.isSafeInteger(parentPid) &&
        Number.isSafeInteger(processGroupId)
      ) {
        identities.push({ pid, parentPid, processGroupId });
      }
    } catch {
      // Processes can exit between listing /proc and reading their stat file.
    }
  }
  return identities;
}

function captureDescendantProcessGroups(
  rootPid: number | undefined,
  capturedGroups: Set<number>,
): void {
  if (rootPid === undefined) return;
  const identities = readLinuxProcessIdentities();
  const descendantPids = new Set([rootPid]);
  let discovered = true;
  while (discovered) {
    discovered = false;
    for (const identity of identities) {
      if (!descendantPids.has(identity.parentPid) || descendantPids.has(identity.pid)) continue;
      descendantPids.add(identity.pid);
      discovered = true;
    }
  }
  for (const identity of identities) {
    if (descendantPids.has(identity.pid) && identity.processGroupId > 1) {
      capturedGroups.add(identity.processGroupId);
    }
  }
  capturedGroups.add(rootPid);
}

function positiveBoundedInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function parseDesktopArtifactSmokeArgs(
  argv: ReadonlyArray<string>,
): DesktopArtifactSmokeOptions {
  let appImagePath: string | undefined;
  let startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS;
  let shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS;
  let keepTemporaryDirectory = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--appimage") {
      appImagePath = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--startup-timeout-ms") {
      startupTimeoutMs = positiveBoundedInteger(argv[index + 1] ?? "", "--startup-timeout-ms");
      index += 1;
      continue;
    }
    if (argument === "--shutdown-timeout-ms") {
      shutdownTimeoutMs = positiveBoundedInteger(argv[index + 1] ?? "", "--shutdown-timeout-ms");
      index += 1;
      continue;
    }
    if (argument === "--keep-temp") {
      keepTemporaryDirectory = true;
      continue;
    }
    if (argument?.startsWith("-")) {
      throw new Error(`Unknown option ${argument}.`);
    }
    if (appImagePath !== undefined) {
      throw new Error("Only one AppImage path may be provided.");
    }
    appImagePath = argument;
  }

  if (!appImagePath) {
    throw new Error(
      "An AppImage path is required. Pass it as a positional argument or with --appimage.",
    );
  }

  return {
    appImagePath,
    startupTimeoutMs,
    shutdownTimeoutMs,
    keepTemporaryDirectory,
  };
}

export function validateAppImagePath(inputPath: string): string {
  const absolutePath = resolve(inputPath);
  if (!basename(absolutePath).endsWith(APPIMAGE_SUFFIX)) {
    throw new Error(`Desktop artifact must end with ${APPIMAGE_SUFFIX}.`);
  }

  const metadata = statSync(absolutePath);
  if (!metadata.isFile()) {
    throw new Error(`Desktop artifact is not a file: ${absolutePath}`);
  }
  accessSync(absolutePath, constants.R_OK | constants.X_OK);
  return realpathSync(absolutePath);
}

export function assertContainedPath(parentPath: string, candidatePath: string): string {
  const parent = realpathSync(parentPath);
  const candidate = realpathSync(candidatePath);
  const relativePath = relative(parent, candidate);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Expected ${candidate} to be contained below ${parent}.`);
  }
  return candidate;
}

function startProcess(input: {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
  readonly onOutput?: (output: string) => void;
}): RunningProcess {
  const child = spawn(input.command, [...input.args], {
    cwd: input.cwd,
    detached: true,
    env: input.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  let outputBytes = 0;
  let settled = false;
  let timedOut = false;
  let outputOverflow = false;
  let forceKill: NodeJS.Timeout | undefined;
  const capturedProcessGroups = new Set<number>();
  const captureProcessGroups = () =>
    captureDescendantProcessGroups(child.pid, capturedProcessGroups);
  captureProcessGroups();
  const descendantCapture = setInterval(captureProcessGroups, 50);
  descendantCapture.unref();
  const signalCapturedProcessGroups = (signal: NodeJS.Signals) => {
    captureProcessGroups();
    for (const processGroupId of capturedProcessGroups) {
      try {
        process.kill(-processGroupId, signal);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "ESRCH") {
          throw cause;
        }
      }
    }
  };

  const appendOutput = (chunk: Buffer) => {
    outputBytes += chunk.byteLength;
    if (outputBytes > MAX_CAPTURED_OUTPUT_BYTES) {
      outputOverflow = true;
      signalCapturedProcessGroups("SIGTERM");
      return;
    }
    const text = chunk.toString();
    output += text;
    captureProcessGroups();
    input.onOutput?.(output);
  };

  child.stdout?.on("data", appendOutput);
  child.stderr?.on("data", appendOutput);

  const timeout = setTimeout(() => {
    timedOut = true;
    signalCapturedProcessGroups("SIGTERM");
    forceKill = setTimeout(() => {
      signalCapturedProcessGroups("SIGKILL");
    }, 5_000);
  }, input.timeoutMs);

  const wait = new Promise<ProcessResult>((resolvePromise, rejectPromise) => {
    child.once("error", (cause) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(descendantCapture);
      captureProcessGroups();
      if (forceKill) clearTimeout(forceKill);
      rejectPromise(cause);
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(descendantCapture);
      captureProcessGroups();
      if (forceKill) clearTimeout(forceKill);
      if (outputOverflow) {
        rejectPromise(
          new Error(`Process output exceeded ${MAX_CAPTURED_OUTPUT_BYTES} bytes.\n${output}`),
        );
        return;
      }
      if (timedOut) {
        rejectPromise(
          new Error(`Process timed out after ${input.timeoutMs} milliseconds.\n${output}`),
        );
        return;
      }
      resolvePromise({ code, signal, output });
    });
  });

  return {
    wait,
    terminate: (gracePeriodMs = 5_000) => {
      child.kill("SIGTERM");
      if (!forceKill) {
        forceKill = setTimeout(() => {
          signalCapturedProcessGroups("SIGKILL");
        }, gracePeriodMs);
      }
    },
    forceTerminate: () => {
      signalCapturedProcessGroups("SIGKILL");
    },
  };
}

function requireSuccessfulExit(result: ProcessResult, label: string): void {
  if (result.code !== 0) {
    const exitDescription =
      result.code === null ? `signal ${result.signal ?? "unknown"}` : `exit code ${result.code}`;
    throw new Error(`${label} failed with ${exitDescription}.\n${result.output}`);
  }
}

export function makeIsolatedDesktopEnvironment(
  temporaryRoot: string,
  _sourceEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    PATH: "/usr/bin:/bin",
    LANG: "C.UTF-8",
    NO_PROXY: "127.0.0.1,localhost",
    TMPDIR: join(temporaryRoot, "tmp"),
    XDG_CACHE_HOME: join(temporaryRoot, "xdg-cache"),
    XDG_CONFIG_HOME: join(temporaryRoot, "xdg-config"),
    XDG_DATA_HOME: join(temporaryRoot, "xdg-data"),
    XDG_STATE_HOME: join(temporaryRoot, "xdg-state"),
    T3CODE_HOME: join(temporaryRoot, "t3-home"),
    T3CODE_NO_BROWSER: "1",
    T3CODE_DISABLE_AUTO_UPDATE: "1",
    T3CODE_TELEMETRY_ENABLED: "0",
    ELECTRON_ENABLE_LOGGING: "1",
  };
}

export async function runDesktopArtifactSmoke(
  options: DesktopArtifactSmokeOptions,
): Promise<DesktopArtifactSmokeResult> {
  if (process.platform !== "linux") {
    throw new Error("Desktop AppImage smoke is supported only on Linux.");
  }

  const appImagePath = validateAppImagePath(options.appImagePath);
  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const temporaryRoot = mkdtempSync(join(tmpdir(), "t3code-desktop-artifact-smoke-"));
  const extractionWorkspace = join(temporaryRoot, "extract");
  const extractedRoot = join(extractionWorkspace, "squashfs-root");
  const userDataDirectory = join(temporaryRoot, "user-data");
  const temporaryDirectory = join(temporaryRoot, "tmp");
  let extractionProcess: RunningProcess | undefined;
  let applicationProcess: RunningProcess | undefined;

  try {
    mkdirSync(extractionWorkspace, { recursive: true });
    mkdirSync(userDataDirectory, { recursive: true });
    mkdirSync(temporaryDirectory, { recursive: true });
    assertContainedPath(temporaryRoot, userDataDirectory);
    const isolatedEnvironment = makeIsolatedDesktopEnvironment(temporaryRoot);
    chmodSync(appImagePath, statSync(appImagePath).mode | 0o100);
    const extraction = startProcess({
      command: appImagePath,
      args: ["--appimage-extract"],
      cwd: extractionWorkspace,
      env: isolatedEnvironment,
      timeoutMs: startupTimeoutMs,
    });
    extractionProcess = extraction;
    const extractionResult = await extraction.wait;
    extraction.forceTerminate();
    extractionProcess = undefined;
    requireSuccessfulExit(extractionResult, "AppImage extraction");

    if (!existsSync(extractedRoot)) {
      throw new Error(`AppImage extraction did not create ${extractedRoot}.`);
    }
    assertContainedPath(extractionWorkspace, extractedRoot);

    const appRunPath = join(extractedRoot, "AppRun");
    accessSync(appRunPath, constants.R_OK | constants.X_OK);
    assertContainedPath(extractedRoot, appRunPath);

    let observedOutput = "";
    let backendListening = false;
    let rendererReady = false;
    let resolveMarkers: (() => void) | undefined;
    const markerPromise = new Promise<void>((resolvePromise) => {
      resolveMarkers = resolvePromise;
    });

    const app = startProcess({
      command: appRunPath,
      args: [
        "--no-sandbox",
        "--headless=new",
        "--ozone-platform=headless",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        `--user-data-dir=${userDataDirectory}`,
      ],
      cwd: extractedRoot,
      env: isolatedEnvironment,
      timeoutMs: startupTimeoutMs + shutdownTimeoutMs,
      onOutput: (output) => {
        observedOutput = output;
        const backendMarkerIndex = output.indexOf(DESKTOP_ARTIFACT_SMOKE_MARKERS.backendListening);
        const rendererMarkerIndex = output.indexOf(DESKTOP_ARTIFACT_SMOKE_MARKERS.rendererReady);
        backendListening ||= backendMarkerIndex >= 0;
        rendererReady ||= backendMarkerIndex >= 0 && rendererMarkerIndex > backendMarkerIndex;
        if (backendListening && rendererReady) {
          resolveMarkers?.();
        }
      },
    });
    applicationProcess = app;
    const appResultPromise = app.wait;
    let startupTimer: NodeJS.Timeout | undefined;
    const startupTimeout = new Promise<"timeout">((resolvePromise) => {
      startupTimer = setTimeout(() => resolvePromise("timeout"), startupTimeoutMs);
    });
    const startupOutcome = await Promise.race([
      markerPromise.then(() => "ready" as const),
      appResultPromise.then(() => "exited" as const),
      startupTimeout,
    ]).finally(() => {
      if (startupTimer) clearTimeout(startupTimer);
    });

    if (startupOutcome === "exited") {
      const result = await appResultPromise;
      app.forceTerminate();
      applicationProcess = undefined;
      requireSuccessfulExit(result, "Packaged desktop");
      throw new Error(
        `Packaged desktop exited before required markers were observed.\n${result.output}`,
      );
    }
    if (startupOutcome === "timeout") {
      app.terminate(shutdownTimeoutMs);
      await appResultPromise.catch(() => undefined);
      app.forceTerminate();
      applicationProcess = undefined;
      throw new Error(
        `Packaged desktop did not emit required markers within ${startupTimeoutMs} milliseconds.\n${observedOutput}`,
      );
    }

    app.terminate(shutdownTimeoutMs);
    const appResult = await appResultPromise;
    app.forceTerminate();
    applicationProcess = undefined;
    requireSuccessfulExit(appResult, "Packaged desktop shutdown");

    return {
      appImagePath,
      extractedRoot,
      temporaryRoot,
      output: observedOutput,
    };
  } finally {
    applicationProcess?.forceTerminate();
    extractionProcess?.forceTerminate();
    if (!options.keepTemporaryDirectory) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
}

async function main(): Promise<void> {
  const options = parseDesktopArtifactSmokeArgs(process.argv.slice(2));
  const result = await runDesktopArtifactSmoke(options);
  console.log(`Desktop artifact smoke passed for ${result.appImagePath}.`);
  if (options.keepTemporaryDirectory) {
    console.log(`Temporary smoke directory kept at ${result.temporaryRoot}.`);
  }
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  main().catch((cause: unknown) => {
    const message = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
    console.error(message);
    process.exitCode = 1;
  });
}
