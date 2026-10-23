// @effect-diagnostics nodeBuiltinImport:off -- Process-group smoke regressions require Linux fixtures.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, expect, it } from "vite-plus/test";

import {
  gamescopeHeadlessArgs,
  gamescopeHeadlessEnvironment,
  parseDesktopArtifactSmokeArguments,
  processGroupExists,
  runExtraction,
  settleCleanupTasks,
  spawnTracked,
  stopTrackedProcess,
  verifyExtractedDesktopIdentity,
  waitForExit,
} from "./desktop-artifact-smoke.ts";
import {
  OFFICIAL_DESKTOP_PRODUCT_APP_ID,
  OFFICIAL_DESKTOP_UPDATER_REPOSITORY,
  type LinuxDesktopReleaseDescriptor,
} from "./linux-desktop-release-artifact.ts";

const descriptor: LinuxDesktopReleaseDescriptor = {
  contractVersion: 1,
  artifactFileName: "T3-Code-1.2.3-x86_64.AppImage",
  artifactSha256: "a".repeat(64),
  version: "1.2.3",
  commitHash: "b".repeat(40),
  architecture: "x64",
  productAppId: OFFICIAL_DESKTOP_PRODUCT_APP_ID,
  updaterRepository: OFFICIAL_DESKTOP_UPDATER_REPOSITORY,
};

describe("desktop artifact smoke identity", () => {
  it("accepts exact embedded package and updater identity", () => {
    verifyExtractedDesktopIdentity({
      descriptor,
      packageJson: {
        name: "t3code",
        version: descriptor.version,
        buildVersion: descriptor.version,
        t3codeCommitHash: descriptor.commitHash,
      },
      updateConfig: { provider: "github", owner: "JerkyTreats", repo: "t3code" },
    });
  });

  it("rejects embedded package metadata drift", () => {
    expect(() =>
      verifyExtractedDesktopIdentity({
        descriptor,
        packageJson: {
          name: "t3code",
          version: "9.9.9",
          buildVersion: descriptor.version,
          t3codeCommitHash: descriptor.commitHash,
        },
        updateConfig: { provider: "github", owner: "JerkyTreats", repo: "t3code" },
      }),
    ).toThrow("package identity");
  });

  it("rejects another embedded updater repository", () => {
    assert.throws(
      () =>
        verifyExtractedDesktopIdentity({
          descriptor,
          packageJson: {
            name: "t3code",
            version: descriptor.version,
            buildVersion: descriptor.version,
            t3codeCommitHash: descriptor.commitHash,
          },
          updateConfig: { provider: "github", owner: "upstream", repo: "t3code" },
        }),
      /exact official repository/,
    );
  });
});

