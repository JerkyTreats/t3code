import * as NodeAssert from "node:assert/strict";

import { describe, it } from "vite-plus/test";

import {
  codexAppServerArgs,
  codexExecLaunchArgs,
  codexSessionAppServerArgs,
  resolveCodexLaunchArgs,
} from "./codexLaunchArgs.ts";

describe("resolveCodexLaunchArgs", () => {
  it("prefers the environment override", () => {
    NodeAssert.equal(
      resolveCodexLaunchArgs(" --strict-config ", {
        T3CODE_CODEX_LAUNCH_ARGS: "--enable feature",
      }),
      "--enable feature",
    );
  });

  it("uses configured settings when the override is blank", () => {
    NodeAssert.equal(
      resolveCodexLaunchArgs(" --strict-config ", { T3CODE_CODEX_LAUNCH_ARGS: "   " }),
      "--strict-config",
    );
  });
});

describe("codex launch argument projection", () => {
  it("places global arguments before app-server", () => {
    NodeAssert.deepStrictEqual(
      codexAppServerArgs('--profile "work profile" --strict-config --config model="gpt 5"'),
      ["--profile", "work profile", "--strict-config", "--config", "model=gpt 5", "app-server"],
    );
  });

  it("preserves every configured global argument for exec", () => {
    NodeAssert.deepStrictEqual(
      codexExecLaunchArgs(
        '--profile "work profile" --strict-config --enable feature --listen off --config model="gpt 5"',
      ),
      [
        "--profile",
        "work profile",
        "--strict-config",
        "--enable",
        "feature",
        "--listen",
        "off",
        "--config",
        "model=gpt 5",
      ],
    );
  });

  it("allows exec composition to keep global arguments before its subcommand", () => {
    NodeAssert.deepStrictEqual(
      [...codexExecLaunchArgs('--profile "work profile"'), "exec", "--ephemeral"],
      ["--profile", "work profile", "exec", "--ephemeral"],
    );
  });

  it("places session MCP configuration after the app-server subcommand", () => {
    NodeAssert.deepStrictEqual(
      codexSessionAppServerArgs(
        ["-c", "mcp_servers.t3-code.url=http://local"],
        '--profile "work profile" --strict-config',
      ),
      [
        "--profile",
        "work profile",
        "--strict-config",
        "app-server",
        "-c",
        "mcp_servers.t3-code.url=http://local",
      ],
    );
  });
});
