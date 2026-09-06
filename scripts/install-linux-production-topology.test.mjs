import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, expect, it } from "vite-plus/test";

import { writeLinuxDesktopReleaseDescriptor } from "./linux-desktop-release-artifact.ts";
import {
  THREAD_BUILD_ARCHITECTURE,
  writeLinuxThreadReleaseDescriptor,
} from "./linux-thread-release-artifact.mjs";
import {
  doctorLinuxProductionTopology,
  installLinuxProductionTopology,
  parseLinuxProductionTopologyArguments,
} from "./install-linux-production-topology.mjs";
import { installLinuxThread, resolveThreadInstallPaths } from "./install-linux-thread.mjs";
import { resolveInstallPaths } from "./install-linux-desktop.mjs";
import { resolveQuattroPaths } from "./quattro-native-bootstrap.mjs";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";
// oxlint-disable-next-line t3code/no-global-process-runtime -- Artifact fixtures must match the standalone installer's host architecture.
const HOST_ARCHITECTURE = NodeOS.arch();
const desktopValidatorMissing = NodeChildProcess.spawnSync("desktop-file-validate", ["--version"], {
  stdio: "ignore",
}).error;

async function executable(filePath, content) {
  await NodeFSP.mkdir(NodePath.dirname(filePath), { recursive: true });
  await NodeFSP.writeFile(filePath, content, { mode: 0o755 });
}

function legacyThreadAppImage(architecture = THREAD_BUILD_ARCHITECTURE) {
  const content = Buffer.alloc(1024 * 1024, 0x61);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x41, 0x49, 0x02]).copy(content);
  content.writeUInt16LE(architecture === "arm64" ? 0xb7 : 0x3e, 18);
  return content;
}

function legacyThreadDependencies(artifact) {
  return {
    legacyArtifactSha256Allowlist: new Set([
      NodeCrypto.createHash("sha256").update(artifact).digest("hex"),
    ]),
  };
}

async function seedLegacyThreadPair(input, threadPaths, artifact = legacyThreadAppImage()) {
  await NodeFSP.mkdir(NodePath.dirname(threadPaths.launcherPath), { recursive: true });
  await NodeFSP.copyFile(input.thread.launcherPath, threadPaths.launcherPath);
  await NodeFSP.chmod(threadPaths.launcherPath, 0o755);
  await NodeFSP.writeFile(threadPaths.appImagePath, artifact, { mode: 0o755 });
  await NodeFSP.chmod(threadPaths.appImagePath, 0o755);
  return artifact;
}

async function fixture() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-topology-test-"));
  const environment = {
    HOME: NodePath.join(root, "home"),
    XDG_DATA_HOME: NodePath.join(root, "data"),
    XDG_CONFIG_HOME: NodePath.join(root, "config"),
    XDG_RUNTIME_DIR: NodePath.join(root, "runtime"),
    XDG_DATA_DIRS: NodePath.join(root, "system-data"),
  };
  const releaseRoot = NodePath.join(root, "releases");
  const releasePath = NodePath.join(releaseRoot, "t3code-deploy-v1.2.3-abcdef0");
  await NodeFSP.mkdir(NodePath.join(releasePath, "apps", "server", "dist", "client"), {
    recursive: true,
  });
  await NodeFSP.writeFile(
    NodePath.join(releasePath, "apps", "server", "dist", "bin.mjs"),
    "export {};\n",
  );
  await NodeFSP.writeFile(
    NodePath.join(releasePath, "apps", "server", "dist", "client", "index.html"),
    "<!doctype html>\n",
  );
  await NodeFSP.writeFile(NodePath.join(releasePath, "package.json"), '{"version":"1.2.3"}\n');
  await Promise.all([
    NodeFSP.mkdir(NodePath.join(root, "state"), { recursive: true }),
    NodeFSP.mkdir(NodePath.join(root, "workspaces"), { recursive: true }),
  ]);
  const desktopArtifact = NodePath.join(root, "T3-Code.AppImage");
  await executable(desktopArtifact, "desktop artifact\n");
  const { descriptorPath: desktopDescriptor } = await writeLinuxDesktopReleaseDescriptor({
    artifactPath: desktopArtifact,
    version: "1.2.3",
    commitHash: COMMIT,
    architecture: HOST_ARCHITECTURE,
  });
  const threadArtifact = NodePath.join(root, "T3-Thread.AppImage");
  const threadLauncher = NodePath.join(root, "t3-thread-launcher.mjs");
  await executable(threadArtifact, "thread artifact\n");
  await executable(threadLauncher, "#!/usr/bin/env node\n");
  const { descriptorPath: threadDescriptor } = await writeLinuxThreadReleaseDescriptor({
    artifactPath: threadArtifact,
    launcherPath: threadLauncher,
    version: "1.2.3",
    commitHash: COMMIT,
    architecture: THREAD_BUILD_ARCHITECTURE,
  });
  const hostPaths = resolveQuattroPaths(environment);
  const desktopPaths = resolveInstallPaths(environment);
  const threadPaths = resolveThreadInstallPaths(environment);
  const input = {
    environment,
    productionServerUrl: "https://production.example.test/",
    refreshDesktopIntegration: false,
    host: {
      releaseRoot,
      releasePath,
      stateDirectory: NodePath.join(root, "state"),
      workspaceRoot: NodePath.join(root, "workspaces"),
      nodePath: process.execPath,
      paths: hostPaths,
      inspectRuntime: false,
    },
    desktop: {
      artifactPath: desktopArtifact,
      descriptorPath: desktopDescriptor,
      runtimeDirectory: environment.XDG_RUNTIME_DIR,
      nodeExecutable: process.execPath,
      omarchyIntegration: false,
      paths: desktopPaths,
    },
    thread: {
      artifactPath: threadArtifact,
      launcherPath: threadLauncher,
      descriptorPath: threadDescriptor,
      paths: threadPaths,
    },
  };
  return { root, environment, input, releaseRoot, hostPaths, desktopPaths, threadPaths };
}

