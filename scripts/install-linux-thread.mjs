import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  OFFICIAL_THREAD_PRODUCT_APP_ID,
  readAndVerifyLinuxThreadReleaseDescriptor,
} from "./linux-thread-release-artifact.mjs";

export const THREAD_INSTALL_CONTRACT_VERSION = 1;
const LEGACY_THREAD_APPIMAGE_MIN_BYTES = 1024 * 1024;
const LEGACY_THREAD_APPIMAGE_MAX_BYTES = 256 * 1024 * 1024;
const LEGACY_THREAD_ARTIFACT_SHA256 = new Set([
  "2300678cb62f5c2d12e5c39d33d10735650be286b629ac7f8ead0aedf48fc9a0",
]);
const APPIMAGE_TYPE_TWO_HEADER = Buffer.from([
  0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x41, 0x49, 0x02,
]);
const ELF_MACHINE_BY_ARCHITECTURE = new Map([
  ["x64", 0x3e],
  ["arm64", 0xb7],
]);

function requireAbsolutePath(value, label) {
  if (
    typeof value !== "string" ||
    !NodePath.isAbsolute(value) ||
    NodePath.resolve(value) !== value ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    throw new Error(`${label} must be one normalized absolute path.`);
  }
  return value;
}

function requireHttpsOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new Error("T3 Thread server URL must be valid.", { cause });
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("T3 Thread server URL must be a credential-free HTTPS origin.");
  }
  return url.href;
}

function desktopQuote(value) {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("`", "\\`")
    .replaceAll("$", "\\$")
    .replaceAll("%", "%%")}"`;
}

export function resolveThreadInstallPaths(environment = process.env) {
  const home = requireAbsolutePath(environment.HOME || NodeOS.homedir(), "Home directory");
  const dataHome = requireAbsolutePath(
    environment.XDG_DATA_HOME || NodePath.join(home, ".local", "share"),
    "XDG data home",
  );
  const configHome = requireAbsolutePath(
    environment.XDG_CONFIG_HOME || NodePath.join(home, ".config"),
    "XDG config home",
  );
  const installRoot = NodePath.join(dataHome, "t3code-thread");
  return {
    installRoot,
    artifactsRoot: NodePath.join(installRoot, "artifacts"),
    currentPath: NodePath.join(installRoot, "current"),
    ownershipManifestPath: NodePath.join(installRoot, "install-manifest.json"),
    launcherPath: NodePath.join(home, ".local", "bin", "t3code-thread"),
    appImagePath: NodePath.join(home, ".local", "bin", "T3-Thread.AppImage"),
    desktopEntryPath: NodePath.join(dataHome, "applications", "t3-thread.desktop"),
    servicePath: NodePath.join(configHome, "systemd", "user", "t3code-thread.service"),
  };
}

async function physicalExecutable(filePath, label) {
  const status = await NodeFSP.lstat(filePath).catch((error) => {
    throw new Error(`${label} is missing.`, { cause: error });
  });
  if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o111) === 0) {
    throw new Error(`${label} must be one physical executable file.`);
  }
}

async function readPhysicalExecutable(filePath, label) {
  const noFollow = NodeFS.constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    throw new Error(`${label} cannot be verified without no-follow file support.`);
  }
  const handle = await NodeFSP.open(filePath, NodeFS.constants.O_RDONLY | noFollow);
  try {
    const initial = await handle.stat();
    if (!initial.isFile() || (initial.mode & 0o111) === 0) {
      throw new Error(`${label} must be one physical executable file.`);
    }
    const content = await handle.readFile();
    const final = await handle.stat();
    if (
      final.dev !== initial.dev ||
      final.ino !== initial.ino ||
      final.size !== initial.size ||
      final.mtimeMs !== initial.mtimeMs
    ) {
      throw new Error(`${label} changed while it was being verified.`);
    }
    return content;
  } finally {
    await handle.close();
  }
}

