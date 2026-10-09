import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, it } from "@effect/vitest";
import {
  HostProcessArguments,
  HostProcessEnvironment,
  HostProcessExecutablePath,
  HostProcessIsExecutable,
  HostProcessPlatform,
} from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  formatCliCommand,
  resolveRootCliCommand,
  resolveServerInstallation,
} from "./invocation.ts";

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

it.layer(NodeServices.layer)("root CLI commands", (it) => {
  /** `sudo t3 browser setup` as this process would render it, with `t3` on PATH or not. */
  const rootCommand = (input: {
    readonly node: string;
    readonly entry: string;
    readonly path?: string;
    readonly env?: Record<string, string>;
    readonly executable?: boolean;
  }) =>
    resolveRootCliCommand("browser setup").pipe(
      Effect.provideService(HostProcessExecutablePath, input.node),
      Effect.provideService(HostProcessArguments, [input.node, input.entry]),
      Effect.provideService(HostProcessIsExecutable, input.executable ?? false),
      Effect.provideService(HostProcessPlatform, "linux"),
      Effect.provideService(HostProcessEnvironment, { PATH: input.path ?? "", ...input.env }),
    );

  /** A directory holding an executable `t3`, to stand in for one on PATH. */
  const pathWithT3 = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const bin = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(path.join(bin, "t3"), "#!/bin/sh\n", { mode: 0o755 });
    return bin;
  });

  it.effect("keeps a user-installed Node reachable when the command runs under sudo", () =>
    Effect.gen(function* () {
      const npx = "/home/example/.npm/_npx/abc/node_modules/t3/dist/bin.mjs";
      // sudo's secure_path already has a system Node.
      expect(yield* rootCommand({ node: "/usr/bin/node", entry: npx })).toBe(
        `sudo /usr/bin/node ${npx} browser setup`,
      );
      // nvm, fnm, and tarball installs are dropped by sudo's PATH reset.
      expect(
        yield* rootCommand({ node: "/home/example/.nvm/versions/node/v24/bin/node", entry: npx }),
      ).toBe(
        `sudo env "PATH=$PATH" /home/example/.nvm/versions/node/v24/bin/node ${npx} browser setup`,
      );
      expect(
        yield* rootCommand({
          node: "/home/example/.local/node/bin/node",
          entry: "/home/example/.local/lib/node_modules/t3/dist/bin.mjs",
          path: yield* pathWithT3,
        }),
      ).toBe('sudo env "PATH=$PATH" t3 browser setup');
    }).pipe(Effect.scoped),
  );

  it.effect("names this install's launcher when t3 is not on PATH", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const shim = path.join(home, ".local bin", "t3");
      yield* fs.makeDirectory(path.dirname(shim), { recursive: true });
      yield* fs.writeFileString(shim, "#!/bin/sh\n", { mode: 0o755 });
      const desktop = {
        node: "/tmp/.mount_T3abc/t3code",
        entry: "/tmp/.mount_T3abc/resources/app.asar/apps/server/dist/bin.mjs",
        env: { T3CODE_CLI_PATH: shim },
      };
      // The desktop app's shim, quoted for the shell and run as root as is.
      expect(yield* rootCommand(desktop)).toBe(`sudo '${shim}' browser setup`);
      // A `t3` the person put on PATH still wins.
      expect(yield* rootCommand({ ...desktop, path: yield* pathWithT3 })).toBe(
        'sudo env "PATH=$PATH" t3 browser setup',
      );
      // A standalone binary names itself.
      expect(
        yield* rootCommand({
          node: "/opt/t3/t3",
          entry: "/opt/t3/t3",
          executable: true,
        }),
      ).toBe("sudo /opt/t3/t3 browser setup");
      // A stale shim path, then no launcher at all, fall back to plain `t3`.
      expect(
        yield* rootCommand({ ...desktop, env: { T3CODE_CLI_PATH: path.join(home, "gone") } }),
      ).toBe('sudo env "PATH=$PATH" t3 browser setup');
    }).pipe(Effect.scoped),
  );
});

