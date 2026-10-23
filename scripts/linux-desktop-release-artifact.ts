// @effect-diagnostics nodeBuiltinImport:off -- Release-only Node script uses descriptor-safe no-follow file handles.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import {
  OFFICIAL_DESKTOP_UPDATER_REPOSITORY,
  officialDesktopRepository,
} from "@t3tools/shared/forkReleaseIdentity";

export const LINUX_DESKTOP_RELEASE_DESCRIPTOR_VERSION = 1 as const;
export const OFFICIAL_DESKTOP_PRODUCT_APP_ID = "com.t3tools.t3code";
export const LINUX_DESKTOP_RELEASE_DESCRIPTOR_SUFFIX = ".release.json";
export { OFFICIAL_DESKTOP_UPDATER_REPOSITORY };

export interface LinuxDesktopReleaseDescriptor {
  readonly contractVersion: typeof LINUX_DESKTOP_RELEASE_DESCRIPTOR_VERSION;
  readonly artifactFileName: string;
  readonly artifactSha256: string;
  readonly version: string;
  readonly commitHash: string;
  readonly architecture: "x64" | "arm64";
  readonly productAppId: typeof OFFICIAL_DESKTOP_PRODUCT_APP_ID;
  readonly updaterRepository: string;
}

export interface LinuxDesktopReleaseDescriptorInput {
  readonly artifactPath: string;
  readonly version: string;
  readonly commitHash: string;
  readonly architecture: "x64" | "arm64";
  readonly updaterRepository?: string;
  readonly mockTestMode?: boolean;
}

function assertUpdaterRepository(repository: string, mockTestMode: boolean): void {
  if (officialDesktopRepository(repository) === null && !mockTestMode) {
    throw new Error("Linux desktop releases require the exact official updater repository.");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    throw new Error("Linux desktop updater repository metadata is invalid.");
  }
}

function assertDescriptor(value: unknown, mockTestMode: boolean): LinuxDesktopReleaseDescriptor {
  const descriptor = value as Partial<LinuxDesktopReleaseDescriptor> | null;
  if (
    descriptor?.contractVersion !== LINUX_DESKTOP_RELEASE_DESCRIPTOR_VERSION ||
    typeof descriptor.artifactFileName !== "string" ||
    NodePath.basename(descriptor.artifactFileName) !== descriptor.artifactFileName ||
    !descriptor.artifactFileName.endsWith(".AppImage") ||
    typeof descriptor.artifactSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(descriptor.artifactSha256) ||
    typeof descriptor.version !== "string" ||
    descriptor.version.trim() !== descriptor.version ||
    descriptor.version.length === 0 ||
    typeof descriptor.commitHash !== "string" ||
    !/^[0-9a-f]{40}$/u.test(descriptor.commitHash) ||
    !["x64", "arm64"].includes(descriptor.architecture ?? "") ||
    descriptor.productAppId !== OFFICIAL_DESKTOP_PRODUCT_APP_ID ||
    typeof descriptor.updaterRepository !== "string"
  ) {
    throw new Error("Linux desktop release descriptor is invalid.");
  }
  assertUpdaterRepository(descriptor.updaterRepository, mockTestMode);
  return descriptor as LinuxDesktopReleaseDescriptor;
}

async function openRegularFileNoFollow(filePath: string, label: string) {
  const noFollow = NodeFS.constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    throw new Error("This platform cannot verify a Linux desktop release without following links.");
  }
  const handle = await NodeFSP.open(filePath, NodeFS.constants.O_RDONLY | noFollow);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`${label} must be a regular file.`);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function sha256RegularFile(filePath: string): Promise<string> {
  const handle = await openRegularFileNoFollow(filePath, "Linux desktop release artifact");
  try {
    const hash = NodeCrypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1_024);
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

export async function readDescriptorBoundRegularFile(
  filePath: string,
  afterOpen?: () => Promise<void>,
): Promise<string> {
  const handle = await openRegularFileNoFollow(filePath, "Linux desktop release descriptor");
  try {
    await afterOpen?.();
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

export function linuxDesktopReleaseDescriptorPath(artifactPath: string): string {
  return `${artifactPath}${LINUX_DESKTOP_RELEASE_DESCRIPTOR_SUFFIX}`;
}

export async function createLinuxDesktopReleaseDescriptor(
  input: LinuxDesktopReleaseDescriptorInput,
): Promise<LinuxDesktopReleaseDescriptor> {
  const updaterRepository = input.updaterRepository ?? OFFICIAL_DESKTOP_UPDATER_REPOSITORY;
  assertUpdaterRepository(updaterRepository, input.mockTestMode === true);
  const descriptor = {
    contractVersion: LINUX_DESKTOP_RELEASE_DESCRIPTOR_VERSION,
    artifactFileName: NodePath.basename(input.artifactPath),
    artifactSha256: await sha256RegularFile(input.artifactPath),
    version: input.version,
    commitHash: input.commitHash.toLowerCase(),
    architecture: input.architecture,
    productAppId: OFFICIAL_DESKTOP_PRODUCT_APP_ID,
    updaterRepository,
  } as const;
  return assertDescriptor(descriptor, input.mockTestMode === true);
}

export async function writeLinuxDesktopReleaseDescriptor(
  input: LinuxDesktopReleaseDescriptorInput,
): Promise<{
  readonly descriptor: LinuxDesktopReleaseDescriptor;
  readonly descriptorPath: string;
}> {
  const descriptor = await createLinuxDesktopReleaseDescriptor(input);
  const descriptorPath = linuxDesktopReleaseDescriptorPath(input.artifactPath);
  const temporaryPath = `${descriptorPath}.${process.pid}.${NodeCrypto.randomUUID()}.tmp`;
  await NodeFSP.writeFile(temporaryPath, `${JSON.stringify(descriptor, null, 2)}\n`, {
    flag: "wx",
    mode: 0o644,
  });
  try {
    await NodeFSP.rename(temporaryPath, descriptorPath);
  } finally {
    await NodeFSP.rm(temporaryPath, { force: true });
  }
  return { descriptor, descriptorPath };
}

export async function readAndVerifyLinuxDesktopReleaseDescriptor(input: {
  readonly artifactPath: string;
  readonly descriptorPath: string;
  readonly mockTestMode?: boolean;
}): Promise<LinuxDesktopReleaseDescriptor> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(await readDescriptorBoundRegularFile(input.descriptorPath));
  } catch {
    throw new Error("Linux desktop release descriptor could not be read.");
  }
  const descriptor = assertDescriptor(decoded, input.mockTestMode === true);
  if (descriptor.artifactFileName !== NodePath.basename(input.artifactPath)) {
    throw new Error("Linux desktop release descriptor names a different artifact.");
  }
  const actualSha256 = await sha256RegularFile(input.artifactPath);
  if (actualSha256 !== descriptor.artifactSha256) {
    throw new Error("Linux desktop release artifact checksum does not match its descriptor.");
  }
  return descriptor;
}

export function selectSingleLinuxAppImage(paths: ReadonlyArray<string>): string {
  const appImages = paths.filter((filePath) => filePath.endsWith(".AppImage"));
  if (appImages.length !== 1) {
    throw new Error(`Expected exactly one final Linux AppImage, found ${appImages.length}.`);
  }
  return appImages[0]!;
}
