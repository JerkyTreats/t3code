import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { ServerInstallation } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { isCommandAvailable } from "@t3tools/shared/shell";
import { detectCliRunner, formatCliCommand } from "./officialRuntimeInvocation.ts";

const InstallManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  bin: Schema.optionalKey(Schema.Struct({ t3: Schema.String })),
});
const decodeInstallManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(InstallManifest));

/**
 * The script this CLI was started through: the Node entry script of a build
 * run from source, or a standalone executable's own path.
 */
const resolveEntryPath = Effect.gen(function* () {
  if (yield* HostProcess.IsExecutable) return yield* HostProcess.ExecutablePath;
  return (yield* HostProcess.Arguments)[1] ?? "";
});

export const resolveServerInstallation = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* HostProcess.Platform;
  const entry = yield* fs.realPath(yield* resolveEntryPath);
  const match = /^(.*)\/lib\/node_modules\/t3\/(?:dist\/bin\.mjs|bin\/t3\.mjs)$/.exec(entry);
  if (!match) {
    const runner = detectCliRunner(entry);
    return runner === null
      ? null
      : ({ kind: runner === "pnpm dlx" ? "pnpm-dlx" : runner } satisfies ServerInstallation);
  }
  if (platform === "win32") return null;
  const prefix = match[1] || "/";
  if (
    prefix.includes("/node_modules/") ||
    /\/(?:Cellar|Caskroom)\//i.test(prefix) ||
    /\/mise\/installs\/(?!node\/)[^/]+\//.test(prefix)
  )
    return null;

  const packageRoot = path.join(prefix, "lib/node_modules/t3");
  const manifest = yield* fs
    .readFileString(path.join(packageRoot, "package.json"))
    .pipe(Effect.flatMap(decodeInstallManifest));
  if (manifest.name !== "t3" || !manifest.bin) return null;
  const bin = yield* fs.realPath(path.join(packageRoot, manifest.bin.t3));
  const globalBin = yield* fs.realPath(path.join(prefix, "bin/t3"));
  if (globalBin !== bin || bin !== entry) return null;
  return { kind: "npm-global", prefix } satisfies ServerInstallation;
}).pipe(Effect.orElseSucceed(() => null));

/** `formatCliCommand` against this process's real executable and entry path. */
export const resolveCliCommand = Effect.fn("invocation.resolveCliCommand")(function* (
  subcommand: string,
) {
  const processArguments = yield* HostProcess.Arguments;
  const platform = yield* HostProcess.Platform;
  return formatCliCommand({
    subcommand,
    executablePath: processArguments[0] ?? "",
    entryPath: processArguments[1] ?? "",
    platform,
  });
});

/** Quotes `value` for a POSIX shell when it needs it. */
const shellWord = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;

/**
 * Quotes `value` for PowerShell, the default Windows terminal. Always quoted,
 * so a path reads the same whether or not it holds a space. Inside double
 * quotes `"` and its typographic forms (which also end the string) double,
 * and `$` and the backtick are escaped so nothing expands.
 */
const powershellWord = (value: string) =>
  `"${value
    .replaceAll("`", "``")
    .replaceAll("$", "`$")
    .replace(/["\u201C\u201D\u201E]/g, "$&$&")}"`;

/** Quotes a word for the host's shell: POSIX, or PowerShell on Windows. */
const hostShellWord = (platform: NodeJS.Platform, value: string) =>
  platform === "win32" ? powershellWord(value) : shellWord(value);

/**
 * The launcher a person can type to run this install when `t3` is not on
 * PATH: the desktop app's `t3` shim, which the app and the shim itself name in
 * `T3CODE_CLI_PATH`, or a standalone binary's own path. Script installs (a
 * repo checkout) have no single launcher and keep plain `t3`.
 */
const resolveInstallLauncher = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const shim = (yield* HostProcess.Environment).T3CODE_CLI_PATH?.trim();
  if (shim && (yield* fs.exists(shim).pipe(Effect.orElseSucceed(() => false)))) {
    return Option.some(shim);
  }
  return (yield* HostProcess.IsExecutable)
    ? Option.some(yield* HostProcess.ExecutablePath)
    : Option.none<string>();
});

/**
 * `t3 <subcommand> <args>` for a person to run on this host: `t3` when it is
 * on PATH, the current executable and entry, or else the absolute path of the
 * launcher for this install, such as the one the desktop app installs. `args`
 * are quoted for the host's shell: POSIX, or PowerShell on Windows.
 */
export const resolveHostCliCommand = Effect.fn("invocation.resolveHostCliCommand")(function* (
  subcommand: string,
  args: ReadonlyArray<string> = [],
) {
  const platform = yield* HostProcess.Platform;
  const [first = "", ...rest] = subcommand.trim().split(/\s+/u);
  const withArgs = (prefix: string) =>
    [prefix, ...[...rest, ...args].map((arg) => hostShellWord(platform, arg))].join(" ");
  const command = yield* resolveCliCommand(first);
  if (command !== `t3 ${first}`) return { command: withArgs(command), launcher: false };
  if (yield* isCommandAvailable("t3")) return { command: withArgs(command), launcher: false };
  const launcher = yield* resolveInstallLauncher;
  if (Option.isNone(launcher)) return { command: withArgs(command), launcher: false };
  // PowerShell runs a quoted path only through the call operator.
  const quoted = hostShellWord(platform, launcher.value);
  const call = platform === "win32" ? `& ${quoted}` : quoted;
  return { command: withArgs(`${call} ${first}`), launcher: true };
});

/**
 * `sudo` resets PATH on most distributions, which drops a user-installed Node
 * (nvm, fnm, a tarball) and with it `npx` or a global `t3`, so the command
 * carries PATH through unless Node is on root's PATH too. An absolute launcher
 * needs neither.
 */
export const resolveRootCliCommand = Effect.fn("invocation.resolveRootCliCommand")(function* (
  subcommand: string,
) {
  const { command, launcher } = yield* resolveHostCliCommand(subcommand);
  if (launcher) return `sudo ${command}`;
  const executablePath = yield* HostProcess.ExecutablePath;
  const systemNode = ROOT_PATH_DIRECTORIES.some((directory) =>
    executablePath.startsWith(`${directory}/`),
  );
  return systemNode ? `sudo ${command}` : `sudo env "PATH=$PATH" ${command}`;
});

const ROOT_PATH_DIRECTORIES = [
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
];
