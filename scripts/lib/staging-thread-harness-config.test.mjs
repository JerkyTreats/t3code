import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  parseHarnessArguments,
  readHarnessConfig,
  validateHarnessConfig,
} from "./staging-thread-harness-config.mjs";

const roots = [];
const base = {
  contractVersion: 1,
  stagingOrigin: "https://staging.example.test",
  stagingDatabasePath: "/private/staging-state.sqlite",
  artifactPath: "/opt/thread/T3-Thread.AppImage",
  descriptorPath: "/opt/thread/T3-Thread.AppImage.release.json",
  launcherPath: "/opt/thread/t3-thread-launcher.mjs",
  entryAdapterPath: "/workspace/scripts/staging-thread-entry.mjs",
  entryConfigPath: "/private/entry.json",
  stateDirectory: "/private/t3code-thread-staging",
  homeWorkingDirectory: "/home/example",
  projectWorkingDirectory: "/workspace/project",
  syntheticCrashDraft: "Inspect this synthetic crash.",
  nativeTypeSentinel: " staged-native-text",
  concurrentWindows: 3,
  thresholds: {
    windowMs: 10000,
    ackMs: 10000,
    connectedMs: 20000,
    usableMs: 20000,
    inputMs: 5000,
    closeMs: 5000,
    crashMs: 5000,
  },
  codeReadinessPath: "/run/user/1000/t3code-staging/ready.json",
  protectedProcesses: [{ label: "server", pid: 1234, startTicks: "5678" }],
  protectedServices: ["t3code-staging.service"],
  hyprland: { threadClass: "t3-thread-staging", defaultWorkspace: 4, projectWorkspace: 5 },
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true, force: true })),
  );
});

describe("staging Thread harness config", () => {
  it("accepts only the explicit V1 origin, paths, workspaces, and thresholds", () => {
    expect(validateHarnessConfig(base)).toEqual(base);
    for (const invalid of [
      { ...base, extra: true },
      { ...base, stagingOrigin: "https://user:secret@staging.example.test" },
      { ...base, artifactPath: "relative" },
      { ...base, concurrentWindows: 2 },
      { ...base, protectedProcesses: [{ label: "server", pid: 1234, startTicks: "bad" }] },
      { ...base, hyprland: { ...base.hyprland, defaultWorkspace: 0 } },
      { ...base, pairingCredentialFd: 3, pairingCredentialFile: "/private/token" },
      { ...base, pairingCredentialFd: 1 },
      { ...base, nativeTypeSentinel: "bad\nenter" },
    ])
      expect(() => validateHarnessConfig(invalid)).toThrow("config is invalid");
    expect(validateHarnessConfig({ ...base, pairingCredentialFd: 0 }).pairingCredentialFd).toBe(0);
  });

  it("reads only an owned mode 0600 config and never echoes protected values", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "thread-harness-config-"));
    roots.push(root);
    const file = NodePath.join(root, "config.json");
    const privateValue = "private-host-marker";
    await NodeFSP.writeFile(file, JSON.stringify({ ...base, extra: privateValue }), {
      mode: 0o600,
    });
    await expect(readHarnessConfig(file)).rejects.toThrow("config could not be read");
    try {
      await readHarnessConfig(file);
    } catch (cause) {
      expect(cause.message).not.toContain(privateValue);
    }
    await NodeFSP.writeFile(file, JSON.stringify(base), { mode: 0o600 });
    await expect(readHarnessConfig(file)).resolves.toEqual(base);
    await NodeFSP.chmod(file, 0o644);
    await expect(readHarnessConfig(file)).rejects.toThrow("config could not be read");
  });

  it("requires the exact two CLI paths", () => {
    expect(
      parseHarnessArguments([
        "--config",
        "/private/config.json",
        "--output-dir",
        "/private/output",
      ]),
    ).toEqual({ configPath: "/private/config.json", outputDirectory: "/private/output" });
    expect(() =>
      parseHarnessArguments(["--config", "relative", "--output-dir", "/private/output"]),
    ).toThrow("paths are invalid");
  });
});
