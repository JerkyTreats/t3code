import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { expect, it } from "vite-plus/test";

import {
  OFFICIAL_THREAD_SOURCE_REPOSITORY,
  createLinuxThreadReleaseDescriptor,
  readAndVerifyLinuxThreadReleaseDescriptor,
  writeLinuxThreadReleaseDescriptor,
} from "./linux-thread-release-artifact.mjs";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";
// oxlint-disable-next-line t3code/no-global-process-runtime -- Descriptor fixtures must match the standalone verifier host.
const HOST_ARCHITECTURE = NodeOS.arch();

async function withFixture(run) {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "thread-descriptor-test-"));
  const artifactPath = NodePath.join(root, "T3-Thread.AppImage");
  const launcherPath = NodePath.join(root, "t3-thread-launcher.mjs");
  await NodeFSP.writeFile(artifactPath, "synthetic app image\n", { mode: 0o755 });
  await NodeFSP.writeFile(launcherPath, "#!/usr/bin/env node\n", { mode: 0o755 });
  try {
    return await run({ root, artifactPath, launcherPath });
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
}

it("records fixed source provenance and separate exact artifact digests", () =>
  withFixture(async ({ artifactPath, launcherPath }) => {
    const descriptor = await createLinuxThreadReleaseDescriptor({
      artifactPath,
      launcherPath,
      version: "1.2.3",
      commitHash: COMMIT.toUpperCase(),
      architecture: HOST_ARCHITECTURE,
    });
    expect(descriptor).toMatchObject({
      commitHash: COMMIT,
      productAppId: "com.t3tools.t3code.thread",
      sourceRepository: OFFICIAL_THREAD_SOURCE_REPOSITORY,
    });
    expect(descriptor).not.toHaveProperty("updaterRepository");
    expect(descriptor.artifactSha256).toBe(
      NodeCrypto.createHash("sha256").update("synthetic app image\n").digest("hex"),
    );
    expect(descriptor.launcherSha256).not.toBe(descriptor.artifactSha256);
  }));

it("round trips only the exact descriptor shape", () =>
  withFixture(async ({ artifactPath, launcherPath }) => {
    const { descriptor, descriptorPath } = await writeLinuxThreadReleaseDescriptor({
      artifactPath,
      launcherPath,
      version: "1.2.3",
      commitHash: COMMIT,
      architecture: HOST_ARCHITECTURE,
    });
    await expect(
      readAndVerifyLinuxThreadReleaseDescriptor({ artifactPath, launcherPath, descriptorPath }),
    ).resolves.toEqual(descriptor);
    await NodeFSP.writeFile(
      descriptorPath,
      `${JSON.stringify({ ...descriptor, updaterRepository: "example/other" })}\n`,
    );
    await expect(
      readAndVerifyLinuxThreadReleaseDescriptor({ artifactPath, launcherPath, descriptorPath }),
    ).rejects.toThrow("descriptor could not be read");
  }));

it("rejects either artifact changing after descriptor creation", () =>
  withFixture(async ({ artifactPath, launcherPath }) => {
    const { descriptorPath } = await writeLinuxThreadReleaseDescriptor({
      artifactPath,
      launcherPath,
      version: "1.2.3",
      commitHash: COMMIT,
      architecture: HOST_ARCHITECTURE,
    });
    await NodeFSP.appendFile(artifactPath, "tampered\n");
    await expect(
      readAndVerifyLinuxThreadReleaseDescriptor({ artifactPath, launcherPath, descriptorPath }),
    ).rejects.toThrow("inputs do not match");
  }));

it("refuses linked release inputs", () =>
  withFixture(async ({ root, artifactPath, launcherPath }) => {
    const physical = NodePath.join(root, "physical.AppImage");
    await NodeFSP.rename(artifactPath, physical);
    await NodeFSP.symlink(physical, artifactPath);
    await expect(
      createLinuxThreadReleaseDescriptor({
        artifactPath,
        launcherPath,
        version: "1.2.3",
        commitHash: COMMIT,
        architecture: HOST_ARCHITECTURE,
      }),
    ).rejects.toThrow();
  }));
