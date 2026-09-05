#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeTimersPromises from "node:timers/promises";

// oxlint-disable-next-line t3code/no-global-process-runtime -- Installed standalone launcher has no Effect runtime.
const HOST_ARCHITECTURE = NodeOS.arch();

export const LAUNCHER_CONTRACT_VERSION = 1;
const MAX_PROTOCOL_URL_LENGTH = 8_192;
export const MAX_ACTIVATION_DOCUMENT_BYTES = 96 * 1_024;
export const MAX_ACTIVATION_WORKSPACE_CHARS = 4_096;
export const MAX_ACTIVATION_PROMPT_CHARS = 65_536;

export const OFFICIAL_LINUX_LAUNCHER_IDENTITY = Object.freeze({
  productAppId: "com.t3tools.t3code",
  userServiceName: "t3code-desktop.service",
  linuxWmClass: "t3code",
  linuxSecureStorageArgument: "--password-store=gnome-libsecret",
});

const DESKTOP_CHANNELS = Object.freeze({
  production: {
    linuxWmClass: "t3code",
    runtimeDirectoryName: "t3code-desktop",
    userServiceName: OFFICIAL_LINUX_LAUNCHER_IDENTITY.userServiceName,
  },
  staging: {
    linuxWmClass: "t3code-staging",
    runtimeDirectoryName: "t3code-desktop-staging",
    userServiceName: "t3code-desktop-staging.service",
  },
});

export function resolveDesktopChannel(environment = process.env) {
  const channel = environment.T3CODE_DESKTOP_CHANNEL?.trim() || "production";
  const identity = DESKTOP_CHANNELS[channel];
  if (!identity) throw new Error("Desktop channel must be production or staging.");
  return { channel, ...identity };
}

function commandResult(command, args, options = {}) {
  return new Promise((resolveResult) => {
    const child = NodeChildProcess.spawn(command, args, {
      env: options.env ?? process.env,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    let settled = false;
    let timeout;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      resolveResult(result);
    };
    timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGTERM");
          finish({ code: null, stdout, stderr, timedOut: true });
        }, options.timeoutMs)
      : undefined;
    timeout?.unref();
    child.once("error", (error) => finish({ code: null, stdout, stderr, error }));
    child.once("exit", (code) => finish({ code, stdout, stderr }));
  });
}

export function resolveLauncherPaths(environment = process.env) {
  const home = environment.HOME || NodeOS.homedir();
  const dataHome = environment.XDG_DATA_HOME || NodePath.join(home, ".local", "share");
  const runtimeHome = environment.XDG_RUNTIME_DIR;
  if (!runtimeHome || !NodePath.isAbsolute(runtimeHome)) {
    throw new Error("An absolute XDG_RUNTIME_DIR is required for desktop launcher ownership.");
  }
  const installRoot = NodePath.join(dataHome, "t3code-desktop");
  const channel = resolveDesktopChannel(environment);
  const runtimeRoot = NodePath.join(runtimeHome, channel.runtimeDirectoryName);
  return {
    installRoot,
    manifestPath: NodePath.join(installRoot, "current", "manifest.json"),
    runtimeRoot,
    readinessPath: NodePath.join(runtimeRoot, "ready.json"),
    environmentPath: NodePath.join(runtimeRoot, "service.env"),
    lockPath: NodePath.join(runtimeRoot, "launch.lock"),
    handoffRequestPath: NodePath.join(runtimeRoot, "handoff-request.json"),
    handoffAckPath: NodePath.join(runtimeRoot, "handoff-ack.json"),
    linuxWmClass: channel.linuxWmClass,
    userServiceName: channel.userServiceName,
  };
}

export function validateDesktopActivationRequest(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Desktop activation must be one JSON object.");
  }
  const keys = Object.keys(value).sort();
  const allowedKeys =
    value.prompt === undefined
      ? ["action", "contractVersion", "workspace"]
      : ["action", "contractVersion", "prompt", "workspace"];
  if (keys.length !== allowedKeys.length || keys.some((key, index) => key !== allowedKeys[index])) {
    throw new Error("Desktop activation contains unknown or missing fields.");
  }
  if (
    value.contractVersion !== LAUNCHER_CONTRACT_VERSION ||
    !["open", "submit"].includes(value.action) ||
    typeof value.workspace !== "string" ||
    value.workspace.length === 0 ||
    value.workspace.length > MAX_ACTIVATION_WORKSPACE_CHARS ||
    value.workspace.includes("\0") ||
    !NodePath.isAbsolute(value.workspace) ||
    (value.prompt !== undefined &&
      (typeof value.prompt !== "string" ||
        value.prompt.length === 0 ||
        value.prompt.length > MAX_ACTIVATION_PROMPT_CHARS ||
        value.prompt.includes("\0"))) ||
    (value.action === "submit" && value.prompt === undefined)
  ) {
    throw new Error("Desktop activation metadata is invalid.");
  }
  return {
    contractVersion: LAUNCHER_CONTRACT_VERSION,
    workspace: value.workspace,
    action: value.action,
    ...(value.prompt === undefined ? {} : { prompt: value.prompt }),
  };
}

