import { describe, expect, it } from "vite-plus/test";

import { collectCodexBinaryCandidates } from "./CodexBinaryDiscovery.ts";

describe("collectCodexBinaryCandidates", () => {
  it("keeps an explicit configured path first and bounds PATH candidates", () => {
    const candidates = collectCodexBinaryCandidates({
      configuredBinaryPath: "/opt/codex/bin/codex",
      environment: { PATH: Array.from({ length: 40 }, (_, index) => `/p${index}`).join(":") },
      platform: "linux",
    });

    expect(candidates[0]).toEqual({
      path: "/opt/codex/bin/codex",
      source: "configured",
    });
    expect(candidates).toHaveLength(32);
  });

  it("labels candidates from a WSL backend without inventing host paths", () => {
    expect(
      collectCodexBinaryCandidates({
        configuredBinaryPath: "codex",
        environment: { PATH: "/usr/bin:/bin", WSL_DISTRO_NAME: "Ubuntu" },
        platform: "linux",
      }),
    ).toEqual([
      { path: "codex", source: "configured" },
      { path: "/usr/bin/codex", source: "wsl-path" },
      { path: "/bin/codex", source: "wsl-path" },
    ]);
  });

  it("keeps a configured command name for shell-aware probing", () => {
    expect(
      collectCodexBinaryCandidates({
        configuredBinaryPath: "codex-preview",
        environment: { PATH: "/usr/bin" },
        platform: "linux",
      }),
    ).toEqual([
      { path: "codex-preview", source: "configured" },
      { path: "/usr/bin/codex", source: "path" },
    ]);
  });

  it("includes Windows npm command shims for configured and PATH locations", () => {
    expect(
      collectCodexBinaryCandidates({
        configuredBinaryPath: String.raw`C:\Custom Codex\codex.cmd`,
        environment: {
          Path: String.raw`C:\Users\tester\AppData\Roaming\npm;C:\Tools`,
        },
        platform: "win32",
      }),
    ).toEqual([
      {
        path: String.raw`C:\Custom Codex\codex.cmd`,
        source: "configured",
      },
      {
        path: String.raw`C:\Users\tester\AppData\Roaming\npm\codex.exe`,
        source: "path",
      },
      {
        path: String.raw`C:\Users\tester\AppData\Roaming\npm\codex.cmd`,
        source: "path",
      },
      {
        path: String.raw`C:\Tools\codex.exe`,
        source: "path",
      },
      {
        path: String.raw`C:\Tools\codex.cmd`,
        source: "path",
      },
    ]);
  });

  it("keeps Windows executable and command shim expansion bounded", () => {
    const candidates = collectCodexBinaryCandidates({
      configuredBinaryPath: "",
      environment: {
        PATH: Array.from({ length: 40 }, (_, index) => `C:\\p${index}`).join(";"),
      },
      platform: "win32",
    });

    expect(candidates).toHaveLength(32);
    expect(candidates.at(-1)).toEqual({
      path: String.raw`C:\p15\codex.cmd`,
      source: "path",
    });
  });

  it("normalizes quoted Windows PATH entries before joining command shims", () => {
    expect(
      collectCodexBinaryCandidates({
        configuredBinaryPath: "",
        environment: {
          Path: String.raw`"C:\Program Files\nodejs";C:\Tools`,
        },
        platform: "win32",
      }),
    ).toEqual([
      {
        path: String.raw`C:\Program Files\nodejs\codex.exe`,
        source: "path",
      },
      {
        path: String.raw`C:\Program Files\nodejs\codex.cmd`,
        source: "path",
      },
      {
        path: String.raw`C:\Tools\codex.exe`,
        source: "path",
      },
      {
        path: String.raw`C:\Tools\codex.cmd`,
        source: "path",
      },
    ]);
  });
});
