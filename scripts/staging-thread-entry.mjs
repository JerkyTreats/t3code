#!/usr/bin/env node
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeStream from "node:stream";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";

import { readAndVerifyLinuxThreadReleaseDescriptor } from "./linux-thread-release-artifact.mjs";

export const STAGING_ENTRY_CONTRACT_VERSION = 1;
export const STAGING_CODE_SERVICE = "t3code-desktop-staging.service";
export const STAGING_WINDOW_CLASS = "t3-thread-staging";
export const STAGING_STATE_DIRECTORY_NAME = "t3code-thread-staging";

const MAX_CONFIG_BYTES = 16 * 1024;
const MAX_PROMPT_BYTES = 32 * 1024;
const STATE_DIRECTORY_NAMES = ["config", "cache", "data", "state", "profiles"];
const ENTRY_FLAGS = new Set(["--config", "--cwd", "--prompt", "--pick", "--inline"]);
const CONFIG_KEYS = [
  "artifactPath",
  "contractVersion",
  "descriptorPath",
  "launcherPath",
  "stagingOrigin",
  "stateDirectory",
];

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return Object.keys(value).toSorted().join("\0") === keys.toSorted().join("\0");
}

function isNormalizedAbsolutePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\0") &&
    NodePath.isAbsolute(value) &&
    NodePath.resolve(value) === value
  );
}

function normalizeHttpsOrigin(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.origin === "null"
    ) {
      return undefined;
    }
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function parseStagingEntryArguments(arguments_) {
  if (!Array.isArray(arguments_)) fail("T3 Thread staging arguments are invalid.");
  const parsed = { inline: false, pick: false };
  const seen = new Set();
  for (let index = 0; index < arguments_.length; index += 1) {
    const flag = arguments_[index];
    if (!ENTRY_FLAGS.has(flag)) {
      fail("T3 Thread staging arguments are invalid.");
    }
    if (seen.has(flag)) fail("T3 Thread staging arguments are invalid.");
    seen.add(flag);
    if (flag === "--pick" || flag === "--inline") {
      parsed[flag.slice(2)] = true;
      continue;
    }
    index += 1;
    if (index >= arguments_.length) {
      fail("T3 Thread staging arguments are invalid.");
    }
    parsed[flag.slice(2)] = arguments_[index];
  }
  if (!Object.hasOwn(parsed, "config")) fail("T3 Thread staging arguments are invalid.");
  if (!isNormalizedAbsolutePath(parsed.config)) {
    fail("T3 Thread staging config path is invalid.");
  }
  if (Object.hasOwn(parsed, "cwd") && !isNormalizedAbsolutePath(parsed.cwd)) {
    fail("T3 Thread staging working directory is invalid.");
  }
  if (Object.hasOwn(parsed, "prompt")) {
    if (
      typeof parsed.prompt !== "string" ||
      parsed.prompt.length === 0 ||
      parsed.prompt.includes("\0") ||
      Buffer.byteLength(parsed.prompt, "utf8") > MAX_PROMPT_BYTES
    ) {
      fail("T3 Thread staging prompt is invalid.");
    }
  }
  return parsed;
}

export function validateStagingEntryConfig(value) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, CONFIG_KEYS) ||
    value.contractVersion !== STAGING_ENTRY_CONTRACT_VERSION
  ) {
    fail("T3 Thread staging config is invalid.");
  }
  const stagingOrigin = normalizeHttpsOrigin(value.stagingOrigin);
  if (stagingOrigin === undefined || stagingOrigin !== value.stagingOrigin) {
    fail("T3 Thread staging config is invalid.");
  }
  for (const key of ["artifactPath", "descriptorPath", "launcherPath", "stateDirectory"]) {
    if (!isNormalizedAbsolutePath(value[key])) {
      fail("T3 Thread staging config is invalid.");
    }
  }
  if (NodePath.basename(value.stateDirectory) !== STAGING_STATE_DIRECTORY_NAME) {
    fail("T3 Thread staging config is invalid.");
  }
  return { ...value };
}

