import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  STAGING_CODE_SERVICE,
  STAGING_STATE_DIRECTORY_NAME,
  STAGING_WINDOW_CLASS,
  buildStagingActivation,
  parseStagingEntryArguments,
  prepareStagingState,
  readStagingEntryConfig,
  runStagingThreadEntry,
  validateStagingEntryConfig,
  validateWorkingDirectory,
  verifyStagingTarget,
} from "./staging-thread-entry.mjs";

const fixtureRoots = [];
const baseConfig = {
  contractVersion: 1,
  stagingOrigin: "https://staging.example.test",
  artifactPath: "/opt/t3-thread-staging/T3-Thread.AppImage",
  descriptorPath: "/opt/t3-thread-staging/T3-Thread.AppImage.release.json",
  launcherPath: "/opt/t3-thread-staging/t3-thread-launcher.mjs",
  stateDirectory: "/var/lib/t3code-thread-staging",
};

async function createFixtureRoot() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "staging-thread-entry-"));
  fixtureRoots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    fixtureRoots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true, force: true })),
  );
});

describe("staging entry arguments and config", () => {
  it("accepts the explicit compatibility flags and rejects unknown or duplicate flags", () => {
    expect(
      parseStagingEntryArguments([
        "--config",
        "/private/config.json",
        "--cwd",
        "/workspace/project",
        "--prompt",
        "draft this",
        "--pick",
        "--inline",
      ]),
    ).toEqual({
      config: "/private/config.json",
      cwd: "/workspace/project",
      prompt: "draft this",
      pick: true,
      inline: true,
    });
    for (const arguments_ of [
      ["--config", "/private/config.json", "--unknown"],
      ["--config", "/one", "--config", "/two"],
      ["--config"],
      ["--config", "relative.json"],
      ["--config", "/private/config.json", "positional"],
    ]) {
      expect(() => parseStagingEntryArguments(arguments_)).toThrow(
        /staging (?:arguments are|config path is) invalid/u,
      );
    }
  });

  it("rejects empty, oversized, and nul-containing prompts without echoing them", () => {
    const privatePrompt = `private-${"x".repeat(32 * 1024)}`;
    for (const prompt of ["", "bad\0prompt", privatePrompt]) {
      let message = "";
      try {
        parseStagingEntryArguments(["--config", "/private/config.json", "--prompt", prompt]);
      } catch (cause) {
        message = cause.message;
      }
      expect(message).toBe("T3 Thread staging prompt is invalid.");
      if (prompt.length > 0) expect(message).not.toContain(prompt);
    }
  });

  it("preserves every recognized flag token when it is the contextual prompt value", () => {
    for (const prompt of ["--config", "--cwd", "--prompt", "--pick", "--inline"]) {
      expect(
        parseStagingEntryArguments(["--prompt", prompt, "--config", "/private/config.json"]).prompt,
      ).toBe(prompt);
    }
  });

  it("requires the exact V1 shape, normalized paths, and a credential-free HTTPS origin", () => {
    expect(validateStagingEntryConfig(baseConfig)).toEqual(baseConfig);
    for (const invalid of [
      { ...baseConfig, contractVersion: 2 },
      { ...baseConfig, extra: true },
      { ...baseConfig, artifactPath: "relative.AppImage" },
      { ...baseConfig, launcherPath: "/opt/../tmp/t3-thread-launcher.mjs" },
      { ...baseConfig, stateDirectory: "/var/lib/arbitrary-private-root" },
      { ...baseConfig, stagingOrigin: "http://staging.example.test" },
      { ...baseConfig, stagingOrigin: "https://user:secret@staging.example.test" },
      { ...baseConfig, stagingOrigin: "https://staging.example.test/path" },
      { ...baseConfig, stagingOrigin: "https://staging.example.test/" },
    ]) {
      expect(() => validateStagingEntryConfig(invalid)).toThrow(
        "T3 Thread staging config is invalid.",
      );
    }
  });

  it("reads only a bounded owned mode 0600 regular config without following links", async () => {
    const root = await createFixtureRoot();
    const configPath = NodePath.join(root, "entry.json");
    const stateDirectory = NodePath.join(root, STAGING_STATE_DIRECTORY_NAME);
    await NodeFSP.writeFile(configPath, JSON.stringify({ ...baseConfig, stateDirectory }), {
      mode: 0o600,
    });
    await expect(readStagingEntryConfig(configPath)).resolves.toEqual({
      ...baseConfig,
      stateDirectory,
    });

    await NodeFSP.chmod(configPath, 0o644);
    await expect(readStagingEntryConfig(configPath)).rejects.toThrow(
      "T3 Thread staging config cannot be verified.",
    );
    await NodeFSP.chmod(configPath, 0o600);
    const linkedPath = NodePath.join(root, "linked.json");
    await NodeFSP.symlink(configPath, linkedPath);
    await expect(readStagingEntryConfig(linkedPath)).rejects.toThrow(
      "T3 Thread staging config cannot be verified.",
    );
  });
});

