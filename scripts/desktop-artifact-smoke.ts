#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalTimers:off globalDate:off globalConsole:off -- Standalone release smoke owns bounded child process cleanup.

import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { extractFile } from "@electron/asar";
import { parse as parseYaml } from "yaml";

import {
  OFFICIAL_DESKTOP_PRODUCT_APP_ID,
  OFFICIAL_DESKTOP_UPDATER_REPOSITORY,
  readAndVerifyLinuxDesktopReleaseDescriptor,
  type LinuxDesktopReleaseDescriptor,
} from "./linux-desktop-release-artifact.ts";

// @ts-expect-error -- Standalone installer is intentionally shipped as plain Node ESM.
const installerModulePromise = import("./install-linux-desktop.mjs");
// @ts-expect-error -- Standalone launcher is intentionally shipped as plain Node ESM.
const launcherModulePromise = import("./linux-desktop-launcher.mjs");

export interface TrackedChild {
  readonly child: NodeChildProcess.ChildProcess;
  readonly pid: number;
  readonly startTicks: number;
}

const TRACKED_PROCESS_SUPERVISOR = ['kill -STOP "$$"', 'exec "$@"'].join("\n");

export function verifyExtractedDesktopIdentity(input: {
  readonly packageJson: unknown;
  readonly updateConfig: unknown;
  readonly descriptor: LinuxDesktopReleaseDescriptor;
}): void {
  const packageJson = input.packageJson as Record<string, unknown> | null;
  if (
    packageJson?.name !== "t3code" ||
    packageJson.version !== input.descriptor.version ||
    packageJson.buildVersion !== input.descriptor.version ||
    packageJson.t3codeCommitHash !== input.descriptor.commitHash
  ) {
    throw new Error("Extracted desktop package identity does not match the release descriptor.");
  }
  const updateConfig = input.updateConfig as Record<string, unknown> | null;
  const repository = `${String(updateConfig?.owner ?? "")}/${String(updateConfig?.repo ?? "")}`;
  if (updateConfig?.provider !== "github" || repository !== OFFICIAL_DESKTOP_UPDATER_REPOSITORY) {
    throw new Error("Extracted desktop updater identity is not the exact official repository.");
  }
}

async function readProcessIdentity(
  pid: number,
): Promise<{ readonly state: string; readonly startTicks: number }> {
  const stat = await NodeFSP.readFile(`/proc/${pid}/stat`, "utf8");
  const { parseLinuxProcessStartTicks } = await launcherModulePromise;
  const ticks = parseLinuxProcessStartTicks(stat);
  if (ticks === null) throw new Error("Could not capture the desktop smoke process identity.");
  const commandEnd = stat.lastIndexOf(")");
  const state =
    commandEnd < 0
      ? undefined
      : stat
          .slice(commandEnd + 1)
          .trim()
          .split(/\s+/, 1)[0];
  if (!state) throw new Error("Could not capture the desktop smoke process state.");
  return { state, startTicks: ticks };
}

async function readProcessStartTicks(pid: number): Promise<number> {
  return (await readProcessIdentity(pid)).startTicks;
}

async function waitForStoppedProcessIdentity(
  child: NodeChildProcess.ChildProcess,
  pid: number,
): Promise<number> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const identity = await readProcessIdentity(pid);
    if (identity.state === "T" || identity.state === "t") return identity.startTicks;
    if (child.exitCode !== null || child.signalCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Desktop smoke process did not stop at its identity gate.");
}

