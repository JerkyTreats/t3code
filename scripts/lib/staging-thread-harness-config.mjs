import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

export const STAGING_THREAD_HARNESS_CONTRACT_VERSION = 1;

const REQUIRED_KEYS = [
  "artifactPath",
  "codeReadinessPath",
  "concurrentWindows",
  "contractVersion",
  "descriptorPath",
  "entryAdapterPath",
  "entryConfigPath",
  "homeWorkingDirectory",
  "hyprland",
  "launcherPath",
  "nativeTypeSentinel",
  "projectWorkingDirectory",
  "protectedProcesses",
  "protectedServices",
  "stagingOrigin",
  "stagingDatabasePath",
  "stateDirectory",
  "syntheticCrashDraft",
  "thresholds",
];
const OPTIONAL_KEYS = [
  "captureScreenshots",
  "certificateSpki",
  "codeCdpPort",
  "pairingCredentialFd",
  "pairingCredentialFile",
];
const THRESHOLD_KEYS = [
  "ackMs",
  "closeMs",
  "connectedMs",
  "crashMs",
  "inputMs",
  "usableMs",
  "windowMs",
];

function fail() {
  throw new Error("T3 Thread staging harness config is invalid.");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isNormalizedAbsolutePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    NodePath.isAbsolute(value) &&
    NodePath.resolve(value) === value
  );
}

function exactKeys(value, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function exactHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

function validText(value, maximum, allowEmpty = false) {
  return (
    typeof value === "string" &&
    !value.includes("\0") &&
    Buffer.byteLength(value, "utf8") <= maximum &&
    (allowEmpty || value.length > 0)
  );
}

function containsControlCharacter(value) {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    return point < 32 || point === 127;
  });
}

export function validateHarnessConfig(value) {
  if (
    !isRecord(value) ||
    !exactKeys(value, REQUIRED_KEYS, OPTIONAL_KEYS) ||
    value.contractVersion !== 1
  )
    fail();
  if (!exactHttpsOrigin(value.stagingOrigin)) fail();
  for (const key of [
    "artifactPath",
    "codeReadinessPath",
    "descriptorPath",
    "entryAdapterPath",
    "entryConfigPath",
    "homeWorkingDirectory",
    "launcherPath",
    "projectWorkingDirectory",
    "stateDirectory",
    "stagingDatabasePath",
  ]) {
    if (!isNormalizedAbsolutePath(value[key])) fail();
  }
  if (
    !validText(value.syntheticCrashDraft, 32 * 1024) ||
    !validText(value.nativeTypeSentinel, 1024) ||
    containsControlCharacter(value.nativeTypeSentinel)
  )
    fail();
  if (
    !Number.isInteger(value.concurrentWindows) ||
    value.concurrentWindows < 3 ||
    value.concurrentWindows > 8
  )
    fail();
  if (!isRecord(value.thresholds) || !exactKeys(value.thresholds, THRESHOLD_KEYS)) fail();
  for (const threshold of Object.values(value.thresholds)) {
    if (!Number.isInteger(threshold) || threshold < 100 || threshold > 300_000) fail();
  }
  if (
    !isRecord(value.hyprland) ||
    !exactKeys(value.hyprland, ["defaultWorkspace", "projectWorkspace", "threadClass"]) ||
    !Number.isInteger(value.hyprland.defaultWorkspace) ||
    !Number.isInteger(value.hyprland.projectWorkspace) ||
    value.hyprland.defaultWorkspace !== 4 ||
    value.hyprland.projectWorkspace !== 5 ||
    value.hyprland.threadClass !== "t3-thread-staging"
  )
    fail();
  if (NodePath.basename(value.stateDirectory) !== "t3code-thread-staging") fail();
  if (!Array.isArray(value.protectedProcesses) || value.protectedProcesses.length === 0) fail();
  for (const item of value.protectedProcesses) {
    if (
      !isRecord(item) ||
      !exactKeys(item, ["label", "pid", "startTicks"]) ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(item.label) ||
      !Number.isInteger(item.pid) ||
      item.pid < 2 ||
      !/^[0-9]+$/u.test(item.startTicks)
    )
      fail();
  }
  if (!Array.isArray(value.protectedServices)) fail();
  for (const name of value.protectedServices) {
    if (typeof name !== "string" || !/^[A-Za-z0-9_.@-]{1,200}\.service$/u.test(name)) fail();
  }
  if (Object.hasOwn(value, "captureScreenshots") && typeof value.captureScreenshots !== "boolean")
    fail();
  if (
    Object.hasOwn(value, "certificateSpki") &&
    !/^[A-Za-z0-9+/=]{20,256}$/u.test(value.certificateSpki)
  )
    fail();
  if (
    Object.hasOwn(value, "codeCdpPort") &&
    (!Number.isInteger(value.codeCdpPort) || value.codeCdpPort < 1024 || value.codeCdpPort > 65535)
  )
    fail();
  const credentialSources =
    Number(Object.hasOwn(value, "pairingCredentialFile")) +
    Number(Object.hasOwn(value, "pairingCredentialFd"));
  if (credentialSources > 1) fail();
  if (
    Object.hasOwn(value, "pairingCredentialFile") &&
    !isNormalizedAbsolutePath(value.pairingCredentialFile)
  )
    fail();
  if (
    Object.hasOwn(value, "pairingCredentialFd") &&
    (!Number.isInteger(value.pairingCredentialFd) ||
      (value.pairingCredentialFd !== 0 && value.pairingCredentialFd < 3) ||
      value.pairingCredentialFd > 1024)
  )
    fail();
  return structuredClone(value);
}

