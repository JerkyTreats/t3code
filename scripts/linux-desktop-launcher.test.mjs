import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeEvents from "node:events";

import { assert, describe, expect, it } from "vite-plus/test";

// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone launcher tests mirror its Node runtime.
const HOST_ARCHITECTURE = NodeOS.arch();

import {
  LAUNCHER_CONTRACT_VERSION,
  MAX_ACTIVATION_DOCUMENT_BYTES,
  OFFICIAL_LINUX_LAUNCHER_IDENTITY,
  acquireDirectoryLock,
  activateDesktopProtocolUrl,
  focusDesktopWindow,
  focusFreshDesktopWindow,
  launchDesktop,
  matchesReadiness,
  parseLinuxProcessParentPid,
  parseLinuxProcessStartTicks,
  processBelongsToControlGroup,
  readAndValidateArtifactManifest,
  readDesktopActivationRequest,
  renderServiceEnvironment,
  resolveDesktopChannel,
  resolveLauncherPaths,
  runDesktopService,
  selectHyprlandClient,
  sha256File,
  verifyReadyProcessOwnership,
  waitForCurrentReadiness,
  waitForInitialReadinessOrHandoff,
} from "./linux-desktop-launcher.mjs";
const PRODUCT_TECHNICAL_IDENTITY = {
  appId: OFFICIAL_LINUX_LAUNCHER_IDENTITY.productAppId,
  linuxWmClass: OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxWmClass,
};
const PRODUCT_LINUX_DESKTOP_LAUNCHER = {
  contractVersion: LAUNCHER_CONTRACT_VERSION,
  userServiceName: OFFICIAL_LINUX_LAUNCHER_IDENTITY.userServiceName,
  linuxSecureStorageArgument: OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxSecureStorageArgument,
};

const COMMIT = "1234567890ab";
const BOOT_ID = "12345678-1234-1234-1234-1234567890ab";
const PROCESS_START_TICKS = 987654;

async function makeFixture() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-launcher-test-"));
  const sourceArtifactPath = NodePath.join(root, "source.AppImage");
  await NodeFSP.writeFile(sourceArtifactPath, "artifact");
  const artifactSha256 = await sha256File(sourceArtifactPath);
  const artifactPath = NodePath.join(root, "artifacts", artifactSha256, "T3-Code.AppImage");
  await NodeFSP.mkdir(NodePath.dirname(artifactPath), { recursive: true });
  await NodeFSP.rename(sourceArtifactPath, artifactPath);
  await NodeFSP.chmod(artifactPath, 0o755);
  const physicalManifestPath = NodePath.join(NodePath.dirname(artifactPath), "manifest.json");
  await NodeFSP.writeFile(
    physicalManifestPath,
    JSON.stringify({
      contractVersion: LAUNCHER_CONTRACT_VERSION,
      productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
      userServiceName: PRODUCT_LINUX_DESKTOP_LAUNCHER.userServiceName,
      linuxWmClass: PRODUCT_TECHNICAL_IDENTITY.linuxWmClass,
      artifactPath,
      artifactSha256,
      version: "1.2.3",
      commitHash: COMMIT,
      architecture: HOST_ARCHITECTURE,
    }),
  );
  const current = NodePath.join(root, "current");
  await NodeFSP.symlink(NodePath.relative(root, NodePath.dirname(artifactPath)), current);
  const manifestPath = NodePath.join(current, "manifest.json");
  return {
    root,
    artifactPath,
    artifactSha256,
    manifestPath,
    runtimeRoot: NodePath.join(root, "runtime"),
  };
}

function readinessDocument(fixture, generation, desktopMainPid = 42) {
  return {
    contractVersion: LAUNCHER_CONTRACT_VERSION,
    productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
    generation,
    artifactSha256: fixture.artifactSha256,
    version: "1.2.3",
    commitHash: COMMIT,
    desktopMainPid,
    bootId: BOOT_ID,
    desktopMainProcessStartTicks: PROCESS_START_TICKS,
    backendReady: true,
    rendererReady: true,
  };
}