it.layer(NodeServices.layer)("manual server installation ownership", (it) => {
  it.effect("recognizes runner caches for both script and executable packages", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      for (const [relative, kind] of [
        ["npm/_npx/hash/node_modules/t3/dist/bin.mjs", "npx"],
        ["npm/_npx/hash/node_modules/@t3code/t3-linux-x64/t3", "npx"],
        ["pnpm/dlx/hash/node_modules/t3/dist/bin.mjs", "pnpm-dlx"],
        [".bun/install/cache/t3/dist/bin.mjs", "bunx"],
      ] as const) {
        const entry = path.join(root, relative);
        yield* fs.makeDirectory(path.dirname(entry), { recursive: true });
        yield* fs.writeFileString(entry, "");
        const installation = yield* resolveServerInstallation.pipe(
          Effect.provideService(HostProcessArguments, ["node", entry]),
          Effect.provideService(HostProcessExecutablePath, entry),
          Effect.provideService(HostProcessIsExecutable, entry.endsWith("/t3")),
        );
        expect(installation).toEqual({ kind });
      }
    }),
  );

  it.effect("requires the npm prefix's bin to point to the running package", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const prefix = path.join(root, "bunx-tools");
      const packageRoot = path.join(prefix, "lib/node_modules/t3");
      const entry = path.join(packageRoot, "dist/bin.mjs");
      const globalBin = path.join(prefix, "bin/t3");
      yield* fs.makeDirectory(path.dirname(entry), { recursive: true });
      yield* fs.makeDirectory(path.dirname(globalBin), { recursive: true });
      yield* fs.writeFileString(entry, "");
      yield* fs.writeFileString(
        path.join(packageRoot, "package.json"),
        '{"name":"t3","version":"0.0.45","bin":{"t3":"./dist/bin.mjs"}}',
      );
      const resolve = resolveServerInstallation.pipe(
        Effect.provideService(HostProcessArguments, ["node", entry]),
        Effect.provideService(HostProcessIsExecutable, false),
        Effect.provideService(HostProcessPlatform, "linux"),
      );
      expect(yield* resolve).toBeNull();
      yield* fs.symlink(entry, globalBin);
      expect(yield* resolve).toEqual({ kind: "npm-global", prefix });
      yield* fs.remove(globalBin);
      yield* fs.writeFileString(globalBin, "an unrelated t3 command");
      expect(yield* resolve).toBeNull();
      expect(yield* resolve.pipe(Effect.provideService(HostProcessPlatform, "win32"))).toBeNull();
    }),
  );

  it.effect("proves the native executable belongs to the npm launcher", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const prefix = path.join(root, "bunx-tools");
      const packageRoot = path.join(prefix, "lib/node_modules/t3");
      const launcher = path.join(packageRoot, "bin/t3.js");
      const entry = path.join(packageRoot, "node_modules/@t3code/t3-linux-x64/t3");
      yield* fs.makeDirectory(path.dirname(launcher), { recursive: true });
      yield* fs.makeDirectory(path.dirname(entry), { recursive: true });
      yield* fs.makeDirectory(path.join(prefix, "bin"));
      yield* fs.writeFileString(launcher, "");
      yield* fs.writeFileString(entry, "");
      yield* fs.writeFileString(
        path.join(packageRoot, "package.json"),
        '{"name":"t3","version":"0.0.45","bin":{"t3":"./bin/t3.js"},"optionalDependencies":{"@t3code/t3-linux-x64":"0.0.45"}}',
      );
      yield* fs.symlink(launcher, path.join(prefix, "bin/t3"));
      const resolve = resolveServerInstallation.pipe(
        Effect.provideService(HostProcessExecutablePath, entry),
        Effect.provideService(HostProcessIsExecutable, true),
        Effect.provideService(HostProcessPlatform, "linux"),
      );
      for (const [version, expected] of [
        ["0.0.44", null],
        ["0.0.45", { kind: "npm-global", prefix }],
      ]) {
        yield* fs.writeFileString(
          path.join(path.dirname(entry), "package.json"),
          `{"name":"@t3code/t3-linux-x64","version":"${version}"}`,
        );
        expect(yield* resolve).toEqual(expected);
      }
    }),
  );

  it.effect("leaves local, standalone, missing and unreadable installs unknown", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      for (const relative of [
        "project/node_modules/t3/dist/bin.mjs",
        "project/apps/server/dist/bin.mjs",
        ".t3/runtime/0.0.45/t3",
        "missing/dist/bin.mjs",
      ]) {
        const entry = path.join(root, relative);
        if (!relative.startsWith("missing")) {
          yield* fs.makeDirectory(path.dirname(entry), { recursive: true });
          yield* fs.writeFileString(entry, "");
        }
        expect(
          yield* resolveServerInstallation.pipe(
            Effect.provideService(HostProcessArguments, ["node", entry]),
            Effect.provideService(HostProcessIsExecutable, false),
          ),
        ).toBeNull();
      }
    }),
  );
});