describe("staging host boundaries", () => {
  it("creates private dedicated state roots and rejects default user state", async () => {
    const root = await createFixtureRoot();
    const stateDirectory = NodePath.join(root, STAGING_STATE_DIRECTORY_NAME);
    await NodeFSP.mkdir(stateDirectory, { mode: 0o700 });
    const directories = await prepareStagingState(stateDirectory, {
      homeDirectory: root,
      environment: {},
    });
    expect(Object.keys(directories).toSorted()).toEqual(
      ["cache", "config", "data", "profiles", "state"].toSorted(),
    );
    for (const directoryPath of Object.values(directories)) {
      const status = await NodeFSP.lstat(directoryPath);
      expect(status.mode & 0o777).toBe(0o700);
      expect(await NodeFSP.realpath(directoryPath)).toBe(directoryPath);
    }
    await expect(
      prepareStagingState(stateDirectory, { homeDirectory: root, environment: {} }),
    ).resolves.toEqual(directories);
    await expect(
      prepareStagingState(NodePath.join(root, "arbitrary-private-root"), {
        homeDirectory: root,
        environment: {},
      }),
    ).rejects.toThrow("T3 Thread staging state directory is unsafe.");
  });

  it("rejects staging namespace overlap with production Code and Thread roots", async () => {
    const root = await createFixtureRoot();
    const productionT3Home = NodePath.join(root, "production-state");
    const productionAppData = NodePath.join(root, "production-config");
    const environment = {
      T3CODE_HOME: productionT3Home,
      XDG_CONFIG_HOME: productionAppData,
    };
    for (const stateDirectory of [
      NodePath.join(productionT3Home, STAGING_STATE_DIRECTORY_NAME),
      NodePath.join(productionAppData, STAGING_STATE_DIRECTORY_NAME),
      NodePath.join(root, ".t3", STAGING_STATE_DIRECTORY_NAME),
    ]) {
      await expect(
        prepareStagingState(stateDirectory, { homeDirectory: root, environment }),
      ).rejects.toThrow("T3 Thread staging state directory is unsafe.");
    }
  });

  it("requires an existing normalized physical working directory", async () => {
    const root = await createFixtureRoot();
    await expect(validateWorkingDirectory(root)).resolves.toBe(root);
    await expect(validateWorkingDirectory(NodePath.join(root, "missing"))).rejects.toThrow(
      "T3 Thread staging working directory is invalid.",
    );
    await expect(validateWorkingDirectory(`${root}/..`)).rejects.toThrow(
      "T3 Thread staging working directory is invalid.",
    );
    const linkedPath = NodePath.join(root, "linked");
    await NodeFSP.symlink(root, linkedPath);
    await expect(validateWorkingDirectory(linkedPath)).rejects.toThrow(
      "T3 Thread staging working directory is invalid.",
    );
  });

  it("reads only the fixed staging service and requires its exact origin", async () => {
    const execFile = vi.fn(async () => ({
      stdout: "T3CODE_DESKTOP_SERVER_URL=https://staging.example.test OTHER=value\n",
    }));
    await expect(
      verifyStagingTarget("https://staging.example.test", { execFile }),
    ).resolves.toBeUndefined();
    expect(execFile).toHaveBeenCalledWith("systemctl", [
      "--user",
      "show",
      STAGING_CODE_SERVICE,
      "--property=Environment",
      "--value",
      "--no-pager",
    ]);

    for (const stdout of [
      "T3CODE_DESKTOP_SERVER_URL=https://production.example.test\n",
      "OTHER=value\n",
      "T3CODE_DESKTOP_SERVER_URL=https://staging.example.test T3CODE_DESKTOP_SERVER_URL=https://staging.example.test\n",
    ]) {
      const secret = "private-token-value";
      await expect(
        verifyStagingTarget("https://staging.example.test", {
          execFile: async () => ({ stdout: `${stdout} SECRET=${secret}` }),
        }),
      ).rejects.toThrow("T3 Thread staging target is not authorized.");
      try {
        await verifyStagingTarget("https://staging.example.test", {
          execFile: async () => ({ stdout: `${stdout} SECRET=${secret}` }),
        });
      } catch (cause) {
        expect(cause.message).not.toContain(secret);
        expect(cause.message).not.toContain("production.example.test");
      }
    }
  });
});

