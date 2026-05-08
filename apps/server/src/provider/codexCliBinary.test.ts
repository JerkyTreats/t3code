import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertSupportedCodexCliVersion,
  resolveSupportedCodexCliBinary,
  resolveSupportedCodexCliBinaries,
} from "./codexCliBinary";

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

describe("assertSupportedCodexCliVersion", () => {
  afterEach(() => {
    spawnSyncMock.mockReset();
  });

  it("returns the parsed version for supported binaries", () => {
    spawnSyncMock.mockReturnValue({
      error: undefined,
      status: 0,
      stdout: "codex 0.45.0\n",
      stderr: "",
    });

    expect(
      assertSupportedCodexCliVersion({
        binaryPath: "/usr/local/bin/codex",
        cwd: "/repo",
      }),
    ).toEqual({
      binaryPath: "/usr/local/bin/codex",
      version: "0.45.0",
    });
  });

  it("throws the upgrade message for unsupported binaries", () => {
    spawnSyncMock.mockReturnValue({
      error: undefined,
      status: 0,
      stdout: "codex 0.36.0\n",
      stderr: "",
    });

    expect(() =>
      assertSupportedCodexCliVersion({
        binaryPath: "/usr/local/bin/codex",
        cwd: "/repo",
      }),
    ).toThrow(
      "Codex CLI v0.36.0 is too old for T3 Code. Upgrade to v0.37.0 or newer and restart T3 Code.",
    );
  });
});

describe("resolveSupportedCodexCliBinary", () => {
  const originalEnvBinaryPath = process.env.CODEX_BINARY_PATH;

  afterEach(() => {
    spawnSyncMock.mockReset();
    if (originalEnvBinaryPath === undefined) {
      delete process.env.CODEX_BINARY_PATH;
      return;
    }
    process.env.CODEX_BINARY_PATH = originalEnvBinaryPath;
  });

  it("prefers the newest supported binary across configured and shell candidates", () => {
    process.env.CODEX_BINARY_PATH = "/opt/bin/codex";
    spawnSyncMock.mockImplementation((binaryPath: string) => {
      if (binaryPath === "/custom/old-codex") {
        return {
          error: undefined,
          status: 0,
          stdout: "codex 0.42.0\n",
          stderr: "",
        };
      }
      if (binaryPath === "/opt/bin/codex") {
        return {
          error: undefined,
          status: 0,
          stdout: "codex 0.45.0\n",
          stderr: "",
        };
      }
      return {
        error: undefined,
        status: 0,
        stdout: "codex 0.44.0\n",
        stderr: "",
      };
    });

    expect(
      resolveSupportedCodexCliBinary({
        preferredBinaryPath: "/custom/old-codex",
        cwd: "/repo",
      }),
    ).toEqual({
      binaryPath: "/opt/bin/codex",
      version: "0.45.0",
    });
  });

  it("keeps the first candidate when versions are unknown", () => {
    delete process.env.CODEX_BINARY_PATH;
    spawnSyncMock.mockReturnValue({
      error: undefined,
      status: 0,
      stdout: "codex dev build\n",
      stderr: "",
    });

    expect(
      resolveSupportedCodexCliBinary({
        preferredBinaryPath: "/custom/codex",
        cwd: "/repo",
      }),
    ).toEqual({
      binaryPath: "/custom/codex",
      version: null,
    });
  });

  it("does not replace an explicit preferred path when it must be respected", () => {
    process.env.CODEX_BINARY_PATH = "/opt/bin/codex";
    spawnSyncMock.mockImplementation((binaryPath: string) => {
      if (binaryPath === "/custom/codex") {
        return {
          error: undefined,
          status: 0,
          stdout: "codex 0.42.0\n",
          stderr: "",
        };
      }
      return {
        error: undefined,
        status: 0,
        stdout: "codex 0.45.0\n",
        stderr: "",
      };
    });

    expect(
      resolveSupportedCodexCliBinary({
        preferredBinaryPath: "/custom/codex",
        respectPreferredBinaryPath: true,
        cwd: "/repo",
      }),
    ).toEqual({
      binaryPath: "/custom/codex",
      version: "0.42.0",
    });
  });

  it("falls back to a later candidate when the preferred path is too old", () => {
    process.env.CODEX_BINARY_PATH = "/opt/bin/codex";
    spawnSyncMock.mockImplementation((binaryPath: string) => {
      if (binaryPath === "/custom/old-codex") {
        return {
          error: undefined,
          status: 0,
          stdout: "codex 0.36.0\n",
          stderr: "",
        };
      }
      return {
        error: undefined,
        status: 0,
        stdout: "codex 0.45.0\n",
        stderr: "",
      };
    });

    expect(
      resolveSupportedCodexCliBinaries({
        preferredBinaryPath: "/custom/old-codex",
        cwd: "/repo",
      }),
    ).toEqual([
      {
        binaryPath: "/opt/bin/codex",
        version: "0.45.0",
      },
      {
        binaryPath: "codex",
        version: "0.45.0",
      },
    ]);
  });
});
