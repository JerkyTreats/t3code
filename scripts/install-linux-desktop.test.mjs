import * as NodeFSP from "node:fs/promises";
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeEvents from "node:events";

import { assert, describe, expect, it } from "vite-plus/test";

// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone installer tests mirror its Node runtime.
const HOST_ARCHITECTURE = NodeOS.arch();

import {
  buildAndInstallCurrentLinuxDesktop,
  installLinuxDesktop,
  quoteDesktopEnvironmentAssignment,
  quoteDesktopExecArgument,
  quoteSystemdArgument,
  quoteSystemdEnvironmentAssignment,
  quoteSystemdUnitPath,
  resolveInstallPaths,
} from "./install-linux-desktop.mjs";
import { writeLinuxDesktopReleaseDescriptor } from "./linux-desktop-release-artifact.ts";
import {
  focusDesktopWindow,
  runDesktopService,
  sha256File,
  validateDesktopActivationRequest,
} from "./linux-desktop-launcher.mjs";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";
const STAGING_ENVIRONMENT_NAMES = new Set([
  "T3CODE_HOME",
  "XDG_CONFIG_HOME",
  "T3CODE_DESKTOP_DISPLAY_NAME",
  "T3CODE_DESKTOP_SERVER_URL",
  "T3CODE_DESKTOP_CHANNEL",
  "T3CODE_DISABLE_AUTO_UPDATE",
]);

function assignmentRecord(assignments) {
  return Object.fromEntries(
    assignments
      .map((assignment) => {
        const separator = assignment.indexOf("=");
        return separator < 1
          ? null
          : [assignment.slice(0, separator), assignment.slice(separator + 1)];
      })
      .filter((entry) => entry !== null && STAGING_ENVIRONMENT_NAMES.has(entry[0])),
  );
}

function parseSystemdEnvironment(unit) {
  return assignmentRecord(
    unit
      .split("\n")
      .filter((line) => line.startsWith("Environment="))
      .map((line) => line.slice("Environment=".length).replace(/^"|"$/g, "")),
  );
}

function parseDesktopExecEnvironment(entry) {
  const exec = entry.split("\n").find((line) => line.startsWith("Exec=env "));
  if (!exec) throw new Error("Staging desktop Exec environment is missing.");
  const tokens = Array.from(exec.matchAll(/"((?:\\.|[^"\\])*)"|(\S+)/g), (match) =>
    match[1] === undefined ? match[2] : match[1],
  );
  return assignmentRecord(tokens);
}

async function fixture() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-installer-test-"));
  const environment = {
    HOME: NodePath.join(root, "home"),
    T3CODE_PORT: "9999",
    XDG_DATA_HOME: NodePath.join(root, "data"),
    XDG_CONFIG_HOME: NodePath.join(root, "config"),
  };
  const artifactPath = NodePath.join(root, "T3-Code.AppImage");
  await NodeFSP.writeFile(artifactPath, "artifact-one");
  const paths = resolveInstallPaths(environment);
  await NodeFSP.mkdir(NodePath.dirname(paths.omarchyHyprConfigPath), { recursive: true });
  await NodeFSP.writeFile(
    paths.omarchyHyprConfigPath,
    ["-- user prefix", 'require("default.hypr.omarchy")', "-- unrelated user suffix", ""].join(
      "\n",
    ),
  );
  await NodeFSP.mkdir(NodePath.dirname(paths.omarchyMenuPath), { recursive: true });
  await NodeFSP.writeFile(
    paths.omarchyMenuPath,
    [
      "{",
      "  // unrelated user menu content",
      '  "personal": {"icon":"x","label":"Personal"}',
      "}",
      "// unrelated trailing menu comment",
      "",
    ].join("\n"),
  );
  const { descriptorPath } = await writeLinuxDesktopReleaseDescriptor({
    artifactPath,
    version: "1.2.3",
    commitHash: COMMIT,
    architecture: HOST_ARCHITECTURE,
  });
  return {
    root,
    environment,
    artifactPath,
    descriptorPath,
    paths,
  };
}

async function descriptorFor(artifactPath) {
  return writeLinuxDesktopReleaseDescriptor({
    artifactPath,
    version: "1.2.3",
    commitHash: COMMIT,
    architecture: HOST_ARCHITECTURE,
  });
}

function installInput(value, overrides = {}) {
  return {
    artifactPath: value.artifactPath,
    descriptorPath: value.descriptorPath,
    runtimeDirectory: NodePath.join(value.root, "runtime"),
    environment: value.environment,
    paths: value.paths,
    omarchyIntegration: true,
    productionServerUrl: "https://production.example.test/",
    stagingServerUrl: "https://staging.example.test/",
    ...overrides,
  };
}

