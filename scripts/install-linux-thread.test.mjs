import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { expect, it } from "vite-plus/test";

import {
  doctorLinuxThread,
  installLinuxThread,
  resolveThreadInstallPaths,
} from "./install-linux-thread.mjs";
import { writeLinuxThreadReleaseDescriptor } from "./linux-thread-release-artifact.mjs";
import { verifyThreadRelease } from "./thread-launcher.mjs";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";
// oxlint-disable-next-line t3code/no-global-process-runtime -- Installer fixtures must match the standalone verifier host.
const HOST_ARCHITECTURE = NodeOS.arch();

async function withFixture(run) {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "thread-install-test-"));
  const environment = {
    HOME: NodePath.join(root, "home"),
    XDG_DATA_HOME: NodePath.join(root, "data"),
    XDG_CONFIG_HOME: NodePath.join(root, "config"),
  };
  const artifactPath = NodePath.join(root, "T3-Thread.AppImage");
  const launcherPath = NodePath.join(root, "t3-thread-launcher.mjs");
  await NodeFSP.writeFile(
    artifactPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] !== '--appimage-extract') process.exit(1);
fs.mkdirSync('squashfs-root');
fs.writeFileSync('squashfs-root/t3-thread', '#!/bin/sh\\nexit 0\\n', { mode: 0o755 });
`,
    { mode: 0o755 },
  );
  await NodeFSP.writeFile(launcherPath, "#!/usr/bin/env node\n", { mode: 0o755 });
  const { descriptorPath } = await writeLinuxThreadReleaseDescriptor({
    artifactPath,
    launcherPath,
    version: "1.2.3",
    commitHash: COMMIT,
    architecture: HOST_ARCHITECTURE,
  });
  const paths = resolveThreadInstallPaths(environment);
  const input = {
    artifactPath,
    launcherPath,
    descriptorPath,
    productionServerUrl: "https://thread.example.test/",
    environment,
    paths,
  };
  try {
    return await run({ root, paths, input });
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
}

it("installs a verified content-addressed Thread client", () =>
  withFixture(async ({ paths, input }) => {
    const result = await installLinuxThread(input);
    expect(result.changed).toContain("artifact");
    await expect(doctorLinuxThread(input)).resolves.toMatchObject({ ok: true, findings: [] });
    const manifest = JSON.parse(await NodeFSP.readFile(paths.ownershipManifestPath, "utf8"));
    expect(manifest).toMatchObject({
      commitHash: COMMIT,
      sourceRepository: "JerkyTreats/t3code",
      productionServerUrl: "https://thread.example.test/",
    });
    expect(await NodeFSP.realpath(paths.appImagePath)).toBe(result.plan.targetArtifact);
    expect(
      await NodeFSP.readFile(await verifyThreadRelease(result.plan.targetArtifact), "utf8"),
    ).toContain("#!/bin/sh\n");
  }));

it("reports prepared-code damage without repairing or replacing it", () =>
  withFixture(async ({ input }) => {
    const result = await installLinuxThread(input);
    const executable = await verifyThreadRelease(result.plan.targetArtifact);
    await NodeFSP.appendFile(executable, "# changed after publication\n");
    const before = await NodeFSP.readFile(executable);
    expect((await doctorLinuxThread(input)).findings).toContain("prepared-release:invalid");
    await expect(installLinuxThread(input)).rejects.toThrow("integrity verification");
    expect(await NodeFSP.readFile(executable)).toEqual(before);
  }));

it("rejects non-origin targets before creating install state", () =>
  withFixture(async ({ paths, input }) => {
    await expect(
      installLinuxThread({ ...input, productionServerUrl: "https://user@thread.example.test/" }),
    ).rejects.toThrow("credential-free HTTPS origin");
    await expect(NodeFSP.lstat(paths.installRoot)).rejects.toMatchObject({ code: "ENOENT" });
  }));

it("rolls back every managed path and artifact after a transactional failure", () =>
  withFixture(async ({ paths, input }) => {
    await expect(
      installLinuxThread(input, {
        beforeManagedWrite: async (file) => {
          if (file.id === "ownership-manifest") throw new Error("synthetic fixture failure");
        },
      }),
    ).rejects.toThrow("synthetic fixture failure");
    for (const filePath of [
      paths.launcherPath,
      paths.appImagePath,
      paths.desktopEntryPath,
      paths.currentPath,
      paths.ownershipManifestPath,
    ]) {
      await expect(NodeFSP.lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    }
    const artifacts = await NodeFSP.readdir(paths.artifactsRoot);
    expect(artifacts).toEqual([]);
  }));