async function withFixture(run) {
  const value = await fixture();
  try {
    return await run(value);
  } finally {
    await NodeFSP.rm(value.root, { recursive: true, force: true });
  }
}

describe("Linux production topology installer", () => {
  it("installs one host, one production T3 Code client, and one independent Thread client", () =>
    withFixture(async ({ input, hostPaths, desktopPaths, threadPaths }) => {
      const first = await installLinuxProductionTopology(input);
      assert.isAbove(first.host.changed.length, 0);
      assert.isAbove(first.thread.changed.length, 0);
      assert.equal(first.thread.plan.releaseDescriptor.architecture, THREAD_BUILD_ARCHITECTURE);
      assert.isTrue((await NodeFSP.lstat(hostPaths.servicePath)).isFile());
      assert.isTrue((await NodeFSP.lstat(desktopPaths.servicePath)).isFile());
      assert.isTrue((await NodeFSP.lstat(desktopPaths.desktopEntryPath)).isFile());
      assert.isTrue((await NodeFSP.lstat(threadPaths.desktopEntryPath)).isFile());
      await expect(NodeFSP.lstat(desktopPaths.stagingServicePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(NodeFSP.lstat(desktopPaths.stagingDesktopEntryPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      assert.include(
        await NodeFSP.readFile(threadPaths.desktopEntryPath, "utf8"),
        "T3_THREAD_SERVER_URL=https://production.example.test/",
      );
      assert.notInclude(await NodeFSP.readFile(hostPaths.servicePath, "utf8"), "Electron");
      assert.isTrue((await doctorLinuxProductionTopology(input)).ok);
    }));

  it("is idempotent and retains the exact server release pointer inode", () =>
    withFixture(async ({ input, hostPaths, desktopPaths, threadPaths }) => {
      const first = await installLinuxProductionTopology(input);
      const pointerBefore = await NodeFSP.lstat(hostPaths.releaseLink);
      const threadCurrentBefore = await NodeFSP.lstat(threadPaths.currentPath);
      const desktopPathsToPreserve = [
        desktopPaths.launcherPath,
        desktopPaths.servicePath,
        desktopPaths.desktopEntryPath,
        desktopPaths.urlHandlerPath,
        desktopPaths.ownershipManifestPath,
        desktopPaths.currentPath,
        NodePath.join(first.desktop.targetRoot, "T3-Code.AppImage"),
        NodePath.join(first.desktop.targetRoot, "manifest.json"),
      ];
      const desktopBefore = new Map(
        await Promise.all(
          desktopPathsToPreserve.map(async (filePath) => [filePath, await NodeFSP.lstat(filePath)]),
        ),
      );
      const second = await installLinuxProductionTopology(input);
      assert.deepEqual(second.host.changed, []);
      assert.deepEqual(second.thread.changed, []);
      assert.equal((await NodeFSP.lstat(hostPaths.releaseLink)).ino, pointerBefore.ino);
      assert.equal((await NodeFSP.lstat(threadPaths.currentPath)).ino, threadCurrentBefore.ino);
      for (const filePath of desktopPathsToPreserve) {
        const before = desktopBefore.get(filePath);
        const after = await NodeFSP.lstat(filePath);
        assert.equal(after.ino, before.ino);
        assert.equal(after.mtimeMs, before.mtimeMs);
        assert.equal(after.ctimeMs, before.ctimeMs);
      }
    }));

  it.skipIf(desktopValidatorMissing)("passes native validation for both client entries", () =>
    withFixture(async ({ input, desktopPaths, threadPaths }) => {
      await installLinuxProductionTopology(input);
      assert.equal(
        NodeChildProcess.spawnSync("desktop-file-validate", [desktopPaths.desktopEntryPath]).status,
        0,
      );
      assert.equal(
        NodeChildProcess.spawnSync("desktop-file-validate", [threadPaths.desktopEntryPath]).status,
        0,
      );
    }),
  );

  it("surfaces a different server target before writing any client file", () =>
    withFixture(async ({ input, releaseRoot, hostPaths, desktopPaths, threadPaths }) => {
      const alternate = NodePath.join(releaseRoot, "t3code-deploy-v2.0.0-fedcba0");
      await NodeFSP.mkdir(alternate);
      await NodeFSP.mkdir(NodePath.dirname(hostPaths.releaseLink), { recursive: true });
      await NodeFSP.symlink(alternate, hostPaths.releaseLink);
      await expect(installLinuxProductionTopology(input)).rejects.toThrow(/different release/);
      await expect(NodeFSP.lstat(desktopPaths.servicePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(NodeFSP.lstat(threadPaths.launcherPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }));

  it("rejects unowned Thread collisions during aggregate preflight", () =>
    withFixture(async ({ input, hostPaths, desktopPaths, threadPaths }) => {
      await NodeFSP.mkdir(NodePath.dirname(threadPaths.launcherPath), { recursive: true });
      await NodeFSP.writeFile(threadPaths.launcherPath, "unowned\n");
      await expect(installLinuxProductionTopology(input)).rejects.toThrow(/unowned T3 Thread/);
      await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(NodeFSP.lstat(desktopPaths.servicePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      assert.equal(await NodeFSP.readFile(threadPaths.launcherPath, "utf8"), "unowned\n");
    }));

  it("adopts only the exact canonical legacy Thread pair", () =>
    withFixture(async ({ input, threadPaths }) => {
      const backupsPath = NodePath.join(threadPaths.installRoot, "backups");
      const artifactBackup = NodePath.join(backupsPath, "T3-Thread.AppImage.prior");
      const launcherBackup = NodePath.join(backupsPath, "t3code-thread.prior");
      await NodeFSP.mkdir(backupsPath, { recursive: true, mode: 0o700 });
      await NodeFSP.chmod(backupsPath, 0o700);
      await NodeFSP.writeFile(artifactBackup, "prior artifact snapshot\n");
      await NodeFSP.writeFile(launcherBackup, "prior launcher snapshot\n");
      const backupsBefore = await NodeFSP.lstat(backupsPath);
      const artifactBackupBefore = await NodeFSP.lstat(artifactBackup);
      const launcherBackupBefore = await NodeFSP.lstat(launcherBackup);
      const legacyArtifact = await seedLegacyThreadPair(input, threadPaths);
      const launcherBefore = await NodeFSP.lstat(threadPaths.launcherPath);
      const result = await installLinuxProductionTopology(input, {
        thread: legacyThreadDependencies(legacyArtifact),
      });
      assert.isTrue(result.thread.plan.legacyAdoption);
      assert.equal((await NodeFSP.lstat(threadPaths.launcherPath)).ino, launcherBefore.ino);
      assert.isTrue((await NodeFSP.lstat(threadPaths.appImagePath)).isSymbolicLink());
      assert.deepEqual(
        await NodeFSP.readFile(result.thread.plan.targetArtifact),
        Buffer.from("thread artifact\n"),
      );
      assert.notDeepEqual(
        await NodeFSP.readFile(result.thread.plan.targetArtifact),
        legacyArtifact,
      );
      assert.isTrue((await NodeFSP.lstat(threadPaths.ownershipManifestPath)).isFile());
      assert.isTrue((await NodeFSP.lstat(threadPaths.desktopEntryPath)).isFile());
      assert.equal((await NodeFSP.lstat(backupsPath)).ino, backupsBefore.ino);
      assert.equal((await NodeFSP.lstat(artifactBackup)).ino, artifactBackupBefore.ino);
      assert.equal((await NodeFSP.lstat(launcherBackup)).ino, launcherBackupBefore.ino);
      assert.equal(await NodeFSP.readFile(artifactBackup, "utf8"), "prior artifact snapshot\n");
      assert.equal(await NodeFSP.readFile(launcherBackup, "utf8"), "prior launcher snapshot\n");
      const ownership = JSON.parse(
        await NodeFSP.readFile(threadPaths.ownershipManifestPath, "utf8"),
      );
      assert.notInclude(ownership.managedPaths, backupsPath);
    }));

  it("rejects unsafe or unexpected legacy Thread install-root residue", async () => {
    for (const residue of ["symlink", "file", "wrong-mode", "unexpected"]) {
      await withFixture(async ({ input, root, hostPaths, threadPaths }) => {
        await NodeFSP.mkdir(threadPaths.installRoot, { recursive: true });
        const backupsPath = NodePath.join(threadPaths.installRoot, "backups");
        if (residue === "symlink") {
          const external = NodePath.join(root, "external-backups");
          await NodeFSP.mkdir(external);
          await NodeFSP.symlink(external, backupsPath);
        } else if (residue === "file") {
          await NodeFSP.writeFile(backupsPath, "not a directory\n");
        } else if (residue === "wrong-mode") {
          await NodeFSP.mkdir(backupsPath, { mode: 0o755 });
          await NodeFSP.chmod(backupsPath, 0o755);
        } else {
          await NodeFSP.mkdir(NodePath.join(threadPaths.installRoot, "unexpected"));
        }
        const legacyArtifact = await seedLegacyThreadPair(input, threadPaths);
        await expect(
          installLinuxProductionTopology(input, {
            thread: legacyThreadDependencies(legacyArtifact),
          }),
        ).rejects.toThrow(/incomplete or unverified legacy T3 Thread installation/);
        await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({
          code: "ENOENT",
        });
        assert.isTrue((await NodeFSP.lstat(threadPaths.appImagePath)).isFile());
      });
    }
  });

  it("rejects partial legacy Thread pairs before topology writes", async () => {
    for (const retained of ["launcher", "artifact"]) {
      await withFixture(async ({ input, hostPaths, desktopPaths, threadPaths }) => {
        if (retained === "launcher") {
          await NodeFSP.mkdir(NodePath.dirname(threadPaths.launcherPath), { recursive: true });
          await NodeFSP.copyFile(input.thread.launcherPath, threadPaths.launcherPath);
          await NodeFSP.chmod(threadPaths.launcherPath, 0o755);
        } else {
          await NodeFSP.mkdir(NodePath.dirname(threadPaths.appImagePath), { recursive: true });
          await NodeFSP.writeFile(threadPaths.appImagePath, legacyThreadAppImage(), {
            mode: 0o755,
          });
          await NodeFSP.chmod(threadPaths.appImagePath, 0o755);
        }
        await expect(installLinuxProductionTopology(input)).rejects.toThrow(
          /incomplete or unverified legacy T3 Thread installation/,
        );
        await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({
          code: "ENOENT",
        });
        await expect(NodeFSP.lstat(desktopPaths.servicePath)).rejects.toMatchObject({
          code: "ENOENT",
        });
      });
    }
  });

  it("rejects legacy Thread pairs with launcher content or mode drift", async () => {
    for (const drift of ["content", "mode"]) {
      await withFixture(async ({ input, hostPaths, threadPaths }) => {
        const legacyArtifact = await seedLegacyThreadPair(input, threadPaths);
        if (drift === "content") {
          await NodeFSP.appendFile(threadPaths.launcherPath, "// legacy drift\n");
        } else {
          await NodeFSP.chmod(threadPaths.launcherPath, 0o644);
        }
        await expect(
          installLinuxProductionTopology(input, {
            thread: legacyThreadDependencies(legacyArtifact),
          }),
        ).rejects.toThrow(/unowned T3 Thread launcher|incomplete or unverified legacy/);
        await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({
          code: "ENOENT",
        });
        assert.isTrue((await NodeFSP.lstat(threadPaths.appImagePath)).isFile());
      });
    }
  });

  it("rejects a legacy Thread lookalike before topology writes", () =>
    withFixture(async ({ input, hostPaths, threadPaths }) => {
      const lookalike = Buffer.alloc(1024 * 1024, 0x61);
      await seedLegacyThreadPair(input, threadPaths, lookalike);
      await expect(
        installLinuxProductionTopology(input, {
          thread: legacyThreadDependencies(lookalike),
        }),
      ).rejects.toThrow(/incomplete or unverified legacy T3 Thread installation/);
      await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
      assert.isTrue((await NodeFSP.lstat(threadPaths.appImagePath)).isFile());
    }));

  it("rejects a structurally credible legacy Thread artifact outside the allowlist", () =>
    withFixture(async ({ input, hostPaths, threadPaths }) => {
      await seedLegacyThreadPair(input, threadPaths);
      await expect(installLinuxProductionTopology(input)).rejects.toThrow(
        /incomplete or unverified legacy T3 Thread installation/,
      );
      await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
      assert.isTrue((await NodeFSP.lstat(threadPaths.appImagePath)).isFile());
    }));

  it("rejects an oversized legacy Thread artifact before reading it", () =>
    withFixture(async ({ input, hostPaths, threadPaths }) => {
      await NodeFSP.mkdir(NodePath.dirname(threadPaths.launcherPath), { recursive: true });
      await NodeFSP.copyFile(input.thread.launcherPath, threadPaths.launcherPath);
      await NodeFSP.chmod(threadPaths.launcherPath, 0o755);
      const handle = await NodeFSP.open(threadPaths.appImagePath, "w", 0o755);
      try {
        await handle.truncate(256 * 1024 * 1024 + 1);
      } finally {
        await handle.close();
      }
      await NodeFSP.chmod(threadPaths.appImagePath, 0o755);
      await expect(installLinuxProductionTopology(input)).rejects.toThrow(/safe snapshot bound/);
      await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
    }));

  it("rejects legacy Thread pairs with retired service or desktop state", async () => {
    for (const conflict of ["service", "desktop"]) {
      await withFixture(async ({ input, hostPaths, threadPaths }) => {
        await seedLegacyThreadPair(input, threadPaths);
        const conflictPath =
          conflict === "service" ? threadPaths.servicePath : threadPaths.desktopEntryPath;
        await NodeFSP.mkdir(NodePath.dirname(conflictPath), { recursive: true });
        await NodeFSP.writeFile(conflictPath, "conflicting legacy state\n");
        await expect(installLinuxProductionTopology(input)).rejects.toThrow(
          conflict === "service" ? /retired service exists/ : /unowned T3 Thread desktop file/,
        );
        await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({
          code: "ENOENT",
        });
        assert.isTrue((await NodeFSP.lstat(threadPaths.appImagePath)).isFile());
      });
    }
  });

  it("restores the legacy Thread AppImage when adoption fails after replacement", () =>
    withFixture(async ({ input, threadPaths }) => {
      const legacyArtifact = await seedLegacyThreadPair(input, threadPaths);
      await expect(
        installLinuxThread(
          {
            ...input.thread,
            environment: input.environment,
            productionServerUrl: input.productionServerUrl,
          },
          {
            ...legacyThreadDependencies(legacyArtifact),
            afterManagedWriteRename: async (file) => {
              if (file.id === "app-image-link") throw new Error("fixture adoption failure");
            },
          },
        ),
      ).rejects.toThrow(/fixture adoption failure/);
      const restored = await NodeFSP.lstat(threadPaths.appImagePath);
      assert.isTrue(restored.isFile());
      assert.equal(restored.mode & 0o777, 0o755);
      assert.deepEqual(await NodeFSP.readFile(threadPaths.appImagePath), legacyArtifact);
      assert.deepEqual(
        await NodeFSP.readFile(threadPaths.launcherPath),
        await NodeFSP.readFile(input.thread.launcherPath),
      );
      await expect(NodeFSP.lstat(threadPaths.ownershipManifestPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }));

  it("preserves a raced legacy AppImage and rejects adoption", () =>
    withFixture(async ({ input, threadPaths }) => {
      const legacyArtifact = await seedLegacyThreadPair(input, threadPaths);
      let replacementInode;
      await expect(
        installLinuxThread(
          {
            ...input.thread,
            environment: input.environment,
            productionServerUrl: input.productionServerUrl,
          },
          {
            ...legacyThreadDependencies(legacyArtifact),
            beforeManagedWrite: async (file) => {
              if (file.id !== "app-image-link") return;
              await NodeFSP.rm(file.path);
              await NodeFSP.writeFile(file.path, legacyArtifact, { mode: 0o755 });
              await NodeFSP.chmod(file.path, 0o755);
              replacementInode = (await NodeFSP.lstat(file.path)).ino;
            },
          },
        ),
      ).rejects.toThrow(/changed during installation/);
      assert.equal((await NodeFSP.lstat(threadPaths.appImagePath)).ino, replacementInode);
      assert.deepEqual(await NodeFSP.readFile(threadPaths.appImagePath), legacyArtifact);
    }));

  it("rejects a legacy backup directory replaced after preflight", () =>
    withFixture(async ({ input, threadPaths }) => {
      const legacyArtifact = await seedLegacyThreadPair(input, threadPaths);
      const backupsPath = NodePath.join(threadPaths.installRoot, "backups");
      await NodeFSP.mkdir(backupsPath, { recursive: true, mode: 0o700 });
      await NodeFSP.chmod(backupsPath, 0o700);
      let replacementInode;
      await expect(
        installLinuxThread(
          {
            ...input.thread,
            environment: input.environment,
            productionServerUrl: input.productionServerUrl,
          },
          {
            ...legacyThreadDependencies(legacyArtifact),
            beforeLegacyAdoptionMutation: async () => {
              await NodeFSP.rm(backupsPath, { recursive: true });
              await NodeFSP.mkdir(backupsPath, { mode: 0o700 });
              await NodeFSP.chmod(backupsPath, 0o700);
              replacementInode = (await NodeFSP.lstat(backupsPath)).ino;
            },
          },
        ),
      ).rejects.toThrow(/install-root state changed after preflight/);
      assert.equal((await NodeFSP.lstat(backupsPath)).ino, replacementInode);
      assert.isTrue((await NodeFSP.lstat(threadPaths.appImagePath)).isFile());
      await expect(NodeFSP.lstat(threadPaths.ownershipManifestPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }));

  it("rejects Thread inputs that no longer match their release descriptor", () =>
    withFixture(async ({ input, hostPaths, desktopPaths }) => {
      await NodeFSP.appendFile(input.thread.launcherPath, "// drift\n");
      await expect(installLinuxProductionTopology(input)).rejects.toThrow(/do not match/);
      await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(NodeFSP.lstat(desktopPaths.servicePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }));

  it("rejects a symlinked Thread artifact root before any component write", () =>
    withFixture(async ({ input, root, hostPaths, desktopPaths, threadPaths }) => {
      const externalRoot = NodePath.join(root, "external-thread-artifacts");
      await NodeFSP.mkdir(threadPaths.installRoot, { recursive: true });
      await NodeFSP.mkdir(externalRoot);
      await NodeFSP.symlink(externalRoot, threadPaths.artifactsRoot);
      await expect(installLinuxProductionTopology(input)).rejects.toThrow(
        /unsafe managed ancestor/,
      );
      await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(NodeFSP.lstat(desktopPaths.servicePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      assert.deepEqual(await NodeFSP.readdir(externalRoot), []);
    }));

  it("rejects activation before preflight or writes", () =>
    withFixture(async ({ input, hostPaths }) => {
      await expect(installLinuxProductionTopology({ ...input, activate: true })).rejects.toThrow(
        /Activation is not supported/,
      );
      await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(() =>
        parseLinuxProductionTopologyArguments(["install", "--activate"], input.environment),
      ).toThrow(/Activation is not supported/);
    }));

  it("reports component drift without repairing it", () =>
    withFixture(async ({ input, hostPaths, desktopPaths, threadPaths }) => {
      const installed = await installLinuxProductionTopology(input);
      await NodeFSP.appendFile(hostPaths.launcherPath, "# drift\n");
      await NodeFSP.chmod(threadPaths.launcherPath, 0o644);
      await NodeFSP.chmod(NodePath.join(installed.desktop.targetRoot, "manifest.json"), 0o600);
      await NodeFSP.chmod(installed.thread.plan.targetManifest, 0o600);
      await NodeFSP.mkdir(NodePath.dirname(threadPaths.servicePath), { recursive: true });
      await NodeFSP.writeFile(threadPaths.servicePath, "unexpected service\n");
      await NodeFSP.writeFile(
        NodePath.join(NodePath.dirname(desktopPaths.desktopEntryPath), "duplicate.desktop"),
        "[Desktop Entry]\nType=Application\nName=Unrelated Label\nX-T3Code-Managed=true\nX-T3Code-ProductAppId=com.t3tools.t3code\n",
      );
      const before = await NodeFSP.readFile(hostPaths.launcherPath);
      const doctor = await doctorLinuxProductionTopology(input);
      assert.include(doctor.findings, "host:launcher:content-drift");
      assert.include(doctor.findings, "thread:launcher:mode-drift");
      assert.include(doctor.findings, "desktop:artifact-manifest:mode-drift");
      assert.include(doctor.findings, "thread:artifact-manifest:mode-drift");
      assert.include(doctor.findings, "thread:service:unexpected");
      assert.include(doctor.findings, "applications:t3-code-visible-count=2");
      assert.deepEqual(await NodeFSP.readFile(hostPaths.launcherPath), before);
    }));

  it("ignores unrelated system desktop entry links without following their targets", () =>
    withFixture(async ({ input, root, environment }) => {
      await installLinuxProductionTopology(input);
      const external = NodePath.join(root, "external.desktop");
      const systemApplications = NodePath.join(environment.XDG_DATA_DIRS, "applications");
      await NodeFSP.mkdir(systemApplications, { recursive: true });
      await NodeFSP.writeFile(
        external,
        "[Desktop Entry]\nType=Application\nX-T3Code-Thread-Managed=true\n",
      );
      await NodeFSP.symlink(external, NodePath.join(systemApplications, "unsafe.desktop"));
      const doctor = await doctorLinuxProductionTopology(input);
      assert.notInclude(doctor.findings, "applications:unsafe-entry");
      assert.notInclude(doctor.findings, "applications:t3-thread-visible-count=2");
      assert.isTrue(doctor.ok);
    }));

  it("reports unrelated user desktop entry links without following their targets", () =>
    withFixture(async ({ input, root, desktopPaths }) => {
      await installLinuxProductionTopology(input);
      const external = NodePath.join(root, "external.desktop");
      await NodeFSP.writeFile(external, "[Desktop Entry]\nType=Application\nName=Unrelated\n");
      await NodeFSP.symlink(
        external,
        NodePath.join(NodePath.dirname(desktopPaths.desktopEntryPath), "untrusted.desktop"),
      );
      const doctor = await doctorLinuxProductionTopology(input);
      assert.include(doctor.findings, "applications:unsafe-entry");
    }));

  it("reports a canonical desktop entry link without following its target", () =>
    withFixture(async ({ input, root, threadPaths }) => {
      await installLinuxProductionTopology(input);
      const external = NodePath.join(root, "external.desktop");
      await NodeFSP.writeFile(external, "[Desktop Entry]\nType=Application\nName=Unrelated\n");
      await NodeFSP.rm(threadPaths.desktopEntryPath);
      await NodeFSP.symlink(external, threadPaths.desktopEntryPath);
      const doctor = await doctorLinuxProductionTopology(input);
      assert.include(doctor.findings, "thread:desktop:unsafe-type");
      assert.include(doctor.findings, "applications:unsafe-entry");
    }));

  it("reports a symlinked Thread artifact manifest without following it", () =>
    withFixture(async ({ input, root }) => {
      const installed = await installLinuxProductionTopology(input);
      const externalManifest = NodePath.join(root, "external-thread-manifest.json");
      await NodeFSP.writeFile(externalManifest, '{"external":true}\n');
      await NodeFSP.rm(installed.thread.plan.targetManifest);
      await NodeFSP.symlink(externalManifest, installed.thread.plan.targetManifest);
      const doctor = await doctorLinuxProductionTopology(input);
      assert.include(doctor.findings, "thread:artifact-manifest:unsafe-type");
    }));

  it("refreshes final desktop registration without issuing a server lifecycle command", () =>
    withFixture(async ({ input }) => {
      const commands = [];
      let mimeDefault = "";
      const runCommand = async (command, args) => {
        commands.push([command, args]);
        if (command === "xdg-mime" && args[0] === "query") {
          return { code: 0, stdout: `${mimeDefault}\n`, stderr: "" };
        }
        if (command === "xdg-mime" && args[0] === "default") {
          mimeDefault = args[1];
        }
        return { code: 0, stdout: "", stderr: "" };
      };
      const result = await installLinuxProductionTopology(
        { ...input, refreshDesktopIntegration: true },
        { integration: { runCommand } },
      );
      assert.isTrue(result.integration.refreshed);
      assert.deepEqual(commands.slice(0, 2), [
        ["systemctl", ["--user", "daemon-reload"]],
        ["update-desktop-database", [NodePath.dirname(input.desktop.paths.desktopEntryPath)]],
      ]);
      assert.isFalse(
        commands.some(
          ([command, args]) =>
            command === "systemctl" &&
            args.some((argument) =>
              new Set(["start", "stop", "restart", "enable", "disable"]).has(argument),
            ),
        ),
      );
      assert.isFalse(commands.some(([_command, args]) => args.includes("t3code-host.service")));
    }));

  it("skips desktop registration refresh when every client file is already exact", () =>
    withFixture(async ({ input }) => {
      const commands = [];
      let mimeDefault = "";
      const runCommand = async (command, args) => {
        commands.push([command, args]);
        if (command === "xdg-mime" && args[0] === "query") {
          return { code: 0, stdout: `${mimeDefault}\n`, stderr: "" };
        }
        if (command === "xdg-mime" && args[0] === "default") mimeDefault = args[1];
        return { code: 0, stdout: "", stderr: "" };
      };
      const productionInput = { ...input, refreshDesktopIntegration: true };
      await installLinuxProductionTopology(productionInput, { integration: { runCommand } });
      commands.length = 0;
      await installLinuxProductionTopology(productionInput, { integration: { runCommand } });
      assert.deepEqual(commands, []);
    }));

  it("rolls back a failed Thread component install", () =>
    withFixture(async ({ input, threadPaths }) => {
      await expect(
        installLinuxThread(
          {
            ...input.thread,
            environment: input.environment,
            productionServerUrl: input.productionServerUrl,
          },
          {
            beforeManagedWrite: async (file) => {
              if (file.id === "ownership-manifest") throw new Error("fixture failure");
            },
          },
        ),
      ).rejects.toThrow(/fixture failure/);
      for (const filePath of [
        threadPaths.launcherPath,
        threadPaths.desktopEntryPath,
        threadPaths.ownershipManifestPath,
        threadPaths.currentPath,
        threadPaths.appImagePath,
      ]) {
        await expect(NodeFSP.lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
      }
    }));

  it("preserves an unowned Thread file introduced after preflight", () =>
    withFixture(async ({ input, threadPaths }) => {
      const component = {
        ...input.thread,
        environment: input.environment,
        productionServerUrl: input.productionServerUrl,
      };
      await expect(
        installLinuxThread(component, {
          beforeManagedWrite: async (file) => {
            if (file.id !== "launcher") return;
            await NodeFSP.mkdir(NodePath.dirname(file.path), { recursive: true });
            await NodeFSP.writeFile(file.path, "raced unowned file\n");
          },
        }),
      ).rejects.toThrow(/changed during installation/);
      assert.equal(
        await NodeFSP.readFile(threadPaths.launcherPath, "utf8"),
        "raced unowned file\n",
      );
      await expect(NodeFSP.lstat(threadPaths.desktopEntryPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }));

  it("preserves an unowned Thread file that replaces an installed path before rollback", () =>
    withFixture(async ({ input, threadPaths }) => {
      const component = {
        ...input.thread,
        environment: input.environment,
        productionServerUrl: input.productionServerUrl,
      };
      await expect(
        installLinuxThread(component, {
          beforeManagedWrite: async (file) => {
            if (file.id !== "ownership-manifest") return;
            await NodeFSP.writeFile(threadPaths.launcherPath, "raced unowned launcher\n");
            throw new Error("simulated late failure");
          },
        }),
      ).rejects.toThrow(/could not be restored/);
      assert.equal(
        await NodeFSP.readFile(threadPaths.launcherPath, "utf8"),
        "raced unowned launcher\n",
      );
    }));

  it("preserves a Thread file that replaces the launcher immediately after rename", () =>
    withFixture(async ({ input, threadPaths }) => {
      const component = {
        ...input.thread,
        environment: input.environment,
        productionServerUrl: input.productionServerUrl,
      };
      let injected = false;
      let replacementInode;
      let installedContent;
      await expect(
        installLinuxThread(component, {
          afterManagedWriteRename: async (file) => {
            if (file.id !== "launcher" || injected) return;
            injected = true;
            installedContent = await NodeFSP.readFile(file.path);
            const mode = (await NodeFSP.lstat(file.path)).mode & 0o777;
            await NodeFSP.rm(file.path);
            await NodeFSP.writeFile(file.path, installedContent, { mode });
            replacementInode = (await NodeFSP.lstat(file.path)).ino;
          },
        }),
      ).rejects.toThrow(/could not be restored/);
      assert.isTrue(injected);
      assert.deepEqual(await NodeFSP.readFile(threadPaths.launcherPath), installedContent);
      assert.equal((await NodeFSP.lstat(threadPaths.launcherPath)).ino, replacementInode);
    }));

  it("preserves a Thread path that replaces the current link immediately after rename", () =>
    withFixture(async ({ input, threadPaths }) => {
      const component = {
        ...input.thread,
        environment: input.environment,
        productionServerUrl: input.productionServerUrl,
      };
      let injected = false;
      let replacementInode;
      let installedTarget;
      await expect(
        installLinuxThread(component, {
          afterManagedWriteRename: async (file) => {
            if (file.id !== "current" || injected) return;
            injected = true;
            installedTarget = await NodeFSP.readlink(file.path);
            await NodeFSP.rm(file.path);
            await NodeFSP.symlink(installedTarget, file.path);
            replacementInode = (await NodeFSP.lstat(file.path)).ino;
          },
        }),
      ).rejects.toThrow(/could not be restored/);
      assert.isTrue(injected);
      assert.equal(await NodeFSP.readlink(threadPaths.currentPath), installedTarget);
      assert.equal((await NodeFSP.lstat(threadPaths.currentPath)).ino, replacementInode);
    }));

  it("preserves a Thread artifact root that replaces the staged root after promotion", () =>
    withFixture(async ({ input }) => {
      const component = {
        ...input.thread,
        environment: input.environment,
        productionServerUrl: input.productionServerUrl,
      };
      let racedRoot;
      await expect(
        installLinuxThread(component, {
          afterArtifactPromotion: async (targetRoot) => {
            racedRoot = targetRoot;
            await NodeFSP.rm(targetRoot, { recursive: true });
            await NodeFSP.mkdir(targetRoot);
            await NodeFSP.writeFile(NodePath.join(targetRoot, "foreign.txt"), "foreign root\n");
          },
        }),
      ).rejects.toThrow(/could not be restored/);
      assert.equal(
        await NodeFSP.readFile(NodePath.join(racedRoot, "foreign.txt"), "utf8"),
        "foreign root\n",
      );
    }));

  it("reports the failed stage and rolls back every completed component", () =>
    withFixture(async ({ input, hostPaths, desktopPaths }) => {
      let failure;
      try {
        await installLinuxProductionTopology(input, {
          thread: {
            beforeManagedWrite: async (file) => {
              if (file.id === "ownership-manifest") throw new Error("fixture failure");
            },
          },
        });
      } catch (error) {
        failure = error;
      }
      assert.equal(failure?.failedComponent, "thread");
      assert.deepEqual(failure?.installedComponents, ["host", "desktop"]);
      assert.deepEqual(failure?.rolledBackComponents, ["desktop", "host"]);
      assert.match(failure?.message ?? "", /thread.*host, desktop/u);
      for (const filePath of [
        hostPaths.servicePath,
        hostPaths.releaseLink,
        desktopPaths.servicePath,
        desktopPaths.desktopEntryPath,
        desktopPaths.currentPath,
        desktopPaths.ownershipManifestPath,
      ]) {
        await expect(NodeFSP.lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
      }
    }));

  it("preserves a replaced host file when the host stage fails before its checkpoint", () =>
    withFixture(async ({ input, hostPaths, desktopPaths, threadPaths }) => {
      let replacementContent;
      let replacementInode;
      let failure;
      try {
        await installLinuxProductionTopology(input, {
          host: {
            beforeManagedWrite: async (file) => {
              if (file.id !== "verifier") return;
              const installedContent = await NodeFSP.readFile(hostPaths.launcherPath);
              const installedMode = (await NodeFSP.lstat(hostPaths.launcherPath)).mode & 0o777;
              await NodeFSP.rm(hostPaths.launcherPath);
              await NodeFSP.writeFile(hostPaths.launcherPath, installedContent, {
                mode: installedMode,
              });
              await NodeFSP.chmod(hostPaths.launcherPath, installedMode);
              replacementContent = await NodeFSP.readFile(hostPaths.launcherPath);
              replacementInode = (await NodeFSP.lstat(hostPaths.launcherPath)).ino;
              throw new Error("synthetic partial host failure");
            },
          },
        });
      } catch (error) {
        failure = error;
      }
      assert.equal(failure?.failedComponent, "host");
      assert.deepEqual(failure?.installedComponents, []);
      assert.deepEqual(failure?.rolledBackComponents, []);
      assert.match(failure?.cause?.message ?? "", /could not be safely removed/);
      assert.match(failure?.cause?.cause?.message ?? "", /synthetic partial host failure/);
      assert.match(
        failure?.cause?.rollbackErrors?.[0]?.message ?? "",
        /changed after installation/,
      );
      assert.deepEqual(await NodeFSP.readFile(hostPaths.launcherPath), replacementContent);
      assert.equal((await NodeFSP.lstat(hostPaths.launcherPath)).ino, replacementInode);
      await expect(NodeFSP.lstat(desktopPaths.servicePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(NodeFSP.lstat(threadPaths.launcherPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }));

  it("preserves an artifact root changed after a completed component", () =>
    withFixture(async ({ input, desktopPaths, hostPaths }) => {
      let targetRoot;
      await expect(
        installLinuxProductionTopology(input, {
          thread: {
            beforeManagedWrite: async (file) => {
              if (file.id !== "ownership-manifest") return;
              targetRoot = await NodeFSP.realpath(desktopPaths.currentPath);
              await NodeFSP.writeFile(NodePath.join(targetRoot, "foreign.txt"), "foreign\n");
              throw new Error("synthetic late topology failure");
            },
          },
        }),
      ).rejects.toThrow("could not be rolled back");
      expect(await NodeFSP.readFile(NodePath.join(targetRoot, "foreign.txt"), "utf8")).toBe(
        "foreign\n",
      );
      await expect(NodeFSP.lstat(hostPaths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
    }));

  it("updates a managed Thread origin while retaining unowned conflict protection", () =>
    withFixture(async ({ input, threadPaths }) => {
      const component = {
        ...input.thread,
        environment: input.environment,
        productionServerUrl: input.productionServerUrl,
      };
      await installLinuxThread(component);
      await executable(component.launcherPath, "#!/usr/bin/env node\n// managed update\n");
      await writeLinuxThreadReleaseDescriptor({
        artifactPath: component.artifactPath,
        launcherPath: component.launcherPath,
        version: "1.2.4",
        commitHash: "abcdef1234567890abcdef1234567890abcdef12",
        architecture: THREAD_BUILD_ARCHITECTURE,
      });
      await installLinuxThread({
        ...component,
        productionServerUrl: "https://replacement.example.test/",
      });
      assert.include(
        await NodeFSP.readFile(threadPaths.desktopEntryPath, "utf8"),
        "T3_THREAD_SERVER_URL=https://replacement.example.test/",
      );
      assert.include(await NodeFSP.readFile(threadPaths.launcherPath, "utf8"), "managed update");
      const ownership = JSON.parse(
        await NodeFSP.readFile(threadPaths.ownershipManifestPath, "utf8"),
      );
      assert.include(ownership.managedPaths, threadPaths.ownershipManifestPath);
    }));

  it("rejects unknown and duplicate public CLI options", () => {
    expect(() => parseLinuxProductionTopologyArguments(["install", "--unknown", "value"])).toThrow(
      /Unknown option/,
    );
    expect(() =>
      parseLinuxProductionTopologyArguments(["install", "--release", "/one", "--release", "/two"]),
    ).toThrow(/Duplicate option/);
  });

  it("accepts the documented pnpm option separator", () =>
    withFixture(async ({ input }) => {
      const parsed = parseLinuxProductionTopologyArguments(
        [
          "install",
          "--",
          "--release",
          input.host.releasePath,
          "--desktop-artifact",
          input.desktop.artifactPath,
          "--desktop-descriptor",
          input.desktop.descriptorPath,
          "--thread-artifact",
          input.thread.artifactPath,
          "--thread-launcher",
          input.thread.launcherPath,
          "--thread-descriptor",
          input.thread.descriptorPath,
          "--production-server-url",
          input.productionServerUrl,
          "--state-dir",
          input.host.stateDirectory,
          "--workspace-root",
          input.host.workspaceRoot,
          "--runtime-dir",
          input.desktop.runtimeDirectory,
        ],
        input.environment,
      );
      assert.equal(parsed.command, "install");
      assert.equal(parsed.input.host.releasePath, input.host.releasePath);
      assert.equal(parsed.input.desktop.artifactPath, input.desktop.artifactPath);
      assert.equal(parsed.input.thread.artifactPath, input.thread.artifactPath);
    }));
});
