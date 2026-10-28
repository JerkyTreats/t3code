// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { assert, it } from "@effect/vitest";

import {
  buildTriageContext,
  buildTriageLaunchPrompt,
  buildTriageSeedPrompt,
  type TriageContextInput,
  TRIAGE_PLAYBOOK,
} from "./triagePrompt.ts";

it("stays byte-identical to .github/triage/PLAYBOOK.md", () => {
  // Older releases fetch the repository playbook.
  const canonicalPath = NodePath.join(
    import.meta.dirname,
    "../../../../.github/triage/PLAYBOOK.md",
  );
  assert.equal(TRIAGE_PLAYBOOK, NodeFS.readFileSync(canonicalPath, "utf8"));
});

it("launch prompt stays a single argv-safe line naming the prompt file", () => {
  // Windows .cmd shims cannot carry multiline argv.
  const launch = buildTriageLaunchPrompt(String.raw`C:\Users\a b\.t3\userdata\triage\x\prompt.md`);
  assert.notInclude(launch, "\n");
  assert.include(launch, String.raw`C:\Users\a b\.t3\userdata\triage\x\prompt.md`);
  assert.isBelow(launch.length, 1_000);
});

it("context file labels the CLI version as the CLI's, not the user's build", () => {
  const context = buildTriageContext({
    ...contextInput,
    entry: { kind: "cli", cliVersion: "0.0.42", launchedAs: CLI_LAUNCH },
    server: "running (pid 42, http://127.0.0.1:3773, version 0.0.43-nightly.20260923.2173)",
  });
  assert.notInclude(context, "Installed version");
  assert.notInclude(context, "Release tag");
  assert.include(context, "- Triage CLI version: 0.0.42 (");
  assert.include(context, "version 0.0.43-nightly.20260923.2173");
  assert.notInclude(context, "runs inside T3 Code");
});

it("in-app context warns the agent off its own server and claims no server clone", () => {
  const context = buildTriageContext({
    ...contextInput,
    entry: { kind: "app", client: "T3 Code Desktop version 0.1.1 on macos" },
    server: "running (pid 42, version 0.1.1); this session runs inside it",
  });
  assert.notInclude(context, "Triage CLI version");
  assert.include(context, "- Started from: T3 Code Desktop version 0.1.1 on macos (");
  assert.include(context, "## This session runs inside T3 Code");
  assert.notInclude(context, "The server cloned");
  assert.notInclude(context, "The server is cloning");
});

it("seed prompt names the context file and embeds the playbook", () => {
  for (const entry of [
    { kind: "cli", cliVersion: "0.0.42", launchedAs: CLI_LAUNCH },
    { kind: "app", client: "T3 Code Desktop" },
  ] as const) {
    const prompt = buildTriageSeedPrompt({ contextFilePath: "/tmp/triage-run/context.md", entry });
    assert.include(prompt, "/tmp/triage-run/context.md");
    assert.include(prompt, TRIAGE_PLAYBOOK);
  }
});

it("routes source and issue guidance only to exact origin", () => {
  assert.include(TRIAGE_PLAYBOOK, "https://github.com/JerkyTreats/t3code");
  assert.include(
    TRIAGE_PLAYBOOK,
    "https://raw.githubusercontent.com/JerkyTreats/t3code/main/.github/triage/PLAYBOOK.md",
  );
  assert.include(TRIAGE_PLAYBOOK, "https://github.com/JerkyTreats/t3code.git");
  assert.include(TRIAGE_PLAYBOOK, "https://github.com/JerkyTreats/t3code/issues/new");
  assert.notInclude(TRIAGE_PLAYBOOK, "pingdotgg/t3code");
  for (const entry of [
    { kind: "cli", cliVersion: "0.0.42", launchedAs: CLI_LAUNCH },
    { kind: "app", client: "T3 Code Desktop" },
  ] as const) {
    const context = buildTriageContext({ ...contextInput, entry, server: "not running" });
    assert.include(context, "- Repo: https://github.com/JerkyTreats/t3code\n");
    assert.notInclude(context, "pingdotgg/t3code");
  }
});

it("requires exact clone approval and preserves existing source caches", () => {
  assert.include(TRIAGE_PLAYBOOK, "exact source URL");
  assert.include(TRIAGE_PLAYBOOK, "exact destination path");
  assert.include(TRIAGE_PLAYBOOK, "get explicit permission for both");
  assert.include(TRIAGE_PLAYBOOK, "verifying its exact-origin identity and matching commit");
  assert.include(
    TRIAGE_PLAYBOOK,
    "Never delete, replace, or clean another source-cache entry\nautomatically.",
  );
});

it("never suggests resolving T3 from a public package runner", () => {
  assert.notMatch(TRIAGE_PLAYBOOK, /\b(?:npx|bunx|pnpm\s+dlx)\b/u);
  assert.include(
    TRIAGE_PLAYBOOK,
    "Never suggest a package\nrunner or a public-registry T3 command.",
  );
});

it("context file carries every path the playbook depends on", () => {
  const context = buildTriageContext({
    ...contextInput,
    entry: { kind: "cli", cliVersion: "0.0.33", launchedAs: CLI_LAUNCH },
    server: "running (pid 42, http://127.0.0.1:4501)",
  });
  for (const value of [
    ...Object.values(contextInput.paths),
    CLI_LAUNCH,
    "exact source and destination approval",
  ]) {
    assert.include(context, value);
  }
});

const CLI_LAUNCH = "/usr/bin/node /workspace/t3code/apps/server/dist/bin.mjs triage";

const contextInput = {
  generatedAt: "2026-09-24T00:00:00.000Z",
  os: "linux x64 (7.2.0)",
  nodeVersion: "v26.8.2",
  paths: {
    stateDir: "/home/u/.t3/userdata",
    dbPath: "/home/u/.t3/userdata/state.sqlite",
    settingsPath: "/home/u/.t3/userdata/settings.json",
    logsDir: "/home/u/.t3/userdata/logs",
    serviceLogPath: "/home/u/.t3/userdata/logs/boot-service.log",
    desktopBackendLogGlob: "/home/u/.t3/userdata/logs/server-child*.log*",
    serverTracePath: "/home/u/.t3/userdata/logs/server.trace.ndjson",
    providerEventLogPath: "/home/u/.t3/userdata/logs/provider/events.log",
    terminalLogsDir: "/home/u/.t3/userdata/logs/terminals",
    providerStatusCacheDir: "/home/u/.t3/caches",
    secretsDir: "/home/u/.t3/userdata/secrets",
    sourceCacheDir: "/home/u/.t3/source",
  },
} satisfies Omit<TriageContextInput, "entry" | "server">;