describe("linux desktop launcher", () => {
  it("isolates production and staging service and runtime ownership", () => {
    const common = {
      HOME: "/home/user",
      XDG_RUNTIME_DIR: "/run/user/1000",
    };
    const production = resolveLauncherPaths({
      ...common,
      T3CODE_DESKTOP_CHANNEL: "production",
    });
    const staging = resolveLauncherPaths({ ...common, T3CODE_DESKTOP_CHANNEL: "staging" });

    assert.equal(production.userServiceName, "t3code-desktop.service");
    assert.equal(production.linuxWmClass, "t3code");
    assert.equal(production.runtimeRoot, "/run/user/1000/t3code-desktop");
    assert.equal(staging.userServiceName, "t3code-desktop-staging.service");
    assert.equal(staging.linuxWmClass, "t3code-staging");
    assert.equal(staging.runtimeRoot, "/run/user/1000/t3code-desktop-staging");
    assert.throws(
      () => resolveDesktopChannel({ T3CODE_DESKTOP_CHANNEL: "preview" }),
      /production or staging/,
    );
  });

  it("keeps the installed standalone launcher aligned with shared product identity", () => {
    assert.deepEqual(OFFICIAL_LINUX_LAUNCHER_IDENTITY, {
      productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
      userServiceName: PRODUCT_LINUX_DESKTOP_LAUNCHER.userServiceName,
      linuxWmClass: PRODUCT_TECHNICAL_IDENTITY.linuxWmClass,
      linuxSecureStorageArgument: PRODUCT_LINUX_DESKTOP_LAUNCHER.linuxSecureStorageArgument,
    });
    assert.equal(LAUNCHER_CONTRACT_VERSION, PRODUCT_LINUX_DESKTOP_LAUNCHER.contractVersion);
  });

  it("reads one bounded exact activation document from stdin", async () => {
    const request = {
      contractVersion: LAUNCHER_CONTRACT_VERSION,
      workspace: "/home/example/exact workspace",
      action: "submit",
      prompt: "Keep this private.",
    };
    async function* chunks() {
      const encoded = JSON.stringify(request);
      yield encoded.slice(0, 20);
      yield Buffer.from(encoded.slice(20));
    }

    assert.deepEqual(await readDesktopActivationRequest(chunks()), request);
    await expect(
      readDesktopActivationRequest([JSON.stringify({ ...request, unknown: true })]),
    ).rejects.toThrow(/unknown or missing fields/);
    await expect(
      readDesktopActivationRequest([JSON.stringify({ ...request, prompt: undefined })]),
    ).rejects.toThrow(/metadata is invalid/);
    await expect(
      readDesktopActivationRequest([`${JSON.stringify(request)}\n${JSON.stringify(request)}`]),
    ).rejects.toThrow(/valid JSON/);
    await expect(
      readDesktopActivationRequest(["x".repeat(MAX_ACTIVATION_DOCUMENT_BYTES + 1)]),
    ).rejects.toThrow(/byte limit/);
  });

  it("validates the current artifact hash and architecture", async () => {
    const fixture = await makeFixture();
    try {
      const manifest = await readAndValidateArtifactManifest(fixture.manifestPath);
      assert.equal(manifest.artifactSha256, fixture.artifactSha256);
      await NodeFSP.writeFile(
        fixture.manifestPath,
        JSON.stringify({ ...manifest, userServiceName: "unowned.service" }),
      );
      await expect(readAndValidateArtifactManifest(fixture.manifestPath)).rejects.toThrow(
        /metadata is invalid/,
      );
      await NodeFSP.writeFile(fixture.manifestPath, JSON.stringify(manifest));
      await NodeFSP.writeFile(fixture.artifactPath, "changed");
      await expect(readAndValidateArtifactManifest(fixture.manifestPath)).rejects.toThrow(
        /hash does not match/,
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects artifacts outside the managed content-addressed root", async () => {
    const fixture = await makeFixture();
    try {
      const manifest = JSON.parse(await NodeFSP.readFile(fixture.manifestPath, "utf8"));
      const outsidePath = NodePath.join(fixture.root, "outside.AppImage");
      await NodeFSP.copyFile(fixture.artifactPath, outsidePath);
      await NodeFSP.writeFile(
        fixture.manifestPath,
        JSON.stringify({ ...manifest, artifactPath: outsidePath }),
      );
      await expect(readAndValidateArtifactManifest(fixture.manifestPath)).rejects.toThrow(
        /outside the managed content-addressed root/,
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked artifacts inside the managed root", async () => {
    const fixture = await makeFixture();
    try {
      const outsidePath = NodePath.join(fixture.root, "outside.AppImage");
      await NodeFSP.copyFile(fixture.artifactPath, outsidePath);
      await NodeFSP.rm(fixture.artifactPath);
      await NodeFSP.symlink(outsidePath, fixture.artifactPath);
      await expect(readAndValidateArtifactManifest(fixture.manifestPath)).rejects.toThrow(
        /physical managed root|managed regular file/,
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects a regular artifact reached through a symlinked managed ancestor", async () => {
    const fixture = await makeFixture();
    const externalRoot = await NodeFSP.mkdtemp(
      NodePath.join(NodeOS.tmpdir(), "t3-launcher-external-"),
    );
    try {
      const artifactsPath = NodePath.join(fixture.root, "artifacts");
      const externalArtifactsPath = NodePath.join(externalRoot, "artifacts");
      await NodeFSP.rename(artifactsPath, externalArtifactsPath);
      await NodeFSP.symlink(externalArtifactsPath, artifactsPath);
      await expect(readAndValidateArtifactManifest(fixture.manifestPath)).rejects.toThrow(
        /physical managed root|unexpected managed ancestor/,
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
      await NodeFSP.rm(externalRoot, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked managed install root", async () => {
    const fixture = await makeFixture();
    const aliasRoot = `${fixture.root}-alias`;
    try {
      await NodeFSP.symlink(fixture.root, aliasRoot);
      const aliasManifestPath = NodePath.join(aliasRoot, "current", "manifest.json");
      const manifest = JSON.parse(await NodeFSP.readFile(fixture.manifestPath, "utf8"));
      await NodeFSP.writeFile(
        fixture.manifestPath,
        JSON.stringify({
          ...manifest,
          artifactPath: NodePath.join(
            aliasRoot,
            "artifacts",
            fixture.artifactSha256,
            "T3-Code.AppImage",
          ),
        }),
      );
      await expect(readAndValidateArtifactManifest(aliasManifestPath)).rejects.toThrow(
        /unexpected managed ancestor/,
      );
    } finally {
      await NodeFSP.rm(aliasRoot, { force: true });
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects a managed artifact that is not executable", async () => {
    const fixture = await makeFixture();
    try {
      await NodeFSP.chmod(fixture.artifactPath, 0o644);
      await expect(readAndValidateArtifactManifest(fixture.manifestPath)).rejects.toThrow(
        /not executable/,
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("delivers one bounded protocol URL only after full artifact verification", async () => {
    const fixture = await makeFixture();
    const calls = [];
    let unrefCount = 0;
    const environment = { T3CODE_PORT: "3778" };
    try {
      await activateDesktopProtocolUrl(
        {
          artifactSha256: fixture.artifactSha256,
          url: "t3code://pair?code=example",
          paths: { manifestPath: fixture.manifestPath },
          environment,
        },
        {
          spawn: (command, args, options) => {
            calls.push([command, args, options]);
            const child = new NodeEvents.EventEmitter();
            child.unref = () => void (unrefCount += 1);
            queueMicrotask(() => child.emit("spawn"));
            return child;
          },
        },
      );

      assert.deepEqual(calls, [
        [
          fixture.artifactPath,
          ["--password-store=gnome-libsecret", "t3code://pair?code=example"],
          { detached: true, env: environment, stdio: "ignore" },
        ],
      ]);
      assert.equal(unrefCount, 1);
      await expect(
        activateDesktopProtocolUrl({
          artifactSha256: fixture.artifactSha256,
          url: "https://example.invalid/",
          paths: { manifestPath: fixture.manifestPath },
        }),
      ).rejects.toThrow(/metadata is invalid/);
      await expect(
        activateDesktopProtocolUrl({
          artifactSha256: "f".repeat(64),
          url: "t3code://pair?code=example",
          paths: { manifestPath: fixture.manifestPath },
        }),
      ).rejects.toThrow(/does not match the installed artifact manifest/);
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe artifact forms on the protocol activation path", async () => {
    const scenarios = [
      {
        expected: /managed regular file|physical managed root/,
        mutate: async (fixture) => {
          await NodeFSP.rm(fixture.artifactPath);
          await NodeFSP.mkdir(fixture.artifactPath);
        },
      },
      {
        expected: /managed regular file|physical managed root/,
        mutate: async (fixture) => {
          const outsidePath = NodePath.join(fixture.root, "outside.AppImage");
          await NodeFSP.copyFile(fixture.artifactPath, outsidePath);
          await NodeFSP.rm(fixture.artifactPath);
          await NodeFSP.symlink(outsidePath, fixture.artifactPath);
        },
      },
      {
        expected: /not executable/,
        mutate: async (fixture) => NodeFSP.chmod(fixture.artifactPath, 0o644),
      },
      {
        expected: /hash does not match/,
        mutate: async (fixture) => NodeFSP.writeFile(fixture.artifactPath, "checksum drift"),
      },
    ];

    for (const scenario of scenarios) {
      const fixture = await makeFixture();
      try {
        await scenario.mutate(fixture);
        await expect(
          activateDesktopProtocolUrl({
            artifactSha256: fixture.artifactSha256,
            url: "t3code://pair?code=example",
            paths: { manifestPath: fixture.manifestPath },
          }),
        ).rejects.toThrow(scenario.expected);
      } finally {
        await NodeFSP.rm(fixture.root, { recursive: true, force: true });
      }
    }
  });

  it("rejects a symlinked manifest on the protocol activation path", async () => {
    const fixture = await makeFixture();
    const physicalManifest = NodePath.join(
      fixture.root,
      "artifacts",
      fixture.artifactSha256,
      "manifest.json",
    );
    try {
      const outsideManifest = NodePath.join(fixture.root, "outside-manifest.json");
      await NodeFSP.rename(physicalManifest, outsideManifest);
      await NodeFSP.symlink(outsideManifest, physicalManifest);
      await expect(
        activateDesktopProtocolUrl({
          artifactSha256: fixture.artifactSha256,
          url: "t3code://pair?code=example",
          paths: { manifestPath: fixture.manifestPath },
        }),
      ).rejects.toThrow(/bounded physical regular file/);
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("starts the owned artifact with explicit Linux secure storage selection", async () => {
    const fixture = await makeFixture();
    const calls = [];
    try {
      const child = new NodeEvents.EventEmitter();
      const serviceEnvironment = {
        T3CODE_LAUNCH_GENERATION: "service-generation",
        T3CODE_HOME: "/staging/state",
        XDG_CONFIG_HOME: "/staging/config",
        T3CODE_DISABLE_AUTO_UPDATE: "true",
        T3CODE_PORT: "3778",
      };
      const exit = runDesktopService(
        {
          paths: { manifestPath: fixture.manifestPath },
          environment: serviceEnvironment,
        },
        {
          spawn: (command, args, options) => {
            calls.push([command, args, options]);
            queueMicrotask(() => child.emit("exit", 0, null));
            return child;
          },
        },
      );
      assert.equal(await exit, 0);
      assert.equal(calls[0]?.[0], fixture.artifactPath);
      assert.deepEqual(calls[0]?.[1], [
        "--password-store=gnome-libsecret",
        "--t3code-launcher-handoff=service-generation",
      ]);
      assert.isFalse(calls[0]?.[1].some((argument) => argument.includes("b".repeat(64))));
      assert.deepEqual(calls[0]?.[2]?.env, serviceEnvironment);
      assert.equal(calls[0]?.[2]?.stdio, "inherit");
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("ignores stale readiness until the exact generation appears", async () => {
    let elapsed = 0;
    let reads = 0;
    const expected = {
      readinessPath: "/runtime/ready.json",
      generation: "fresh-generation",
      artifactSha256: "a".repeat(64),
      commitHash: COMMIT,
      version: "1.2.3",
      productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
      timeoutMs: 100,
      intervalMs: 10,
    };
    const base = {
      contractVersion: LAUNCHER_CONTRACT_VERSION,
      productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
      artifactSha256: expected.artifactSha256,
      commitHash: expected.commitHash,
      version: "1.2.3",
      desktopMainPid: 42,
      bootId: BOOT_ID,
      desktopMainProcessStartTicks: PROCESS_START_TICKS,
      backendReady: true,
      rendererReady: true,
    };
    const readiness = await waitForCurrentReadiness(expected, {
      now: () => elapsed,
      sleep: async (milliseconds) => {
        elapsed += milliseconds;
      },
      serviceIsActive: async () => true,
      readFile: async () =>
        JSON.stringify({
          ...base,
          generation: reads++ === 0 ? "stale-generation" : expected.generation,
        }),
    });
    assert.equal(readiness.generation, expected.generation);
    assert.isFalse(matchesReadiness({ ...readiness, artifactSha256: "b".repeat(64) }, expected));
    assert.isFalse(
      matchesReadiness(
        {
          ...readiness,
          desktopMainPid: undefined,
          desktopMainProcessStartTicks: undefined,
          pid: 42,
          processStartTicks: PROCESS_START_TICKS,
        },
        expected,
      ),
    );
  });

  it("encodes service environment line breaks and rejects NUL", () => {
    const rendered = renderServiceEnvironment({
      generation: "generation",
      readinessPath: "/run/user/1000/t3\ncode\rready.json",
      artifactSha256: "a".repeat(64),
      commitHash: COMMIT,
    });
    assert.include(rendered, "t3\\ncode\\rready.json");
    assert.notInclude(rendered, "HANDOFF_TOKEN");
    assert.notInclude(rendered, "b".repeat(64));
    expect(() =>
      renderServiceEnvironment({
        generation: "bad\0generation",
        readinessPath: "/runtime/ready.json",
        artifactSha256: "a".repeat(64),
        commitHash: COMMIT,
      }),
    ).toThrow(/cannot contain NUL/);
  });

  it("verifies boot, start ticks, and exact user-service cgroup ownership", async () => {
    const statFields = ["S", ...Array.from({ length: 18 }, () => "1"), "987654", "1"];
    const processStat = `42 (T3 Code worker) ${statFields.join(" ")}`;
    assert.equal(parseLinuxProcessParentPid(processStat), 1);
    assert.equal(parseLinuxProcessStartTicks(processStat), PROCESS_START_TICKS);
    assert.isTrue(
      processBelongsToControlGroup(
        "0::/user.slice/user-1000.slice/app.slice/t3code-desktop.service/client",
        "/user.slice/user-1000.slice/app.slice/t3code-desktop.service",
      ),
    );
    assert.isFalse(
      processBelongsToControlGroup(
        "0::/user.slice/user-1000.slice/app.slice/unrelated.service",
        "/user.slice/user-1000.slice/app.slice/t3code-desktop.service",
      ),
    );

    await verifyReadyProcessOwnership(
      {
        desktopMainPid: 42,
        bootId: BOOT_ID,
        desktopMainProcessStartTicks: PROCESS_START_TICKS,
      },
      {
        runCommand: async () => ({
          code: 0,
          stdout: "/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n",
          stderr: "",
        }),
        readSystemFile: async (path) => {
          if (path.endsWith("boot_id")) return `${BOOT_ID}\n`;
          if (path.endsWith("/stat")) return processStat;
          return "0::/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n";
        },
      },
    );
    await expect(
      verifyReadyProcessOwnership(
        {
          desktopMainPid: 42,
          bootId: BOOT_ID,
          desktopMainProcessStartTicks: PROCESS_START_TICKS,
        },
        {
          runCommand: async () => ({
            code: 0,
            stdout: "/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n",
            stderr: "",
          }),
          readSystemFile: async (path) => {
            if (path.endsWith("boot_id")) return `${BOOT_ID}\n`;
            if (path.endsWith("/stat")) return processStat;
            return "0::/user.slice/user-1000.slice/app.slice/unrelated.service\n";
          },
        },
      ),
    ).rejects.toThrow(/outside the owned user service control group/);

    const scopedProcessStat = `42 (T3 Code worker) ${[
      "S",
      "98",
      ...Array.from({ length: 17 }, () => "1"),
      String(PROCESS_START_TICKS),
      "1",
    ].join(" ")}`;
    const appImageRuntimeStat = `98 (T3 Code AppImage) ${[
      "S",
      "99",
      ...Array.from({ length: 19 }, () => "1"),
    ].join(" ")}`;
    const serviceMainStat = `99 (node) ${["S", "1", ...Array.from({ length: 19 }, () => "1")].join(
      " ",
    )}`;
    await verifyReadyProcessOwnership(
      {
        desktopMainPid: 42,
        bootId: BOOT_ID,
        desktopMainProcessStartTicks: PROCESS_START_TICKS,
      },
      {
        runCommand: async (_command, args) =>
          args.includes("MainPID")
            ? { code: 0, stdout: "99\n", stderr: "" }
            : {
                code: 0,
                stdout: "/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n",
                stderr: "",
              },
        readSystemFile: async (path) => {
          if (path.endsWith("boot_id")) return `${BOOT_ID}\n`;
          if (path === "/proc/42/stat") return scopedProcessStat;
          if (path === "/proc/98/stat") return appImageRuntimeStat;
          if (path === "/proc/99/stat") return serviceMainStat;
          if (path === "/proc/42/cgroup") {
            return "0::/user.slice/user-1000.slice/app.slice/app-t3code-42.scope\n";
          }
          if (path === "/proc/98/cgroup") {
            return "0::/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n";
          }
          if (path === "/proc/99/cgroup") {
            return "0::/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n";
          }
          throw new Error(`Unexpected path: ${path}`);
        },
      },
    );
    await expect(
      verifyReadyProcessOwnership(
        {
          desktopMainPid: 42,
          bootId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          desktopMainProcessStartTicks: PROCESS_START_TICKS,
        },
        {
          runCommand: async () => ({
            code: 0,
            stdout: "/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n",
            stderr: "",
          }),
          readSystemFile: async (path) => {
            if (path.endsWith("boot_id")) return `${BOOT_ID}\n`;
            if (path.endsWith("/stat")) return processStat;
            return "0::/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n";
          },
        },
      ),
    ).rejects.toThrow(/boot identity/);
    await expect(
      verifyReadyProcessOwnership(
        { desktopMainPid: 42, bootId: BOOT_ID, desktopMainProcessStartTicks: 1 },
        {
          runCommand: async () => ({
            code: 0,
            stdout: "/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n",
            stderr: "",
          }),
          readSystemFile: async (path) => {
            if (path.endsWith("boot_id")) return `${BOOT_ID}\n`;
            if (path.endsWith("/stat")) return processStat;
            return "0::/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n";
          },
        },
      ),
    ).rejects.toThrow(/start identity/);
  });

  it("focuses only the exact Hyprland class and desktop main process pid", async () => {
    const clients = [
      { class: "t3code", pid: 100, address: "0xaaa" },
      { class: "t3code-dev", pid: 200, address: "0xbbb" },
      { class: "t3code", pid: 200, address: "not-an-address" },
    ];
    assert.equal(
      selectHyprlandClient(clients, 100, PRODUCT_TECHNICAL_IDENTITY.linuxWmClass),
      "0xaaa",
    );
    assert.isNull(selectHyprlandClient(clients, 200, PRODUCT_TECHNICAL_IDENTITY.linuxWmClass));
    const calls = [];
    const focusMethod = await focusDesktopWindow(
      {
        desktopMainPid: 100,
        artifactPath: "/artifact",
        linuxWmClass: PRODUCT_TECHNICAL_IDENTITY.linuxWmClass,
        hyprlandAvailable: true,
      },
      {
        runCommand: async (command, args) => {
          calls.push([command, args]);
          return command === "hyprctl" && args[0] === "clients"
            ? { code: 0, stdout: JSON.stringify(clients), stderr: "" }
            : { code: 0, stdout: "", stderr: "" };
        },
      },
    );
    assert.equal(focusMethod, "hyprland");
    assert.deepEqual(calls[1], ["hyprctl", ["dispatch", "focuswindow", "address:0xaaa"]]);
  });

  it("does not use a class-only X11 focus fallback", async () => {
    const calls = [];
    const method = await focusDesktopWindow(
      {
        desktopMainPid: 100,
        artifactPath: "/artifact",
        linuxWmClass: "t3code",
        hyprlandAvailable: true,
      },
      {
        runCommand: async (command, args) => {
          calls.push([command, args]);
          if (command === "hyprctl" && args[0] === "clients") {
            return { code: 0, stdout: "[]", stderr: "" };
          }
          return { code: 1, stdout: "", stderr: "unavailable" };
        },
      },
    );
    assert.isNull(method);
    assert.isFalse(calls.some(([command]) => command === "wmctrl"));
  });

  it("uses the validated-address Lua dispatcher when legacy Hyprland focus is unavailable", async () => {
    const calls = [];
    const method = await focusDesktopWindow(
      {
        desktopMainPid: 100,
        artifactPath: "/artifact",
        linuxWmClass: "t3code",
        hyprlandAvailable: true,
        allowElectronFallback: false,
      },
      {
        runCommand: async (command, args) => {
          calls.push([command, args]);
          if (args[0] === "clients") {
            return {
              code: 0,
              stdout: JSON.stringify([{ class: "t3code", pid: 100, address: "0xaaa" }]),
              stderr: "",
            };
          }
          return {
            code: args[1] === "focuswindow" ? 7 : 0,
            stdout: args[1] === "focuswindow" ? "" : "ok\n",
            stderr: args[1] === "focuswindow" ? "legacy dispatcher unavailable" : "",
          };
        },
      },
    );

    assert.equal(method, "hyprland");
    assert.deepEqual(calls, [
      ["hyprctl", ["clients", "-j"]],
      ["hyprctl", ["dispatch", "focuswindow", "address:0xaaa"]],
      ["hyprctl", ["dispatch", 'hl.dsp.focus({ window = "address:0xaaa" })']],
    ]);
  });

  it("waits for a fresh exact Hyprland window before focusing it", async () => {
    const calls = [];
    let clientQueries = 0;
    let clock = 0;
    let ownershipChecks = 0;
    const method = await focusFreshDesktopWindow(
      {
        desktopMainPid: 100,
        artifactPath: "/artifact",
        linuxWmClass: "t3code",
        hyprlandAvailable: true,
        discoveryTimeoutMs: 100,
        discoveryIntervalMs: 10,
        verifyCurrentProcess: async () => {
          ownershipChecks += 1;
        },
      },
      {
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
        runCommand: async (command, args) => {
          calls.push([command, args]);
          if (command === "hyprctl" && args[0] === "clients") {
            clientQueries += 1;
            return {
              code: 0,
              stdout: JSON.stringify(
                clientQueries < 3 ? [] : [{ class: "t3code", pid: 100, address: "0xaaa" }],
              ),
              stderr: "",
            };
          }
          return { code: 0, stdout: "", stderr: "" };
        },
      },
    );

    assert.equal(method, "hyprland");
    assert.equal(clientQueries, 3);
    assert.equal(ownershipChecks, 3);
    assert.deepEqual(calls.at(-1), ["hyprctl", ["dispatch", "focuswindow", "address:0xaaa"]]);
    assert.isFalse(calls.some(([command]) => command === "/artifact"));
  });

  it("does not use Electron fallback after exact Hyprland discovery times out", async () => {
    let clock = 0;
    const calls = [];
    const method = await focusFreshDesktopWindow(
      {
        desktopMainPid: 100,
        artifactPath: "/artifact",
        linuxWmClass: "t3code",
        hyprlandAvailable: true,
        discoveryTimeoutMs: 20,
        discoveryIntervalMs: 10,
      },
      {
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
        runCommand: async (command, args) => {
          calls.push([command, args]);
          return { code: 0, stdout: "[]", stderr: "" };
        },
      },
    );

    assert.isNull(method);
    assert.isTrue(calls.every(([command]) => command === "hyprctl"));
  });

  it("does not mutate a symlinked launcher runtime root", async () => {
    const fixture = await makeFixture();
    const externalRuntimeRoot = await NodeFSP.mkdtemp(
      NodePath.join(NodeOS.tmpdir(), "t3-launcher-external-runtime-"),
    );
    const sentinelFiles = new Map([
      ["ready.json", "preserve readiness\n"],
      ["service.env", "preserve environment\n"],
      ["handoff-request.json", "preserve request\n"],
      ["handoff-ack.json", "preserve acknowledgement\n"],
    ]);
    let lockAcquired = false;
    try {
      for (const [fileName, content] of sentinelFiles) {
        await NodeFSP.writeFile(NodePath.join(externalRuntimeRoot, fileName), content);
      }
      await NodeFSP.symlink(externalRuntimeRoot, fixture.runtimeRoot);
      const paths = {
        installRoot: fixture.root,
        manifestPath: fixture.manifestPath,
        runtimeRoot: fixture.runtimeRoot,
        readinessPath: NodePath.join(fixture.runtimeRoot, "ready.json"),
        environmentPath: NodePath.join(fixture.runtimeRoot, "service.env"),
        lockPath: NodePath.join(fixture.runtimeRoot, "launch.lock"),
        handoffRequestPath: NodePath.join(fixture.runtimeRoot, "handoff-request.json"),
        handoffAckPath: NodePath.join(fixture.runtimeRoot, "handoff-ack.json"),
      };

      await expect(
        launchDesktop(
          { paths, environment: {}, timeoutMs: 100 },
          {
            acquireLock: async () => {
              lockAcquired = true;
              return async () => undefined;
            },
          },
        ),
      ).rejects.toThrow(/runtime root must be a user-owned physical directory/);

      assert.isFalse(lockAcquired);
      assert.isTrue((await NodeFSP.lstat(fixture.runtimeRoot)).isSymbolicLink());
      assert.deepEqual((await NodeFSP.readdir(externalRuntimeRoot)).sort(), [
        "handoff-ack.json",
        "handoff-request.json",
        "ready.json",
        "service.env",
      ]);
      for (const [fileName, content] of sentinelFiles) {
        assert.equal(
          await NodeFSP.readFile(NodePath.join(externalRuntimeRoot, fileName), "utf8"),
          content,
        );
      }
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
      await NodeFSP.rm(externalRuntimeRoot, { recursive: true, force: true });
    }
  });

  it("focuses a verified active primary without changing its runtime state", async () => {
    const fixture = await makeFixture();
    const paths = {
      installRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      runtimeRoot: fixture.runtimeRoot,
      readinessPath: NodePath.join(fixture.runtimeRoot, "ready.json"),
      environmentPath: NodePath.join(fixture.runtimeRoot, "service.env"),
      lockPath: NodePath.join(fixture.runtimeRoot, "launch.lock"),
      handoffRequestPath: NodePath.join(fixture.runtimeRoot, "handoff-request.json"),
      handoffAckPath: NodePath.join(fixture.runtimeRoot, "handoff-ack.json"),
    };
    const calls = [];
    const existingReadiness = readinessDocument(
      fixture,
      "11111111-1111-4111-8111-111111111111",
      4242,
    );
    try {
      await NodeFSP.mkdir(paths.runtimeRoot, { recursive: true, mode: 0o700 });
      await Promise.all([
        NodeFSP.writeFile(paths.readinessPath, `${JSON.stringify(existingReadiness)}\n`),
        NodeFSP.writeFile(paths.environmentPath, "preserve environment\n"),
        NodeFSP.writeFile(paths.handoffRequestPath, "preserve request\n"),
        NodeFSP.writeFile(paths.handoffAckPath, "preserve acknowledgement\n"),
      ]);
      const before = await Promise.all(
        [
          paths.readinessPath,
          paths.environmentPath,
          paths.handoffRequestPath,
          paths.handoffAckPath,
        ].map((path) => NodeFSP.readFile(path, "utf8")),
      );
      const result = await launchDesktop(
        { paths, environment: { HYPRLAND_INSTANCE_SIGNATURE: "instance" } },
        {
          runCommand: async (command, args) => {
            calls.push([command, args]);
            if (command === "systemctl" && args.includes("is-active")) {
              return { code: 0, stdout: "active\n", stderr: "" };
            }
            if (command === "hyprctl" && args[0] === "clients") {
              return {
                code: 0,
                stdout: JSON.stringify([
                  {
                    class: PRODUCT_TECHNICAL_IDENTITY.linuxWmClass,
                    pid: existingReadiness.desktopMainPid,
                    address: "0xaaa",
                  },
                ]),
                stderr: "",
              };
            }
            if (command === "hyprctl" && args[0] === "dispatch") {
              return { code: 0, stdout: "", stderr: "" };
            }
            throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
          },
          verifyOwnedProcess: async (readiness) => assert.deepEqual(readiness, existingReadiness),
        },
      );
      assert.equal(result.generation, existingReadiness.generation);
      assert.equal(result.readiness.desktopMainPid, existingReadiness.desktopMainPid);
      assert.equal(result.focusMethod, "hyprland");
      assert.deepEqual(calls, [
        ["systemctl", ["--user", "is-active", "t3code-desktop.service"]],
        ["hyprctl", ["clients", "-j"]],
        ["hyprctl", ["dispatch", "focuswindow", "address:0xaaa"]],
      ]);
      assert.deepEqual(
        await Promise.all(
          [
            paths.readinessPath,
            paths.environmentPath,
            paths.handoffRequestPath,
            paths.handoffAckPath,
          ].map((path) => NodeFSP.readFile(path, "utf8")),
        ),
        before,
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("focuses a primary that becomes active while an ordinary launch waits for the lock", async () => {
    const fixture = await makeFixture();
    const paths = {
      installRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      runtimeRoot: fixture.runtimeRoot,
      readinessPath: NodePath.join(fixture.runtimeRoot, "ready.json"),
      environmentPath: NodePath.join(fixture.runtimeRoot, "service.env"),
      lockPath: NodePath.join(fixture.runtimeRoot, "launch.lock"),
      handoffRequestPath: NodePath.join(fixture.runtimeRoot, "handoff-request.json"),
      handoffAckPath: NodePath.join(fixture.runtimeRoot, "handoff-ack.json"),
    };
    const calls = [];
    const existingReadiness = readinessDocument(
      fixture,
      "22222222-2222-4222-8222-222222222222",
      4242,
    );
    let stateQueries = 0;
    try {
      await NodeFSP.mkdir(paths.runtimeRoot, { recursive: true, mode: 0o700 });
      await Promise.all([
        NodeFSP.writeFile(paths.readinessPath, `${JSON.stringify(existingReadiness)}\n`),
        NodeFSP.writeFile(paths.environmentPath, "preserve environment\n"),
        NodeFSP.writeFile(paths.handoffRequestPath, "preserve request\n"),
        NodeFSP.writeFile(paths.handoffAckPath, "preserve acknowledgement\n"),
      ]);
      const runtimeFiles = [
        paths.readinessPath,
        paths.environmentPath,
        paths.handoffRequestPath,
        paths.handoffAckPath,
      ];
      const before = await Promise.all(runtimeFiles.map((path) => NodeFSP.readFile(path, "utf8")));
      const result = await launchDesktop(
        { paths, environment: { HYPRLAND_INSTANCE_SIGNATURE: "instance" } },
        {
          acquireLock: async () => async () => undefined,
          runCommand: async (command, args) => {
            calls.push([command, args]);
            if (command === "systemctl" && args.includes("is-active")) {
              stateQueries += 1;
              return {
                code: stateQueries === 1 ? 3 : 0,
                stdout: stateQueries === 1 ? "inactive\n" : "active\n",
                stderr: "",
              };
            }
            if (command === "hyprctl" && args[0] === "clients") {
              return {
                code: 0,
                stdout: JSON.stringify([
                  {
                    class: PRODUCT_TECHNICAL_IDENTITY.linuxWmClass,
                    pid: existingReadiness.desktopMainPid,
                    address: "0xaaa",
                  },
                ]),
                stderr: "",
              };
            }
            if (command === "hyprctl" && args[0] === "dispatch") {
              return { code: 0, stdout: "", stderr: "" };
            }
            throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
          },
          verifyOwnedProcess: async (readiness) => assert.deepEqual(readiness, existingReadiness),
        },
      );
      assert.equal(result.generation, existingReadiness.generation);
      assert.deepEqual(calls, [
        ["systemctl", ["--user", "is-active", "t3code-desktop.service"]],
        ["systemctl", ["--user", "is-active", "t3code-desktop.service"]],
        ["hyprctl", ["clients", "-j"]],
        ["hyprctl", ["dispatch", "focuswindow", "address:0xaaa"]],
      ]);
      assert.deepEqual(
        await Promise.all(runtimeFiles.map((path) => NodeFSP.readFile(path, "utf8"))),
        before,
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails closed for an active primary without a valid readiness generation", async () => {
    const fixture = await makeFixture();
    const paths = {
      installRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      runtimeRoot: fixture.runtimeRoot,
      readinessPath: NodePath.join(fixture.runtimeRoot, "ready.json"),
      environmentPath: NodePath.join(fixture.runtimeRoot, "service.env"),
      lockPath: NodePath.join(fixture.runtimeRoot, "launch.lock"),
      handoffRequestPath: NodePath.join(fixture.runtimeRoot, "handoff-request.json"),
      handoffAckPath: NodePath.join(fixture.runtimeRoot, "handoff-ack.json"),
    };
    const calls = [];
    try {
      await NodeFSP.mkdir(paths.runtimeRoot, { recursive: true, mode: 0o700 });
      await NodeFSP.writeFile(
        paths.readinessPath,
        JSON.stringify(readinessDocument(fixture, "legacy-generation", 4242)),
      );
      await NodeFSP.writeFile(paths.environmentPath, "preserve environment\n");
      const before = await Promise.all(
        [paths.readinessPath, paths.environmentPath].map((path) => NodeFSP.readFile(path, "utf8")),
      );
      await expect(
        launchDesktop(
          { paths, environment: {} },
          {
            runCommand: async (command, args) => {
              calls.push([command, args]);
              if (command === "systemctl" && args.includes("is-active")) {
                return { code: 0, stdout: "active\n", stderr: "" };
              }
              throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
            },
          },
        ),
      ).rejects.toThrow(/active desktop client readiness is not verified/);
      assert.deepEqual(calls, [["systemctl", ["--user", "is-active", "t3code-desktop.service"]]]);
      assert.deepEqual(
        await Promise.all(
          [paths.readinessPath, paths.environmentPath].map((path) =>
            NodeFSP.readFile(path, "utf8"),
          ),
        ),
        before,
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  for (const scenario of [
    { name: "transport error", result: { code: null, stdout: "", stderr: "bus unavailable" } },
    { name: "transitional state", result: { code: 0, stdout: "activating\n", stderr: "" } },
    { name: "missing or unknown unit", result: { code: 4, stdout: "unknown\n", stderr: "" } },
    { name: "malformed active output", result: { code: 0, stdout: " active\n", stderr: "" } },
    { name: "malformed inactive output", result: { code: 3, stdout: "inactive\n\n", stderr: "" } },
  ]) {
    for (const launch of [
      { name: "ordinary activation", options: {} },
      {
        name: "payload activation",
        options: {
          activation: {
            contractVersion: LAUNCHER_CONTRACT_VERSION,
            workspace: "/workspace/project",
            action: "open",
          },
        },
      },
    ]) {
      it(`fails closed for ${launch.name} with a ${scenario.name} desktop service state`, async () => {
        const fixture = await makeFixture();
        const paths = {
          installRoot: fixture.root,
          manifestPath: fixture.manifestPath,
          runtimeRoot: fixture.runtimeRoot,
          readinessPath: NodePath.join(fixture.runtimeRoot, "ready.json"),
          environmentPath: NodePath.join(fixture.runtimeRoot, "service.env"),
          lockPath: NodePath.join(fixture.runtimeRoot, "launch.lock"),
          handoffRequestPath: NodePath.join(fixture.runtimeRoot, "handoff-request.json"),
          handoffAckPath: NodePath.join(fixture.runtimeRoot, "handoff-ack.json"),
        };
        const calls = [];
        try {
          await NodeFSP.mkdir(paths.runtimeRoot, { recursive: true, mode: 0o700 });
          await Promise.all([
            NodeFSP.writeFile(paths.readinessPath, "preserve readiness\n"),
            NodeFSP.writeFile(paths.environmentPath, "preserve environment\n"),
            NodeFSP.writeFile(paths.handoffRequestPath, "preserve request\n"),
            NodeFSP.writeFile(paths.handoffAckPath, "preserve acknowledgement\n"),
          ]);
          const runtimeFiles = [
            paths.readinessPath,
            paths.environmentPath,
            paths.handoffRequestPath,
            paths.handoffAckPath,
          ];
          const before = await Promise.all(
            runtimeFiles.map((path) => NodeFSP.readFile(path, "utf8")),
          );
          await expect(
            launchDesktop(
              { paths, environment: {}, ...launch.options },
              {
                runCommand: async (command, args) => {
                  calls.push([command, args]);
                  if (command === "systemctl" && args.includes("is-active")) return scenario.result;
                  throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
                },
              },
            ),
          ).rejects.toThrow(/Could not verify the desktop service state/);
          assert.deepEqual(calls, [
            ["systemctl", ["--user", "is-active", "t3code-desktop.service"]],
          ]);
          assert.deepEqual(
            await Promise.all(runtimeFiles.map((path) => NodeFSP.readFile(path, "utf8"))),
            before,
          );
        } finally {
          await NodeFSP.rm(fixture.root, { recursive: true, force: true });
        }
      });
    }
  }

  it("starts the owned desktop service only when no primary is active", async () => {
    const fixture = await makeFixture();
    const paths = {
      installRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      runtimeRoot: fixture.runtimeRoot,
      readinessPath: NodePath.join(fixture.runtimeRoot, "ready.json"),
      environmentPath: NodePath.join(fixture.runtimeRoot, "service.env"),
      lockPath: NodePath.join(fixture.runtimeRoot, "launch.lock"),
    };
    const calls = [];
    let serviceActive = false;
    try {
      const result = await launchDesktop(
        { paths, environment: {}, timeoutMs: 500 },
        {
          randomUUID: () => "absent-generation",
          runCommand: async (command, args) => {
            calls.push([command, args]);
            if (command === "systemctl" && args.includes("is-active")) {
              return {
                code: serviceActive ? 0 : 3,
                stdout: serviceActive ? "active\n" : "inactive\n",
                stderr: "",
              };
            }
            if (command === "systemctl" && args.includes("start")) {
              serviceActive = true;
              await NodeFSP.writeFile(
                paths.readinessPath,
                JSON.stringify(readinessDocument(fixture, "absent-generation", 4242)),
              );
            }
            return { code: 0, stdout: "", stderr: "" };
          },
          verifyOwnedProcess: async () => undefined,
        },
      );
      assert.equal(result.generation, "absent-generation");
      assert.deepEqual(
        calls.filter(([command, args]) => command === "systemctl" && args.includes("start")),
        [["systemctl", ["--user", "start", "t3code-desktop.service"]]],
      );
      assert.isFalse(
        calls.some(([command, args]) => command === "systemctl" && args.includes("restart")),
      );
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("delegates payload replacement only to the owned service and verifies its cgroup", async () => {
    const fixture = await makeFixture();
    const calls = [];
    let serviceEnvironment = "";
    let handoffRequest = "";
    let handoffRequestMode = 0;
    const readyPid = 4242;
    const processStat = `${readyPid} (T3 Code) ${["S", ...Array.from({ length: 18 }, () => "1"), PROCESS_START_TICKS, "1"].join(" ")}`;
    const paths = {
      installRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      runtimeRoot: fixture.runtimeRoot,
      readinessPath: NodePath.join(fixture.runtimeRoot, "ready.json"),
      environmentPath: NodePath.join(fixture.runtimeRoot, "service.env"),
      lockPath: NodePath.join(fixture.runtimeRoot, "launch.lock"),
    };
    const stagingEnvironment = {
      T3CODE_HOME: "/staging/state",
      XDG_CONFIG_HOME: "/staging/config",
      T3CODE_DESKTOP_DISPLAY_NAME: "T3 Code (Staging)",
      T3CODE_DISABLE_AUTO_UPDATE: "true",
      T3CODE_PORT: "3778",
    };
    let focusEnvironment;
    try {
      const result = await launchDesktop(
        {
          paths,
          environment: stagingEnvironment,
          timeoutMs: 500,
          activation: {
            contractVersion: LAUNCHER_CONTRACT_VERSION,
            workspace: "/home/example/private-workspace",
            action: "submit",
            prompt: "private prompt sentinel",
          },
        },
        {
          randomUUID: () => "owned-generation",
          randomActivationUUID: () => "12345678-1234-4234-8234-1234567890ab",
          randomToken: () => "b".repeat(64),
          runCommand: async (command, args, options) => {
            calls.push([command, args]);
            if (command === "systemctl" && args.includes("is-active")) {
              return { code: 0, stdout: "active\n", stderr: "" };
            }
            if (command === fixture.artifactPath && args.includes("--t3code-focus-existing")) {
              focusEnvironment = options?.env;
            }
            if (command === "systemctl" && args.includes("restart")) {
              serviceEnvironment = await NodeFSP.readFile(paths.environmentPath, "utf8");
              handoffRequest = await NodeFSP.readFile(
                NodePath.join(fixture.runtimeRoot, "handoff-request.json"),
                "utf8",
              );
              handoffRequestMode =
                (await NodeFSP.stat(NodePath.join(fixture.runtimeRoot, "handoff-request.json")))
                  .mode & 0o777;
              await NodeFSP.mkdir(fixture.runtimeRoot, { recursive: true });
              await NodeFSP.writeFile(
                paths.readinessPath,
                JSON.stringify({
                  contractVersion: LAUNCHER_CONTRACT_VERSION,
                  productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
                  generation: "owned-generation",
                  artifactSha256: fixture.artifactSha256,
                  version: "1.2.3",
                  commitHash: COMMIT,
                  desktopMainPid: readyPid,
                  bootId: BOOT_ID,
                  desktopMainProcessStartTicks: PROCESS_START_TICKS,
                  backendReady: true,
                  rendererReady: true,
                }),
              );
            }
            if (command === "systemctl" && args.includes("ControlGroup")) {
              return {
                code: 0,
                stdout: "/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n",
                stderr: "",
              };
            }
            return { code: 0, stdout: "", stderr: "" };
          },
          readSystemFile: async (path, encoding) => {
            if (path.endsWith("boot_id")) return `${BOOT_ID}\n`;
            if (path === `/proc/${readyPid}/stat`) return processStat;
            if (path === `/proc/${readyPid}/cgroup`) {
              return "0::/user.slice/user-1000.slice/app.slice/t3code-desktop.service\n";
            }
            return NodeFSP.readFile(path, encoding);
          },
        },
      );
      assert.equal(result.generation, "owned-generation");
      assert.equal(result.activationId, "12345678-1234-4234-8234-1234567890ab");
      assert.equal(result.focusMethod, "electron");
      assert.deepEqual(
        calls.filter(([command, args]) => command === "systemctl" && args.includes("restart")),
        [["systemctl", ["--user", "restart", "t3code-desktop.service"]]],
      );
      assert.isFalse(calls.some(([command]) => ["kill", "pkill", "killall"].includes(command)));
      assert.deepEqual(focusEnvironment, stagingEnvironment);
      assert.notInclude(serviceEnvironment, "HANDOFF_TOKEN");
      assert.notInclude(serviceEnvironment, "b".repeat(64));
      assert.include(handoffRequest, "b".repeat(64));
      assert.include(handoffRequest, "private prompt sentinel");
      assert.equal(handoffRequestMode, 0o600);
      assert.isFalse(
        calls.some((call) => JSON.stringify(call).includes("private prompt sentinel")),
      );
      assert.notInclude(serviceEnvironment, "private prompt sentinel");
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("accepts a verified unmanaged-primary handoff before the second owned restart", async () => {
    const fixture = await makeFixture();
    const paths = {
      installRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      runtimeRoot: fixture.runtimeRoot,
      readinessPath: NodePath.join(fixture.runtimeRoot, "ready.json"),
      environmentPath: NodePath.join(fixture.runtimeRoot, "service.env"),
      lockPath: NodePath.join(fixture.runtimeRoot, "launch.lock"),
      handoffRequestPath: NodePath.join(fixture.runtimeRoot, "handoff-request.json"),
      handoffAckPath: NodePath.join(fixture.runtimeRoot, "handoff-ack.json"),
    };
    let startCount = 0;
    let restartCount = 0;
    let scopeStopCount = 0;
    let serviceActive = false;
    try {
      const result = await launchDesktop(
        { paths, environment: {}, timeoutMs: 500 },
        {
          randomUUID: () => "handoff-generation",
          randomToken: () => "c".repeat(64),
          runCommand: async (command, args) => {
            if (command === "systemctl" && args.includes("is-active")) {
              return {
                code: serviceActive ? 0 : 3,
                stdout: serviceActive ? "active\n" : "inactive\n",
                stderr: "",
              };
            }
            if (
              command === "systemctl" &&
              args.includes("ControlGroup") &&
              args.includes("app-t3code-999999.scope")
            ) {
              return {
                code: 0,
                stdout: "/user.slice/user-1000.slice/app.slice/app-t3code-999999.scope\n",
                stderr: "",
              };
            }
            if (
              command === "systemctl" &&
              args.includes("stop") &&
              args.includes("app-t3code-999999.scope")
            ) {
              scopeStopCount += 1;
              return { code: 0, stdout: "", stderr: "" };
            }
            if (command === "systemctl" && args.includes("start")) {
              startCount += 1;
              serviceActive = true;
              await NodeFSP.writeFile(
                paths.handoffAckPath,
                JSON.stringify({
                  contractVersion: LAUNCHER_CONTRACT_VERSION,
                  productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
                  generation: "handoff-generation",
                  token: "c".repeat(64),
                  primaryPid: 999_999,
                  primaryBootId: BOOT_ID,
                  primaryStartTicks: PROCESS_START_TICKS,
                  accepted: true,
                }),
              );
            }
            if (command === "systemctl" && args.includes("restart")) {
              restartCount += 1;
              await NodeFSP.writeFile(
                paths.readinessPath,
                JSON.stringify(readinessDocument(fixture, "handoff-generation")),
              );
            }
            return { code: 0, stdout: "", stderr: "" };
          },
          readSystemFile: async (path, encoding) => {
            if (path === "/proc/999999/stat") {
              const error = new Error("gone");
              error.code = "ENOENT";
              throw error;
            }
            return NodeFSP.readFile(path, encoding);
          },
          verifyOwnedProcess: async () => undefined,
        },
      );
      assert.equal(startCount, 1);
      assert.equal(restartCount, 1);
      assert.equal(scopeStopCount, 1);
      assert.equal(result.generation, "handoff-generation");
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails closed when a legacy unmanaged primary cannot authenticate handoff", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-legacy-handoff-"));
    try {
      let elapsed = 0;
      await expect(
        waitForInitialReadinessOrHandoff(
          {
            readinessPath: NodePath.join(root, "ready.json"),
            handoffAckPath: NodePath.join(root, "ack.json"),
            generation: "generation",
            token: "f".repeat(64),
            artifactSha256: "a".repeat(64),
            version: "1.2.3",
            commitHash: COMMIT,
            productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
            timeoutMs: 100,
            handoffAckGraceMs: 20,
          },
          {
            now: () => elapsed,
            sleep: async (milliseconds) => {
              elapsed += milliseconds;
            },
            serviceIsActive: async () => false,
            intervalMs: 10,
          },
        ),
      ).rejects.toThrow(/Close that legacy client once/);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("waits through bounded post-exit grace for a delayed handoff acknowledgement", async () => {
    let elapsed = 0;
    const expected = {
      readinessPath: "/runtime/ready.json",
      handoffAckPath: "/runtime/handoff-ack.json",
      generation: "delayed-generation",
      token: "f".repeat(64),
      artifactSha256: "a".repeat(64),
      version: "1.2.3",
      commitHash: COMMIT,
      productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
      timeoutMs: 100,
      handoffAckGraceMs: 50,
      intervalMs: 10,
    };
    const outcome = await waitForInitialReadinessOrHandoff(expected, {
      now: () => elapsed,
      sleep: async (milliseconds) => {
        elapsed += milliseconds;
      },
      serviceIsActive: async () => false,
      readFile: async (filePath) => {
        if (filePath === expected.handoffAckPath && elapsed >= 30) {
          return JSON.stringify({
            contractVersion: LAUNCHER_CONTRACT_VERSION,
            productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
            generation: expected.generation,
            token: expected.token,
            primaryPid: 42,
            primaryBootId: BOOT_ID,
            primaryStartTicks: PROCESS_START_TICKS,
            accepted: true,
          });
        }
        const error = new Error("not ready");
        error.code = "ENOENT";
        throw error;
      },
    });
    assert.equal(outcome.type, "handoff");
    assert.equal(elapsed, 30);
  });

  it("recovers a stale launch lock without signaling its former owner", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-lock-test-"));
    const lockPath = NodePath.join(root, "launch.lock");
    try {
      await NodeFSP.mkdir(lockPath);
      await NodeFSP.writeFile(
        NodePath.join(lockPath, "owner.json"),
        JSON.stringify({
          contractVersion: LAUNCHER_CONTRACT_VERSION,
          ownerToken: "11111111-1111-4111-8111-111111111111",
          pid: 999_999,
          bootId: BOOT_ID,
          processStartTicks: PROCESS_START_TICKS,
        }),
      );
      const release = await acquireDirectoryLock(lockPath, {
        lockRandomUUID: () => "22222222-2222-4222-8222-222222222222",
        readSystemFile: async (path, encoding) => {
          if (path === "/proc/999999/stat") {
            const error = new Error("gone");
            error.code = "ENOENT";
            throw error;
          }
          return NodeFSP.readFile(path, encoding);
        },
      });
      const owner = JSON.parse(
        await NodeFSP.readFile(NodePath.join(lockPath, "owner.json"), "utf8"),
      );
      assert.equal(owner.ownerToken, "22222222-2222-4222-8222-222222222222");
      await release();
      await expect(NodeFSP.lstat(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("does not reclaim malformed or unreadable launch ownership", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-lock-invalid-"));
    const lockPath = NodePath.join(root, "launch.lock");
    try {
      await NodeFSP.mkdir(lockPath);
      await NodeFSP.writeFile(NodePath.join(lockPath, "owner.json"), "not-json");
      await expect(acquireDirectoryLock(lockPath)).rejects.toThrow(/cannot be reclaimed safely/);
      assert.equal(
        await NodeFSP.readFile(NodePath.join(lockPath, "owner.json"), "utf8"),
        "not-json",
      );

      await expect(
        acquireDirectoryLock(lockPath, {
          readLockFile: async () => {
            const error = new Error("permission denied");
            error.code = "EACCES";
            throw error;
          },
        }),
      ).rejects.toThrow(/cannot be reclaimed safely/);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when the fresh desktop window cannot be focused", async () => {
    const fixture = await makeFixture();
    const paths = {
      installRoot: fixture.root,
      manifestPath: fixture.manifestPath,
      runtimeRoot: fixture.runtimeRoot,
      readinessPath: NodePath.join(fixture.runtimeRoot, "ready.json"),
      environmentPath: NodePath.join(fixture.runtimeRoot, "service.env"),
      lockPath: NodePath.join(fixture.runtimeRoot, "launch.lock"),
    };
    try {
      await expect(
        launchDesktop(
          { paths, environment: {}, timeoutMs: 100 },
          {
            randomUUID: () => "focus-generation",
            runCommand: async (command, args) => {
              if (command === "systemctl" && args.includes("is-active")) {
                return { code: 3, stdout: "inactive\n", stderr: "" };
              }
              if (command === "systemctl" && args.includes("start")) {
                await NodeFSP.mkdir(fixture.runtimeRoot, { recursive: true });
                await NodeFSP.writeFile(
                  paths.readinessPath,
                  JSON.stringify({
                    contractVersion: LAUNCHER_CONTRACT_VERSION,
                    productAppId: PRODUCT_TECHNICAL_IDENTITY.appId,
                    generation: "focus-generation",
                    artifactSha256: fixture.artifactSha256,
                    version: "1.2.3",
                    commitHash: COMMIT,
                    desktopMainPid: 42,
                    bootId: BOOT_ID,
                    desktopMainProcessStartTicks: PROCESS_START_TICKS,
                    backendReady: true,
                    rendererReady: true,
                  }),
                );
                return { code: 0, stdout: "", stderr: "" };
              }
              if (command === "systemctl") return { code: 0, stdout: "", stderr: "" };
              return { code: 1, stdout: "", stderr: "unavailable" };
            },
            verifyOwnedProcess: async () => undefined,
          },
        ),
      ).rejects.toThrow(/could not be focused/);
    } finally {
      await NodeFSP.rm(fixture.root, { recursive: true, force: true });
    }
  });
});
