import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, expect, it } from "vite-plus/test";

import {
  doctorQuattroNative,
  installQuattroNative,
  normalizeQuattroConfiguration,
  renderQuattroFiles,
  resolveQuattroPaths,
  validateQuattroRelease,
} from "./quattro-native-bootstrap.mjs";

const missingNativeTools = ["bash", "systemd-analyze"].filter(
  (command) => NodeChildProcess.spawnSync(command, ["--version"], { stdio: "ignore" }).error,
);
if (process.env.T3CODE_REQUIRE_QUATTRO_NATIVE_TOOLS === "1" && missingNativeTools.length > 0) {
  throw new Error(`Required Quattro native tools are missing: ${missingNativeTools.join(", ")}`);
}

async function writeExecutable(filePath, content = "#!/usr/bin/env bash\nexit 0\n") {
  await NodeFSP.mkdir(NodePath.dirname(filePath), { recursive: true });
  await NodeFSP.writeFile(filePath, content, { mode: 0o755 });
}

async function makeFixture() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-host-installer-test-"));
  const home = NodePath.join(root, "home");
  const environment = {
    HOME: home,
    XDG_DATA_HOME: NodePath.join(root, "data"),
    XDG_CONFIG_HOME: NodePath.join(root, "config"),
  };
  const releaseRoot = NodePath.join(root, "releases");
  const releasePath = NodePath.join(releaseRoot, "t3code-deploy-v1.2.3-abcdef0");
  const nodePath = NodePath.join(root, "runtime", "node");
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
  await writeExecutable(nodePath);
  const paths = resolveQuattroPaths(environment);
  await Promise.all([
    NodeFSP.mkdir(NodePath.join(home, ".t3"), { recursive: true }),
    NodeFSP.mkdir(NodePath.join(home, "Work"), { recursive: true }),
  ]);
  return {
    root,
    releaseRoot,
    releasePath,
    paths,
    input: {
      environment,
      paths,
      releaseRoot,
      releasePath,
      stateDirectory: NodePath.join(home, ".t3"),
      workspaceRoot: NodePath.join(home, "Work"),
      nodePath,
      inspectRuntime: false,
      host: "0.0.0.0",
      port: 3773,
    },
  };
}

async function withFixture(run) {
  const fixture = await makeFixture();
  try {
    return await run(fixture);
  } finally {
    await NodeFSP.rm(fixture.root, { recursive: true, force: true });
  }
}

