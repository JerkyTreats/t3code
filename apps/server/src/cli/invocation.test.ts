import { assert, it } from "@effect/vitest";

import { formatCliCommand } from "./invocation.ts";

it("reuses package-runner bytes through an explicit POSIX invocation", () => {
  for (const entryPath of [
    "/workspace/.npm/_npx/abc123/node_modules/t3/dist/bin.mjs",
    "/workspace/.cache/pnpm/dlx/abc/node_modules/t3/dist/bin.mjs",
    "/workspace/.local/share/pnpm/.pnpm/dlx/abc/node_modules/t3/dist/bin.mjs",
    "/workspace/.bun/install/cache/t3@0.0.31/dist/bin.mjs",
    "/tmp/bunx-1000-t3@latest/node_modules/t3/dist/bin.mjs",
  ]) {
    const command = formatCliCommand({
      subcommand: "serve",
      executablePath: "/opt/node/bin/node",
      entryPath,
      platform: "linux",
    });
    assert.equal(command, `/opt/node/bin/node ${entryPath} serve`);
    assert.notMatch(command, /^(?:npx|bunx|pnpm\s+dlx)\s/u);
  }
});

it("quotes an explicit current executable and entry for POSIX shells", () => {
  assert.equal(
    formatCliCommand({
      subcommand: "serve",
      executablePath: "/opt/Node Runtime/bin/node",
      entryPath: "/workspace/T3 Cache/.npm/_npx/abc/node_modules/t3/dist/bin.mjs",
      platform: "darwin",
    }),
    "'/opt/Node Runtime/bin/node' '/workspace/T3 Cache/.npm/_npx/abc/node_modules/t3/dist/bin.mjs' serve",
  );
  assert.equal(
    formatCliCommand({
      subcommand: "serve",
      executablePath: "/opt/Node's Runtime/bin/node",
      entryPath: "/workspace/.npm/_npx/abc/node_modules/t3/dist/bin.mjs",
      platform: "linux",
    }),
    "'/opt/Node'\\''s Runtime/bin/node' /workspace/.npm/_npx/abc/node_modules/t3/dist/bin.mjs serve",
  );
});

it("quotes an explicit current executable and entry for PowerShell", () => {
  for (const entryPath of [
    String.raw`C:\Users\User Name\npm-cache\_npx\abc\node_modules\t3\dist\bin.mjs`,
    String.raw`C:\Users\User Name\pnpm-cache\dlx\abc\node_modules\t3\dist\bin.mjs`,
    String.raw`C:\Users\User Name\Temp\bunx-0-t3@latest\node_modules\t3\dist\bin.mjs`,
  ]) {
    assert.equal(
      formatCliCommand({
        subcommand: "serve",
        executablePath: String.raw`C:\Program Files\nodejs\node.exe`,
        entryPath,
        platform: "win32",
      }),
      `& 'C:\\Program Files\\nodejs\\node.exe' '${entryPath}' serve`,
    );
  }
  assert.equal(
    formatCliCommand({
      subcommand: "serve",
      executablePath: String.raw`C:\Node's Runtime\node.exe`,
      entryPath: String.raw`C:\Cache\_npx\abc\node_modules\t3\dist\bin.mjs`,
      platform: "win32",
    }),
    String.raw`& 'C:\Node''s Runtime\node.exe' C:\Cache\_npx\abc\node_modules\t3\dist\bin.mjs serve`,
  );
});

it("keeps installed and checkout runtimes on the authorized t3 command", () => {
  for (const entryPath of [
    "/usr/local/lib/node_modules/t3/dist/bin.mjs",
    "/workspace/t3code/apps/server/dist/bin.mjs",
    "/workspace/.t3/runtime/0.0.31/node_modules/t3/dist/bin.mjs",
    "",
  ]) {
    assert.equal(
      formatCliCommand({
        subcommand: "serve",
        executablePath: "/usr/bin/node",
        entryPath,
        platform: "linux",
      }),
      "t3 serve",
    );
  }
});

it("quotes the bounded subcommand instead of interpreting shell syntax", () => {
  assert.equal(
    formatCliCommand({
      subcommand: "serve; echo unexpected",
      executablePath: "/usr/bin/node",
      entryPath: "/workspace/.npm/_npx/abc/node_modules/t3/dist/bin.mjs",
      platform: "linux",
    }),
    "/usr/bin/node /workspace/.npm/_npx/abc/node_modules/t3/dist/bin.mjs 'serve; echo unexpected'",
  );
});