export async function spawnTracked(
  command: string,
  args: ReadonlyArray<string>,
  options: NodeChildProcess.SpawnOptions,
): Promise<TrackedChild> {
  // Stop the detached group leader before exec so even an immediate command exit cannot race the
  // Linux start-time read. Exec preserves both the PID and process-group identity captured here.
  const child = NodeChildProcess.spawn(
    "/bin/sh",
    ["-c", TRACKED_PROCESS_SUPERVISOR, "desktop-artifact-smoke", command, ...args],
    {
      ...options,
      detached: true,
      shell: false,
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  if (child.pid === undefined) throw new Error("Desktop smoke process did not start.");
  let startTicks: number;
  try {
    startTicks = await waitForStoppedProcessIdentity(child, child.pid);
    process.kill(child.pid, "SIGCONT");
  } catch (error) {
    child.kill("SIGKILL");
    await waitForExit(child, 1_000);
    throw error;
  }
  return { child, pid: child.pid, startTicks };
}

type LeaderIdentity = "gone" | "matches" | "reused";

async function inspectLeaderIdentity(tracked: TrackedChild): Promise<LeaderIdentity> {
  try {
    const currentStartTicks = await readProcessStartTicks(tracked.pid);
    return currentStartTicks === tracked.startTicks ? "matches" : "reused";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ESRCH") return "gone";
    throw error;
  }
}

async function trackedProcessGroupExists(tracked: TrackedChild): Promise<boolean> {
  const leaderIdentity = await inspectLeaderIdentity(tracked);
  if (leaderIdentity === "reused") return false;
  return processGroupExists(tracked.pid);
}

export async function waitForExit(
  child: NodeChildProcess.ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

export function processGroupExists(groupId: number): boolean {
  try {
    process.kill(-groupId, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function waitForProcessGroupExit(tracked: TrackedChild, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await trackedProcessGroupExists(tracked))) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !(await trackedProcessGroupExists(tracked));
}

export async function stopTrackedProcess(tracked: TrackedChild): Promise<void> {
  if (!(await trackedProcessGroupExists(tracked))) return;
  try {
    process.kill(-tracked.pid, "SIGTERM");
  } catch {}
  if (await waitForProcessGroupExit(tracked, 5_000)) return;
  if (!(await trackedProcessGroupExists(tracked))) return;
  try {
    process.kill(-tracked.pid, "SIGKILL");
  } catch {}
  if (!(await waitForProcessGroupExit(tracked, 3_000))) {
    throw new Error("Desktop smoke process did not exit within the cleanup bound.");
  }
}

async function collectCleanupFailures(
  tasks: ReadonlyArray<() => Promise<void>>,
): Promise<ReadonlyArray<unknown>> {
  const results = await Promise.allSettled(tasks.map((task) => task()));
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}

export async function settleCleanupTasks(tasks: ReadonlyArray<() => Promise<void>>): Promise<void> {
  const failures = await collectCleanupFailures(tasks);
  if (failures.length > 0) {
    throw new AggregateError(failures, "Desktop artifact smoke cleanup failed.");
  }
}

export async function runExtraction(
  artifactPath: string,
  extractionRoot: string,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const extractionProcess = await spawnTracked(artifactPath, ["--appimage-extract"], {
    cwd: extractionRoot,
    env: environment,
  });
  let extractedRoot: string | undefined;
  let operationFailure: { readonly error: unknown } | undefined;
  try {
    const exited = await waitForExit(extractionProcess.child, 30_000);
    if (!exited) throw new Error("AppImage extraction exceeded the smoke timeout.");
    if (extractionProcess.child.exitCode !== 0) throw new Error("AppImage extraction failed.");
    extractedRoot = NodePath.join(extractionRoot, "squashfs-root");
    const stat = await NodeFSP.lstat(extractedRoot).catch(() => null);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("AppImage extraction did not produce a physical application root.");
    }
  } catch (error) {
    operationFailure = { error };
  }
  const cleanupFailures = await collectCleanupFailures([
    () => stopTrackedProcess(extractionProcess),
  ]);
  if (operationFailure && cleanupFailures.length > 0) {
    const operationMessage =
      operationFailure.error instanceof Error
        ? operationFailure.error.message
        : "AppImage extraction failed.";
    throw new AggregateError([operationFailure.error, ...cleanupFailures], operationMessage, {
      cause: operationFailure.error,
    });
  }
  if (operationFailure) throw operationFailure.error;
  if (cleanupFailures.length > 0) {
    throw new AggregateError(cleanupFailures, "AppImage extraction cleanup failed.");
  }
  if (!extractedRoot) throw new Error("AppImage extraction did not resolve its application root.");
  return extractedRoot;
}

async function findOptionalExecutable(
  name: string,
  pathValue: string | undefined,
): Promise<string | undefined> {
  for (const directory of pathValue?.split(NodePath.delimiter) ?? []) {
    if (!directory) continue;
    const candidate = NodePath.join(directory, name);
    const usable = await NodeFSP.access(candidate, NodeFS.constants.X_OK)
      .then(() => true)
      .catch(() => false);
    if (usable) return candidate;
  }
  return undefined;
}

async function findExecutable(name: string, pathValue: string | undefined): Promise<string> {
  const executable = await findOptionalExecutable(name, pathValue);
  if (executable) return executable;
  throw new Error(`Desktop artifact smoke requires ${name} for isolated launch.`);
}

async function startVirtualDisplay(input: {
  readonly executable: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly cwd: string;
}): Promise<{ readonly display: string; readonly process: TrackedChild }> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const displayNumber = 100 + NodeCrypto.randomInt(800);
    const socketPath = `/tmp/.X11-unix/X${displayNumber}`;
    if (
      await NodeFSP.lstat(socketPath)
        .then(() => true)
        .catch(() => false)
    )
      continue;
    const tracked = await spawnTracked(
      input.executable,
      [`:${displayNumber}`, "-screen", "0", "1280x800x24", "-nolisten", "tcp", "-noreset"],
      { cwd: input.cwd, env: input.environment },
    );
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      if (tracked.child.exitCode !== null || tracked.child.signalCode !== null) break;
      if (
        await NodeFSP.lstat(socketPath)
          .then(() => true)
          .catch(() => false)
      ) {
        return { display: `:${displayNumber}`, process: tracked };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await stopTrackedProcess(tracked);
  }
  throw new Error("Desktop artifact smoke could not start an isolated virtual display.");
}

export function gamescopeHeadlessArgs(input: {
  readonly dbusRunSessionExecutable: string;
  readonly appRunPath: string;
  readonly generation: string;
  readonly userDataDirectory: string;
}): ReadonlyArray<string> {
  return [
    "--backend",
    "headless",
    "--xwayland-count",
    "1",
    "--expose-wayland",
    "-W",
    "1280",
    "-H",
    "800",
    "--",
    input.dbusRunSessionExecutable,
    "--",
    input.appRunPath,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${input.userDataDirectory}`,
    `--t3code-launcher-handoff=${input.generation}`,
  ];
}

export function gamescopeHeadlessEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const privateEnvironment = { ...environment };
  delete privateEnvironment.DISPLAY;
  delete privateEnvironment.WAYLAND_DISPLAY;
  return privateEnvironment;
}

async function verifyPrivateRuntimeDirectory(runtimeDirectory: string): Promise<void> {
  const stat = await NodeFSP.lstat(runtimeDirectory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o777) !== 0o700 ||
    stat.uid !== process.getuid?.()
  ) {
    throw new Error("Desktop artifact smoke requires a private mode-0700 runtime directory.");
  }
}

async function waitForExactReadiness(input: {
  readonly readinessPath: string;
  readonly expected: Record<string, unknown>;
  readonly child: NodeChildProcess.ChildProcess;
  readonly timeoutMs: number;
  readonly matchesReadiness: (value: unknown, expected: Record<string, unknown>) => boolean;
}): Promise<void> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    if (input.child.exitCode !== null || input.child.signalCode !== null) {
      throw new Error("Desktop artifact exited before publishing F16 readiness.");
    }
    const readiness = await NodeFSP.readFile(input.readinessPath, "utf8")
      .then((raw) => JSON.parse(raw) as unknown)
      .catch(() => null);
    if (input.matchesReadiness(readiness, input.expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Desktop artifact did not publish exact F16 readiness before the timeout.");
}

export async function runDesktopArtifactSmoke(input: {
  readonly artifactPath: string;
  readonly descriptorPath: string;
  readonly readinessTimeoutMs?: number;
}): Promise<void> {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone release smoke has no Effect runtime.
  if (process.platform !== "linux") throw new Error("Desktop artifact smoke requires Linux.");
  const descriptor = await readAndVerifyLinuxDesktopReleaseDescriptor(input);
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone release smoke has no Effect runtime.
  if (descriptor.architecture !== NodeOS.arch()) {
    throw new Error("Desktop artifact architecture does not match the smoke host.");
  }
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-desktop-artifact-smoke-"));
  let desktopProcess: TrackedChild | undefined;
  let displayProcess: TrackedChild | undefined;
  let operationFailure: { readonly error: unknown } | undefined;
  try {
    const { installLinuxDesktop, resolveInstallPaths } = await installerModulePromise;
    const { matchesReadiness, readAndValidateArtifactManifest } = await launcherModulePromise;
    const extractionRoot = NodePath.join(root, "extract");
    const extractionHome = NodePath.join(root, "extract-home");
    const extractionTemp = NodePath.join(root, "extract-tmp");
    await Promise.all([
      NodeFSP.mkdir(extractionRoot, { mode: 0o700 }),
      NodeFSP.mkdir(extractionHome, { mode: 0o700 }),
      NodeFSP.mkdir(extractionTemp, { mode: 0o700 }),
    ]);
    const extractedRoot = await runExtraction(input.artifactPath, extractionRoot, {
      PATH: process.env.PATH,
      LANG: process.env.LANG ?? "C.UTF-8",
      HOME: extractionHome,
      TMPDIR: extractionTemp,
    });
    const resourcesRoot = NodePath.join(extractedRoot, "resources");
    const packageJson = JSON.parse(
      extractFile(NodePath.join(resourcesRoot, "app.asar"), "package.json").toString("utf8"),
    ) as unknown;
    const updateConfig = parseYaml(
      await NodeFSP.readFile(NodePath.join(resourcesRoot, "app-update.yml"), "utf8"),
    ) as unknown;
    verifyExtractedDesktopIdentity({ packageJson, updateConfig, descriptor });

    const home = NodePath.join(root, "home");
    const environment = {
      HOME: home,
      XDG_DATA_HOME: NodePath.join(root, "xdg-data"),
      XDG_CONFIG_HOME: NodePath.join(root, "xdg-config"),
    };
    const runtimeDirectory = NodePath.join(root, "xdg-runtime");
    await Promise.all([
      NodeFSP.mkdir(home, { recursive: true, mode: 0o700 }),
      NodeFSP.mkdir(runtimeDirectory, { recursive: true, mode: 0o700 }),
    ]);
    await NodeFSP.chmod(runtimeDirectory, 0o700);
    await verifyPrivateRuntimeDirectory(runtimeDirectory);
    const installed = await installLinuxDesktop({
      artifactPath: input.artifactPath,
      descriptorPath: input.descriptorPath,
      productionServerUrl: "https://production.example.test/",
      stagingServerUrl: "https://staging.example.test/",
      iconPath: NodePath.resolve(import.meta.dirname, "../assets/prod/black-universal-1024.png"),
      runtimeDirectory,
      environment,
      paths: resolveInstallPaths(environment),
      refreshDesktopIntegration: false,
    });
    const installedManifest = await readAndValidateArtifactManifest(
      NodePath.join(installed.targetRoot, "manifest.json"),
      { architecture: descriptor.architecture, installRoot: installed.paths.installRoot },
    );
    if (
      installedManifest.productAppId !== OFFICIAL_DESKTOP_PRODUCT_APP_ID ||
      installedManifest.artifactSha256 !== descriptor.artifactSha256 ||
      installedManifest.version !== descriptor.version ||
      installedManifest.commitHash !== descriptor.commitHash
    ) {
      throw new Error("Installed launcher manifest is incompatible with the release descriptor.");
    }

    const generation = NodeCrypto.randomBytes(16).toString("hex");
    const readinessRoot = NodePath.join(runtimeDirectory, "t3code-desktop");
    const readinessPath = NodePath.join(readinessRoot, "ready.json");
    await NodeFSP.mkdir(readinessRoot, { recursive: true, mode: 0o700 });
    const isolatedEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      LANG: process.env.LANG ?? "C.UTF-8",
      HOME: home,
      XDG_DATA_HOME: environment.XDG_DATA_HOME,
      XDG_CONFIG_HOME: environment.XDG_CONFIG_HOME,
      XDG_CACHE_HOME: NodePath.join(root, "xdg-cache"),
      XDG_RUNTIME_DIR: runtimeDirectory,
      TMPDIR: NodePath.join(root, "tmp"),
      T3CODE_HOME: NodePath.join(root, "state"),
      T3CODE_DISABLE_AUTO_UPDATE: "true",
      T3CODE_LAUNCH_GENERATION: generation,
      T3CODE_LAUNCH_READINESS_PATH: readinessPath,
      T3CODE_LAUNCH_ARTIFACT_SHA256: descriptor.artifactSha256,
      T3CODE_LAUNCH_COMMIT_HASH: descriptor.commitHash,
      APPIMAGE: input.artifactPath,
    };
    await Promise.all([
      NodeFSP.mkdir(isolatedEnv.XDG_CACHE_HOME!, { recursive: true }),
      NodeFSP.mkdir(isolatedEnv.TMPDIR!, { recursive: true }),
      NodeFSP.mkdir(isolatedEnv.T3CODE_HOME!, { recursive: true }),
    ]);
    const dbusRunSessionExecutable = await findExecutable("dbus-run-session", isolatedEnv.PATH);
    const appRunPath = NodePath.join(extractedRoot, "AppRun");
    const userDataDirectory = NodePath.join(root, "electron-user-data");
    const xvfbExecutable = await findOptionalExecutable("Xvfb", isolatedEnv.PATH);
    if (xvfbExecutable) {
      const virtualDisplay = await startVirtualDisplay({
        executable: xvfbExecutable,
        environment: isolatedEnv,
        cwd: home,
      });
      displayProcess = virtualDisplay.process;
      isolatedEnv.DISPLAY = virtualDisplay.display;
      desktopProcess = await spawnTracked(
        dbusRunSessionExecutable,
        [
          "--",
          appRunPath,
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          `--user-data-dir=${userDataDirectory}`,
          `--t3code-launcher-handoff=${generation}`,
        ],
        { cwd: home, env: isolatedEnv },
      );
    } else {
      const gamescopeExecutable = await findExecutable("gamescope", isolatedEnv.PATH);
      const gamescopeEnvironment = gamescopeHeadlessEnvironment(isolatedEnv);
      displayProcess = await spawnTracked(
        gamescopeExecutable,
        gamescopeHeadlessArgs({
          dbusRunSessionExecutable,
          appRunPath,
          generation,
          userDataDirectory,
        }),
        { cwd: home, env: gamescopeEnvironment },
      );
    }
    const readinessOwner = desktopProcess ?? displayProcess;
    await waitForExactReadiness({
      readinessPath,
      child: readinessOwner.child,
      timeoutMs: input.readinessTimeoutMs ?? 45_000,
      expected: {
        productAppId: OFFICIAL_DESKTOP_PRODUCT_APP_ID,
        generation,
        artifactSha256: descriptor.artifactSha256,
        version: descriptor.version,
        commitHash: descriptor.commitHash,
      },
      matchesReadiness,
    });
  } catch (error) {
    operationFailure = { error };
  }
  const processCleanupFailures = await collectCleanupFailures([
    ...(desktopProcess ? [() => stopTrackedProcess(desktopProcess)] : []),
    ...(displayProcess ? [() => stopTrackedProcess(displayProcess)] : []),
  ]);
  const temporaryCleanupFailures = await collectCleanupFailures([
    () => NodeFSP.rm(root, { recursive: true, force: true }),
  ]);
  const cleanupFailures = [...processCleanupFailures, ...temporaryCleanupFailures];
  if (operationFailure && cleanupFailures.length === 0) throw operationFailure.error;
  if (operationFailure || cleanupFailures.length > 0) {
    throw new AggregateError(
      [...(operationFailure ? [operationFailure.error] : []), ...cleanupFailures],
      "Desktop artifact smoke failed and completed all cleanup attempts.",
    );
  }
}

export function parseDesktopArtifactSmokeArguments(
  rawArguments: ReadonlyArray<string>,
): readonly [string, string] {
  const argumentsWithoutSeparator = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
  const [artifactPath, descriptorPath, unexpected] = argumentsWithoutSeparator;
  if (!artifactPath || !descriptorPath || unexpected) {
    throw new Error("Usage requires an AppImage path and its release descriptor path.");
  }
  return [artifactPath, descriptorPath];
}

async function main(): Promise<void> {
  const [artifactPath, descriptorPath] = parseDesktopArtifactSmokeArguments(process.argv.slice(2));
  await runDesktopArtifactSmoke({
    artifactPath: NodePath.resolve(artifactPath),
    descriptorPath: NodePath.resolve(descriptorPath),
  });
  console.log("Desktop artifact smoke passed.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