export async function readDesktopActivationRequest(
  input = process.stdin,
  maximumBytes = MAX_ACTIVATION_DOCUMENT_BYTES,
) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of input) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > maximumBytes) {
      throw new Error("Desktop activation document exceeds its byte limit.");
    }
    chunks.push(bytes);
  }
  if (totalBytes === 0) throw new Error("Desktop activation document is required on stdin.");
  let document;
  try {
    document = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new Error("Desktop activation document must be valid UTF-8.");
  }
  try {
    return validateDesktopActivationRequest(JSON.parse(document));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Desktop activation document must be valid JSON.", { cause: error });
    }
    throw error;
  }
}

export async function sha256File(filePath) {
  const hash = NodeCrypto.createHash("sha256");
  const stream = NodeFS.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

export async function readAndValidateArtifactManifest(manifestPath, dependencies = {}) {
  const readFile = dependencies.readFile ?? NodeFSP.readFile;
  const hashFile = dependencies.hashFile ?? sha256File;
  const lstat = dependencies.lstat ?? NodeFSP.lstat;
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 64 * 1_024) {
    throw new Error("Installed desktop artifact manifest must be a bounded physical regular file.");
  }
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  if (
    manifest?.contractVersion !== LAUNCHER_CONTRACT_VERSION ||
    manifest?.productAppId !== OFFICIAL_LINUX_LAUNCHER_IDENTITY.productAppId ||
    manifest.userServiceName !== OFFICIAL_LINUX_LAUNCHER_IDENTITY.userServiceName ||
    manifest.linuxWmClass !== OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxWmClass ||
    typeof manifest.artifactPath !== "string" ||
    typeof manifest.artifactSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(manifest.artifactSha256) ||
    typeof manifest.version !== "string" ||
    manifest.version.trim().length === 0 ||
    typeof manifest.commitHash !== "string" ||
    !/^[0-9a-f]{7,40}$/.test(manifest.commitHash) ||
    !["x64", "arm64"].includes(manifest.architecture)
  ) {
    throw new Error("Installed desktop artifact metadata is invalid.");
  }
  const hostArchitecture = dependencies.architecture ?? HOST_ARCHITECTURE;
  const expectedArchitecture =
    hostArchitecture === "x64" ? "x64" : hostArchitecture === "arm64" ? "arm64" : null;
  if (expectedArchitecture === null || manifest.architecture !== expectedArchitecture) {
    throw new Error(
      `Installed desktop artifact does not support architecture ${hostArchitecture}.`,
    );
  }
  const installRoot = dependencies.installRoot ?? NodePath.dirname(NodePath.dirname(manifestPath));
  const expectedArtifactPath = NodePath.join(
    installRoot,
    "artifacts",
    manifest.artifactSha256,
    "T3-Code.AppImage",
  );
  if (NodePath.resolve(manifest.artifactPath) !== NodePath.resolve(expectedArtifactPath)) {
    throw new Error("Installed desktop artifact is outside the managed content-addressed root.");
  }
  const [installRootStat, artifactsRootStat, artifactRootStat] = await Promise.all([
    lstat(installRoot),
    lstat(NodePath.join(installRoot, "artifacts")),
    lstat(NodePath.join(installRoot, "artifacts", manifest.artifactSha256)),
  ]);
  if (
    !installRootStat.isDirectory() ||
    installRootStat.isSymbolicLink() ||
    !artifactsRootStat.isDirectory() ||
    artifactsRootStat.isSymbolicLink() ||
    !artifactRootStat.isDirectory() ||
    artifactRootStat.isSymbolicLink()
  ) {
    throw new Error("Installed desktop artifact has an unexpected managed ancestor.");
  }
  const realpath = dependencies.realpath ?? NodeFSP.realpath;
  const [physicalInstallRoot, physicalManifestPath, physicalArtifactPath, currentManifestStat] =
    await Promise.all([
      realpath(installRoot),
      realpath(manifestPath),
      realpath(manifest.artifactPath),
      lstat(manifestPath),
    ]);
  const expectedPhysicalArtifactPath = NodePath.join(
    physicalInstallRoot,
    "artifacts",
    manifest.artifactSha256,
    "T3-Code.AppImage",
  );
  if (physicalArtifactPath !== expectedPhysicalArtifactPath) {
    throw new Error("Installed desktop artifact escapes the physical managed root.");
  }
  if (
    physicalManifestPath !==
      NodePath.join(physicalInstallRoot, "artifacts", manifest.artifactSha256, "manifest.json") ||
    !currentManifestStat.isFile() ||
    currentManifestStat.isSymbolicLink() ||
    currentManifestStat.dev !== manifestStat.dev ||
    currentManifestStat.ino !== manifestStat.ino ||
    currentManifestStat.size !== manifestStat.size
  ) {
    throw new Error("Installed desktop artifact manifest changed or escaped its physical root.");
  }
  const artifactStat = await lstat(manifest.artifactPath);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink()) {
    throw new Error("Installed desktop artifact must be a managed regular file.");
  }
  await (dependencies.access ?? NodeFSP.access)(manifest.artifactPath, NodeFS.constants.X_OK).catch(
    (error) => {
      throw new Error("Installed desktop artifact is not executable.", { cause: error });
    },
  );
  const actualHash = await hashFile(manifest.artifactPath);
  if (actualHash !== manifest.artifactSha256) {
    throw new Error("Installed desktop artifact hash does not match its manifest.");
  }
  return manifest;
}