async function sha256(filePath) {
  const hash = NodeCrypto.createHash("sha256");
  const handle = await NodeFSP.open(filePath, NodeFS.constants.O_RDONLY);
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let position = 0;
  try {
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

export async function prepareLinuxThreadInstall(input) {
  const artifactPath = requireAbsolutePath(input.artifactPath, "T3 Thread artifact");
  const launcherSource = requireAbsolutePath(input.launcherPath, "T3 Thread launcher");
  const descriptorPath = requireAbsolutePath(input.descriptorPath, "T3 Thread descriptor");
  const serverUrl = requireHttpsOrigin(input.productionServerUrl);
  await physicalExecutable(artifactPath, "T3 Thread artifact");
  const paths = { ...resolveThreadInstallPaths(input.environment), ...input.paths };
  const [releaseDescriptor, launcherContent] = await Promise.all([
    readAndVerifyLinuxThreadReleaseDescriptor({
      artifactPath,
      launcherPath: launcherSource,
      descriptorPath,
    }),
    readPhysicalExecutable(launcherSource, "T3 Thread launcher"),
  ]);
  const { artifactSha256, launcherSha256 } = releaseDescriptor;
  const capturedLauncherSha256 = NodeCrypto.createHash("sha256")
    .update(launcherContent)
    .digest("hex");
  if (capturedLauncherSha256 !== launcherSha256) {
    throw new Error("Captured T3 Thread launcher does not match its release descriptor.");
  }
  const contentId = NodeCrypto.createHash("sha256")
    .update(`t3-thread\n${artifactSha256}\n${launcherSha256}\n`)
    .digest("hex");
  const targetRoot = NodePath.join(paths.artifactsRoot, contentId);
  const targetArtifact = NodePath.join(targetRoot, "T3-Thread.AppImage");
  const targetLauncher = NodePath.join(targetRoot, "t3-thread-launcher.mjs");
  const targetManifest = NodePath.join(targetRoot, "manifest.json");
  const desktop = `[Desktop Entry]
Type=Application
Name=T3 Thread
Comment=Independent client for one T3 Code thread
Exec=env ${desktopQuote(`T3_THREAD_SERVER_URL=${serverUrl}`)} ${desktopQuote(paths.launcherPath)}
TryExec=${paths.launcherPath}
Icon=t3code
Terminal=false
Categories=Development;
StartupWMClass=t3-thread
X-T3Code-Thread-Managed=true
X-T3Code-ProductAppId=${OFFICIAL_THREAD_PRODUCT_APP_ID}
`;
  const artifactManifest = {
    contractVersion: THREAD_INSTALL_CONTRACT_VERSION,
    owner: "t3code-thread-artifact",
    contentId,
    artifactPath: targetArtifact,
    launcherPath: targetLauncher,
    artifactSha256,
    launcherSha256,
    version: releaseDescriptor.version,
    commitHash: releaseDescriptor.commitHash,
    architecture: releaseDescriptor.architecture,
    productAppId: releaseDescriptor.productAppId,
    sourceRepository: releaseDescriptor.sourceRepository,
  };
  const ownershipManifest = {
    contractVersion: THREAD_INSTALL_CONTRACT_VERSION,
    owner: "t3code-thread-client",
    contentId,
    artifactSha256,
    launcherSha256,
    version: releaseDescriptor.version,
    commitHash: releaseDescriptor.commitHash,
    architecture: releaseDescriptor.architecture,
    productAppId: releaseDescriptor.productAppId,
    sourceRepository: releaseDescriptor.sourceRepository,
    productionServerUrl: serverUrl,
    managedPaths: [
      paths.launcherPath,
      paths.appImagePath,
      paths.desktopEntryPath,
      paths.currentPath,
      paths.ownershipManifestPath,
    ],
  };
  return {
    artifactPath,
    launcherSource,
    descriptorPath,
    releaseDescriptor,
    serverUrl,
    paths,
    artifactSha256,
    launcherSha256,
    contentId,
    launcherContent,
    targetRoot,
    targetArtifact,
    targetLauncher,
    targetManifest,
    artifactManifest,
    ownershipManifest,
    files: [
      { id: "launcher", path: paths.launcherPath, content: launcherContent, mode: 0o755 },
      { id: "desktop", path: paths.desktopEntryPath, content: desktop, mode: 0o644 },
      {
        id: "ownership-manifest",
        path: paths.ownershipManifestPath,
        content: `${JSON.stringify(ownershipManifest, null, 2)}\n`,
        mode: 0o600,
      },
    ],
  };
}

async function snapshotPath(filePath, allowSymbolicLink = false, maximumBytes = Infinity) {
  try {
    const status = await NodeFSP.lstat(filePath);
    if (status.isSymbolicLink()) {
      if (!allowSymbolicLink) throw new Error(`Managed path is a symbolic link: ${filePath}`);
      const target = await NodeFSP.readlink(filePath);
      const current = await NodeFSP.lstat(filePath);
      if (!current.isSymbolicLink() || current.dev !== status.dev || current.ino !== status.ino) {
        throw new Error(`Managed symbolic link changed during snapshot: ${filePath}`);
      }
      return { kind: "symlink", path: filePath, target, dev: status.dev, ino: status.ino };
    }
    if (!status.isFile()) throw new Error(`Managed path is not a physical file: ${filePath}`);
    if (status.size > maximumBytes) {
      throw new Error(`Managed file exceeds its safe snapshot bound: ${filePath}`);
    }
    const content = await NodeFSP.readFile(filePath);
    const current = await NodeFSP.lstat(filePath);
    if (!current.isFile() || current.dev !== status.dev || current.ino !== status.ino) {
      throw new Error(`Managed file changed during snapshot: ${filePath}`);
    }
    return {
      kind: "file",
      path: filePath,
      content,
      mode: status.mode & 0o777,
      dev: status.dev,
      ino: status.ino,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "missing", path: filePath };
    throw error;
  }
}

async function restoreSnapshot(snapshot) {
  await NodeFSP.rm(snapshot.path, { force: true });
  if (snapshot.kind === "missing") return;
  await NodeFSP.mkdir(NodePath.dirname(snapshot.path), { recursive: true });
  if (snapshot.kind === "symlink") {
    await NodeFSP.symlink(snapshot.target, snapshot.path);
    return;
  }
  await NodeFSP.writeFile(snapshot.path, snapshot.content, { mode: snapshot.mode });
  await NodeFSP.chmod(snapshot.path, snapshot.mode);
}

function snapshotsMatch(left, right) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "missing") return true;
  if (left.kind === "symlink") {
    return left.target === right.target && left.dev === right.dev && left.ino === right.ino;
  }
  return (
    left.mode === right.mode &&
    left.content.equals(right.content) &&
    left.dev === right.dev &&
    left.ino === right.ino
  );
}