function historicalV1HostContent(file, input, paths) {
  const quote = (value) => `'${value}'`;
  if (file.id === "verifier") {
    return `#!/usr/bin/env bash
# Managed by T3 Code Quattro bootstrap v1
set -euo pipefail

release_link=${quote(paths.releaseLink)}
release_root=${quote(input.releaseRoot)}
node_path=${quote(input.nodePath)}

fail_verification() {
  printf 'T3 Code host release verification failed: %s\\n' "$1" >&2
  exit 78
}

[[ -L "$release_link" ]] || fail_verification "release link is not a symbolic link"
release_path=$(readlink -f -- "$release_link")
[[ -n "$release_path" ]] || fail_verification "release link does not resolve"
[[ "$(dirname -- "$release_path")" == "$release_root" ]] || fail_verification "release target escapes the deployment root"
[[ "$(basename -- "$release_path")" == t3code-deploy-v* ]] || fail_verification "release target is not versioned"
[[ -d "$release_path" && ! -L "$release_path" ]] || fail_verification "release target is not a physical directory"

for required_file in \\
  "$release_path/apps/server/dist/bin.mjs" \\
  "$release_path/apps/server/dist/client/index.html" \\
  "$release_path/package.json"; do
  [[ -f "$required_file" && ! -L "$required_file" && -r "$required_file" ]] \\
    || fail_verification "required release file is unavailable"
done

[[ -x "$node_path" && ! -L "$node_path" ]] || fail_verification "pinned Node runtime is unavailable"
"$node_path" --check "$release_path/apps/server/dist/bin.mjs" >/dev/null \\
  || fail_verification "server entry fails the Node syntax check"

if [[ "\${1:-}" == --print-path ]]; then
  printf '%s\\n' "$release_path"
elif [[ $# -ne 0 ]]; then
  fail_verification "unexpected verifier argument"
fi
`;
  }
  if (file.id === "launcher") {
    return `#!/usr/bin/env bash
# Managed by T3 Code Quattro bootstrap v1
set -euo pipefail

verifier=${quote(paths.verifierPath)}
node_path=${quote(input.nodePath)}
release_path="$("$verifier" --print-path)"

if [[ -z "\${T3CODE_HOME:-}" ]]; then
  export T3CODE_HOME=${quote(input.stateDirectory)}
fi
if [[ -z "\${T3CODE_HOST:-}" ]]; then
  export T3CODE_HOST=${quote(input.host)}
fi
if [[ -z "\${T3CODE_PORT:-}" ]]; then
  export T3CODE_PORT=${quote(String(input.port))}
fi
if [[ -z "\${T3CODE_NO_BROWSER:-}" ]]; then
  export T3CODE_NO_BROWSER=true
fi
workspace_root="\${T3CODE_WORKSPACE_ROOT:-}"
if [[ -z "$workspace_root" ]]; then
  workspace_root=${quote(input.workspaceRoot)}
fi

exec "$node_path" "$release_path/apps/server/dist/bin.mjs" \\
  serve \\
  --host "$T3CODE_HOST" \\
  --port "$T3CODE_PORT" \\
  --base-dir "$T3CODE_HOME" \\
  "$workspace_root"
`;
  }
  if (file.id === "environment") {
    return `# Managed by T3 Code Quattro bootstrap v1
T3CODE_HOME="${input.stateDirectory}"
T3CODE_HOST="${input.host}"
T3CODE_PORT="${String(input.port)}"
T3CODE_NO_BROWSER=true
T3CODE_WORKSPACE_ROOT="${input.workspaceRoot}"
`;
  }
  if (file.id === "service") {
    return `# Managed by T3 Code Quattro bootstrap v1
[Unit]
Description=T3 Code Quattro native host server
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=60s
StartLimitBurst=4

[Service]
Type=exec
WorkingDirectory=${input.workspaceRoot}
Environment=NODE_ENV=production
EnvironmentFile=${paths.environmentPath}
UMask=0077
ExecStartPre="${paths.verifierPath}"
ExecStart="${paths.launcherPath}"
KillMode=control-group
KillSignal=SIGTERM
FinalKillSignal=SIGKILL
SendSIGKILL=yes
TimeoutStartSec=45s
TimeoutStopSec=45s
Restart=on-failure
RestartPreventExitStatus=78
RestartSec=5s
SuccessExitStatus=130 143 SIGINT SIGTERM
StandardOutput=journal
StandardError=journal
SyslogIdentifier=t3code-host

[Install]
WantedBy=default.target
`;
  }
  throw new Error(`No historical v1 fixture for ${file.id}.`);
}