function runExecutable(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function writeExecutable(filePath, content) {
  await NodeFSP.mkdir(NodePath.dirname(filePath), { recursive: true });
  await NodeFSP.writeFile(filePath, content, { mode: 0o755 });
}

describe("Linux desktop installer", () => {
  it("escapes percent markers for systemd and desktop Exec syntax", () => {
    assert.equal(quoteSystemdArgument("/data/100%/t3 code"), '"/data/100%%/t3 code"');
    assert.equal(quoteSystemdArgument("/data/$profile/t3"), '"/data/$$profile/t3"');
    assert.equal(
      quoteSystemdEnvironmentAssignment("T3CODE_HOME", "/data/$profile/100%/t3 code"),
      '"T3CODE_HOME=/data/$profile/100%%/t3 code"',
    );
    assert.equal(
      quoteDesktopEnvironmentAssignment("T3CODE_HOME", "/data/$profile/100%/t3 code"),
      '"T3CODE_HOME=/data/\\$profile/100%%/t3 code"',
    );
    assert.equal(
      quoteSystemdUnitPath("/data/$profile/100%/service.env"),
      '"/data/$profile/100%%/service.env"',
    );
    assert.equal(quoteDesktopExecArgument("/data/100%/$t3`code"), '"/data/100%%/\\$t3\\`code"');
    expect(() => quoteSystemdArgument("/data/t3\ncode")).toThrow(/single line/);
    expect(() => quoteSystemdUnitPath("/data/t3\rcode")).toThrow(/single line/);
    expect(() => quoteDesktopExecArgument("/data/t3\ncode")).toThrow(/single line/);
    expect(() => quoteSystemdEnvironmentAssignment("invalid-name", "/data/t3")).toThrow(
      /uppercase ASCII identifiers/,
    );
    expect(() => quoteDesktopEnvironmentAssignment("invalid-name", "/data/t3")).toThrow(
      /uppercase ASCII identifiers/,
    );
  });

  it("installs only production ownership when staging is not explicitly configured", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(
        installInput(value, { stagingServerUrl: undefined, omarchyIntegration: false }),
      );
      assert.isTrue((await NodeFSP.lstat(value.paths.servicePath)).isFile());
      assert.isTrue((await NodeFSP.lstat(value.paths.desktopEntryPath)).isFile());
      await expect(NodeFSP.lstat(value.paths.stagingServicePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(NodeFSP.lstat(value.paths.stagingDesktopEntryPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      assert.notInclude(ownership.managedPaths, value.paths.stagingServicePath);
      assert.notInclude(ownership.managedPaths, value.paths.stagingDesktopEntryPath);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("removes a previously owned desktop icon when a later install omits it", async () => {
    const value = await fixture();
    const iconSource = NodePath.join(value.root, "desktop-icon.png");
    try {
      await NodeFSP.writeFile(iconSource, "owned icon");
      await installLinuxDesktop(installInput(value, { iconPath: iconSource }));
      assert.equal(await NodeFSP.readFile(value.paths.iconPath, "utf8"), "owned icon");

      await installLinuxDesktop(installInput(value));

      await expect(NodeFSP.lstat(value.paths.iconPath)).rejects.toMatchObject({ code: "ENOENT" });
      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      assert.notInclude(ownership.managedPaths, value.paths.iconPath);
      assert.include(await NodeFSP.readFile(value.paths.desktopEntryPath, "utf8"), "Icon=t3code");
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("recovers an exact requested desktop icon omitted by a prior ownership manifest", async () => {
    const value = await fixture();
    const iconSource = NodePath.join(value.root, "desktop-icon.png");
    try {
      await NodeFSP.writeFile(iconSource, "owned icon");
      await installLinuxDesktop(installInput(value, { iconPath: iconSource }));
      const iconBefore = await NodeFSP.lstat(value.paths.iconPath);
      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      ownership.managedPaths = ownership.managedPaths.filter(
        (filePath) => filePath !== value.paths.iconPath,
      );
      await NodeFSP.writeFile(
        value.paths.ownershipManifestPath,
        `${JSON.stringify(ownership, null, 2)}\n`,
      );

      await installLinuxDesktop(installInput(value, { iconPath: iconSource }));

      const iconAfter = await NodeFSP.lstat(value.paths.iconPath);
      assert.equal(iconAfter.ino, iconBefore.ino);
      const repairedOwnership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      assert.include(repairedOwnership.managedPaths, value.paths.iconPath);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a changed desktop icon omitted by a prior ownership manifest", async () => {
    const value = await fixture();
    const iconSource = NodePath.join(value.root, "desktop-icon.png");
    try {
      await NodeFSP.writeFile(iconSource, "owned icon");
      await installLinuxDesktop(installInput(value, { iconPath: iconSource }));
      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      ownership.managedPaths = ownership.managedPaths.filter(
        (filePath) => filePath !== value.paths.iconPath,
      );
      await NodeFSP.writeFile(
        value.paths.ownershipManifestPath,
        `${JSON.stringify(ownership, null, 2)}\n`,
      );
      await NodeFSP.writeFile(value.paths.iconPath, "unowned replacement");

      await expect(
        installLinuxDesktop(installInput(value, { iconPath: iconSource })),
      ).rejects.toThrow(/does not own the desktop icon/);
      assert.equal(await NodeFSP.readFile(value.paths.iconPath, "utf8"), "unowned replacement");
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects an unowned desktop icon raced before its exact recovery snapshot", async () => {
    const value = await fixture();
    const iconSource = NodePath.join(value.root, "desktop-icon.png");
    try {
      await NodeFSP.writeFile(iconSource, "owned icon");
      await installLinuxDesktop(installInput(value, { iconPath: iconSource }));
      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      ownership.managedPaths = ownership.managedPaths.filter(
        (filePath) => filePath !== value.paths.iconPath,
      );
      await NodeFSP.writeFile(
        value.paths.ownershipManifestPath,
        `${JSON.stringify(ownership, null, 2)}\n`,
      );

      await expect(
        installLinuxDesktop(installInput(value, { iconPath: iconSource }), {
          beforeManagedStateSnapshot: async () => {
            await NodeFSP.writeFile(value.paths.iconPath, "raced unowned replacement");
          },
        }),
      ).rejects.toThrow(/changed before its exact recovery snapshot/);
      assert.equal(
        await NodeFSP.readFile(value.paths.iconPath, "utf8"),
        "raced unowned replacement",
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("preserves an existing explicit staging lane during production-only installation", async () => {
    const value = await fixture();
    try {
      await NodeFSP.mkdir(NodePath.dirname(value.paths.stagingServicePath), { recursive: true });
      await NodeFSP.mkdir(NodePath.dirname(value.paths.stagingDesktopEntryPath), {
        recursive: true,
      });
      await NodeFSP.writeFile(value.paths.stagingServicePath, "explicit staging service\n");
      await NodeFSP.writeFile(value.paths.stagingDesktopEntryPath, "explicit staging desktop\n");
      await installLinuxDesktop(
        installInput(value, { stagingServerUrl: undefined, omarchyIntegration: false }),
      );
      assert.equal(
        await NodeFSP.readFile(value.paths.stagingServicePath, "utf8"),
        "explicit staging service\n",
      );
      assert.equal(
        await NodeFSP.readFile(value.paths.stagingDesktopEntryPath, "utf8"),
        "explicit staging desktop\n",
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("is idempotent and installs only generated user paths", async () => {
    const value = await fixture();
    try {
      const first = await installLinuxDesktop(installInput(value));
      const firstUnit = await NodeFSP.readFile(value.paths.servicePath, "utf8");
      const firstStagingUnit = await NodeFSP.readFile(value.paths.stagingServicePath, "utf8");
      const firstDesktop = await NodeFSP.readFile(value.paths.desktopEntryPath, "utf8");
      const firstStagingDesktop = await NodeFSP.readFile(
        value.paths.stagingDesktopEntryPath,
        "utf8",
      );
      const firstUrlHandler = await NodeFSP.readFile(value.paths.urlHandlerPath, "utf8");
      const firstOmarchyCommand = await NodeFSP.readFile(value.paths.omarchyCommandPath, "utf8");
      const firstOmarchyAgent = await NodeFSP.readFile(value.paths.omarchyAgentPath, "utf8");
      const firstOmarchyDefaultAgent = await NodeFSP.readFile(
        value.paths.omarchyDefaultAgentPath,
        "utf8",
      );
      const firstHypr = await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8");
      const firstMenu = await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8");
      const firstCurrent = await NodeFSP.readlink(value.paths.currentPath);
      const firstCurrentStat = await NodeFSP.lstat(value.paths.currentPath);
      const second = await installLinuxDesktop(installInput(value));
      assert.equal(first.artifactSha256, second.artifactSha256);
      assert.equal(await NodeFSP.readlink(value.paths.currentPath), firstCurrent);
      assert.equal(await NodeFSP.readFile(value.paths.servicePath, "utf8"), firstUnit);
      assert.equal(
        await NodeFSP.readFile(value.paths.stagingServicePath, "utf8"),
        firstStagingUnit,
      );
      assert.equal(await NodeFSP.readFile(value.paths.desktopEntryPath, "utf8"), firstDesktop);
      assert.equal(
        await NodeFSP.readFile(value.paths.stagingDesktopEntryPath, "utf8"),
        firstStagingDesktop,
      );
      assert.equal(await NodeFSP.readFile(value.paths.urlHandlerPath, "utf8"), firstUrlHandler);
      assert.equal(
        await NodeFSP.readFile(value.paths.omarchyCommandPath, "utf8"),
        firstOmarchyCommand,
      );
      assert.equal(await NodeFSP.readFile(value.paths.omarchyAgentPath, "utf8"), firstOmarchyAgent);
      assert.equal(
        await NodeFSP.readFile(value.paths.omarchyDefaultAgentPath, "utf8"),
        firstOmarchyDefaultAgent,
      );
      assert.equal(await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8"), firstHypr);
      assert.equal(await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8"), firstMenu);
      assert.equal((await NodeFSP.lstat(value.paths.currentPath)).ino, firstCurrentStat.ino);
      assert.include(firstUnit, value.paths.launcherPath);
      assert.include(firstUnit, "Description=T3 Code");
      assert.include(firstUnit, "Environment=T3CODE_DISABLE_AUTO_UPDATE=true");
      assert.include(firstUnit, "Environment=APPIMAGE_EXTRACT_AND_RUN=1");
      assert.include(firstUnit, `Environment="T3CODE_HOME=${value.paths.productionT3Home}"`);
      assert.include(
        firstUnit,
        `Environment="XDG_CONFIG_HOME=${value.paths.productionXdgConfigHome}"`,
      );
      assert.include(firstUnit, 'Environment="T3CODE_DESKTOP_DISPLAY_NAME=T3 Code"');
      assert.include(
        firstUnit,
        'Environment="T3CODE_DESKTOP_SERVER_URL=https://production.example.test/"',
      );
      assert.notInclude(firstUnit, "T3CODE_PORT=");
      assert.notInclude(firstUnit, `T3CODE_HOME=${NodePath.join(value.environment.HOME, ".t3")}`);
      assert.notInclude(firstUnit, "Environment=XDG_DATA_HOME=");
      assert.include(firstUnit, "KillMode=control-group");
      assert.include(firstUnit, "TimeoutStopSec=8s");
      assert.notInclude(firstUnit, "T3CODE_LAUNCH_HANDOFF_TOKEN");
      assert.notInclude(firstUnit, "{{");
      assert.include(firstStagingUnit, "Description=T3 Code (Staging)");
      assert.include(firstStagingUnit, "Environment=APPIMAGE_EXTRACT_AND_RUN=1");
      assert.include(firstStagingUnit, `Environment="T3CODE_HOME=${value.paths.stagingT3Home}"`);
      assert.include(firstStagingUnit, 'Environment="T3CODE_DESKTOP_CHANNEL=staging"');
      assert.include(firstDesktop, "Name=T3 Code");
      assert.include(firstDesktop, `"T3CODE_HOME=${value.paths.productionT3Home}"`);
      assert.include(firstDesktop, `"XDG_CONFIG_HOME=${value.paths.productionXdgConfigHome}"`);
      assert.include(firstDesktop, '"T3CODE_DESKTOP_DISPLAY_NAME=T3 Code"');
      assert.include(firstDesktop, '"T3CODE_DESKTOP_SERVER_URL=https://production.example.test/"');
      assert.include(firstDesktop, '"T3CODE_DESKTOP_CHANNEL=production"');
      assert.include(firstStagingDesktop, "Name=T3 Code (Staging)");
      assert.include(firstStagingDesktop, `"T3CODE_HOME=${value.paths.stagingT3Home}"`);
      assert.include(firstStagingDesktop, `"XDG_CONFIG_HOME=${value.paths.stagingXdgConfigHome}"`);
      assert.include(firstStagingDesktop, '"T3CODE_DESKTOP_CHANNEL=staging"');
      assert.include(firstDesktop, '"T3CODE_DISABLE_AUTO_UPDATE=true"');
      assert.notInclude(firstDesktop, "T3CODE_PORT=");
      assert.include(firstDesktop, value.paths.launcherPath);
      assert.include(firstUrlHandler, "Name=T3 Code");
      assert.include(firstUrlHandler, `"T3CODE_HOME=${value.paths.productionT3Home}"`);
      assert.include(firstUrlHandler, `"XDG_CONFIG_HOME=${value.paths.productionXdgConfigHome}"`);
      assert.include(firstUrlHandler, '"T3CODE_DESKTOP_DISPLAY_NAME=T3 Code"');
      assert.include(
        firstUrlHandler,
        '"T3CODE_DESKTOP_SERVER_URL=https://production.example.test/"',
      );
      assert.include(firstUrlHandler, '"T3CODE_DESKTOP_CHANNEL=production"');
      assert.include(firstUrlHandler, '"T3CODE_DISABLE_AUTO_UPDATE=true"');
      assert.include(firstUrlHandler, value.paths.launcherPath);
      assert.include(firstUrlHandler, '"protocol"');
      assert.include(firstUrlHandler, `"${first.artifactSha256}"`);
      assert.notInclude(firstUrlHandler, "X-T3Code-Managed-Staging=true");
      assert.include(firstUrlHandler, "MimeType=x-scheme-handler/t3code;");
      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      assert.include(ownership.managedPaths, value.paths.urlHandlerPath);
      assert.include(ownership.managedPaths, value.paths.stagingServicePath);
      assert.include(ownership.managedPaths, value.paths.stagingDesktopEntryPath);
      assert.includeMembers(ownership.managedPaths, [
        value.paths.omarchyCommandPath,
        value.paths.omarchyAgentPath,
        value.paths.omarchyDefaultAgentPath,
        value.paths.omarchyHyprModulePath,
        value.paths.omarchyUwsmEnvironmentPath,
      ]);
      assert.notInclude(
        ownership.managedPaths,
        NodePath.join(value.environment.HOME, ".config", "omarchy", "defaults", "agent"),
      );
      assert.deepEqual(
        ownership.managedSharedPaths.map((entry) => entry.path),
        [value.paths.omarchyHyprConfigPath, value.paths.omarchyMenuPath],
      );
      assert.include(firstOmarchyCommand, "exec '/usr/bin/omarchy'");
      assert.include(firstOmarchyAgent, "exec '/usr/bin/omarchy-agent'");
      assert.include(firstOmarchyDefaultAgent, "exec '/usr/bin/omarchy-default-agent'");
      assert.include(firstOmarchyAgent, `${value.paths.launcherPath}' activate`);
      assert.include(firstHypr, "-- unrelated user suffix");
      assert.include(firstHypr, 'require("default.hypr.omarchy")\n-- >>> T3 Code');
      assert.include(firstHypr, 'require("hypr.t3code_omarchy")');
      assert.include(firstMenu, "// unrelated user menu content");
      assert.include(firstMenu, '"setup.default.agent.t3code"');
      assert.include(firstMenu, value.paths.omarchyDefaultAgentPath);
      for (const scriptPath of [
        value.paths.omarchyCommandPath,
        value.paths.omarchyAgentPath,
        value.paths.omarchyDefaultAgentPath,
        value.paths.omarchyUwsmEnvironmentPath,
      ]) {
        assert.equal((await runExecutable("/usr/bin/bash", ["-n", scriptPath])).code, 0);
      }
      const installedManifest = JSON.parse(
        await NodeFSP.readFile(NodePath.join(first.targetRoot, "manifest.json"), "utf8"),
      );
      assert.equal(installedManifest.commitHash, COMMIT);
      assert.equal(installedManifest.artifactSha256, first.artifactSha256);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("removes the owned legacy production service during identity migration", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      await NodeFSP.writeFile(value.paths.legacyProductionServicePath, "legacy production unit\n");
      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      ownership.managedPaths.push(value.paths.legacyProductionServicePath);
      await NodeFSP.writeFile(
        value.paths.ownershipManifestPath,
        `${JSON.stringify(ownership, null, 2)}\n`,
      );

      await installLinuxDesktop(installInput(value));

      await expect(NodeFSP.lstat(value.paths.legacyProductionServicePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      const migratedOwnership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      assert.notInclude(migratedOwnership.managedPaths, value.paths.legacyProductionServicePath);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("skips Omarchy integration when its host capability is absent", async () => {
    const value = await fixture();
    try {
      const originalHypr = await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8");
      const originalMenu = await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8");
      await installLinuxDesktop(installInput(value, { omarchyIntegration: false }));

      assert.equal(await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8"), originalHypr);
      assert.equal(await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8"), originalMenu);
      await expect(NodeFSP.access(value.paths.omarchyCommandPath)).rejects.toThrow();
      await expect(NodeFSP.access(value.paths.omarchyUwsmEnvironmentPath)).rejects.toThrow();
      await expect(NodeFSP.access(value.paths.omarchyAdapterBinRoot)).rejects.toThrow();

      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      assert.deepEqual(ownership.managedSharedPaths, []);
      assert.notInclude(ownership.managedPaths, value.paths.omarchyCommandPath);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("removes previously owned Omarchy integration when capability disappears", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      await installLinuxDesktop(installInput(value, { omarchyIntegration: false }));

      for (const filePath of [
        value.paths.omarchyCommandPath,
        value.paths.omarchyAgentPath,
        value.paths.omarchyDefaultAgentPath,
        value.paths.omarchyHyprModulePath,
        value.paths.omarchyUwsmEnvironmentPath,
      ]) {
        await expect(NodeFSP.access(filePath)).rejects.toThrow();
      }
      const hypr = await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8");
      const menu = await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8");
      assert.notInclude(hypr, "T3 Code managed Omarchy adapter");
      assert.include(hypr, "-- unrelated user suffix");
      assert.notInclude(menu, "setup.default.agent.t3code");
      assert.include(menu, '"personal"');

      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      assert.deepEqual(ownership.managedSharedPaths, []);
      assert.notInclude(ownership.managedPaths, value.paths.omarchyCommandPath);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("restores owned markers around later edits when capability-loss cleanup fails", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      await expect(
        installLinuxDesktop(installInput(value, { omarchyIntegration: false }), {
          beforeManagedFileReplace: async (filePath) => {
            if (filePath !== value.paths.ownershipManifestPath) return;
            await NodeFSP.appendFile(
              value.paths.omarchyHyprConfigPath,
              "-- edit after capability cleanup\n",
            );
            await NodeFSP.appendFile(
              value.paths.omarchyMenuPath,
              "// edit after capability cleanup\n",
            );
            throw new Error("simulated capability cleanup manifest failure");
          },
        }),
      ).rejects.toThrow(/simulated capability cleanup manifest failure/);

      const hypr = await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8");
      const menu = await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8");
      assert.include(hypr, "-- edit after capability cleanup");
      assert.include(hypr, "T3 Code managed Omarchy adapter");
      assert.include(menu, "// edit after capability cleanup");
      assert.include(menu, "setup.default.agent.t3code");
      assert.isTrue((await NodeFSP.stat(value.paths.omarchyCommandPath)).isFile());
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("recomputes menu marker commas across capability-loss rollback", async () => {
    for (const transition of ["nonempty-to-empty", "empty-to-nonempty"]) {
      const value = await fixture();
      try {
        if (transition === "empty-to-nonempty") {
          await NodeFSP.writeFile(value.paths.omarchyMenuPath, "{\n}\n");
        }
        await installLinuxDesktop(installInput(value));
        await expect(
          installLinuxDesktop(installInput(value, { omarchyIntegration: false }), {
            beforeManagedFileReplace: async (filePath) => {
              if (filePath !== value.paths.ownershipManifestPath) return;
              await NodeFSP.writeFile(
                value.paths.omarchyMenuPath,
                transition === "nonempty-to-empty"
                  ? "{\n}\n// became empty after cleanup\n"
                  : '{\n  "later": {"label":"Later"}\n}\n',
              );
              throw new Error(`simulated ${transition} rollback`);
            },
          }),
        ).rejects.toThrow(new RegExp(`simulated ${transition} rollback`));

        const restoredMenu = await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8");
        assert.include(restoredMenu, "setup.default.agent.t3code");
        if (transition === "nonempty-to-empty") {
          assert.notMatch(restoredMenu, /\n,\s+"setup\.default\.agent\.t3code"/);
        } else {
          assert.match(restoredMenu, /\n,\s+"setup\.default\.agent\.t3code"/);
          assert.include(restoredMenu, '"later"');
        }

        await installLinuxDesktop(installInput(value));
      } finally {
        await NodeFSP.rm(value.root, { recursive: true, force: true });
      }
    }
  });

  it("removes only exact Omarchy paths recorded by a partial prior manifest", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      const ownership = JSON.parse(
        await NodeFSP.readFile(value.paths.ownershipManifestPath, "utf8"),
      );
      ownership.managedPaths = ownership.managedPaths.filter(
        (filePath) =>
          filePath !== value.paths.omarchyAgentPath &&
          filePath !== value.paths.omarchyDefaultAgentPath &&
          filePath !== value.paths.omarchyHyprModulePath &&
          filePath !== value.paths.omarchyUwsmEnvironmentPath,
      );
      ownership.managedSharedPaths = [];
      await NodeFSP.writeFile(
        value.paths.ownershipManifestPath,
        `${JSON.stringify(ownership, null, 2)}\n`,
      );
      const agentBefore = await NodeFSP.readFile(value.paths.omarchyAgentPath);

      await installLinuxDesktop(installInput(value, { omarchyIntegration: false }));

      await expect(NodeFSP.access(value.paths.omarchyCommandPath)).rejects.toThrow();
      assert.deepEqual(await NodeFSP.readFile(value.paths.omarchyAgentPath), agentBefore);
      assert.include(
        await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8"),
        "T3 Code managed Omarchy adapter",
      );
      assert.include(
        await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8"),
        "setup.default.agent.t3code",
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("delegates every stock Omarchy route and stock agent argument exactly", async () => {
    const value = await fixture();
    const stockBin = NodePath.join(value.root, "stock-bin");
    const callLog = NodePath.join(value.root, "stock-call");
    try {
      const recorder = `#!/bin/bash
printf '%s\\0' "$(basename "$0")" "$@" >"$T3_TEST_LOG"
`;
      await Promise.all([
        writeExecutable(NodePath.join(stockBin, "omarchy"), recorder),
        writeExecutable(NodePath.join(stockBin, "omarchy-agent"), recorder),
        writeExecutable(
          NodePath.join(stockBin, "omarchy-default-agent"),
          `#!/bin/bash
if (( $# == 0 )); then
  [[ -f $HOME/.config/omarchy/defaults/agent ]] && cat "$HOME/.config/omarchy/defaults/agent"
  exit 0
fi
printf '%s\\0' "$(basename "$0")" "$@" >"$T3_TEST_LOG"
`,
        ),
      ]);
      await NodeFSP.mkdir(NodePath.join(value.environment.HOME, ".config", "omarchy", "defaults"), {
        recursive: true,
      });
      await NodeFSP.writeFile(
        NodePath.join(value.environment.HOME, ".config", "omarchy", "defaults", "agent"),
        "codex\n",
      );
      await installLinuxDesktop(installInput(value), {
        omarchyStockBinDirectory: stockBin,
      });
      const runEnvironment = {
        ...process.env,
        ...value.environment,
        T3_TEST_LOG: callLog,
      };
      assert.equal(
        (
          await runExecutable(value.paths.omarchyCommandPath, ["theme", "set", "nord"], {
            env: runEnvironment,
          })
        ).code,
        0,
      );
      assert.deepEqual((await NodeFSP.readFile(callLog)).toString().split("\0").filter(Boolean), [
        "omarchy",
        "theme",
        "set",
        "nord",
      ]);
      assert.equal(
        (
          await runExecutable(
            value.paths.omarchyCommandPath,
            ["agent", "--inline", "--prompt", "keep exact spacing"],
            { env: runEnvironment },
          )
        ).code,
        0,
      );
      assert.deepEqual((await NodeFSP.readFile(callLog)).toString().split("\0").filter(Boolean), [
        "omarchy-agent",
        "--inline",
        "--prompt",
        "keep exact spacing",
      ]);
      assert.equal(
        (
          await runExecutable(value.paths.omarchyDefaultAgentPath, ["codex", "extra"], {
            env: runEnvironment,
          })
        ).code,
        0,
      );
      assert.deepEqual((await NodeFSP.readFile(callLog)).toString().split("\0").filter(Boolean), [
        "omarchy-default-agent",
        "codex",
        "extra",
      ]);
      assert.equal(
        (
          await runExecutable(value.paths.omarchyCommandPath, ["agent", "prompt", "stock"], {
            env: runEnvironment,
          })
        ).code,
        0,
      );
      assert.deepEqual((await NodeFSP.readFile(callLog)).toString().split("\0").filter(Boolean), [
        "omarchy",
        "agent",
        "prompt",
        "stock",
      ]);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("selects T3 explicitly and sends one bounded activation document", async () => {
    const value = await fixture();
    const stockBin = NodePath.join(value.root, "stock-bin");
    const activationPath = NodePath.join(value.root, "activation.json");
    const activationModePath = NodePath.join(value.root, "activation-mode");
    const launcherSource = NodePath.join(value.root, "launcher-stub");
    const workspace = NodePath.join(value.root, "workspace");
    try {
      await NodeFSP.mkdir(workspace);
      await writeExecutable(
        NodePath.join(stockBin, "omarchy-default-agent"),
        `#!/bin/bash
if (( $# == 0 )); then
  [[ -f $HOME/.config/omarchy/defaults/agent ]] && cat "$HOME/.config/omarchy/defaults/agent"
  exit 0
fi
exit 91
`,
      );
      await writeExecutable(NodePath.join(stockBin, "omarchy"), "#!/bin/bash\nexit 92\n");
      await writeExecutable(NodePath.join(stockBin, "omarchy-agent"), "#!/bin/bash\nexit 93\n");
      await writeExecutable(
        launcherSource,
        `#!/bin/bash
printf '%s' "$1" >"$T3_ACTIVATION_MODE"
cat >"$T3_ACTIVATION_PATH"
`,
      );
      const preferencePath = NodePath.join(
        value.environment.HOME,
        ".config",
        "omarchy",
        "defaults",
        "agent",
      );
      await NodeFSP.mkdir(NodePath.dirname(preferencePath), { recursive: true });
      await NodeFSP.writeFile(preferencePath, "claude\n");
      await installLinuxDesktop(installInput(value, { launcherSource }), {
        omarchyStockBinDirectory: stockBin,
      });
      assert.equal(await NodeFSP.readFile(preferencePath, "utf8"), "claude\n");
      const runEnvironment = {
        ...process.env,
        ...value.environment,
        T3_ACTIVATION_MODE: activationModePath,
        T3_ACTIVATION_PATH: activationPath,
      };
      assert.equal(
        (
          await runExecutable(value.paths.omarchyCommandPath, ["default", "agent", "t3code"], {
            cwd: workspace,
            env: runEnvironment,
          })
        ).code,
        0,
      );
      assert.equal(await NodeFSP.readFile(preferencePath, "utf8"), "t3code\n");
      assert.equal(await NodeFSP.readFile(activationModePath, "utf8"), "activate");
      const openActivation = JSON.parse(await NodeFSP.readFile(activationPath, "utf8"));
      assert.deepEqual(openActivation, {
        contractVersion: 1,
        workspace,
        action: "open",
      });
      assert.deepEqual(validateDesktopActivationRequest(openActivation), openActivation);

      assert.equal(
        (
          await runExecutable(
            value.paths.omarchyAgentPath,
            ["--inline", "--prompt", "review this change"],
            { cwd: workspace, env: runEnvironment },
          )
        ).code,
        0,
      );
      const submitActivation = JSON.parse(await NodeFSP.readFile(activationPath, "utf8"));
      assert.deepEqual(submitActivation, {
        contractVersion: 1,
        workspace,
        action: "submit",
        prompt: "review this change",
      });
      assert.deepEqual(validateDesktopActivationRequest(submitActivation), submitActivation);
      assert.equal(
        (
          await runExecutable(value.paths.omarchyAgentPath, ["--prompt", ""], {
            cwd: workspace,
            env: runEnvironment,
          })
        ).code,
        2,
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("preserves unrelated Hypr and menu bytes around bounded owned markers", async () => {
    const value = await fixture();
    try {
      const originalHypr = await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8");
      const originalMenu = await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8");
      await installLinuxDesktop(installInput(value));
      const installedHypr = await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8");
      const installedMenu = await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8");
      assert.equal(
        installedHypr.replace(
          /-- >>> T3 Code managed Omarchy adapter >>>\n[\s\S]*?-- <<< T3 Code managed Omarchy adapter <<<\n/,
          "",
        ),
        originalHypr,
      );
      assert.equal(
        installedMenu
          .replace(
            /  \/\/ >>> T3 Code managed Omarchy adapter >>>\n[\s\S]*?  \/\/ <<< T3 Code managed Omarchy adapter <<<\n/,
            "",
          )
          .replace(',  "personal"', '  "personal"'),
        originalMenu,
      );
      assert.isTrue((await NodeFSP.stat(value.paths.omarchyCommandPath)).isFile());
      assert.isFalse((await NodeFSP.lstat(value.paths.omarchyCommandPath)).isSymbolicLink());
      assert.equal((await NodeFSP.stat(value.paths.omarchyCommandPath)).mode & 0o777, 0o755);
      assert.include(
        await NodeFSP.readFile(value.paths.omarchyHyprModulePath, "utf8"),
        `table.insert(kept, 1, adapter_bin)`,
      );
      assert.include(
        await NodeFSP.readFile(value.paths.omarchyUwsmEnvironmentPath, "utf8"),
        `export PATH="$t3code_omarchy_bin\${PATH:+:$PATH}"`,
      );
      const sourcedEnvironment = await runExecutable(
        "/usr/bin/bash",
        [
          "-c",
          '. "$1"; printf "%s" "$PATH"',
          "t3code-uwsm-test",
          value.paths.omarchyUwsmEnvironmentPath,
        ],
        { env: { PATH: "/usr/bin" } },
      );
      assert.equal(sourcedEnvironment.code, 0);
      assert.equal(sourcedEnvironment.stdout, `${value.paths.omarchyAdapterBinRoot}:/usr/bin`);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("re-reads shared Omarchy files after staging and preserves concurrent edits", async () => {
    const value = await fixture();
    const changed = new Set();
    try {
      await installLinuxDesktop(installInput(value), {
        beforeManagedFileReplace: async (filePath) => {
          if (changed.has(filePath)) return;
          if (filePath === value.paths.omarchyHyprConfigPath) {
            changed.add(filePath);
            await NodeFSP.appendFile(filePath, "-- concurrent Hypr edit\n");
          }
          if (filePath === value.paths.omarchyMenuPath) {
            changed.add(filePath);
            const menu = await NodeFSP.readFile(filePath, "utf8");
            await NodeFSP.writeFile(
              filePath,
              menu.replace(
                "// unrelated trailing menu comment",
                "// concurrent menu edit\n// unrelated trailing menu comment",
              ),
            );
          }
        },
      });

      assert.include(
        await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8"),
        "-- concurrent Hypr edit",
      );
      assert.include(
        await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8"),
        "// concurrent menu edit",
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rolls back only owned markers when shared files change after replacement", async () => {
    const value = await fixture();
    try {
      await expect(
        installLinuxDesktop(installInput(value), {
          beforeManagedFileReplace: async (filePath) => {
            if (filePath !== value.paths.ownershipManifestPath) return;
            await NodeFSP.appendFile(
              value.paths.omarchyHyprConfigPath,
              "-- edit after Hypr replacement\n",
            );
            await NodeFSP.appendFile(
              value.paths.omarchyMenuPath,
              "// edit after menu replacement\n",
            );
            throw new Error("simulated late manifest failure");
          },
        }),
      ).rejects.toThrow(/simulated late manifest failure/);

      const hypr = await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8");
      const menu = await NodeFSP.readFile(value.paths.omarchyMenuPath, "utf8");
      assert.include(hypr, "-- edit after Hypr replacement");
      assert.notInclude(hypr, "T3 Code managed Omarchy adapter");
      assert.include(menu, "// edit after menu replacement");
      assert.notInclude(menu, "setup.default.agent.t3code");
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects unowned adapter conflicts and every managed adapter symlink", async () => {
    const conflictValue = await fixture();
    try {
      await NodeFSP.mkdir(NodePath.dirname(conflictValue.paths.omarchyAgentPath), {
        recursive: true,
      });
      await NodeFSP.writeFile(conflictValue.paths.omarchyAgentPath, "unowned adapter\n");
      await expect(installLinuxDesktop(installInput(conflictValue))).rejects.toThrow(
        /unowned Omarchy agent adapter/,
      );
      assert.equal(
        await NodeFSP.readFile(conflictValue.paths.omarchyAgentPath, "utf8"),
        "unowned adapter\n",
      );
    } finally {
      await NodeFSP.rm(conflictValue.root, { recursive: true, force: true });
    }

    for (const pathName of [
      "omarchyCommandPath",
      "omarchyAgentPath",
      "omarchyDefaultAgentPath",
      "omarchyHyprModulePath",
      "omarchyUwsmEnvironmentPath",
    ]) {
      const value = await fixture();
      try {
        const managedPath = value.paths[pathName];
        const externalPath = NodePath.join(value.root, `external-${pathName}`);
        await NodeFSP.mkdir(NodePath.dirname(managedPath), { recursive: true });
        await NodeFSP.writeFile(externalPath, "external adapter target\n");
        await NodeFSP.symlink(externalPath, managedPath);
        await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
          /physical regular file/,
        );
        assert.isTrue((await NodeFSP.lstat(managedPath)).isSymbolicLink());
        assert.equal(await NodeFSP.readFile(externalPath, "utf8"), "external adapter target\n");
      } finally {
        await NodeFSP.rm(value.root, { recursive: true, force: true });
      }
    }
  });

  it("rejects symlinked or conflicting shared Omarchy integration files", async () => {
    for (const pathName of ["omarchyHyprConfigPath", "omarchyMenuPath"]) {
      const value = await fixture();
      try {
        const sharedPath = value.paths[pathName];
        const externalPath = NodePath.join(value.root, `external-${pathName}`);
        const original = await NodeFSP.readFile(sharedPath);
        await NodeFSP.writeFile(externalPath, original);
        await NodeFSP.rm(sharedPath);
        await NodeFSP.symlink(externalPath, sharedPath);
        await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
          /physical regular file|must not be a symbolic link/,
        );
        assert.isTrue((await NodeFSP.lstat(sharedPath)).isSymbolicLink());
        assert.deepEqual(await NodeFSP.readFile(externalPath), original);
      } finally {
        await NodeFSP.rm(value.root, { recursive: true, force: true });
      }
    }

    const value = await fixture();
    try {
      await NodeFSP.writeFile(
        value.paths.omarchyHyprConfigPath,
        [
          'require("default.hypr.omarchy")',
          "-- >>> T3 Code managed Omarchy adapter >>>",
          'require("hypr.user_owned")',
          "",
        ].join("\n"),
      );
      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
        /incomplete managed marker/,
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked Omarchy adapter-bin ancestor", async () => {
    const value = await fixture();
    const externalRoot = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-omarchy-bin-"));
    try {
      await NodeFSP.mkdir(NodePath.dirname(value.paths.omarchyAdapterBinRoot), {
        recursive: true,
      });
      await NodeFSP.symlink(externalRoot, value.paths.omarchyAdapterBinRoot);
      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
        /unexpected managed ancestor/,
      );
      assert.deepEqual(await NodeFSP.readdir(externalRoot), []);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
      await NodeFSP.rm(externalRoot, { recursive: true, force: true });
    }
  });

  it("carries one parsed staging environment through service spawn and focus fallback", async () => {
    const value = await fixture();
    try {
      const installed = await installLinuxDesktop(installInput(value));
      const service = await NodeFSP.readFile(value.paths.stagingServicePath, "utf8");
      const desktop = await NodeFSP.readFile(value.paths.stagingDesktopEntryPath, "utf8");
      const serviceEnvironment = parseSystemdEnvironment(service);
      const desktopEnvironment = parseDesktopExecEnvironment(desktop);
      const expectedEnvironment = {
        T3CODE_HOME: value.paths.stagingT3Home,
        XDG_CONFIG_HOME: value.paths.stagingXdgConfigHome,
        T3CODE_DESKTOP_DISPLAY_NAME: "T3 Code (Staging)",
        T3CODE_DESKTOP_SERVER_URL: "https://staging.example.test/",
        T3CODE_DESKTOP_CHANNEL: "staging",
        T3CODE_DISABLE_AUTO_UPDATE: "true",
      };
      assert.deepEqual(serviceEnvironment, expectedEnvironment);
      assert.deepEqual(desktopEnvironment, expectedEnvironment);

      const spawnCalls = [];
      const child = new NodeEvents.EventEmitter();
      const serviceExit = runDesktopService(
        {
          paths: { manifestPath: NodePath.join(value.paths.currentPath, "manifest.json") },
          environment: {
            ...serviceEnvironment,
            T3CODE_LAUNCH_GENERATION: "staging-integration-generation",
          },
        },
        {
          spawn: (command, args, options) => {
            spawnCalls.push([command, args, options]);
            queueMicrotask(() => child.emit("exit", 0, null));
            return child;
          },
        },
      );
      assert.equal(await serviceExit, 0);
      assert.deepEqual(spawnCalls[0]?.[2]?.env, {
        ...expectedEnvironment,
        T3CODE_LAUNCH_GENERATION: "staging-integration-generation",
      });

      let fallbackEnvironment;
      assert.equal(
        await focusDesktopWindow(
          {
            desktopMainPid: 42,
            artifactPath: NodePath.join(installed.targetRoot, "T3-Code.AppImage"),
            linuxWmClass: "t3code",
            hyprlandAvailable: false,
            environment: desktopEnvironment,
          },
          {
            runCommand: async (_command, _args, options) => {
              fallbackEnvironment = options?.env;
              return { code: 0, stdout: "", stderr: "" };
            },
          },
        ),
        "electron",
      );
      assert.deepEqual(fallbackEnvironment, expectedEnvironment);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("replaces the Alpha-owned entry and service without changing artifact provenance", async () => {
    const value = await fixture();
    try {
      const first = await installLinuxDesktop(installInput(value));
      const currentBefore = await NodeFSP.readlink(value.paths.currentPath);
      const manifestBefore = await NodeFSP.readFile(
        NodePath.join(first.targetRoot, "manifest.json"),
        "utf8",
      );
      await NodeFSP.writeFile(
        value.paths.servicePath,
        [
          "[Unit]",
          "Description=T3 Code (Alpha)",
          "",
          "[Service]",
          `ExecStart=${value.paths.launcherPath} service`,
          "",
        ].join("\n"),
      );
      await NodeFSP.writeFile(
        value.paths.desktopEntryPath,
        [
          "[Desktop Entry]",
          "Type=Application",
          "Name=T3 Code (Alpha)",
          `Exec=${value.paths.launcherPath} launch`,
          "StartupWMClass=t3code",
          "",
        ].join("\n"),
      );

      await installLinuxDesktop(installInput(value));

      const service = await NodeFSP.readFile(value.paths.servicePath, "utf8");
      const desktop = await NodeFSP.readFile(value.paths.desktopEntryPath, "utf8");
      assert.include(service, "Description=T3 Code");
      assert.include(service, `Environment="T3CODE_HOME=${value.paths.productionT3Home}"`);
      assert.include(
        service,
        `Environment="XDG_CONFIG_HOME=${value.paths.productionXdgConfigHome}"`,
      );
      assert.include(service, 'Environment="T3CODE_DESKTOP_DISPLAY_NAME=T3 Code"');
      assert.include(
        service,
        'Environment="T3CODE_DESKTOP_SERVER_URL=https://production.example.test/"',
      );
      assert.include(desktop, "Name=T3 Code");
      assert.include(desktop, `"T3CODE_HOME=${value.paths.productionT3Home}"`);
      assert.include(desktop, `"XDG_CONFIG_HOME=${value.paths.productionXdgConfigHome}"`);
      assert.include(desktop, '"T3CODE_DESKTOP_SERVER_URL=https://production.example.test/"');
      assert.equal(await NodeFSP.readlink(value.paths.currentPath), currentBefore);
      assert.equal(
        await NodeFSP.readFile(NodePath.join(first.targetRoot, "manifest.json"), "utf8"),
        manifestBefore,
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects descriptor checksum drift before creating managed paths", async () => {
    const value = await fixture();
    try {
      await NodeFSP.appendFile(value.artifactPath, "changed-after-release");
      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(/checksum/);
      await expect(NodeFSP.lstat(value.paths.installRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects matching-content symlinks at trusted launcher integration paths", async () => {
    for (const pathName of ["launcherPath", "servicePath", "desktopEntryPath"]) {
      const value = await fixture();
      try {
        await installLinuxDesktop(installInput(value));
        const managedPath = value.paths[pathName];
        const externalPath = NodePath.join(value.root, `external-${pathName}`);
        const originalContent = await NodeFSP.readFile(managedPath);
        await NodeFSP.writeFile(externalPath, originalContent);
        await NodeFSP.rm(managedPath);
        await NodeFSP.symlink(externalPath, managedPath);

        await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
          /physical regular file/,
        );
        assert.isTrue((await NodeFSP.lstat(managedPath)).isSymbolicLink());
        assert.deepEqual(await NodeFSP.readFile(externalPath), originalContent);
      } finally {
        await NodeFSP.rm(value.root, { recursive: true, force: true });
      }
    }
  });

  it("rejects a symlinked trusted ownership manifest without changing its target", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      const externalPath = NodePath.join(value.root, "external-install-manifest.json");
      const originalContent = await NodeFSP.readFile(value.paths.ownershipManifestPath);
      await NodeFSP.writeFile(externalPath, originalContent);
      await NodeFSP.rm(value.paths.ownershipManifestPath);
      await NodeFSP.symlink(externalPath, value.paths.ownershipManifestPath);

      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
        /physical regular file/,
      );
      assert.isTrue((await NodeFSP.lstat(value.paths.ownershipManifestPath)).isSymbolicLink());
      assert.deepEqual(await NodeFSP.readFile(externalPath), originalContent);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked current artifact files without changing external targets", async () => {
    for (const fileName of ["manifest.json", "T3-Code.AppImage"]) {
      const value = await fixture();
      try {
        const installed = await installLinuxDesktop(installInput(value));
        const managedPath = NodePath.join(installed.targetRoot, fileName);
        const externalPath = NodePath.join(value.root, `external-${fileName}`);
        const originalContent = await NodeFSP.readFile(managedPath);
        await NodeFSP.writeFile(externalPath, originalContent);
        await NodeFSP.rm(managedPath);
        await NodeFSP.symlink(externalPath, managedPath);

        await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
          /physical regular file/,
        );
        assert.isTrue((await NodeFSP.lstat(managedPath)).isSymbolicLink());
        assert.deepEqual(await NodeFSP.readFile(externalPath), originalContent);
      } finally {
        await NodeFSP.rm(value.root, { recursive: true, force: true });
      }
    }
  });

  it("rejects a matching service symlink introduced after validation", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      const originalContent = await NodeFSP.readFile(value.paths.servicePath);
      const externalPath = NodePath.join(value.root, "external-raced-service");
      await NodeFSP.writeFile(externalPath, originalContent, { mode: 0o640 });
      await NodeFSP.chmod(externalPath, 0o640);
      await NodeFSP.appendFile(value.paths.servicePath, "# managed drift\n");
      let injected = false;

      await expect(
        installLinuxDesktop(installInput(value), {
          beforeManagedFileReplace: async (filePath) => {
            if (filePath !== value.paths.servicePath || injected) return;
            injected = true;
            await NodeFSP.rm(filePath);
            await NodeFSP.symlink(externalPath, filePath);
          },
        }),
      ).rejects.toThrow(/symbolic link|changed/);

      assert.isTrue(injected);
      assert.isTrue((await NodeFSP.lstat(value.paths.servicePath)).isSymbolicLink());
      assert.deepEqual(await NodeFSP.readFile(externalPath), originalContent);
      assert.equal((await NodeFSP.stat(externalPath)).mode & 0o777, 0o640);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("preserves an unowned file that replaces an installed path before rollback", async () => {
    const value = await fixture();
    try {
      await expect(
        installLinuxDesktop(installInput(value), {
          beforeManagedFileReplace: async (filePath) => {
            if (filePath !== value.paths.ownershipManifestPath) return;
            await NodeFSP.writeFile(value.paths.launcherPath, "raced unowned launcher\n");
            throw new Error("simulated late failure");
          },
        }),
      ).rejects.toThrow(/could not be restored/);
      assert.equal(
        await NodeFSP.readFile(value.paths.launcherPath, "utf8"),
        "raced unowned launcher\n",
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("preserves a file that replaces the launcher immediately after rename", async () => {
    const value = await fixture();
    try {
      let injected = false;
      let replacementInode;
      let installedContent;
      await expect(
        installLinuxDesktop(installInput(value), {
          afterManagedFileRename: async (filePath) => {
            if (filePath !== value.paths.launcherPath || injected) return;
            injected = true;
            installedContent = await NodeFSP.readFile(filePath);
            const mode = (await NodeFSP.lstat(filePath)).mode & 0o777;
            await NodeFSP.rm(filePath);
            await NodeFSP.writeFile(filePath, installedContent, { mode });
            replacementInode = (await NodeFSP.lstat(filePath)).ino;
          },
        }),
      ).rejects.toThrow(/could not be restored/);
      assert.isTrue(injected);
      assert.deepEqual(await NodeFSP.readFile(value.paths.launcherPath), installedContent);
      assert.equal((await NodeFSP.lstat(value.paths.launcherPath)).ino, replacementInode);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("preserves a marked shared file that is recreated after rename", async () => {
    const value = await fixture();
    try {
      let injected = false;
      let replacementInode;
      let installedContent;
      await expect(
        installLinuxDesktop(installInput(value), {
          afterManagedFileRename: async (filePath) => {
            if (filePath !== value.paths.omarchyHyprConfigPath || injected) return;
            injected = true;
            installedContent = await NodeFSP.readFile(filePath);
            const mode = (await NodeFSP.lstat(filePath)).mode & 0o777;
            await NodeFSP.rm(filePath);
            await NodeFSP.writeFile(filePath, installedContent, { mode });
            replacementInode = (await NodeFSP.lstat(filePath)).ino;
          },
        }),
      ).rejects.toThrow(/could not be restored/);
      assert.isTrue(injected);
      assert.deepEqual(await NodeFSP.readFile(value.paths.omarchyHyprConfigPath), installedContent);
      assert.equal((await NodeFSP.lstat(value.paths.omarchyHyprConfigPath)).ino, replacementInode);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("preserves an artifact root that replaces the staged root immediately after promotion", async () => {
    const value = await fixture();
    try {
      let racedRoot;
      await expect(
        installLinuxDesktop(installInput(value), {
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
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("fails closed when current artifact files change after no-follow open", async () => {
    for (const pathName of ["manifestPath", "artifactPath"]) {
      const value = await fixture();
      try {
        const installed = await installLinuxDesktop(installInput(value));
        const managedPath =
          pathName === "manifestPath"
            ? NodePath.join(installed.targetRoot, "manifest.json")
            : NodePath.join(installed.targetRoot, "T3-Code.AppImage");
        const originalContent = await NodeFSP.readFile(managedPath);
        const originalMode = (await NodeFSP.stat(managedPath)).mode & 0o777;
        const externalPath = NodePath.join(value.root, `external-raced-${pathName}`);
        await NodeFSP.writeFile(externalPath, originalContent, { mode: originalMode });
        await NodeFSP.chmod(externalPath, originalMode);
        let injected = false;

        await expect(
          installLinuxDesktop(installInput(value), {
            afterExistingArtifactOpen: async (paths) => {
              if (injected) return;
              injected = true;
              await NodeFSP.rm(paths[pathName]);
              await NodeFSP.symlink(externalPath, paths[pathName]);
            },
          }),
        ).rejects.toThrow(/changed during physical file validation/);

        assert.isTrue(injected);
        assert.isTrue((await NodeFSP.lstat(managedPath)).isSymbolicLink());
        assert.deepEqual(await NodeFSP.readFile(externalPath), originalContent);
        assert.equal((await NodeFSP.stat(externalPath)).mode & 0o777, originalMode);
      } finally {
        await NodeFSP.rm(value.root, { recursive: true, force: true });
      }
    }
  });

  it("rejects corrupt content-addressed artifacts without changing current", async () => {
    const value = await fixture();
    try {
      const first = await installLinuxDesktop(installInput(value));
      const priorCurrent = await NodeFSP.readlink(value.paths.currentPath);
      await NodeFSP.writeFile(NodePath.join(first.targetRoot, "T3-Code.AppImage"), "corrupt");
      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
        /content-addressed desktop artifact is invalid/,
      );
      assert.equal(await NodeFSP.readlink(value.paths.currentPath), priorCurrent);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked artifacts ancestor outside the physical install root", async () => {
    const value = await fixture();
    const externalRoot = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-artifacts-"));
    try {
      await NodeFSP.mkdir(value.paths.installRoot, { recursive: true });
      await NodeFSP.symlink(externalRoot, value.paths.artifactsRoot);
      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
        /physical managed install root|unexpected managed ancestor/,
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
      await NodeFSP.rm(externalRoot, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked managed install root", async () => {
    const value = await fixture();
    const externalRoot = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-install-root-"));
    try {
      await NodeFSP.mkdir(NodePath.dirname(value.paths.installRoot), { recursive: true });
      await NodeFSP.symlink(externalRoot, value.paths.installRoot);
      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
        /unexpected managed ancestor/,
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
      await NodeFSP.rm(externalRoot, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked launcher-bin managed ancestor", async () => {
    const value = await fixture();
    const externalRoot = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-bin-root-"));
    try {
      await NodeFSP.mkdir(value.paths.installRoot, { recursive: true });
      await NodeFSP.symlink(externalRoot, NodePath.dirname(value.paths.launcherPath));
      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
        /unexpected managed ancestor/,
      );
      assert.deepEqual(await NodeFSP.readdir(externalRoot), []);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
      await NodeFSP.rm(externalRoot, { recursive: true, force: true });
    }
  });

  it("refuses unowned service collisions before changing managed files", async () => {
    const value = await fixture();
    try {
      await NodeFSP.mkdir(NodePath.dirname(value.paths.servicePath), { recursive: true });
      await NodeFSP.writeFile(value.paths.servicePath, "[Service]\nExecStart=/unrelated\n");
      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
        /unowned desktop user service/,
      );
      assert.equal(
        await NodeFSP.readFile(value.paths.servicePath, "utf8"),
        "[Service]\nExecStart=/unrelated\n",
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("safely adopts a recognized legacy T3 Code desktop entry", async () => {
    const value = await fixture();
    try {
      await NodeFSP.mkdir(NodePath.dirname(value.paths.desktopEntryPath), { recursive: true });
      await NodeFSP.writeFile(
        value.paths.desktopEntryPath,
        [
          "[Desktop Entry]",
          "Type=Application",
          "Name=T3 Code (Alpha)",
          "Exec=/previous/T3-Code.AppImage",
          "StartupWMClass=t3code",
          "",
        ].join("\n"),
      );
      await installLinuxDesktop(installInput(value));
      const installed = await NodeFSP.readFile(value.paths.desktopEntryPath, "utf8");
      assert.include(installed, value.paths.launcherPath);
      assert.notInclude(installed, "/previous/T3-Code.AppImage");
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("replaces the Alpha URL handler with the canonical production handler", async () => {
    const value = await fixture();
    try {
      await NodeFSP.mkdir(NodePath.dirname(value.paths.urlHandlerPath), { recursive: true });
      await NodeFSP.writeFile(
        value.paths.urlHandlerPath,
        [
          "[Desktop Entry]",
          "Type=Application",
          "Name=T3 Code (Alpha)",
          "Exec=/previous/T3-Code.AppImage %U",
          "NoDisplay=true",
          "MimeType=x-scheme-handler/t3code;",
          "",
        ].join("\n"),
      );

      await installLinuxDesktop(installInput(value));
      const handler = await NodeFSP.readFile(value.paths.urlHandlerPath, "utf8");
      assert.include(handler, "Name=T3 Code");
      assert.include(handler, '"T3CODE_DESKTOP_CHANNEL=production"');
      assert.notInclude(handler, "X-T3Code-Managed-Staging=true");
      assert.notInclude(handler, "/previous/T3-Code.AppImage");
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects an unowned URL handler marker lookalike", async () => {
    const value = await fixture();
    try {
      await NodeFSP.mkdir(NodePath.dirname(value.paths.urlHandlerPath), { recursive: true });
      const lookalike = [
        "[Desktop Entry]",
        "Type=Application",
        "Name=T3 Code (Staging)",
        "Exec=/untrusted/T3-Code.AppImage %U",
        "NoDisplay=true",
        "MimeType=x-scheme-handler/t3code;",
        "X-T3Code-Managed-Staging=true",
        "",
      ].join("\n");
      await NodeFSP.writeFile(value.paths.urlHandlerPath, lookalike);

      await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
        /unowned desktop URL handler/,
      );
      assert.equal(await NodeFSP.readFile(value.paths.urlHandlerPath, "utf8"), lookalike);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rejects legacy lookalikes outside Desktop Entry and unrelated executables", async () => {
    for (const desktopEntry of [
      [
        "[Unrelated]",
        "Type=Application",
        "Name=T3 Code (Alpha)",
        "Exec=/previous/T3-Code.AppImage",
        "StartupWMClass=t3code",
        "",
      ].join("\n"),
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=T3 Code (Alpha)",
        "Exec=/usr/bin/unrelated-client",
        "StartupWMClass=t3code",
        "",
      ].join("\n"),
      [
        "[Desktop Entry]",
        "Type=Application",
        "Name=T3 Code (Alpha)",
        'Exec="/previous/T3-Code.AppImage"unrelated',
        "StartupWMClass=t3code",
        "",
      ].join("\n"),
    ]) {
      const value = await fixture();
      try {
        await NodeFSP.mkdir(NodePath.dirname(value.paths.desktopEntryPath), { recursive: true });
        await NodeFSP.writeFile(value.paths.desktopEntryPath, desktopEntry);
        await expect(installLinuxDesktop(installInput(value))).rejects.toThrow(
          /unowned desktop entry/,
        );
        assert.equal(await NodeFSP.readFile(value.paths.desktopEntryPath, "utf8"), desktopEntry);
      } finally {
        await NodeFSP.rm(value.root, { recursive: true, force: true });
      }
    }
  });

  it("repairs executable permissions on an otherwise valid managed artifact", async () => {
    const value = await fixture();
    try {
      const first = await installLinuxDesktop(installInput(value));
      const installedArtifact = NodePath.join(first.targetRoot, "T3-Code.AppImage");
      await NodeFSP.chmod(installedArtifact, 0o644);
      await installLinuxDesktop(installInput(value));
      assert.equal((await NodeFSP.stat(installedArtifact)).mode & 0o777, 0o755);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("keeps the prior current artifact when upgrade staging fails", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      const priorCurrent = await NodeFSP.readlink(value.paths.currentPath);
      const nextArtifact = NodePath.join(value.root, "next.AppImage");
      await NodeFSP.writeFile(nextArtifact, "artifact-two");
      const nextDescriptor = await descriptorFor(nextArtifact);
      await expect(
        installLinuxDesktop(
          installInput(value, {
            artifactPath: nextArtifact,
            descriptorPath: nextDescriptor.descriptorPath,
            desktopTemplatePath: NodePath.join(value.root, "missing.desktop.in"),
          }),
        ),
      ).rejects.toThrow();
      assert.equal(await NodeFSP.readlink(value.paths.currentPath), priorCurrent);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("restores managed files and current selection when desktop refresh fails", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      await NodeFSP.writeFile(value.paths.omarchyAgentPath, "prior managed adapter state\n", {
        mode: 0o755,
      });
      await NodeFSP.writeFile(
        value.paths.omarchyHyprConfigPath,
        (await NodeFSP.readFile(value.paths.omarchyHyprConfigPath, "utf8")).replace(
          'require("hypr.t3code_omarchy")',
          'require("hypr.prior_owned_state")',
        ),
      );
      const prior = {
        current: await NodeFSP.readlink(value.paths.currentPath),
        launcher: await NodeFSP.readFile(value.paths.launcherPath),
        service: await NodeFSP.readFile(value.paths.servicePath),
        desktop: await NodeFSP.readFile(value.paths.desktopEntryPath),
      };
      const nextArtifact = NodePath.join(value.root, "next.AppImage");
      await NodeFSP.writeFile(nextArtifact, "artifact-two");
      const nextDescriptor = await descriptorFor(nextArtifact);
      const calls = [];
      await expect(
        installLinuxDesktop(
          installInput(value, {
            artifactPath: nextArtifact,
            descriptorPath: nextDescriptor.descriptorPath,
            refreshDesktopIntegration: true,
          }),
          {
            runCommand: async (command, args) => {
              calls.push([command, args]);
              return { code: 1, stdout: "", stderr: "reload failed" };
            },
          },
        ),
      ).rejects.toThrow(/Could not reload/);
      assert.deepEqual(calls, [
        ["systemctl", ["--user", "daemon-reload"]],
        ["systemctl", ["--user", "daemon-reload"]],
        ["update-desktop-database", [NodePath.dirname(value.paths.desktopEntryPath)]],
      ]);
      assert.equal(await NodeFSP.readlink(value.paths.currentPath), prior.current);
      assert.deepEqual(await NodeFSP.readFile(value.paths.launcherPath), prior.launcher);
      assert.deepEqual(await NodeFSP.readFile(value.paths.servicePath), prior.service);
      assert.deepEqual(await NodeFSP.readFile(value.paths.desktopEntryPath), prior.desktop);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("restores the managed staging URL handler when a later managed write fails", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      const prior = {
        current: await NodeFSP.readlink(value.paths.currentPath),
        urlHandler: await NodeFSP.readFile(value.paths.urlHandlerPath),
        ownership: await NodeFSP.readFile(value.paths.ownershipManifestPath),
        omarchyCommand: await NodeFSP.readFile(value.paths.omarchyCommandPath),
        omarchyAgent: await NodeFSP.readFile(value.paths.omarchyAgentPath),
        omarchyDefaultAgent: await NodeFSP.readFile(value.paths.omarchyDefaultAgentPath),
        hyprModule: await NodeFSP.readFile(value.paths.omarchyHyprModulePath),
        uwsmEnvironment: await NodeFSP.readFile(value.paths.omarchyUwsmEnvironmentPath),
        hyprConfig: await NodeFSP.readFile(value.paths.omarchyHyprConfigPath),
        menu: await NodeFSP.readFile(value.paths.omarchyMenuPath),
      };
      const nextArtifact = NodePath.join(value.root, "next.AppImage");
      await NodeFSP.writeFile(nextArtifact, "artifact-two");
      const nextDescriptor = await descriptorFor(nextArtifact);

      await expect(
        installLinuxDesktop(
          installInput(value, {
            artifactPath: nextArtifact,
            descriptorPath: nextDescriptor.descriptorPath,
          }),
          {
            beforeManagedFileReplace: async (filePath) => {
              if (filePath === value.paths.urlHandlerPath) {
                throw new Error("simulated URL handler failure");
              }
            },
          },
        ),
      ).rejects.toThrow(/simulated URL handler failure/);

      assert.equal(await NodeFSP.readlink(value.paths.currentPath), prior.current);
      assert.deepEqual(await NodeFSP.readFile(value.paths.urlHandlerPath), prior.urlHandler);
      assert.deepEqual(await NodeFSP.readFile(value.paths.ownershipManifestPath), prior.ownership);
      assert.deepEqual(
        await NodeFSP.readFile(value.paths.omarchyCommandPath),
        prior.omarchyCommand,
      );
      assert.deepEqual(await NodeFSP.readFile(value.paths.omarchyAgentPath), prior.omarchyAgent);
      assert.deepEqual(
        await NodeFSP.readFile(value.paths.omarchyDefaultAgentPath),
        prior.omarchyDefaultAgent,
      );
      assert.deepEqual(await NodeFSP.readFile(value.paths.omarchyHyprModulePath), prior.hyprModule);
      assert.deepEqual(
        await NodeFSP.readFile(value.paths.omarchyUwsmEnvironmentPath),
        prior.uwsmEnvironment,
      );
      assert.deepEqual(await NodeFSP.readFile(value.paths.omarchyHyprConfigPath), prior.hyprConfig);
      assert.deepEqual(await NodeFSP.readFile(value.paths.omarchyMenuPath), prior.menu);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("claims the managed staging protocol immediately without starting the service", async () => {
    const value = await fixture();
    const calls = [];
    let currentDefault = "t3code-alpha.desktop";
    try {
      await installLinuxDesktop(installInput(value, { refreshDesktopIntegration: true }), {
        runCommand: async (command, args) => {
          calls.push([command, args]);
          if (command === "xdg-mime" && args[0] === "query") {
            return { code: 0, stdout: `${currentDefault}\n`, stderr: "" };
          }
          if (command === "xdg-mime" && args[0] === "default") {
            currentDefault = args[1];
          }
          return { code: 0, stdout: "", stderr: "" };
        },
      });

      assert.deepEqual(calls, [
        ["systemctl", ["--user", "daemon-reload"]],
        ["update-desktop-database", [NodePath.dirname(value.paths.desktopEntryPath)]],
        ["xdg-mime", ["query", "default", "x-scheme-handler/t3code"]],
        ["xdg-mime", ["default", "t3code-url-handler.desktop", "x-scheme-handler/t3code"]],
        ["xdg-mime", ["query", "default", "x-scheme-handler/t3code"]],
      ]);
      assert.isFalse(
        calls.some(([command, args]) => command === "systemctl" && args.includes("start")),
      );
      assert.isFalse(
        calls.some(([command, args]) => command === "systemctl" && args.includes("restart")),
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("rolls back the managed handler and artifact selection when MIME claim fails", async () => {
    const value = await fixture();
    try {
      await installLinuxDesktop(installInput(value));
      const priorHandler = await NodeFSP.readFile(value.paths.urlHandlerPath);
      const priorCurrent = await NodeFSP.readlink(value.paths.currentPath);
      const nextArtifact = NodePath.join(value.root, "next.AppImage");
      await NodeFSP.writeFile(nextArtifact, "artifact-two");
      const nextDescriptor = await descriptorFor(nextArtifact);

      await expect(
        installLinuxDesktop(
          installInput(value, {
            artifactPath: nextArtifact,
            descriptorPath: nextDescriptor.descriptorPath,
            refreshDesktopIntegration: true,
          }),
          {
            runCommand: async (command, args) => {
              if (command === "xdg-mime" && args[0] === "query") {
                return { code: 0, stdout: "t3code-alpha.desktop\n", stderr: "" };
              }
              return command === "xdg-mime"
                ? { code: 1, stdout: "", stderr: "claim failed" }
                : { code: 0, stdout: "", stderr: "" };
            },
          },
        ),
      ).rejects.toThrow(/Could not claim/);

      assert.deepEqual(await NodeFSP.readFile(value.paths.urlHandlerPath), priorHandler);
      assert.equal(await NodeFSP.readlink(value.paths.currentPath), priorCurrent);
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("accepts a nonzero MIME command when its postcondition is established", async () => {
    const value = await fixture();
    let currentDefault = "t3code-alpha.desktop";
    try {
      await installLinuxDesktop(installInput(value, { refreshDesktopIntegration: true }), {
        runCommand: async (command, args) => {
          if (command === "xdg-mime" && args[0] === "query") {
            return { code: 0, stdout: `${currentDefault}\n`, stderr: "" };
          }
          if (command === "xdg-mime" && args[0] === "default") {
            currentDefault = args[1];
            return { code: 1, stdout: "", stderr: "reported failure after write" };
          }
          return { code: 0, stdout: "", stderr: "" };
        },
      });

      assert.equal(currentDefault, "t3code-url-handler.desktop");
      assert.equal(
        await NodeFSP.readlink(value.paths.currentPath),
        `artifacts/${await sha256File(value.artifactPath)}`,
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("restores a changed prior MIME default before failing installation", async () => {
    const value = await fixture();
    let currentDefault = "t3code-alpha.desktop";
    const defaults = [];
    try {
      await expect(
        installLinuxDesktop(installInput(value, { refreshDesktopIntegration: true }), {
          runCommand: async (command, args) => {
            if (command === "xdg-mime" && args[0] === "query") {
              return { code: 0, stdout: `${currentDefault}\n`, stderr: "" };
            }
            if (command === "xdg-mime" && args[0] === "default") {
              defaults.push(args[1]);
              currentDefault =
                args[1] === "t3code-url-handler.desktop" ? "unexpected.desktop" : args[1];
              return {
                code: args[1] === "t3code-url-handler.desktop" ? 1 : 0,
                stdout: "",
                stderr: "",
              };
            }
            return { code: 0, stdout: "", stderr: "" };
          },
        }),
      ).rejects.toThrow(/prior default was restored/);

      assert.deepEqual(defaults, ["t3code-url-handler.desktop", "t3code-alpha.desktop"]);
      assert.equal(currentDefault, "t3code-alpha.desktop");
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("builds and installs the clean current artifact without launching it", async () => {
    const value = await fixture();
    const sourceRoot = NodePath.join(value.root, "source");
    await NodeFSP.mkdir(NodePath.join(sourceRoot, "apps", "desktop"), {
      recursive: true,
    });
    await NodeFSP.mkdir(NodePath.join(sourceRoot, "assets", "prod"), { recursive: true });
    await NodeFSP.writeFile(
      NodePath.join(sourceRoot, "apps", "desktop", "package.json"),
      JSON.stringify({ version: "1.2.3" }),
    );
    await NodeFSP.writeFile(
      NodePath.join(sourceRoot, "assets", "prod", "black-universal-1024.png"),
      "icon",
    );
    const calls = [];
    let currentDefault = "t3code-alpha.desktop";
    try {
      const result = await buildAndInstallCurrentLinuxDesktop(
        {
          repositoryRoot: sourceRoot,
          architecture: HOST_ARCHITECTURE,
          runtimeDirectory: NodePath.join(value.root, "runtime"),
          paths: value.paths,
          productionServerUrl: "https://production.example.test/",
          stagingServerUrl: "https://staging.example.test/",
        },
        {
          runCommand: async (command, args, options) => {
            calls.push([command, args, options]);
            if (command === "git" && args[0] === "status") {
              return { code: 0, stdout: "", stderr: "" };
            }
            if (command === "git") {
              return { code: 0, stdout: `${"a".repeat(40)}\n`, stderr: "" };
            }
            if (command === process.execPath) {
              const outputDirectory = args[args.indexOf("--output-dir") + 1];
              await NodeFSP.mkdir(NodePath.join(outputDirectory, "linux-x64"), {
                recursive: true,
              });
              const artifactPath = NodePath.join(
                outputDirectory,
                "linux-x64",
                "T3-Code-1.2.3-x64.AppImage",
              );
              await NodeFSP.writeFile(artifactPath, "official artifact");
              await descriptorFor(artifactPath);
              return { code: 0, stdout: "", stderr: "" };
            }
            if (command === "xdg-mime" && args[0] === "query") {
              return { code: 0, stdout: `${currentDefault}\n`, stderr: "" };
            }
            if (command === "xdg-mime" && args[0] === "default") {
              currentDefault = args[1];
            }
            return { code: 0, stdout: "", stderr: "" };
          },
        },
      );
      assert.match(result.artifactSha256, /^[0-9a-f]{64}$/);
      assert.isTrue(
        calls.some(([command, args]) => command === "systemctl" && args[1] === "daemon-reload"),
      );
      assert.isTrue(calls.some(([command]) => command === "update-desktop-database"));
      assert.isFalse(
        calls.some(([command, args]) => command === "systemctl" && args.includes("restart")),
      );
    } finally {
      await NodeFSP.rm(value.root, { recursive: true, force: true });
    }
  });

  it("refuses an official current build from a dirty worktree", async () => {
    await expect(
      buildAndInstallCurrentLinuxDesktop(
        { repositoryRoot: "/repo", architecture: HOST_ARCHITECTURE },
        {
          runCommand: async () => ({ code: 0, stdout: " M package.json\n", stderr: "" }),
        },
      ),
    ).rejects.toThrow(/require a clean repository worktree/);
  });

  it("keeps tracked templates free of machine-specific paths", async () => {
    const root = NodePath.resolve(import.meta.dirname, "..");
    const templatePaths = [
      "apps/desktop/resources/linux/t3code-desktop.service.in",
      "apps/desktop/resources/linux/t3code.desktop.in",
    ];
    for (const relativePath of [
      ...templatePaths,
      "scripts/linux-desktop-launcher.mjs",
      "scripts/install-linux-desktop.mjs",
    ]) {
      const content = await NodeFSP.readFile(NodePath.join(root, relativePath), "utf8");
      assert.notMatch(content, /\/home\//);
      if (templatePaths.includes(relativePath)) assert.match(content, /\{\{[A-Z_]+\}\}/);
    }
  });
});