export function matchesReadiness(readiness, expected) {
  return (
    readiness?.contractVersion === LAUNCHER_CONTRACT_VERSION &&
    readiness?.productAppId === expected.productAppId &&
    readiness?.generation === expected.generation &&
    readiness?.artifactSha256 === expected.artifactSha256 &&
    readiness?.version === expected.version &&
    readiness?.commitHash === expected.commitHash &&
    readiness?.backendReady === true &&
    readiness?.rendererReady === true &&
    Number.isInteger(readiness?.desktopMainPid) &&
    readiness.desktopMainPid > 0 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(readiness?.bootId) &&
    Number.isSafeInteger(readiness?.desktopMainProcessStartTicks) &&
    readiness.desktopMainProcessStartTicks > 0
  );
}

function matchesExistingReadiness(readiness, manifest) {
  return (
    typeof readiness?.generation === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(readiness.generation) &&
    matchesReadiness(readiness, {
      productAppId: manifest.productAppId,
      generation: readiness.generation,
      artifactSha256: manifest.artifactSha256,
      version: manifest.version,
      commitHash: manifest.commitHash,
    })
  );
}

export function parseLinuxProcessStartTicks(stat) {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 0) return null;
  const fieldsAfterCommand = stat
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/);
  const rawStartTicks = fieldsAfterCommand[19];
  if (!rawStartTicks || !/^\d+$/.test(rawStartTicks)) return null;
  const startTicks = Number(rawStartTicks);
  return Number.isSafeInteger(startTicks) && startTicks > 0 ? startTicks : null;
}

export function parseLinuxProcessParentPid(stat) {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 0) return null;
  const fieldsAfterCommand = stat
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/);
  const rawParentPid = fieldsAfterCommand[1];
  if (!rawParentPid || !/^\d+$/.test(rawParentPid)) return null;
  const parentPid = Number(rawParentPid);
  return Number.isSafeInteger(parentPid) && parentPid > 0 ? parentPid : null;
}

export function processBelongsToControlGroup(cgroupText, expectedControlGroup) {
  if (!expectedControlGroup.startsWith("/")) return false;
  return cgroupText.split("\n").some((line) => {
    const separator = line.indexOf("::");
    if (separator < 0) return false;
    const processControlGroup = line.slice(separator + 2).trim();
    return (
      processControlGroup === expectedControlGroup ||
      processControlGroup.startsWith(`${expectedControlGroup}/`)
    );
  });
}

export async function verifyReadyProcessOwnership(input, dependencies = {}) {
  const run = dependencies.runCommand ?? commandResult;
  const readSystemFile = dependencies.readSystemFile ?? NodeFSP.readFile;
  const controlGroupResult = await run("systemctl", [
    "--user",
    "show",
    "--property",
    "ControlGroup",
    "--value",
    input.userServiceName ?? OFFICIAL_LINUX_LAUNCHER_IDENTITY.userServiceName,
  ]);
  const controlGroup = controlGroupResult.stdout.trim();
  if (controlGroupResult.code !== 0 || !controlGroup.startsWith("/")) {
    throw new Error("Could not resolve the owned desktop service control group.");
  }
  const [bootId, processStat, processCgroup] = await Promise.all([
    readSystemFile("/proc/sys/kernel/random/boot_id", "utf8"),
    readSystemFile(`/proc/${input.desktopMainPid}/stat`, "utf8"),
    readSystemFile(`/proc/${input.desktopMainPid}/cgroup`, "utf8"),
  ]);
  if (bootId.trim().toLowerCase() !== input.bootId) {
    throw new Error("Ready desktop process boot identity does not match the current boot.");
  }
  if (parseLinuxProcessStartTicks(processStat) !== input.desktopMainProcessStartTicks) {
    throw new Error("Ready desktop process start identity no longer matches.");
  }
  if (processBelongsToControlGroup(processCgroup, controlGroup)) return;
  let ancestorPid = parseLinuxProcessParentPid(processStat);
  const mainPidResult = await run("systemctl", [
    "--user",
    "show",
    "--property",
    "MainPID",
    "--value",
    input.userServiceName ?? OFFICIAL_LINUX_LAUNCHER_IDENTITY.userServiceName,
  ]);
  const serviceMainPid = Number(mainPidResult.stdout.trim());
  if (
    mainPidResult.code !== 0 ||
    !Number.isSafeInteger(serviceMainPid) ||
    serviceMainPid <= 0 ||
    ancestorPid === null
  ) {
    throw new Error("Ready desktop process is outside the owned user service control group.");
  }
  for (let depth = 0; depth < 8; depth += 1) {
    const [ancestorStat, ancestorCgroup] = await Promise.all([
      readSystemFile(`/proc/${ancestorPid}/stat`, "utf8"),
      readSystemFile(`/proc/${ancestorPid}/cgroup`, "utf8"),
    ]);
    if (!processBelongsToControlGroup(ancestorCgroup, controlGroup)) {
      throw new Error(
        "Ready desktop process ancestor is outside the owned user service control group.",
      );
    }
    if (ancestorPid === serviceMainPid) return;
    ancestorPid = parseLinuxProcessParentPid(ancestorStat);
    if (ancestorPid === null) break;
  }
  throw new Error("Ready desktop process does not descend from the owned user service main PID.");
}

