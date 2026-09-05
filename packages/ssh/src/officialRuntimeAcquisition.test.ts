// @effect-diagnostics nodeBuiltinImport:off -- Replacement-host proof executes the portable shell boundary.
import * as NodeChildProcess from "node:child_process";

import { assert, describe, it } from "@effect/vitest";

import {
  OFFICIAL_REMOTE_T3_MISSING_MESSAGE,
  buildOfficialRemoteT3RunnerScript,
  officialRuntimeAcquisition,
} from "./officialRuntimeAcquisition.ts";

const REPLACEMENT_NODE_ENVIRONMENT = "ensure_remote_node_path() { :; }";

describe("official remote T3 runtime acquisition", () => {
  it("selects only an explicit entry or a preinstalled runtime", () => {
    assert.deepEqual(officialRuntimeAcquisition(), { kind: "preinstalled-t3" });
    assert.deepEqual(officialRuntimeAcquisition("   "), { kind: "preinstalled-t3" });
    assert.deepEqual(officialRuntimeAcquisition(" /workspace/server/bin.mjs "), {
      kind: "explicit-node-entry",
      nodeScriptPath: "/workspace/server/bin.mjs",
    });
  });

  it("renders explicit entries safely without any registry acquisition", () => {
    const script = buildOfficialRemoteT3RunnerScript({
      nodeEnvironmentScript: REPLACEMENT_NODE_ENVIRONMENT,
      nodeScriptPath: "/workspace/owner's server/bin.mjs",
    });

    assert.include(script, "T3_NODE_SCRIPT_PATH='/workspace/owner'\\''s server/bin.mjs'");
    assert.include(script, 'exec node "$T3_NODE_SCRIPT_PATH" "$@"');
    assert.notMatch(script, /\b(?:npm|npx|bunx|pnpm)\b/u);
  });

  it("fails with the exact no-registry instruction in a replacement host", () => {
    const result = NodeChildProcess.spawnSync("/bin/sh", ["-s", "--", "serve"], {
      input: buildOfficialRemoteT3RunnerScript({
        nodeEnvironmentScript: REPLACEMENT_NODE_ENVIRONMENT,
      }),
      encoding: "utf8",
      env: { PATH: "/nonexistent" },
    });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, `${OFFICIAL_REMOTE_T3_MISSING_MESSAGE}\n`);
  });
});