describe("desktop artifact smoke isolation and cleanup", () => {
  it("accepts the script-runner argument separator without shifting release paths", () => {
    expect(
      parseDesktopArtifactSmokeArguments(["--", "release/app.AppImage", "release/app.json"]),
    ).toEqual(["release/app.AppImage", "release/app.json"]);
    expect(() => parseDesktopArtifactSmokeArguments(["--", "release/app.AppImage"])).toThrow(
      "Usage requires",
    );
  });

  it("runs every cleanup when multiple cleanup operations fail", async () => {
    const calls: string[] = [];
    await expect(
      settleCleanupTasks([
        async () => {
          calls.push("desktop");
          throw new Error("desktop cleanup failed");
        },
        async () => {
          calls.push("display");
          throw new Error("display cleanup failed");
        },
        async () => {
          calls.push("temporary files");
        },
      ]),
    ).rejects.toMatchObject({ errors: expect.arrayContaining([expect.any(Error)]) });
    expect(calls).toEqual(["desktop", "display", "temporary files"]);
  });

  it("places the desktop only behind a headless gamescope child display", () => {
    expect(
      gamescopeHeadlessArgs({
        dbusRunSessionExecutable: "/usr/bin/dbus-run-session",
        appRunPath: "/private/extract/AppRun",
        generation: "generation",
        userDataDirectory: "/private/electron-data",
      }),
    ).toEqual([
      "--backend",
      "headless",
      "--xwayland-count",
      "1",
      "--expose-wayland",
      "-W",
      "1280",
      "-H",
      "800",
      "--",
      "/usr/bin/dbus-run-session",
      "--",
      "/private/extract/AppRun",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--user-data-dir=/private/electron-data",
      "--t3code-launcher-handoff=generation",
    ]);
    expect(
      gamescopeHeadlessEnvironment({
        DISPLAY: ":0",
        WAYLAND_DISPLAY: "wayland-0",
        XDG_RUNTIME_DIR: "/private/runtime",
      }),
    ).toEqual({ XDG_RUNTIME_DIR: "/private/runtime" });
  });

  it("cleans a surviving process group after its tracked parent exits", async () => {
    const tracked = await spawnTracked("/bin/sh", ["-c", "sleep 30 &"], {
      env: { PATH: process.env.PATH },
    });
    try {
      expect(await waitForExit(tracked.child, 5_000)).toBe(true);
      expect(processGroupExists(tracked.pid)).toBe(true);
      await stopTrackedProcess(tracked);
      expect(processGroupExists(tracked.pid)).toBe(false);
    } finally {
      if (processGroupExists(tracked.pid)) await stopTrackedProcess(tracked);
    }
  });

  it("captures stable identities before immediate command failures", async () => {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const tracked = await spawnTracked("/bin/sh", ["-c", "exit 7"], {
        env: { PATH: process.env.PATH },
      });
      expect(tracked.startTicks).toBeGreaterThan(0);
      expect(await waitForExit(tracked.child, 5_000)).toBe(true);
      expect(tracked.child.exitCode).toBe(7);
      await stopTrackedProcess(tracked);
    }
  });

  it("executes the requested command as the captured process-group leader", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-process-leader-"));
    const pidPath = NodePath.join(root, "pid");
    const tracked = await spawnTracked(
      "/bin/sh",
      ["-c", 'printf "%s" "$$" > "$1"', "desktop-artifact-smoke", pidPath],
      { env: { PATH: process.env.PATH } },
    );
    try {
      expect(await waitForExit(tracked.child, 5_000)).toBe(true);
      expect(Number.parseInt(await NodeFSP.readFile(pidPath, "utf8"), 10)).toBe(tracked.pid);
    } finally {
      await stopTrackedProcess(tracked);
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("does not signal a group when the leader identity has changed", async () => {
    const tracked = await spawnTracked("/bin/sh", ["-c", "sleep 30"], {
      env: { PATH: process.env.PATH },
    });
    try {
      await stopTrackedProcess({ ...tracked, startTicks: tracked.startTicks + 1 });
      expect(processGroupExists(tracked.pid)).toBe(true);
    } finally {
      await stopTrackedProcess(tracked);
    }
    expect(processGroupExists(tracked.pid)).toBe(false);
  });

  it("cleans extraction descendants after successful extraction", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-extract-cleanup-"));
    const artifactPath = NodePath.join(root, "test.AppImage");
    const extractionRoot = NodePath.join(root, "extract");
    const groupPath = NodePath.join(root, "group-id");
    await NodeFSP.mkdir(extractionRoot);
    await NodeFSP.writeFile(
      artifactPath,
      `#!/bin/sh\nmkdir squashfs-root\nprintf '%s' "$$" > '${groupPath}'\nsleep 30 &\nexit 0\n`,
      { mode: 0o700 },
    );
    try {
      await expect(
        runExtraction(artifactPath, extractionRoot, {
          PATH: process.env.PATH,
        }),
      ).resolves.toBe(NodePath.join(extractionRoot, "squashfs-root"));
      const groupId = Number.parseInt(await NodeFSP.readFile(groupPath, "utf8"), 10);
      expect(processGroupExists(groupId)).toBe(false);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("cleans extraction descendants after failed extraction", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-extract-failure-"));
    const artifactPath = NodePath.join(root, "test.AppImage");
    const extractionRoot = NodePath.join(root, "extract");
    const groupPath = NodePath.join(root, "group-id");
    await NodeFSP.mkdir(extractionRoot);
    await NodeFSP.writeFile(
      artifactPath,
      `#!/bin/sh\nprintf '%s' "$$" > '${groupPath}'\nsleep 30 &\nexit 7\n`,
      { mode: 0o700 },
    );
    try {
      await expect(
        runExtraction(artifactPath, extractionRoot, {
          PATH: process.env.PATH,
        }),
      ).rejects.toThrow("AppImage extraction failed");
      const groupId = Number.parseInt(await NodeFSP.readFile(groupPath, "utf8"), 10);
      expect(processGroupExists(groupId)).toBe(false);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });
});