describe("Quattro production host file installer", () => {
  it("owns only production host files", () =>
    withFixture(async ({ input, paths, releasePath }) => {
      const rendered = renderQuattroFiles(input);
      assert.deepEqual(
        rendered.files.map((file) => file.id),
        ["launcher", "verifier", "environment", "service", "manifest"],
      );
      const first = await installQuattroNative(input);
      assert.deepEqual(first.changed, [
        "launcher",
        "verifier",
        "environment",
        "service",
        "manifest",
        "release-link",
      ]);
      assert.equal(await NodeFSP.realpath(paths.releaseLink), releasePath);
      assert.include(await NodeFSP.readFile(paths.servicePath, "utf8"), "production host server");
      assert.notInclude(await NodeFSP.readFile(paths.servicePath, "utf8"), "Electron");
      assert.notProperty(paths, "desktopPath");
      assert.notProperty(paths, "stagingDesktopPath");
      assert.isTrue((await doctorQuattroNative(input)).ok);
    }));

  it("does not rewrite exact server files or replace the release link inode", () =>
    withFixture(async ({ input, paths }) => {
      await installQuattroNative(input);
      const before = await NodeFSP.lstat(paths.releaseLink);
      const serviceBefore = await NodeFSP.lstat(paths.servicePath);
      const second = await installQuattroNative(input);
      assert.deepEqual(second.changed, []);
      assert.equal((await NodeFSP.lstat(paths.releaseLink)).ino, before.ino);
      assert.equal((await NodeFSP.lstat(paths.servicePath)).ino, serviceBefore.ino);
    }));

  it("accepts exact legacy host files without changing their bytes or inodes", () =>
    withFixture(async ({ input, paths }) => {
      const rendered = renderQuattroFiles(input);
      for (const file of rendered.files.filter((candidate) => candidate.id !== "manifest")) {
        const content = historicalV1HostContent(file, input, paths);
        await NodeFSP.mkdir(NodePath.dirname(file.path), { recursive: true });
        await NodeFSP.writeFile(file.path, content, { mode: file.mode });
        await NodeFSP.chmod(file.path, file.mode);
      }
      await NodeFSP.mkdir(NodePath.dirname(paths.releaseLink), { recursive: true });
      await NodeFSP.symlink(input.releasePath, paths.releaseLink);
      const before = new Map();
      for (const file of rendered.files.filter((candidate) => candidate.id !== "manifest")) {
        before.set(file.id, {
          bytes: await NodeFSP.readFile(file.path),
          inode: (await NodeFSP.lstat(file.path)).ino,
        });
      }
      const result = await installQuattroNative(input);
      assert.deepEqual(result.changed, ["manifest"]);
      assert.equal(
        historicalV1HostContent(
          rendered.files.find((file) => file.id === "launcher"),
          input,
          paths,
        ).match(/export T3CODE_HOST=/gu)?.length,
        1,
      );
      for (const file of rendered.files.filter((candidate) => candidate.id !== "manifest")) {
        assert.deepEqual(await NodeFSP.readFile(file.path), before.get(file.id).bytes);
        assert.equal((await NodeFSP.lstat(file.path)).ino, before.get(file.id).inode);
      }
      assert.isTrue((await doctorQuattroNative(input)).ok);
    }));

  it("rejects server file and release target drift before creating another path", () =>
    withFixture(async ({ input, paths, releaseRoot }) => {
      await NodeFSP.mkdir(NodePath.dirname(paths.servicePath), { recursive: true });
      await NodeFSP.writeFile(paths.servicePath, "unowned\n");
      await expect(installQuattroNative(input)).rejects.toThrow(/Refusing to replace/);
      await expect(NodeFSP.lstat(paths.launcherPath)).rejects.toMatchObject({ code: "ENOENT" });

      await NodeFSP.rm(paths.servicePath);
      const alternate = NodePath.join(releaseRoot, "t3code-deploy-v2.0.0-fedcba0");
      await NodeFSP.mkdir(alternate);
      await NodeFSP.mkdir(NodePath.dirname(paths.releaseLink), { recursive: true });
      await NodeFSP.symlink(alternate, paths.releaseLink);
      await expect(installQuattroNative(input)).rejects.toThrow(/different release/);
      await expect(NodeFSP.lstat(paths.launcherPath)).rejects.toMatchObject({ code: "ENOENT" });
    }));

  it("rejects activation without issuing any command or writing files", () =>
    withFixture(async ({ input, paths }) => {
      await expect(installQuattroNative({ ...input, activate: true })).rejects.toThrow(
        /Activation is not supported/,
      );
      await expect(NodeFSP.lstat(paths.servicePath)).rejects.toMatchObject({ code: "ENOENT" });
    }));

  it("rejects a symlinked managed host destination ancestor", () =>
    withFixture(async ({ input, paths, root }) => {
      const external = NodePath.join(root, "external-host-units");
      await NodeFSP.mkdir(NodePath.dirname(NodePath.dirname(paths.servicePath)), {
        recursive: true,
      });
      await NodeFSP.mkdir(external);
      await NodeFSP.symlink(external, NodePath.dirname(paths.servicePath));
      await expect(installQuattroNative(input)).rejects.toThrow(/unsafe managed ancestor/);
      assert.deepEqual(await NodeFSP.readdir(external), []);
      await expect(NodeFSP.lstat(paths.launcherPath)).rejects.toMatchObject({ code: "ENOENT" });
    }));

  it("rolls back files created before a late failure", () =>
    withFixture(async ({ input, paths }) => {
      await expect(
        installQuattroNative(input, {
          beforeManagedWrite: async (file) => {
            if (file.id === "manifest") throw new Error("fixture failure");
          },
        }),
      ).rejects.toThrow(/fixture failure/);
      for (const filePath of [
        paths.launcherPath,
        paths.verifierPath,
        paths.environmentPath,
        paths.servicePath,
        paths.ownershipManifestPath,
        paths.releaseLink,
      ]) {
        await expect(NodeFSP.lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
      }
    }));

  it("preserves host files whose content, mode, or identity changes before rollback", async () => {
    for (const mutation of ["content", "mode", "identity"]) {
      await withFixture(async ({ input, paths }) => {
        let expectedContent;
        let expectedMode;
        let expectedInode;
        let failure;
        try {
          await installQuattroNative(input, {
            beforeManagedWrite: async (file) => {
              if (file.id !== "verifier") return;
              const installedContent = await NodeFSP.readFile(paths.launcherPath);
              const installedMode = (await NodeFSP.lstat(paths.launcherPath)).mode & 0o777;
              if (mutation === "content") {
                await NodeFSP.appendFile(paths.launcherPath, "# concurrent edit\n");
              } else if (mutation === "mode") {
                await NodeFSP.chmod(paths.launcherPath, 0o700);
              } else {
                await NodeFSP.rm(paths.launcherPath);
                await NodeFSP.writeFile(paths.launcherPath, installedContent, {
                  mode: installedMode,
                });
                await NodeFSP.chmod(paths.launcherPath, installedMode);
              }
              expectedContent = await NodeFSP.readFile(paths.launcherPath);
              const replacement = await NodeFSP.lstat(paths.launcherPath);
              expectedMode = replacement.mode & 0o777;
              expectedInode = replacement.ino;
              throw new Error(`synthetic ${mutation} failure`);
            },
          });
        } catch (error) {
          failure = error;
        }
        assert.match(failure?.message ?? "", /could not be safely removed/);
        assert.match(failure?.cause?.message ?? "", new RegExp(`synthetic ${mutation} failure`));
        assert.lengthOf(failure?.rollbackErrors ?? [], 1);
        assert.match(failure?.rollbackErrors?.[0]?.message ?? "", /changed after installation/);
        assert.deepEqual(await NodeFSP.readFile(paths.launcherPath), expectedContent);
        const retained = await NodeFSP.lstat(paths.launcherPath);
        assert.equal(retained.mode & 0o777, expectedMode);
        assert.equal(retained.ino, expectedInode);
        await expect(NodeFSP.lstat(paths.verifierPath)).rejects.toMatchObject({ code: "ENOENT" });
      });
    }
  });

  it("preserves a release link replaced with the same target before rollback", () =>
    withFixture(async ({ input, paths, releasePath }) => {
      let replacementInode;
      let failure;
      try {
        await installQuattroNative(input, {
          afterReleasePromotion: async () => {
            await NodeFSP.rm(paths.releaseLink);
            await NodeFSP.symlink(releasePath, paths.releaseLink);
            replacementInode = (await NodeFSP.lstat(paths.releaseLink)).ino;
            throw new Error("synthetic release-link failure");
          },
        });
      } catch (error) {
        failure = error;
      }
      assert.match(failure?.message ?? "", /could not be safely removed/);
      assert.match(failure?.cause?.message ?? "", /synthetic release-link failure/);
      assert.lengthOf(failure?.rollbackErrors ?? [], 1);
      assert.equal(await NodeFSP.readlink(paths.releaseLink), releasePath);
      assert.equal((await NodeFSP.lstat(paths.releaseLink)).ino, replacementInode);
      for (const filePath of [
        paths.launcherPath,
        paths.verifierPath,
        paths.environmentPath,
        paths.servicePath,
        paths.ownershipManifestPath,
      ]) {
        await expect(NodeFSP.lstat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
      }
    }));

  it("reports exact host content, mode, and release pointer drift", () =>
    withFixture(async ({ input, paths, releaseRoot }) => {
      await installQuattroNative(input);
      await NodeFSP.appendFile(paths.launcherPath, "# drift\n");
      await NodeFSP.chmod(paths.environmentPath, 0o644);
      const alternate = NodePath.join(releaseRoot, "t3code-deploy-v1.2.4-fedcba0");
      await NodeFSP.mkdir(alternate);
      const next = `${paths.releaseLink}.next`;
      await NodeFSP.symlink(alternate, next);
      await NodeFSP.rename(next, paths.releaseLink);
      const doctor = await doctorQuattroNative(input);
      assert.include(doctor.findings, "launcher:content-drift");
      assert.include(doctor.findings, "environment:mode-drift");
      assert.include(doctor.findings, "release-link:target-drift");
    }));

  it("verifies exact active systemd ownership through read-only runtime queries", () =>
    withFixture(async ({ input, paths }) => {
      await installQuattroNative(input);
      const commands = [];
      const healthy = await doctorQuattroNative(
        { ...input, inspectRuntime: true },
        {
          runCommand: async (command, args) => {
            commands.push([command, args]);
            return {
              code: 0,
              stderr: "",
              stdout: [
                `FragmentPath=${paths.servicePath}`,
                "MainPID=4242",
                "ControlGroup=/user.slice/t3code-host.service",
                "ActiveState=active",
                "NeedDaemonReload=no",
                `ExecStart={ path=${paths.launcherPath} ; argv[]=${paths.launcherPath} ; ignore_errors=no ; }`,
                `ExecStartPre={ path=${paths.verifierPath} ; argv[]=${paths.verifierPath} ; ignore_errors=no ; }`,
                "",
              ].join("\n"),
            };
          },
          readFile: async (filePath) =>
            filePath.endsWith("/cmdline")
              ? Buffer.from(
                  [
                    input.nodePath,
                    NodePath.join(input.releasePath, "apps/server/dist/bin.mjs"),
                    "serve",
                    "--host",
                    input.host,
                    "--port",
                    String(input.port),
                    "--base-dir",
                    input.stateDirectory,
                    input.workspaceRoot,
                    "",
                  ].join("\0"),
                )
              : "0::/user.slice/t3code-host.service\n",
          readLink: async () => input.nodePath,
        },
      );
      assert.isTrue(healthy.ok);
      assert.deepEqual(commands, [
        [
          "systemctl",
          [
            "--user",
            "show",
            "t3code-host.service",
            "--property=FragmentPath",
            "--property=MainPID",
            "--property=ControlGroup",
            "--property=ActiveState",
            "--property=NeedDaemonReload",
            "--property=ExecStart",
            "--property=ExecStartPre",
          ],
        ],
      ]);

      const drifted = await doctorQuattroNative(
        { ...input, inspectRuntime: true },
        {
          runCommand: async () => ({
            code: 0,
            stderr: "",
            stdout: [
              "FragmentPath=/unowned/t3code-host.service",
              "MainPID=4242",
              "ControlGroup=/user.slice/t3code-host.service",
              "ActiveState=inactive",
              "NeedDaemonReload=yes",
              "ExecStart={ path=/unowned/launcher ; argv[]=/unowned/launcher ; ignore_errors=no ; }",
              "ExecStartPre={ path=/unowned/verifier ; argv[]=/unowned/verifier ; ignore_errors=no ; }",
              "",
            ].join("\n"),
          }),
          readFile: async (filePath) =>
            filePath.endsWith("/cmdline")
              ? Buffer.from("/unowned/node\0wrong\0")
              : "0::/user.slice/other.service\n",
          readLink: async () => "/unowned/node",
        },
      );
      assert.include(drifted.findings, "runtime:fragment-path-drift");
      assert.include(drifted.findings, "runtime:inactive");
      assert.include(drifted.findings, "runtime:control-group-drift");
      assert.include(drifted.findings, "runtime:daemon-reload-needed");
      assert.include(drifted.findings, "runtime:exec-start-drift");
      assert.include(drifted.findings, "runtime:exec-start-pre-drift");
      assert.include(drifted.findings, "runtime:executable-drift");
      assert.include(drifted.findings, "runtime:arguments-drift");
    }));

  it("rejects release paths outside the physical deployment root", () =>
    withFixture(async ({ input, root, releasePath }) => {
      expect(() =>
        normalizeQuattroConfiguration({
          ...input,
          releaseRoot: NodePath.join(root, "other"),
        }),
      ).toThrow(/directly below/);
      const alias = NodePath.join(root, "release-alias");
      await NodeFSP.symlink(NodePath.dirname(releasePath), alias);
      await expect(
        validateQuattroRelease(
          normalizeQuattroConfiguration({
            ...input,
            releaseRoot: alias,
            releasePath: NodePath.join(alias, NodePath.basename(releasePath)),
          }),
        ),
      ).rejects.toThrow(/physical directories|escapes/);
    }));

  it("rejects missing or symlinked state and workspace directories", () =>
    withFixture(async ({ input, root }) => {
      await NodeFSP.rm(input.stateDirectory, { recursive: true });
      await expect(validateQuattroRelease(normalizeQuattroConfiguration(input))).rejects.toThrow(
        /state directory is missing/,
      );
      await NodeFSP.mkdir(input.stateDirectory);
      const external = NodePath.join(root, "external-workspace");
      await NodeFSP.rm(input.workspaceRoot, { recursive: true });
      await NodeFSP.mkdir(external);
      await NodeFSP.symlink(external, input.workspaceRoot);
      await expect(validateQuattroRelease(normalizeQuattroConfiguration(input))).rejects.toThrow(
        /physical directory/,
      );
    }));

  it.skipIf(missingNativeTools.length > 0)("passes native shell and systemd validation", () =>
    withFixture(async ({ input, paths }) => {
      await installQuattroNative(input);
      assert.equal(NodeChildProcess.spawnSync("bash", ["-n", paths.launcherPath]).status, 0);
      assert.equal(NodeChildProcess.spawnSync("bash", ["-n", paths.verifierPath]).status, 0);
      assert.equal(
        NodeChildProcess.spawnSync("systemd-analyze", ["--user", "verify", paths.servicePath])
          .status,
        0,
      );
    }),
  );
});