export async function readStagingEntryConfig(configPath, dependencies = {}) {
  const fileSystem = dependencies.fileSystem ?? NodeFSP;
  const constants = dependencies.constants ?? NodeFS.constants;
  const expectedUserId = dependencies.expectedUserId ?? NodeProcess.getuid?.();
  let handle;
  try {
    if (!Number.isInteger(constants.O_NOFOLLOW) || !Number.isInteger(expectedUserId)) {
      fail("T3 Thread staging config cannot be verified.");
    }
    handle = await fileSystem.open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const status = await handle.stat();
    if (
      !status.isFile() ||
      status.isSymbolicLink?.() ||
      status.uid !== expectedUserId ||
      (status.mode & 0o777) !== 0o600 ||
      status.size <= 0 ||
      status.size > MAX_CONFIG_BYTES
    ) {
      fail("T3 Thread staging config cannot be verified.");
    }
    return validateStagingEntryConfig(JSON.parse(await handle.readFile("utf8")));
  } catch {
    fail("T3 Thread staging config cannot be verified.");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function configuredProductionPath(value) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const configured = value.trim();
  if (!isNormalizedAbsolutePath(configured)) {
    fail("T3 Thread staging state directory is unsafe.");
  }
  return configured;
}

function pathsOverlap(left, right) {
  const relativeFromLeft = NodePath.relative(left, right);
  const relativeFromRight = NodePath.relative(right, left);
  const isContained = (relative) =>
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${NodePath.sep}`) &&
      !NodePath.isAbsolute(relative));
  return isContained(relativeFromLeft) || isContained(relativeFromRight);
}

function productionStateRoots(homeDirectory, environment) {
  const defaultT3Home = NodePath.join(homeDirectory, ".t3");
  const configuredT3Home = configuredProductionPath(environment.T3CODE_HOME);
  const appDataDirectory =
    configuredProductionPath(environment.XDG_CONFIG_HOME) ??
    NodePath.join(homeDirectory, ".config");
  return [
    defaultT3Home,
    configuredT3Home,
    appDataDirectory,
    NodePath.join(appDataDirectory, "t3code"),
    NodePath.join(appDataDirectory, "T3 Code (Alpha)"),
    NodePath.join(appDataDirectory, "t3code-thread"),
    NodePath.join(appDataDirectory, "t3code-thread-profiles"),
  ].filter((value) => value !== undefined);
}

async function verifyPrivateDirectory(directoryPath, fileSystem, expectedUserId) {
  const [physicalPath, status] = await Promise.all([
    fileSystem.realpath(directoryPath),
    fileSystem.lstat(directoryPath),
  ]);
  if (
    physicalPath !== directoryPath ||
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    status.uid !== expectedUserId ||
    (status.mode & 0o777) !== 0o700
  ) {
    fail("T3 Thread staging state directory is unsafe.");
  }
}

export async function prepareStagingState(stateDirectory, dependencies = {}) {
  const fileSystem = dependencies.fileSystem ?? NodeFSP;
  const expectedUserId = dependencies.expectedUserId ?? NodeProcess.getuid?.();
  const homeDirectory = dependencies.homeDirectory ?? NodeOS.homedir();
  const environment = dependencies.environment ?? NodeProcess.env;
  if (!Number.isInteger(expectedUserId)) {
    fail("T3 Thread staging state directory is unsafe.");
  }
  if (
    NodePath.basename(stateDirectory) !== STAGING_STATE_DIRECTORY_NAME ||
    productionStateRoots(homeDirectory, environment).some((root) =>
      pathsOverlap(stateDirectory, root),
    )
  ) {
    fail("T3 Thread staging state directory is unsafe.");
  }
  try {
    await verifyPrivateDirectory(stateDirectory, fileSystem, expectedUserId);
    const directories = Object.fromEntries(
      STATE_DIRECTORY_NAMES.map((name) => [name, NodePath.join(stateDirectory, name)]),
    );
    for (const directoryPath of Object.values(directories)) {
      try {
        await fileSystem.mkdir(directoryPath, { mode: 0o700 });
      } catch (cause) {
        if (!isRecord(cause) || cause.code !== "EEXIST") throw cause;
      }
      await verifyPrivateDirectory(directoryPath, fileSystem, expectedUserId);
    }
    return directories;
  } catch {
    fail("T3 Thread staging state directory is unsafe.");
  }
}

export async function validateWorkingDirectory(directoryPath, dependencies = {}) {
  const fileSystem = dependencies.fileSystem ?? NodeFSP;
  if (!isNormalizedAbsolutePath(directoryPath)) {
    fail("T3 Thread staging working directory is invalid.");
  }
  try {
    const [physicalPath, status] = await Promise.all([
      fileSystem.realpath(directoryPath),
      fileSystem.stat(directoryPath),
    ]);
    if (physicalPath !== directoryPath || !status.isDirectory()) {
      fail("T3 Thread staging working directory is invalid.");
    }
    return directoryPath;
  } catch {
    fail("T3 Thread staging working directory is invalid.");
  }
}

function parseStagingServiceOrigin(output) {
  if (typeof output !== "string") return undefined;
  const pattern = /(?:^|\s|")T3CODE_DESKTOP_SERVER_URL=([^"'\s]+)(?=$|\s|")/gu;
  const matches = [...output.matchAll(pattern)];
  if (matches.length !== 1) return undefined;
  return normalizeHttpsOrigin(matches[0][1]);
}

export async function verifyStagingTarget(stagingOrigin, dependencies = {}) {
  const execFile = dependencies.execFile ?? NodeUtil.promisify(NodeChildProcess.execFile);
  try {
    const result = await execFile("systemctl", [
      "--user",
      "show",
      STAGING_CODE_SERVICE,
      "--property=Environment",
      "--value",
      "--no-pager",
    ]);
    if (parseStagingServiceOrigin(result.stdout) !== stagingOrigin) {
      fail("T3 Thread staging target is not authorized.");
    }
  } catch {
    fail("T3 Thread staging target is not authorized.");
  }
}

export function buildStagingActivation(prompt, workingDirectory, createIntentId) {
  if (prompt === undefined) return Buffer.alloc(0);
  const intentId = createIntentId();
  if (!/^[0-9a-f]{32}$/u.test(intentId)) {
    fail("T3 Thread staging intent identity is invalid.");
  }
  return Buffer.from(
    JSON.stringify({
      contractVersion: 1,
      intentId,
      source: "direct-launch",
      action: "draft",
      draft: { text: prompt },
      workingDirectory,
    }),
  );
}

export function buildStagingEnvironment(
  config,
  workingDirectory,
  stateDirectories,
  environment = NodeProcess.env,
) {
  return {
    ...environment,
    T3_THREAD_SERVER_URL: config.stagingOrigin,
    T3_THREAD_WORKING_DIRECTORY: workingDirectory,
    T3_THREAD_PROFILE: stateDirectories.profiles,
    XDG_CONFIG_HOME: stateDirectories.config,
    XDG_CACHE_HOME: stateDirectories.cache,
    XDG_DATA_HOME: stateDirectories.data,
    XDG_STATE_HOME: stateDirectories.state,
  };
}

async function importVerifiedLauncher(launcherPath) {
  return import(NodeURL.pathToFileURL(launcherPath).href);
}

export async function runStagingThreadEntry(arguments_, dependencies = {}) {
  const options = parseStagingEntryArguments(arguments_);
  const homeDirectory = dependencies.homeDirectory ?? NodeOS.homedir();
  const environment = dependencies.environment ?? NodeProcess.env;
  const config = await (dependencies.readConfig ?? readStagingEntryConfig)(options.config);
  const workingDirectory = await (dependencies.validateCwd ?? validateWorkingDirectory)(
    options.cwd ?? homeDirectory,
  );
  try {
    await (dependencies.verifyRelease ?? readAndVerifyLinuxThreadReleaseDescriptor)({
      artifactPath: config.artifactPath,
      descriptorPath: config.descriptorPath,
      launcherPath: config.launcherPath,
    });
  } catch {
    fail("T3 Thread staging release verification failed.");
  }
  await (dependencies.verifyTarget ?? verifyStagingTarget)(config.stagingOrigin);

  let launcher;
  try {
    launcher = await (dependencies.importLauncher ?? importVerifiedLauncher)(config.launcherPath);
    if (
      typeof launcher.launchThread !== "function" ||
      typeof launcher.spawnAppImage !== "function"
    ) {
      fail("T3 Thread staging launcher exports are invalid.");
    }
  } catch {
    fail("T3 Thread staging verified launcher could not be loaded.");
  }

  const stateDirectories = await (dependencies.prepareState ?? prepareStagingState)(
    config.stateDirectory,
    { environment, homeDirectory },
  );

  const createIntentId =
    dependencies.createIntentId ?? (() => NodeCrypto.randomBytes(16).toString("hex"));
  const activationBytes = buildStagingActivation(options.prompt, workingDirectory, createIntentId);
  const launchEnvironment = buildStagingEnvironment(
    config,
    workingDirectory,
    stateDirectories,
    environment,
  );
  const spawn = dependencies.spawn ?? NodeChildProcess.spawn;
  try {
    await launcher.launchThread({
      activationInput: NodeStream.Readable.from([activationBytes]),
      appImagePath: config.artifactPath,
      defaultWorkingDirectory: workingDirectory,
      spawnApp: (appImagePath) =>
        launcher.spawnAppImage(appImagePath, {
          environment: launchEnvironment,
          spawn: (command, argumentsForApp, spawnOptions) =>
            spawn(command, [...argumentsForApp, `--class=${STAGING_WINDOW_CLASS}`], spawnOptions),
        }),
      superviseAfterReady: true,
      writeReady: (bytes, channel) => {
        if (channel !== "external") fail("T3 Thread staging completion channel is invalid.");
        (dependencies.stdout ?? NodeProcess.stdout).write(bytes);
      },
    });
  } catch {
    fail("T3 Thread staging launch failed.");
  }
}

async function main() {
  await runStagingThreadEntry(NodeProcess.argv.slice(2));
}

if (
  NodePath.resolve(NodeProcess.argv[1] ?? "") ===
  NodePath.resolve(NodeURL.fileURLToPath(import.meta.url))
) {
  main().catch((cause) => {
    NodeProcess.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  });
}
