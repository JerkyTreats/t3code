import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export const LINUX_THREAD_RELEASE_DESCRIPTOR_VERSION = 1;
export const OFFICIAL_THREAD_PRODUCT_APP_ID = "com.t3tools.t3code.thread";
export const OFFICIAL_THREAD_SOURCE_REPOSITORY = "JerkyTreats/t3code";
export const OFFICIAL_THREAD_ARTIFACT_NAME = "T3-Thread.AppImage";
export const OFFICIAL_THREAD_LAUNCHER_NAME = "t3-thread-launcher.mjs";
export const THREAD_BUILD_ARCHITECTURE = "x64";
export const LINUX_THREAD_RELEASE_DESCRIPTOR_SUFFIX = ".release.json";

async function sha256RegularFile(filePath, label) {
  const noFollow = NodeFS.constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    throw new Error("This platform cannot verify a T3 Thread release without following links.");
  }
  const handle = await NodeFSP.open(filePath, NodeFS.constants.O_RDONLY | noFollow);
  try {
    const status = await handle.stat();
    if (!status.isFile()) throw new Error(`${label} must be a physical regular file.`);
    const hash = NodeCrypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

function assertDescriptor(value) {
  const exactKeys = [
    "architecture",
    "artifactFileName",
    "artifactSha256",
    "commitHash",
    "contractVersion",
    "launcherFileName",
    "launcherSha256",
    "productAppId",
    "sourceRepository",
    "version",
  ];
  if (
    value === null ||
    typeof value !== "object" ||
    Object.keys(value).toSorted().join("\0") !== exactKeys.toSorted().join("\0") ||
    value?.contractVersion !== LINUX_THREAD_RELEASE_DESCRIPTOR_VERSION ||
    value.artifactFileName !== OFFICIAL_THREAD_ARTIFACT_NAME ||
    value.launcherFileName !== OFFICIAL_THREAD_LAUNCHER_NAME ||
    typeof value.artifactSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(value.artifactSha256) ||
    typeof value.launcherSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(value.launcherSha256) ||
    typeof value.version !== "string" ||
    value.version.length === 0 ||
    value.version.trim() !== value.version ||
    typeof value.commitHash !== "string" ||
    !/^[0-9a-f]{40}$/u.test(value.commitHash) ||
    !new Set(["x64", "arm64"]).has(value.architecture) ||
    value.productAppId !== OFFICIAL_THREAD_PRODUCT_APP_ID ||
    value.sourceRepository !== OFFICIAL_THREAD_SOURCE_REPOSITORY
  ) {
    throw new Error("T3 Thread release descriptor is invalid.");
  }
  return value;
}

export function linuxThreadReleaseDescriptorPath(artifactPath) {
  return `${artifactPath}${LINUX_THREAD_RELEASE_DESCRIPTOR_SUFFIX}`;
}

export async function createLinuxThreadReleaseDescriptor(input) {
  if (NodePath.basename(input.artifactPath) !== OFFICIAL_THREAD_ARTIFACT_NAME) {
    throw new Error("T3 Thread artifact has an unexpected filename.");
  }
  if (NodePath.basename(input.launcherPath) !== OFFICIAL_THREAD_LAUNCHER_NAME) {
    throw new Error("T3 Thread launcher has an unexpected filename.");
  }
  return assertDescriptor({
    contractVersion: LINUX_THREAD_RELEASE_DESCRIPTOR_VERSION,
    artifactFileName: OFFICIAL_THREAD_ARTIFACT_NAME,
    launcherFileName: OFFICIAL_THREAD_LAUNCHER_NAME,
    artifactSha256: await sha256RegularFile(input.artifactPath, "T3 Thread artifact"),
    launcherSha256: await sha256RegularFile(input.launcherPath, "T3 Thread launcher"),
    version: input.version,
    commitHash: input.commitHash.toLowerCase(),
    architecture: input.architecture,
    productAppId: OFFICIAL_THREAD_PRODUCT_APP_ID,
    sourceRepository: OFFICIAL_THREAD_SOURCE_REPOSITORY,
  });
}

export async function writeLinuxThreadReleaseDescriptor(input) {
  const descriptor = await createLinuxThreadReleaseDescriptor(input);
  const descriptorPath = linuxThreadReleaseDescriptorPath(input.artifactPath);
  const temporaryPath = `${descriptorPath}.${process.pid}.${NodeCrypto.randomUUID()}.tmp`;
  await NodeFSP.writeFile(temporaryPath, `${JSON.stringify(descriptor, null, 2)}\n`, {
    flag: "wx",
    mode: 0o644,
  });
  try {
    await NodeFSP.chmod(temporaryPath, 0o644);
    await NodeFSP.rename(temporaryPath, descriptorPath);
  } finally {
    await NodeFSP.rm(temporaryPath, { force: true });
  }
  return { descriptor, descriptorPath };
}

export async function readAndVerifyLinuxThreadReleaseDescriptor(input) {
  let descriptor;
  try {
    const noFollow = NodeFS.constants.O_NOFOLLOW;
    if (!Number.isInteger(noFollow)) throw new Error("No no-follow support.");
    const handle = await NodeFSP.open(input.descriptorPath, NodeFS.constants.O_RDONLY | noFollow);
    try {
      const status = await handle.stat();
      if (!status.isFile()) throw new Error("Descriptor is not a regular file.");
      descriptor = assertDescriptor(JSON.parse(await handle.readFile("utf8")));
    } finally {
      await handle.close();
    }
  } catch {
    throw new Error("T3 Thread release descriptor could not be read.");
  }
  if (
    NodePath.basename(input.artifactPath) !== descriptor.artifactFileName ||
    NodePath.basename(input.launcherPath) !== descriptor.launcherFileName
  ) {
    throw new Error("T3 Thread release descriptor names different inputs.");
  }
  const [artifactSha256, launcherSha256] = await Promise.all([
    sha256RegularFile(input.artifactPath, "T3 Thread artifact"),
    sha256RegularFile(input.launcherPath, "T3 Thread launcher"),
  ]);
  if (
    artifactSha256 !== descriptor.artifactSha256 ||
    launcherSha256 !== descriptor.launcherSha256
  ) {
    throw new Error("T3 Thread release inputs do not match their descriptor.");
  }
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone Linux release validation must match the current host architecture.
  const hostArchitecture = NodeOS.arch();
  if (descriptor.architecture !== hostArchitecture) {
    throw new Error("T3 Thread release architecture does not match this host.");
  }
  return descriptor;
}
