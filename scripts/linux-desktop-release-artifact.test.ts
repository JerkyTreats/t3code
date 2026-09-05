// @effect-diagnostics nodeBuiltinImport:off -- Tests exercise the standalone Node descriptor helper.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, expect, it } from "vite-plus/test";

import {
  OFFICIAL_DESKTOP_PRODUCT_APP_ID,
  OFFICIAL_DESKTOP_UPDATER_REPOSITORY,
  createLinuxDesktopReleaseDescriptor,
  readAndVerifyLinuxDesktopReleaseDescriptor,
  readDescriptorBoundRegularFile,
  selectSingleLinuxAppImage,
  writeLinuxDesktopReleaseDescriptor,
} from "./linux-desktop-release-artifact.ts";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";

async function fixture() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-release-descriptor-"));
  const artifactPath = NodePath.join(root, "T3-Code-1.2.3-x86_64.AppImage");
  await NodeFSP.writeFile(artifactPath, "app-image");
  return { root, artifactPath };
}

describe("Linux desktop release artifact descriptor", () => {
  it("binds the final artifact and official release identity", async () => {
    const value = await fixture();
    try {
      const written = await writeLinuxDesktopReleaseDescriptor({
        artifactPath: value.artifactPath,
        version: "1.2.3",
        commitHash: COMMIT,
        architecture: "x64",
      });
      const descriptor = await readAndVerifyLinuxDesktopReleaseDescriptor({
        artifactPath: value.artifactPath,
        descriptorPath: written.descriptorPath,
      });
      assert.equal(descriptor.artifactFileName, NodePath.basename(value.artifactPath));
      assert.equal(descriptor.version, "1.2.3");
      assert.equal(descriptor.commitHash, COMMIT);
      assert.equal(descriptor.architecture, "x64");
      assert.equal(descriptor.productAppId, OFFICIAL_DESKTOP_PRODUCT_APP_ID);
      assert.equal(descriptor.updaterRepository, OFFICIAL_DESKTOP_UPDATER_REPOSITORY);
      assert.match(descriptor.artifactSha256, /^[0-9a-f]{64}$/u);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects modified artifacts", async () => {
    const value = await fixture();
    try {
      const written = await writeLinuxDesktopReleaseDescriptor({
        artifactPath: value.artifactPath,
        version: "1.2.3",
        commitHash: COMMIT,
        architecture: "x64",
      });
      await NodeFSP.appendFile(value.artifactPath, "changed");
      await expect(
        readAndVerifyLinuxDesktopReleaseDescriptor({
          artifactPath: value.artifactPath,
          descriptorPath: written.descriptorPath,
        }),
      ).rejects.toThrow("checksum");
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a descriptor symlink without following it", async () => {
    const value = await fixture();
    try {
      const written = await writeLinuxDesktopReleaseDescriptor({
        artifactPath: value.artifactPath,
        version: "1.2.3",
        commitHash: COMMIT,
        architecture: "x64",
      });
      const symlinkPath = NodePath.join(value.root, "linked.release.json");
      await NodeFSP.symlink(written.descriptorPath, symlinkPath);

      await expect(
        readAndVerifyLinuxDesktopReleaseDescriptor({
          artifactPath: value.artifactPath,
          descriptorPath: symlinkPath,
        }),
      ).rejects.toThrow("descriptor could not be read");
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("keeps descriptor reads bound to the opened regular file across a path swap", async () => {
    const value = await fixture();
    try {
      const descriptorPath = NodePath.join(value.root, "release.json");
      const openedContents = '{"source":"opened-descriptor"}\n';
      await NodeFSP.writeFile(descriptorPath, openedContents);

      const readContents = await readDescriptorBoundRegularFile(descriptorPath, async () => {
        await NodeFSP.rename(descriptorPath, NodePath.join(value.root, "opened.release.json"));
        await NodeFSP.writeFile(descriptorPath, '{"source":"replacement-path"}\n');
      });

      assert.equal(readContents, openedContents);
      assert.equal(
        await NodeFSP.readFile(descriptorPath, "utf8"),
        '{"source":"replacement-path"}\n',
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("fails closed on another updater repository outside explicit mock tests", async () => {
    const value = await fixture();
    try {
      await expect(
        createLinuxDesktopReleaseDescriptor({
          artifactPath: value.artifactPath,
          version: "1.2.3",
          commitHash: COMMIT,
          architecture: "x64",
          updaterRepository: "another/example",
        }),
      ).rejects.toThrow("exact official updater repository");

      const descriptor = await createLinuxDesktopReleaseDescriptor({
        artifactPath: value.artifactPath,
        version: "1.2.3",
        commitHash: COMMIT,
        architecture: "x64",
        updaterRepository: "mock/example",
        mockTestMode: true,
      });
      assert.equal(descriptor.updaterRepository, "mock/example");
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("requires exactly one final AppImage", () => {
    assert.equal(selectSingleLinuxAppImage(["notes.txt", "T3-Code.AppImage"]), "T3-Code.AppImage");
    expect(() => selectSingleLinuxAppImage([])).toThrow("found 0");
    expect(() => selectSingleLinuxAppImage(["a.AppImage", "b.AppImage"])).toThrow("found 2");
  });
});