async function restoreSnapshotIfStillOwned(priorSnapshot, installedSnapshot) {
  const current = await snapshotPath(priorSnapshot.path, true);
  if (!snapshotsMatch(installedSnapshot, current)) {
    throw new Error(
      `Refusing to roll back a T3 Thread path that changed after installation: ${priorSnapshot.path}`,
    );
  }
  await restoreSnapshot(priorSnapshot);
}

async function assertExistingPhysicalAncestor(directory) {
  let current = directory;
  while (true) {
    const status = await NodeFSP.lstat(current).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (status !== null) {
      if (
        !status.isDirectory() ||
        status.isSymbolicLink() ||
        (await NodeFSP.realpath(current)) !== current
      ) {
        throw new Error("T3 Thread storage contains an unsafe managed ancestor.");
      }
      return;
    }
    const parent = NodePath.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function assertPhysicalThreadRoots(paths, options = {}) {
  const createMissing = options.createMissing === true;
  if (
    paths.artifactsRoot !== NodePath.join(paths.installRoot, "artifacts") ||
    paths.currentPath !== NodePath.join(paths.installRoot, "current") ||
    paths.ownershipManifestPath !== NodePath.join(paths.installRoot, "install-manifest.json")
  ) {
    throw new Error("T3 Thread managed paths are outside their expected install ancestors.");
  }
  const directories = [
    paths.installRoot,
    paths.artifactsRoot,
    NodePath.dirname(paths.launcherPath),
    NodePath.dirname(paths.desktopEntryPath),
  ];
  for (const directory of directories) {
    await assertExistingPhysicalAncestor(directory);
    if (createMissing) await NodeFSP.mkdir(directory, { recursive: true });
    const status = await NodeFSP.lstat(directory).catch((error) => {
      if (error?.code === "ENOENT" && !createMissing) return null;
      throw error;
    });
    if (
      status !== null &&
      (!status.isDirectory() ||
        status.isSymbolicLink() ||
        (await NodeFSP.realpath(directory)) !== directory)
    ) {
      throw new Error("T3 Thread storage contains an unsafe managed ancestor.");
    }
  }
}

function manifestOwns(manifest, filePath) {
  return (
    manifest?.contractVersion === THREAD_INSTALL_CONTRACT_VERSION &&
    manifest?.owner === "t3code-thread-client" &&
    Array.isArray(manifest.managedPaths) &&
    manifest.managedPaths.includes(filePath)
  );
}

function isCredibleLegacyThreadAppImage(snapshot, architecture, allowedArtifactHashes) {
  const expectedMachine = ELF_MACHINE_BY_ARCHITECTURE.get(architecture);
  const artifactHash =
    snapshot.kind === "file"
      ? NodeCrypto.createHash("sha256").update(snapshot.content).digest("hex")
      : "";
  return (
    snapshot.kind === "file" &&
    (snapshot.mode & 0o111) !== 0 &&
    snapshot.content.length >= LEGACY_THREAD_APPIMAGE_MIN_BYTES &&
    snapshot.content
      .subarray(0, APPIMAGE_TYPE_TWO_HEADER.length)
      .equals(APPIMAGE_TYPE_TWO_HEADER) &&
    expectedMachine !== undefined &&
    snapshot.content.readUInt16LE(18) === expectedMachine &&
    allowedArtifactHashes.has(artifactHash)
  );
}

function directoryIdentity(status) {
  return {
    dev: status.dev,
    ino: status.ino,
    mode: status.mode & 0o777,
    mtimeMs: status.mtimeMs,
    ctimeMs: status.ctimeMs,
  };
}

function legacyThreadInstallRootStatesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function inspectLegacyThreadInstallRoot(paths) {
  const installStatus = await NodeFSP.lstat(paths.installRoot).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (installStatus === null) {
    return { compatible: true, installRoot: null, artifactsRoot: null, backups: null, entries: [] };
  }
  if (!installStatus.isDirectory() || installStatus.isSymbolicLink()) {
    return { compatible: false };
  }
  const installEntries = (await NodeFSP.readdir(paths.installRoot)).toSorted();
  const allowedEntries = new Set([NodePath.basename(paths.artifactsRoot), "backups"]);
  if (installEntries.some((entry) => !allowedEntries.has(entry))) return { compatible: false };
  let artifactsRoot = null;
  if (installEntries.includes(NodePath.basename(paths.artifactsRoot))) {
    const artifactsStatus = await NodeFSP.lstat(paths.artifactsRoot);
    if (
      !artifactsStatus.isDirectory() ||
      artifactsStatus.isSymbolicLink() ||
      (await NodeFSP.realpath(paths.artifactsRoot)) !== paths.artifactsRoot ||
      (await NodeFSP.readdir(paths.artifactsRoot)).length !== 0
    ) {
      return { compatible: false };
    }
    const currentArtifactsStatus = await NodeFSP.lstat(paths.artifactsRoot);
    artifactsRoot = directoryIdentity(artifactsStatus);
    if (
      JSON.stringify(artifactsRoot) !== JSON.stringify(directoryIdentity(currentArtifactsStatus))
    ) {
      return { compatible: false };
    }
  }
  let backups = null;
  if (installEntries.includes("backups")) {
    const backupsPath = NodePath.join(paths.installRoot, "backups");
    const backupsStatus = await NodeFSP.lstat(backupsPath);
    if (
      !backupsStatus.isDirectory() ||
      backupsStatus.isSymbolicLink() ||
      (backupsStatus.mode & 0o777) !== 0o700 ||
      (await NodeFSP.realpath(backupsPath)) !== backupsPath
    ) {
      return { compatible: false };
    }
    const currentBackupsStatus = await NodeFSP.lstat(backupsPath);
    backups = directoryIdentity(backupsStatus);
    if (JSON.stringify(backups) !== JSON.stringify(directoryIdentity(currentBackupsStatus))) {
      return { compatible: false };
    }
  }
  const currentInstallStatus = await NodeFSP.lstat(paths.installRoot);
  const installRoot = directoryIdentity(installStatus);
  if (JSON.stringify(installRoot) !== JSON.stringify(directoryIdentity(currentInstallStatus))) {
    return { compatible: false };
  }
  return { compatible: true, installRoot, artifactsRoot, backups, entries: installEntries };
}

export async function preflightLinuxThreadInstall(input, dependencies = {}) {
  const prepared = await prepareLinuxThreadInstall(input);
  await assertPhysicalThreadRoots(prepared.paths);
  let priorManifest = null;
  const manifestSnapshot = await snapshotPath(prepared.paths.ownershipManifestPath);
  if (manifestSnapshot.kind === "file") {
    try {
      priorManifest = JSON.parse(manifestSnapshot.content.toString("utf8"));
    } catch {
      throw new Error("Existing T3 Thread ownership manifest is invalid.");
    }
  }
  const snapshots = new Map();
  for (const file of prepared.files) {
    const snapshot =
      file.id === "ownership-manifest" ? manifestSnapshot : await snapshotPath(file.path);
    if (
      snapshot.kind === "file" &&
      !snapshot.content.equals(
        Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content),
      ) &&
      !manifestOwns(priorManifest, file.path)
    ) {
      throw new Error(`Refusing to replace an unowned T3 Thread ${file.id} file.`);
    }
    snapshots.set(file.id, snapshot);
  }
  for (const [id, filePath] of [
    ["app-image-link", prepared.paths.appImagePath],
    ["current", prepared.paths.currentPath],
  ]) {
    const snapshot = await snapshotPath(
      filePath,
      true,
      id === "app-image-link" ? LEGACY_THREAD_APPIMAGE_MAX_BYTES : Infinity,
    );
    if (snapshot.kind === "file" && id !== "app-image-link") {
      throw new Error(`T3 Thread ${id} path is not a symbolic link.`);
    }
    if (snapshot.kind === "symlink" && !manifestOwns(priorManifest, filePath)) {
      const resolved = NodePath.resolve(NodePath.dirname(filePath), snapshot.target);
      const expected = id === "current" ? prepared.targetRoot : prepared.targetArtifact;
      if (resolved !== expected) throw new Error(`Refusing to replace an unowned T3 Thread ${id}.`);
    }
    snapshots.set(id, snapshot);
  }
  const targetStatus = await NodeFSP.lstat(prepared.targetRoot).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (targetStatus !== null) {
    if (!targetStatus.isDirectory() || targetStatus.isSymbolicLink()) {
      throw new Error("Content-addressed T3 Thread root is unsafe.");
    }
    const [artifactStatus, launcherStatus, manifestStatus] = await Promise.all([
      NodeFSP.lstat(prepared.targetArtifact),
      NodeFSP.lstat(prepared.targetLauncher),
      NodeFSP.lstat(prepared.targetManifest),
    ]);
    if (
      !artifactStatus.isFile() ||
      artifactStatus.isSymbolicLink() ||
      (artifactStatus.mode & 0o777) !== 0o755 ||
      !launcherStatus.isFile() ||
      launcherStatus.isSymbolicLink() ||
      (launcherStatus.mode & 0o777) !== 0o755 ||
      !manifestStatus.isFile() ||
      manifestStatus.isSymbolicLink() ||
      (manifestStatus.mode & 0o777) !== 0o644
    ) {
      throw new Error("Existing content-addressed T3 Thread artifact is unsafe.");
    }
    const [installedHash, installedLauncherHash, installedManifest] = await Promise.all([
      sha256(prepared.targetArtifact),
      sha256(prepared.targetLauncher),
      NodeFSP.readFile(prepared.targetManifest, "utf8").then(JSON.parse),
    ]);
    if (
      installedHash !== prepared.artifactSha256 ||
      installedLauncherHash !== prepared.launcherSha256 ||
      JSON.stringify(installedManifest) !== JSON.stringify(prepared.artifactManifest)
    ) {
      throw new Error("Existing content-addressed T3 Thread artifact is invalid.");
    }
  }
  const serviceSnapshot = await snapshotPath(prepared.paths.servicePath);
  if (serviceSnapshot.kind !== "missing") {
    throw new Error("Refusing to adopt or install T3 Thread while its retired service exists.");
  }
  const launcherSnapshot = snapshots.get("launcher");
  const desktopSnapshot = snapshots.get("desktop");
  const currentSnapshot = snapshots.get("current");
  const appImageSnapshot = snapshots.get("app-image-link");
  const legacyInstallRootState = await inspectLegacyThreadInstallRoot(prepared.paths);
  const installRootCompatible = legacyInstallRootState.compatible;
  const legacyAdoption =
    priorManifest === null &&
    launcherSnapshot.kind === "file" &&
    launcherSnapshot.content.equals(prepared.launcherContent) &&
    (launcherSnapshot.mode & 0o111) !== 0 &&
    isCredibleLegacyThreadAppImage(
      appImageSnapshot,
      prepared.releaseDescriptor.architecture,
      dependencies.legacyArtifactSha256Allowlist ?? LEGACY_THREAD_ARTIFACT_SHA256,
    ) &&
    desktopSnapshot.kind === "missing" &&
    currentSnapshot.kind === "missing" &&
    targetStatus === null &&
    installRootCompatible;
  const unmanagedThreadState =
    priorManifest === null &&
    (launcherSnapshot.kind !== "missing" ||
      desktopSnapshot.kind !== "missing" ||
      currentSnapshot.kind !== "missing" ||
      appImageSnapshot.kind !== "missing" ||
      targetStatus !== null ||
      !installRootCompatible);
  if (unmanagedThreadState && !legacyAdoption) {
    throw new Error("Refusing to adopt an incomplete or unverified legacy T3 Thread installation.");
  }
  if (appImageSnapshot.kind === "file" && !legacyAdoption) {
    throw new Error("T3 Thread app-image-link path is not a symbolic link.");
  }
  return {
    ...prepared,
    snapshots,
    targetExists: targetStatus !== null,
    legacyAdoption,
    legacyInstallRootState,
  };
}

async function writeManagedFile(file, snapshot, dependencies, recordInstalled) {
  const expected = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
  if (
    snapshot.kind === "file" &&
    snapshot.content.equals(expected) &&
    snapshot.mode === file.mode
  ) {
    return null;
  }
  await dependencies.beforeManagedWrite?.(file);
  await NodeFSP.mkdir(NodePath.dirname(file.path), { recursive: true });
  const temporary = `${file.path}.${process.pid}.${NodeCrypto.randomUUID()}.tmp`;
  await NodeFSP.writeFile(temporary, expected, { mode: file.mode, flag: "wx" });
  try {
    await NodeFSP.chmod(temporary, file.mode);
    const current = await snapshotPath(file.path);
    if (!snapshotsMatch(snapshot, current)) {
      throw new Error(`T3 Thread ${file.id} changed during installation.`);
    }
    const installedStatus = await NodeFSP.lstat(temporary);
    await NodeFSP.rename(temporary, file.path);
    const installedSnapshot = {
      kind: "file",
      path: file.path,
      content: expected,
      mode: file.mode,
      dev: installedStatus.dev,
      ino: installedStatus.ino,
    };
    recordInstalled(installedSnapshot);
    if (dependencies.afterManagedWriteRename) {
      await dependencies.afterManagedWriteRename(file);
    }
    const installedPath = await snapshotPath(file.path);
    if (!snapshotsMatch(installedSnapshot, installedPath)) {
      throw new Error(`T3 Thread ${file.id} changed after installation.`);
    }
    return installedSnapshot;
  } finally {
    await NodeFSP.rm(temporary, { force: true });
  }
}

async function setLink(filePath, target, snapshot, dependencies, id, recordInstalled) {
  if (snapshot.kind === "symlink") {
    const resolved = NodePath.resolve(NodePath.dirname(filePath), snapshot.target);
    if (resolved === target) return null;
  }
  await dependencies.beforeManagedWrite?.({ id, path: filePath });
  await NodeFSP.mkdir(NodePath.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${NodeCrypto.randomUUID()}.tmp`;
  await NodeFSP.symlink(target, temporary);
  try {
    const current = await snapshotPath(filePath, true);
    if (!snapshotsMatch(snapshot, current)) {
      throw new Error(`T3 Thread ${id} changed during installation.`);
    }
    const installedStatus = await NodeFSP.lstat(temporary);
    await NodeFSP.rename(temporary, filePath);
    const installedSnapshot = {
      kind: "symlink",
      path: filePath,
      target,
      dev: installedStatus.dev,
      ino: installedStatus.ino,
    };
    recordInstalled(installedSnapshot);
    if (dependencies.afterManagedWriteRename) {
      await dependencies.afterManagedWriteRename({ id, path: filePath });
    }
    const installedPath = await snapshotPath(filePath, true);
    if (!snapshotsMatch(installedSnapshot, installedPath)) {
      throw new Error(`T3 Thread ${id} changed after installation.`);
    }
    return installedSnapshot;
  } finally {
    await NodeFSP.rm(temporary, { force: true });
  }
}

export async function installLinuxThread(input, dependencies = {}) {
  const plan = await preflightLinuxThreadInstall(input, dependencies);
  let promoted = false;
  let promotedIdentity = null;
  const changed = [];
  const installedSnapshots = new Map();
  try {
    if (plan.legacyAdoption) {
      await dependencies.beforeLegacyAdoptionMutation?.();
      const currentLegacyRootState = await inspectLegacyThreadInstallRoot(plan.paths);
      if (
        !currentLegacyRootState.compatible ||
        !legacyThreadInstallRootStatesMatch(plan.legacyInstallRootState, currentLegacyRootState)
      ) {
        throw new Error("Legacy T3 Thread install-root state changed after preflight.");
      }
    }
    await assertPhysicalThreadRoots(plan.paths, { createMissing: true });
    if (!plan.targetExists) {
      const staging = `${plan.targetRoot}.${process.pid}.${NodeCrypto.randomUUID()}.tmp`;
      await NodeFSP.mkdir(staging, { recursive: true, mode: 0o700 });
      try {
        await NodeFSP.copyFile(plan.artifactPath, NodePath.join(staging, "T3-Thread.AppImage"));
        await NodeFSP.chmod(NodePath.join(staging, "T3-Thread.AppImage"), 0o755);
        await NodeFSP.copyFile(
          plan.launcherSource,
          NodePath.join(staging, "t3-thread-launcher.mjs"),
        );
        await NodeFSP.chmod(NodePath.join(staging, "t3-thread-launcher.mjs"), 0o755);
        await NodeFSP.writeFile(
          NodePath.join(staging, "manifest.json"),
          `${JSON.stringify(plan.artifactManifest, null, 2)}\n`,
          { mode: 0o644 },
        );
        await NodeFSP.chmod(NodePath.join(staging, "manifest.json"), 0o644);
        if (
          (await sha256(NodePath.join(staging, "T3-Thread.AppImage"))) !== plan.artifactSha256 ||
          (await sha256(NodePath.join(staging, "t3-thread-launcher.mjs"))) !== plan.launcherSha256
        ) {
          throw new Error("Staged T3 Thread artifact failed hash verification.");
        }
        await assertPhysicalThreadRoots(plan.paths, { createMissing: true });
        const racedTarget = await NodeFSP.lstat(plan.targetRoot).catch((error) => {
          if (error?.code === "ENOENT") return null;
          throw error;
        });
        if (racedTarget !== null) {
          throw new Error("T3 Thread artifact target appeared during installation.");
        }
        const stagingStatus = await NodeFSP.lstat(staging);
        if (!stagingStatus.isDirectory() || stagingStatus.isSymbolicLink()) {
          throw new Error("Staged T3 Thread artifact root is unsafe.");
        }
        promotedIdentity = { dev: stagingStatus.dev, ino: stagingStatus.ino };
        await NodeFSP.rename(staging, plan.targetRoot);
        promoted = true;
        changed.push("artifact");
        if (dependencies.afterArtifactPromotion) {
          await dependencies.afterArtifactPromotion(plan.targetRoot);
        }
        const promotedStatus = await NodeFSP.lstat(plan.targetRoot);
        if (
          !promotedStatus.isDirectory() ||
          promotedStatus.isSymbolicLink() ||
          promotedStatus.dev !== promotedIdentity.dev ||
          promotedStatus.ino !== promotedIdentity.ino
        ) {
          throw new Error("Promoted T3 Thread artifact root changed during installation.");
        }
      } finally {
        await NodeFSP.rm(staging, { recursive: true, force: true });
      }
    }
    for (const file of plan.files) {
      await writeManagedFile(file, plan.snapshots.get(file.id), dependencies, (installed) => {
        changed.push(file.id);
        installedSnapshots.set(file.id, installed);
      });
    }
    await setLink(
      plan.paths.currentPath,
      plan.targetRoot,
      plan.snapshots.get("current"),
      dependencies,
      "current",
      (installed) => {
        changed.push("current");
        installedSnapshots.set("current", installed);
      },
    );
    await setLink(
      plan.paths.appImagePath,
      plan.targetArtifact,
      plan.snapshots.get("app-image-link"),
      dependencies,
      "app-image-link",
      (installed) => {
        changed.push("app-image-link");
        installedSnapshots.set("app-image-link", installed);
      },
    );
    return { changed, plan };
  } catch (error) {
    const mutatedSnapshots = changed
      .filter((id) => plan.snapshots.has(id))
      .map((id) => [plan.snapshots.get(id), installedSnapshots.get(id)]);
    const results = await Promise.allSettled(
      mutatedSnapshots
        .toReversed()
        .map(([prior, installed]) => restoreSnapshotIfStillOwned(prior, installed)),
    );
    const artifactFailures = [];
    if (promoted) {
      const current = await NodeFSP.lstat(plan.targetRoot).catch((cause) => {
        if (cause?.code === "ENOENT") return null;
        throw cause;
      });
      if (
        current === null ||
        (current.isDirectory() &&
          !current.isSymbolicLink() &&
          current.dev === promotedIdentity?.dev &&
          current.ino === promotedIdentity?.ino)
      ) {
        if (current !== null) await NodeFSP.rm(plan.targetRoot, { recursive: true });
      } else {
        artifactFailures.push({
          status: "rejected",
          reason: new Error(
            "Refusing to remove a T3 Thread artifact root that changed after promotion.",
          ),
        });
      }
    }
    const failures = [...results, ...artifactFailures].filter(
      (result) => result.status === "rejected",
    );
    if (failures.length > 0) {
      const rollbackError = new Error(
        `T3 Thread installation failed and ${failures.length} managed paths could not be restored.`,
        { cause: error },
      );
      rollbackError.rollbackErrors = failures.map((failure) => failure.reason);
      throw rollbackError;
    }
    throw error;
  }
}

export async function doctorLinuxThread(input) {
  const plan = await prepareLinuxThreadInstall(input);
  const findings = [];
  try {
    await assertPhysicalThreadRoots(plan.paths);
  } catch {
    findings.push("storage:unsafe-root");
  }
  for (const file of plan.files) {
    try {
      const status = await NodeFSP.lstat(file.path);
      const expected = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
      if (!status.isFile() || status.isSymbolicLink()) findings.push(`${file.id}:unsafe-type`);
      else {
        if (!(await NodeFSP.readFile(file.path)).equals(expected))
          findings.push(`${file.id}:content-drift`);
        if ((status.mode & 0o777) !== file.mode) findings.push(`${file.id}:mode-drift`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") findings.push(`${file.id}:missing`);
      else throw error;
    }
  }
  for (const [id, filePath, target] of [
    ["current", plan.paths.currentPath, plan.targetRoot],
    ["app-image-link", plan.paths.appImagePath, plan.targetArtifact],
  ]) {
    try {
      const status = await NodeFSP.lstat(filePath);
      if (!status.isSymbolicLink()) findings.push(`${id}:unsafe-type`);
      else if ((await NodeFSP.realpath(filePath)) !== target) findings.push(`${id}:target-drift`);
    } catch (error) {
      if (error?.code === "ENOENT") findings.push(`${id}:missing`);
      else throw error;
    }
  }
  try {
    const status = await NodeFSP.lstat(plan.targetArtifact);
    if (!status.isFile() || status.isSymbolicLink()) {
      findings.push("artifact:unsafe-type");
    } else {
      if ((status.mode & 0o777) !== 0o755) findings.push("artifact:mode-drift");
      if ((await sha256(plan.targetArtifact)) !== plan.artifactSha256) {
        findings.push("artifact:content-drift");
      }
    }
  } catch (error) {
    if (error?.code === "ENOENT") findings.push("artifact:missing");
    else throw error;
  }
  try {
    const status = await NodeFSP.lstat(plan.targetManifest);
    if (!status.isFile() || status.isSymbolicLink()) {
      findings.push("artifact-manifest:unsafe-type");
    } else {
      if ((status.mode & 0o777) !== 0o644) findings.push("artifact-manifest:mode-drift");
      let installedManifest;
      try {
        installedManifest = JSON.parse(await NodeFSP.readFile(plan.targetManifest, "utf8"));
      } catch {
        findings.push("artifact-manifest:invalid");
      }
      if (
        installedManifest !== undefined &&
        JSON.stringify(installedManifest) !== JSON.stringify(plan.artifactManifest)
      ) {
        findings.push("artifact-manifest:content-drift");
      }
    }
  } catch (error) {
    if (error?.code === "ENOENT") findings.push("artifact-manifest:missing");
    else throw error;
  }
  try {
    const status = await NodeFSP.lstat(plan.targetLauncher);
    if (!status.isFile() || status.isSymbolicLink()) {
      findings.push("artifact-launcher:unsafe-type");
    } else {
      if ((status.mode & 0o777) !== 0o755) findings.push("artifact-launcher:mode-drift");
      if ((await sha256(plan.targetLauncher)) !== plan.launcherSha256) {
        findings.push("artifact-launcher:content-drift");
      }
    }
  } catch (error) {
    if (error?.code === "ENOENT") findings.push("artifact-launcher:missing");
    else throw error;
  }
  const serviceStatus = await NodeFSP.lstat(plan.paths.servicePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (serviceStatus !== null) findings.push("service:unexpected");
  return { ok: findings.length === 0, findings, plan };
}