describe("staging launch conversion", () => {
  function runFixture(arguments_, overrides = {}) {
    const observed = { events: [], stdout: Buffer.alloc(0) };
    const stateDirectories = {
      config: "/private/state/config",
      cache: "/private/state/cache",
      data: "/private/state/data",
      state: "/private/state/state",
      profiles: "/private/state/profiles",
    };
    const spawn = vi.fn((command, spawnArguments, options) => ({
      command,
      spawnArguments,
      options,
    }));
    const launcher = {
      launchThread: vi.fn(async (input) => {
        observed.events.push("launch");
        const chunks = [];
        for await (const chunk of input.activationInput) chunks.push(Buffer.from(chunk));
        observed.activation = Buffer.concat(chunks);
        observed.launchInput = input;
        observed.spawnResult = await input.spawnApp(input.appImagePath);
        input.writeReady(
          Buffer.from(`${JSON.stringify({ contractVersion: 1, status: "completed" })}\n`),
          "external",
        );
      }),
      spawnAppImage: vi.fn(async (appImagePath, dependencies) => {
        observed.environment = dependencies.environment;
        return dependencies.spawn(appImagePath, ["--existing-app-flag"], { detached: false });
      }),
    };
    const dependencies = {
      homeDirectory: "/workspace/user-root",
      environment: {
        PATH: "/usr/bin",
        HOME: "/workspace/user-root",
        CODEX_HOME: "/workspace/user-root/.codex",
        PWD: "/inherited/pwd",
        XDG_RUNTIME_DIR: "/run/user/1000",
        DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
        GNOME_KEYRING_CONTROL: "/run/user/1000/keyring",
        WAYLAND_DISPLAY: "wayland-1",
      },
      readConfig: vi.fn(async () => baseConfig),
      validateCwd: vi.fn(async (value) => value),
      prepareState: vi.fn(async () => {
        observed.events.push("state");
        return stateDirectories;
      }),
      verifyRelease: vi.fn(async () => observed.events.push("verify")),
      verifyTarget: vi.fn(async () => observed.events.push("target")),
      importLauncher: vi.fn(async () => {
        observed.events.push("import");
        return launcher;
      }),
      createIntentId: () => "0123456789abcdef0123456789abcdef",
      spawn,
      stdout: {
        write(bytes) {
          observed.stdout = Buffer.concat([observed.stdout, Buffer.from(bytes)]);
        },
      },
      ...overrides,
    };
    const result = { dependencies, launcher, observed, spawn };
    return Object.assign(
      runStagingThreadEntry(arguments_, dependencies).then(() => result),
      result,
    );
  }

  it("converts an exact prompt and cwd into an unsent direct-launch draft", async () => {
    const exactPrompt = "  Diagnose 雪\r\nwithout sending  ";
    const result = await runFixture([
      "--config",
      "/private/config.json",
      "--cwd",
      "/workspace/project",
      "--prompt",
      exactPrompt,
      "--pick",
      "--inline",
    ]);
    expect(JSON.parse(result.observed.activation.toString("utf8"))).toEqual({
      contractVersion: 1,
      intentId: "0123456789abcdef0123456789abcdef",
      source: "direct-launch",
      action: "draft",
      draft: { text: exactPrompt },
      workingDirectory: "/workspace/project",
    });
    expect(result.observed.launchInput.superviseAfterReady).toBe(true);
    expect(result.observed.stdout.toString("utf8")).toBe(
      `${JSON.stringify({ contractVersion: 1, status: "completed" })}\n`,
    );
    expect(result.spawn).toHaveBeenCalledWith(
      baseConfig.artifactPath,
      ["--existing-app-flag", `--class=${STAGING_WINDOW_CLASS}`],
      { detached: false },
    );
    expect(result.spawn.mock.calls[0][1]).not.toContain(exactPrompt);
  });

  it("uses zero-byte fresh input and home rather than inherited PWD", async () => {
    const result = await runFixture(["--config", "/private/config.json"]);
    expect(result.observed.activation).toEqual(Buffer.alloc(0));
    expect(result.dependencies.validateCwd).toHaveBeenCalledWith("/workspace/user-root");
    expect(result.observed.environment.T3_THREAD_WORKING_DIRECTORY).toBe("/workspace/user-root");
    expect(result.observed.environment.PWD).toBe("/inherited/pwd");
  });

  it("isolates staging state while preserving runtime, keyring, Wayland, HOME, and CODEX_HOME", async () => {
    const result = await runFixture(["--config", "/private/config.json"]);
    expect(result.observed.environment).toMatchObject({
      T3_THREAD_SERVER_URL: "https://staging.example.test",
      T3_THREAD_CHANNEL: "staging",
      T3_THREAD_WORKING_DIRECTORY: "/workspace/user-root",
      T3_THREAD_PROFILE: "/private/state/profiles",
      XDG_CONFIG_HOME: "/private/state/config",
      XDG_CACHE_HOME: "/private/state/cache",
      XDG_DATA_HOME: "/private/state/data",
      XDG_STATE_HOME: "/private/state/state",
      XDG_RUNTIME_DIR: "/run/user/1000",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
      GNOME_KEYRING_CONTROL: "/run/user/1000/keyring",
      WAYLAND_DISPLAY: "wayland-1",
      HOME: "/workspace/user-root",
      CODEX_HOME: "/workspace/user-root/.codex",
    });
  });

  it("verifies the release and staging target before importing launcher code", async () => {
    const result = await runFixture(["--config", "/private/config.json"]);
    expect(result.observed.events).toEqual(["verify", "target", "import", "state", "launch"]);
    expect(result.dependencies.verifyRelease).toHaveBeenCalledWith({
      artifactPath: baseConfig.artifactPath,
      descriptorPath: baseConfig.descriptorPath,
      launcherPath: baseConfig.launcherPath,
    });
  });

  it("does not create state before every immutable admission check passes", async () => {
    for (const overrides of [
      { verifyRelease: async () => Promise.reject(new Error("release rejected")) },
      { verifyTarget: async () => Promise.reject(new Error("target rejected")) },
      { importLauncher: async () => Promise.reject(new Error("import rejected")) },
    ]) {
      const running = runFixture(["--config", "/private/config.json"], overrides);
      await expect(running).rejects.toThrow();
      expect(running.dependencies.prepareState).not.toHaveBeenCalled();
    }
  });

  it("uses fixed secret-free launch failures", async () => {
    const privatePrompt = "private prompt text";
    let message = "";
    try {
      await runFixture(["--config", "/private/config.json", "--prompt", privatePrompt], {
        importLauncher: async () => ({
          launchThread: async () => {
            throw new Error(`failure contains ${privatePrompt}`);
          },
          spawnAppImage: async () => undefined,
        }),
      });
    } catch (cause) {
      message = cause.message;
    }
    expect(message).toBe("T3 Thread staging launch failed.");
    expect(message).not.toContain(privatePrompt);
    expect(message).not.toContain(baseConfig.stagingOrigin);
  });
});

it("builds a random-identity draft without a send action", () => {
  const activation = JSON.parse(
    buildStagingActivation(
      "review this",
      "/workspace/project",
      () => "fedcba9876543210fedcba9876543210",
    ).toString("utf8"),
  );
  expect(activation).toEqual({
    contractVersion: 1,
    intentId: "fedcba9876543210fedcba9876543210",
    source: "direct-launch",
    action: "draft",
    draft: { text: "review this" },
    workingDirectory: "/workspace/project",
  });
  expect(JSON.stringify(activation)).not.toContain("send");
});