async function readProtectedFile(filePath, maximumBytes) {
  const noFollow = NodeFS.constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow) || !Number.isInteger(NodeProcess.getuid?.()))
    throw new Error("protected-file-unavailable");
  const handle = await NodeFSP.open(filePath, NodeFS.constants.O_RDONLY | noFollow);
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.uid !== NodeProcess.getuid() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.size <= 0 ||
      stat.size > maximumBytes
    ) {
      throw new Error("protected-file-unsafe");
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export async function readHarnessConfig(filePath) {
  if (!isNormalizedAbsolutePath(filePath)) fail();
  try {
    await verifyPrivateDirectory(NodePath.dirname(filePath));
    return validateHarnessConfig(
      JSON.parse((await readProtectedFile(filePath, 64 * 1024)).toString("utf8")),
    );
  } catch {
    throw new Error("T3 Thread staging harness config could not be read.");
  }
}

export async function readPairingCredential(config) {
  let bytes;
  if (Object.hasOwn(config, "pairingCredentialFile"))
    bytes = await readProtectedFile(config.pairingCredentialFile, 4096);
  else if (Object.hasOwn(config, "pairingCredentialFd")) {
    const stat = NodeFS.fstatSync(config.pairingCredentialFd);
    if (stat.isDirectory() || stat.size > 4096) throw new Error("pairing-credential-unavailable");
    const chunks = [];
    let byteLength = 0;
    while (true) {
      const chunk = Buffer.alloc(512);
      const bytesRead = NodeFS.readSync(config.pairingCredentialFd, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      byteLength += bytesRead;
      if (byteLength > 4096) {
        chunk.fill(0);
        for (const prior of chunks) prior.fill(0);
        throw new Error("pairing-credential-unavailable");
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    bytes = Buffer.concat(chunks);
    for (const chunk of chunks) chunk.fill(0);
  } else return undefined;
  const credential = bytes.toString("utf8").trim();
  bytes.fill(0);
  if (!validText(credential, 256) || /\s/u.test(credential))
    throw new Error("pairing-credential-unavailable");
  return credential;
}

export function parseHarnessArguments(arguments_) {
  if (
    !Array.isArray(arguments_) ||
    arguments_.length !== 4 ||
    arguments_[0] !== "--config" ||
    arguments_[2] !== "--output-dir"
  ) {
    throw new Error("Usage: staging-thread-harness.mjs --config PATH --output-dir DIRECTORY");
  }
  if (!isNormalizedAbsolutePath(arguments_[1]) || !isNormalizedAbsolutePath(arguments_[3])) {
    throw new Error("T3 Thread staging harness paths are invalid.");
  }
  return { configPath: arguments_[1], outputDirectory: arguments_[3] };
}

export async function verifyPrivateDirectory(directoryPath) {
  const [physical, stat] = await Promise.all([
    NodeFSP.realpath(directoryPath),
    NodeFSP.lstat(directoryPath),
  ]);
  if (
    physical !== directoryPath ||
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== NodeProcess.getuid?.() ||
    (stat.mode & 0o777) !== 0o700
  )
    throw new Error("T3 Thread staging harness directory is unsafe.");
}