export async function readLinuxProcessIdentity(pid, dependencies = {}) {
  const readSystemFile = dependencies.readSystemFile ?? NodeFSP.readFile;
  const [bootId, processStat] = await Promise.all([
    readSystemFile("/proc/sys/kernel/random/boot_id", "utf8"),
    readSystemFile(`/proc/${pid}/stat`, "utf8"),
  ]);
  const normalizedBootId = bootId.trim().toLowerCase();
  const processStartTicks = parseLinuxProcessStartTicks(processStat);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalizedBootId) ||
    processStartTicks === null
  ) {
    throw new Error("Could not resolve Linux process identity.");
  }
  return { pid, bootId: normalizedBootId, processStartTicks };
}

export async function waitForCurrentReadiness(input, dependencies = {}) {
  const readFile = dependencies.readFile ?? NodeFSP.readFile;
  const serviceIsActive = dependencies.serviceIsActive ?? (async () => true);
  const sleep = dependencies.sleep ?? NodeTimersPromises.setTimeout;
  const now = dependencies.now ?? Date.now;
  const deadline = now() + input.timeoutMs;
  while (now() < deadline) {
    if (!(await serviceIsActive())) throw new Error("Desktop service exited before readiness.");
    try {
      const readiness = JSON.parse(await readFile(input.readinessPath, "utf8"));
      if (matchesReadiness(readiness, input)) return readiness;
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    await sleep(input.intervalMs ?? 50);
  }
  throw new Error("Timed out waiting for the current desktop generation.");
}

export function selectHyprlandClient(clients, expectedPid, expectedClass) {
  if (!Array.isArray(clients)) return null;
  const matches = clients.filter(
    (client) => client?.class === expectedClass && Number(client?.pid) === expectedPid,
  );
  if (matches.length !== 1) return null;
  const address = matches[0]?.address;
  return typeof address === "string" && /^0x[0-9a-f]+$/i.test(address) ? address : null;
}

export async function focusDesktopWindow(input, dependencies = {}) {
  const run = dependencies.runCommand ?? commandResult;
  if (input.hyprlandAvailable) {
    const clientsResult = await run("hyprctl", ["clients", "-j"], { timeoutMs: 5_000 });
    if (clientsResult.code === 0) {
      try {
        const address = selectHyprlandClient(
          JSON.parse(clientsResult.stdout),
          input.desktopMainPid,
          input.linuxWmClass,
        );
        if (address) {
          const focusResult = await run(
            "hyprctl",
            ["dispatch", "focuswindow", `address:${address}`],
            { timeoutMs: 5_000 },
          );
          if (focusResult.code === 0) return "hyprland";
          const luaFocusResult = await run(
            "hyprctl",
            ["dispatch", `hl.dsp.focus({ window = "address:${address}" })`],
            { timeoutMs: 5_000 },
          );
          if (luaFocusResult.code === 0) return "hyprland";
        }
      } catch {}
    }
  }
  if (input.allowElectronFallback === false) return null;
  const activation = await run(input.artifactPath, ["--t3code-focus-existing"], {
    env: input.environment,
    timeoutMs: 5_000,
  });
  if (activation.code === 0) return "electron";
  return null;
}

export async function focusFreshDesktopWindow(input, dependencies = {}) {
  if (!input.hyprlandAvailable) {
    return focusDesktopWindow(input, dependencies);
  }
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? NodeTimersPromises.setTimeout;
  const deadline = now() + (input.discoveryTimeoutMs ?? 5_000);
  while (true) {
    await input.verifyCurrentProcess?.();
    const focusMethod = await focusDesktopWindow(
      { ...input, allowElectronFallback: false },
      dependencies,
    );
    if (focusMethod !== null) return focusMethod;
    if (now() >= deadline) break;
    await sleep(input.discoveryIntervalMs ?? 50);
  }
  return null;
}

async function writeFileAtomically(filePath, content, mode) {
  const temporaryPath = `${filePath}.${process.pid}.${NodeCrypto.randomUUID()}.tmp`;
  await NodeFSP.writeFile(temporaryPath, content, { mode });
  try {
    await NodeFSP.rename(temporaryPath, filePath);
  } catch (error) {
    await NodeFSP.rm(temporaryPath, { force: true });
    throw error;
  }
}

function encodeSystemdEnvironmentValue(value) {
  if (value.includes("\0")) throw new Error("Systemd environment values cannot contain NUL.");
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")}"`;
}

export function renderServiceEnvironment(input) {
  return [
    `T3CODE_LAUNCH_GENERATION=${encodeSystemdEnvironmentValue(input.generation)}`,
    `T3CODE_LAUNCH_READINESS_PATH=${encodeSystemdEnvironmentValue(input.readinessPath)}`,
    `T3CODE_LAUNCH_ARTIFACT_SHA256=${encodeSystemdEnvironmentValue(input.artifactSha256)}`,
    `T3CODE_LAUNCH_COMMIT_HASH=${encodeSystemdEnvironmentValue(input.commitHash)}`,
    "",
  ].join("\n");
}

async function readLockOwner(lockPath, dependencies = {}) {
  const readFile = dependencies.readLockFile ?? NodeFSP.readFile;
  try {
    const owner = JSON.parse(await readFile(NodePath.join(lockPath, "owner.json"), "utf8"));
    if (
      owner?.contractVersion !== LAUNCHER_CONTRACT_VERSION ||
      typeof owner.ownerToken !== "string" ||
      !/^[0-9a-f-]{36}$/.test(owner.ownerToken) ||
      !Number.isInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.bootId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(owner.bootId) ||
      !Number.isSafeInteger(owner.processStartTicks) ||
      owner.processStartTicks <= 0
    ) {
      return { status: "malformed" };
    }
    return { status: "valid", owner };
  } catch (error) {
    if (error instanceof SyntaxError || error?.code === "ENOENT") {
      return { status: "malformed" };
    }
    return { status: "unreadable", error };
  }
}

async function lockOwnerIsLive(owner, dependencies = {}) {
  try {
    const current = await readLinuxProcessIdentity(owner.pid, dependencies);
    return current.bootId === owner.bootId && current.processStartTicks === owner.processStartTicks;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function assertOwnedPhysicalDirectory(directoryPath, label, dependencies = {}) {
  if (!NodePath.isAbsolute(directoryPath) || NodePath.resolve(directoryPath) !== directoryPath) {
    throw new Error(`${label} must be an absolute normalized path.`);
  }
  const lstat = dependencies.lstatRuntimeDirectory ?? NodeFSP.lstat;
  const realpath = dependencies.realpathRuntimeDirectory ?? NodeFSP.realpath;
  const currentUid = dependencies.currentUid ?? process.getuid?.();
  if (!Number.isInteger(currentUid) || currentUid < 0) {
    throw new Error("Desktop launcher runtime ownership cannot be resolved.");
  }
  const status = await lstat(directoryPath);
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    status.uid !== currentUid ||
    (await realpath(directoryPath)) !== directoryPath
  ) {
    throw new Error(`${label} must be a user-owned physical directory.`);
  }
}

export async function prepareLauncherRuntimeRoot(runtimeRoot, dependencies = {}) {
  const runtimeParent = NodePath.dirname(runtimeRoot);
  if (runtimeParent === runtimeRoot) {
    throw new Error("Desktop launcher runtime root must have a dedicated parent directory.");
  }
  await assertOwnedPhysicalDirectory(
    runtimeParent,
    "Desktop launcher runtime parent",
    dependencies,
  );
  const lstat = dependencies.lstatRuntimeDirectory ?? NodeFSP.lstat;
  try {
    await lstat(runtimeRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await (dependencies.mkdirRuntimeDirectory ?? NodeFSP.mkdir)(runtimeRoot, { mode: 0o700 });
  }
  await assertOwnedPhysicalDirectory(runtimeRoot, "Desktop launcher runtime root", dependencies);
  await (dependencies.chmodRuntimeDirectory ?? NodeFSP.chmod)(runtimeRoot, 0o700);
}

export async function acquireDirectoryLock(lockPath, dependencies = {}) {
  await assertOwnedPhysicalDirectory(
    NodePath.dirname(lockPath),
    "Desktop launcher runtime root",
    dependencies,
  );
  const ownerToken = dependencies.lockRandomUUID?.() ?? NodeCrypto.randomUUID();
  const identity = await readLinuxProcessIdentity(process.pid, dependencies);
  const owner = {
    contractVersion: LAUNCHER_CONTRACT_VERSION,
    ownerToken,
    pid: identity.pid,
    bootId: identity.bootId,
    processStartTicks: identity.processStartTicks,
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidatePath = `${lockPath}.${ownerToken}.candidate`;
    await NodeFSP.rm(candidatePath, { recursive: true, force: true });
    await NodeFSP.mkdir(candidatePath, { mode: 0o700 });
    await NodeFSP.writeFile(
      NodePath.join(candidatePath, "owner.json"),
      `${JSON.stringify(owner)}\n`,
      { mode: 0o600 },
    );
    try {
      await NodeFSP.rename(candidatePath, lockPath);
      return async () => {
        const currentOwner = await readLockOwner(lockPath, dependencies);
        if (currentOwner.status === "valid" && currentOwner.owner.ownerToken === ownerToken) {
          await NodeFSP.rm(lockPath, { recursive: true, force: true });
        }
      };
    } catch (error) {
      await NodeFSP.rm(candidatePath, { recursive: true, force: true });
      if (error?.code !== "EEXIST" && error?.code !== "ENOTEMPTY") throw error;
      const existingOwner = await readLockOwner(lockPath, dependencies);
      if (existingOwner.status !== "valid") {
        throw new Error(
          "Desktop launch lock ownership is malformed or unreadable and cannot be reclaimed safely.",
          { cause: error },
        );
      }
      if (await lockOwnerIsLive(existingOwner.owner, dependencies)) {
        throw new Error("Another desktop launch is already in progress.", { cause: error });
      }
      const stalePath = `${lockPath}.${ownerToken}.stale`;
      try {
        await NodeFSP.rename(lockPath, stalePath);
      } catch (renameError) {
        if (renameError?.code === "ENOENT") continue;
        throw renameError;
      }
      await NodeFSP.rm(stalePath, { recursive: true, force: true });
    }
  }
  throw new Error("Could not acquire the desktop launch lock after stale-owner recovery.");
}

function matchesHandoffAck(ack, expected) {
  return (
    ack?.contractVersion === LAUNCHER_CONTRACT_VERSION &&
    ack?.productAppId === OFFICIAL_LINUX_LAUNCHER_IDENTITY.productAppId &&
    ack?.generation === expected.generation &&
    ack?.token === expected.token &&
    ack?.accepted === true &&
    Number.isInteger(ack?.primaryPid) &&
    ack.primaryPid > 0 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ack?.primaryBootId) &&
    Number.isSafeInteger(ack?.primaryStartTicks) &&
    ack.primaryStartTicks > 0
  );
}

async function readJsonFileIfPresent(filePath, dependencies = {}) {
  const readFile = dependencies.readFile ?? NodeFSP.readFile;
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function waitForInitialReadinessOrHandoff(input, dependencies = {}) {
  const sleep = dependencies.sleep ?? NodeTimersPromises.setTimeout;
  const now = dependencies.now ?? Date.now;
  const serviceIsActive = dependencies.serviceIsActive ?? (async () => true);
  let deadline = now() + input.timeoutMs;
  let inactiveSince = null;
  while (now() < deadline) {
    const readiness = await readJsonFileIfPresent(input.readinessPath, dependencies);
    if (readiness && matchesReadiness(readiness, input)) return { type: "readiness", readiness };
    const ack = await readJsonFileIfPresent(input.handoffAckPath, dependencies);
    if (ack && matchesHandoffAck(ack, input)) return { type: "handoff", ack };
    if (await serviceIsActive()) {
      inactiveSince = null;
    } else {
      const handoffAckGraceMs = input.handoffAckGraceMs ?? 750;
      if (inactiveSince === null) {
        inactiveSince = now();
        deadline = Math.max(deadline, inactiveSince + handoffAckGraceMs);
      }
      if (now() - inactiveSince >= handoffAckGraceMs) {
        throw new Error(
          "An existing desktop client did not accept the verified launcher handoff. Close that legacy client once, then launch again.",
        );
      }
    }
    await sleep(input.intervalMs ?? 50);
  }
  throw new Error("Timed out waiting for desktop readiness or a verified client handoff.");
}

export async function waitForHandoffPrimaryExit(ack, input = {}, dependencies = {}) {
  const sleep = dependencies.sleep ?? NodeTimersPromises.setTimeout;
  const now = dependencies.now ?? Date.now;
  const deadline = now() + (input.timeoutMs ?? 30_000);
  while (now() < deadline) {
    try {
      const identity = await readLinuxProcessIdentity(ack.primaryPid, dependencies);
      if (
        identity.bootId !== ack.primaryBootId ||
        identity.processStartTicks !== ack.primaryStartTicks
      ) {
        return;
      }
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    await sleep(input.intervalMs ?? 50);
  }
  throw new Error("The recognized desktop primary did not finish its graceful handoff shutdown.");
}

export async function stopVerifiedDesktopAppScope(primaryPid, dependencies = {}) {
  if (!Number.isInteger(primaryPid) || primaryPid <= 0) {
    throw new Error("Desktop app scope PID is invalid.");
  }
  const run = dependencies.runCommand ?? commandResult;
  const unit = `app-t3code-${primaryPid}.scope`;
  const show = await run("systemctl", [
    "--user",
    "show",
    "--property",
    "ControlGroup",
    "--value",
    unit,
  ]);
  const controlGroup = show.stdout.trim();
  if (show.code !== 0 || controlGroup.length === 0) return false;
  if (!controlGroup.startsWith("/") || !controlGroup.endsWith(`/app.slice/${unit}`)) {
    throw new Error("Desktop app scope control group does not match the verified primary PID.");
  }
  const stop = await run("systemctl", ["--user", "stop", unit]);
  if (stop.code !== 0) {
    throw new Error(`Could not stop verified desktop app scope: ${stop.stderr}`);
  }
  return true;
}

async function restartOwnedDesktopService(run, userServiceName) {
  const restart = await run("systemctl", ["--user", "restart", userServiceName]);
  if (restart.code !== 0) {
    throw new Error(`Could not restart owned desktop service: ${restart.stderr}`);
  }
}

async function startOwnedDesktopService(run, userServiceName) {
  const start = await run("systemctl", ["--user", "start", userServiceName]);
  if (start.code !== 0) {
    throw new Error(`Could not start owned desktop service: ${start.stderr}`);
  }
}

async function focusVerifiedExistingDesktop(
  { manifest, paths, linuxWmClass, environment },
  dependencies,
) {
  const readiness = await readJsonFileIfPresent(paths.readinessPath, dependencies);
  // Ordinary activation cannot safely reuse an active client without an exact current readiness identity.
  if (!matchesExistingReadiness(readiness, manifest)) {
    throw new Error("The active desktop client readiness is not verified; refusing to mutate it.");
  }
  if (dependencies.verifyOwnedProcess) {
    await dependencies.verifyOwnedProcess(readiness);
  } else {
    await verifyReadyProcessOwnership(readiness, { ...dependencies });
  }
  const focusMethod = await focusDesktopWindow(
    {
      desktopMainPid: readiness.desktopMainPid,
      artifactPath: manifest.artifactPath,
      linuxWmClass,
      hyprlandAvailable: Boolean(environment.HYPRLAND_INSTANCE_SIGNATURE),
      allowElectronFallback: false,
      environment,
    },
    dependencies,
  );
  if (focusMethod === null) {
    throw new Error("The verified desktop window could not be focused.");
  }
  return { generation: readiness.generation, readiness, focusMethod };
}

export async function launchDesktop(options = {}, dependencies = {}) {
  const paths = options.paths ?? resolveLauncherPaths(options.environment);
  const linuxWmClass = paths.linuxWmClass ?? OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxWmClass;
  const userServiceName = paths.userServiceName ?? OFFICIAL_LINUX_LAUNCHER_IDENTITY.userServiceName;
  const run = dependencies.runCommand ?? commandResult;
  const activationRequest =
    options.activation === undefined
      ? undefined
      : validateDesktopActivationRequest(options.activation);
  const manifest = await readAndValidateArtifactManifest(paths.manifestPath, dependencies);
  const environment = options.environment ?? process.env;
  const serviceIsActive = async () => {
    const result = await run("systemctl", ["--user", "is-active", userServiceName]);
    if (result.code === 0 && result.stdout === "active\n") return true;
    if (result.code === 3 && result.stdout === "inactive\n") return false;
    // A non-final or inaccessible service state cannot establish ownership for lifecycle mutation.
    throw new Error("Could not verify the desktop service state.");
  };
  const serviceWasActive = await serviceIsActive();
  if (!activationRequest && serviceWasActive) {
    await assertOwnedPhysicalDirectory(
      paths.runtimeRoot,
      "Desktop launcher runtime root",
      dependencies,
    );
    return await focusVerifiedExistingDesktop(
      { manifest, paths, linuxWmClass, environment },
      dependencies,
    );
  }
  await prepareLauncherRuntimeRoot(paths.runtimeRoot, dependencies);
  const releaseLock = dependencies.acquireLock
    ? await dependencies.acquireLock(paths.lockPath)
    : await acquireDirectoryLock(paths.lockPath, dependencies);
  let wroteHandoffState = false;
  try {
    const serviceWasActive = await serviceIsActive();
    if (!activationRequest && serviceWasActive) {
      return await focusVerifiedExistingDesktop(
        { manifest, paths, linuxWmClass, environment },
        dependencies,
      );
    }
    const generation = dependencies.randomUUID?.() ?? NodeCrypto.randomUUID();
    const activationId = activationRequest
      ? (dependencies.randomActivationUUID?.() ?? NodeCrypto.randomUUID())
      : undefined;
    const handoffToken = dependencies.randomToken?.() ?? NodeCrypto.randomBytes(32).toString("hex");
    const handoffRequestPath =
      paths.handoffRequestPath ?? NodePath.join(paths.runtimeRoot, "handoff-request.json");
    const handoffAckPath =
      paths.handoffAckPath ?? NodePath.join(paths.runtimeRoot, "handoff-ack.json");
    wroteHandoffState = true;
    await Promise.all([
      NodeFSP.rm(paths.readinessPath, { force: true }),
      NodeFSP.rm(handoffAckPath, { force: true }),
    ]);
    const requesterIdentity = await readLinuxProcessIdentity(process.pid, dependencies);
    await writeFileAtomically(
      handoffRequestPath,
      `${JSON.stringify({
        contractVersion: LAUNCHER_CONTRACT_VERSION,
        productAppId: OFFICIAL_LINUX_LAUNCHER_IDENTITY.productAppId,
        generation,
        token: handoffToken,
        artifactSha256: manifest.artifactSha256,
        requesterPid: requesterIdentity.pid,
        requesterBootId: requesterIdentity.bootId,
        requesterStartTicks: requesterIdentity.processStartTicks,
        ...(activationRequest ? { activation: { activationId, ...activationRequest } } : {}),
      })}\n`,
      0o600,
    );
    await writeFileAtomically(
      paths.environmentPath,
      renderServiceEnvironment({
        generation,
        readinessPath: paths.readinessPath,
        artifactSha256: manifest.artifactSha256,
        commitHash: manifest.commitHash,
      }),
      0o600,
    );
    const reload = await run("systemctl", ["--user", "daemon-reload"]);
    if (reload.code !== 0)
      throw new Error(`Could not reload the desktop user service: ${reload.stderr}`);
    const expected = {
      readinessPath: paths.readinessPath,
      handoffAckPath,
      generation,
      token: handoffToken,
      artifactSha256: manifest.artifactSha256,
      version: manifest.version,
      commitHash: manifest.commitHash,
      productAppId: manifest.productAppId,
      timeoutMs: options.timeoutMs ?? 60_000,
      userServiceName,
    };
    if (serviceWasActive) {
      await restartOwnedDesktopService(run, userServiceName);
    } else {
      await startOwnedDesktopService(run, userServiceName);
    }
    const initial = await waitForInitialReadinessOrHandoff(expected, {
      ...dependencies,
      serviceIsActive,
    });
    let readiness;
    if (initial.type === "handoff") {
      await waitForHandoffPrimaryExit(initial.ack, {}, dependencies);
      await stopVerifiedDesktopAppScope(initial.ack.primaryPid, {
        ...dependencies,
        runCommand: run,
      });
      await restartOwnedDesktopService(run, userServiceName);
      readiness = await waitForCurrentReadiness(expected, {
        ...dependencies,
        serviceIsActive,
      });
    } else {
      readiness = initial.readiness;
    }
    if (dependencies.verifyOwnedProcess) {
      await dependencies.verifyOwnedProcess(readiness);
    } else {
      await verifyReadyProcessOwnership(readiness, { ...dependencies, runCommand: run });
    }
    const focusMethod = await focusFreshDesktopWindow(
      {
        desktopMainPid: readiness.desktopMainPid,
        artifactPath: manifest.artifactPath,
        linuxWmClass,
        hyprlandAvailable: Boolean(
          (options.environment ?? process.env).HYPRLAND_INSTANCE_SIGNATURE,
        ),
        environment,
        discoveryTimeoutMs: options.focusTimeoutMs,
        verifyCurrentProcess: async () => {
          if (dependencies.verifyOwnedProcess) {
            await dependencies.verifyOwnedProcess(readiness);
          } else {
            await verifyReadyProcessOwnership(readiness, { ...dependencies, runCommand: run });
          }
        },
      },
      dependencies,
    );
    if (focusMethod === null) {
      throw new Error("The fresh desktop window could not be focused.");
    }
    return { generation, readiness, focusMethod, ...(activationId ? { activationId } : {}) };
  } finally {
    if (wroteHandoffState) {
      await Promise.allSettled([
        NodeFSP.rm(
          paths.handoffRequestPath ?? NodePath.join(paths.runtimeRoot, "handoff-request.json"),
          {
            force: true,
          },
        ),
        NodeFSP.rm(paths.handoffAckPath ?? NodePath.join(paths.runtimeRoot, "handoff-ack.json"), {
          force: true,
        }),
      ]);
    }
    await releaseLock();
  }
}

export async function runDesktopService(options = {}, dependencies = {}) {
  const paths = options.paths ?? resolveLauncherPaths(options.environment);
  const manifest = await readAndValidateArtifactManifest(paths.manifestPath, dependencies);
  const generation = (options.environment ?? process.env).T3CODE_LAUNCH_GENERATION?.trim();
  if (!generation || generation.length > 128) {
    throw new Error("Desktop service generation metadata is invalid.");
  }
  const spawn = dependencies.spawn ?? NodeChildProcess.spawn;
  const child = spawn(
    manifest.artifactPath,
    [
      OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxSecureStorageArgument,
      `--t3code-launcher-handoff=${generation}`,
    ],
    {
      env: options.environment ?? process.env,
      stdio: "inherit",
    },
  );
  return await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => {
      resolveExit(signal ? 128 + (NodeOS.constants.signals[signal] ?? 0) : (code ?? 0));
    });
  });
}

export async function activateDesktopProtocolUrl(input, dependencies = {}) {
  if (
    typeof input?.artifactSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(input.artifactSha256) ||
    typeof input?.url !== "string" ||
    input.url.length === 0 ||
    input.url.length > MAX_PROTOCOL_URL_LENGTH ||
    input.url.includes("\0") ||
    new URL(input.url).protocol !== "t3code:"
  ) {
    throw new Error("Desktop protocol activation metadata is invalid.");
  }
  const paths = input.paths ?? resolveLauncherPaths(input.environment);
  const manifest = await readAndValidateArtifactManifest(paths.manifestPath, dependencies);
  if (manifest.artifactSha256 !== input.artifactSha256) {
    throw new Error("Desktop protocol handler does not match the installed artifact manifest.");
  }
  const spawn = dependencies.spawn ?? NodeChildProcess.spawn;
  const child = spawn(
    manifest.artifactPath,
    [OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxSecureStorageArgument, input.url],
    {
      detached: true,
      env: input.environment ?? process.env,
      stdio: "ignore",
    },
  );
  await new Promise((resolveSpawn, rejectSpawn) => {
    child.once("spawn", resolveSpawn);
    child.once("error", rejectSpawn);
  });
  child.unref();
}

async function main() {
  const command = process.argv[2] ?? "launch";
  const exitCode =
    command === "service"
      ? await runDesktopService()
      : command === "activate" && process.argv.length === 3
        ? await readDesktopActivationRequest()
            // Prompt content stays in the mode 0600 authenticated handoff file. It never enters
            // argv, public URLs, logs, or a renderer-write API.
            .then((activation) => launchDesktop({ activation }))
            .then(() => 0)
        : command === "protocol"
          ? await activateDesktopProtocolUrl({
              artifactSha256: process.argv[3],
              url: process.argv.length === 5 ? process.argv[4] : undefined,
            }).then(() => 0)
          : command === "launch"
            ? await launchDesktop().then(() => 0)
            : 1;
  process.exitCode = exitCode;
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
