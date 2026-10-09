import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { ServerInstallation } from "@t3tools/contracts";
import {
  HostProcessArguments,
  HostProcessEnvironment,
  HostProcessExecutablePath,
  HostProcessIsExecutable,
  HostProcessPlatform,
} from "@t3tools/shared/hostProcess";
import { isCommandAvailable } from "@t3tools/shared/shell";

export type CliRunner = "npx" | "pnpm dlx" | "bunx";

/**
 * Detect public package-runner cache entries so follow-up guidance can reuse
 * the already-running bytes without asking the runner to resolve T3 again.
 */
function detectCliRunner(entryPath: string): CliRunner | null {
  const path = entryPath.replaceAll("\\", "/");
  if (path.includes("/_npx/")) {
    return "npx";
  }
  if (
    path.includes("/pnpm/dlx/") ||
    path.includes("/.pnpm/dlx/") ||
    path.includes("/pnpm-cache/dlx/")
  ) {
    return "pnpm dlx";
  }
  if (path.includes("/.bun/install/cache/") || path.includes("/bunx-")) {
    return "bunx";
  }
  return null;
}

/** Quote one copyable argument for the host's ordinary interactive shell. */
function quoteShellWord(word: string, platform: NodeJS.Platform): string {
  const safeWord = platform === "win32" ? /^[\w./:\\@=-]+$/u : /^[\w./:@=-]+$/u;
  if (safeWord.test(word)) return word;
  return platform === "win32"
    ? `'${word.replaceAll("'", "''")}'`
    : `'${word.replaceAll("'", "'\\''")}'`;
}

function formatExplicitNodeInvocation(input: {
  readonly executablePath: string;
  readonly entryPath: string;
  readonly subcommand: string;
  readonly platform: NodeJS.Platform;
}): string {
  const executable = quoteShellWord(input.executablePath, input.platform);
  const executableCommand =
    input.platform === "win32" && executable !== input.executablePath
      ? `& ${executable}`
      : executable;
  return [
    executableCommand,
    quoteShellWord(input.entryPath, input.platform),
    quoteShellWord(input.subcommand, input.platform),
  ].join(" ");
}

const InstallManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  bin: Schema.optionalKey(Schema.Struct({ t3: Schema.String })),
  optionalDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
const decodeInstallManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(InstallManifest));

/** Prove the running package and its global bin belong together before suggesting an update. */
export const resolveServerInstallation = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const args = yield* HostProcessArguments;
  const executable = yield* HostProcessIsExecutable;
  const executablePath = yield* HostProcessExecutablePath;
  const platform = yield* HostProcessPlatform;
  const entry = yield* fs.realPath(executable ? executablePath : (args[1] ?? ""));
  const match =
    /^(.*)\/lib\/node_modules\/t3\/(?:dist\/bin\.mjs|bin\/t3\.js|node_modules\/@t3code\/t3-[^/]+\/t3)$/.exec(
      entry,
    );
  if (!match) {
    const runner = detectCliRunner(entry);
    return runner === null
      ? null
      : ({ kind: runner === "pnpm dlx" ? "pnpm-dlx" : runner } satisfies ServerInstallation);
  }
  // A global prefix can contain runner-like names; prove its ownership first.
  // Windows shims and other package managers need their own ownership proof.
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
  if (globalBin !== bin) return null;
  if (executable) {
    const nativeManifest = yield* fs
      .readFileString(path.join(path.dirname(entry), "package.json"))
      .pipe(Effect.flatMap(decodeInstallManifest));
    if (
      manifest.bin.t3 !== "./bin/t3.js" ||
      manifest.optionalDependencies?.[nativeManifest.name] !== nativeManifest.version ||
      nativeManifest.version !== manifest.version
    )
      return null;
  } else if (bin !== entry) {
    return null;
  }
  return { kind: "npm-global", prefix } satisfies ServerInstallation;
}).pipe(Effect.orElseSucceed(() => null));

/**
 * Render a follow-up command without creating a new public-registry T3
 * resolution. Installed runtimes keep the normal `t3` command. A process that
 * came from a transient package runner instead names its current executable
 * and entry script exactly, with host-shell quoting.
 */
export function formatCliCommand(input: {
  readonly subcommand: string;
  readonly executablePath: string;
  readonly entryPath: string;
  readonly platform: NodeJS.Platform;
}): string {
  if (
    detectCliRunner(input.entryPath) === null ||
    input.executablePath.length === 0 ||
    input.entryPath.length === 0
  ) {
    return `t3 ${quoteShellWord(input.subcommand, input.platform)}`;
  }
  return formatExplicitNodeInvocation(input);
}

/** `formatCliCommand` against this process's real executable and entry path. */
export const resolveCliCommand = (subcommand: string) =>
  Effect.gen(function* () {
    const processArguments = yield* HostProcessArguments;
    const platform = yield* HostProcessPlatform;
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
 * The launcher a person can type to run this install when `t3` is not on
 * PATH: the desktop app's `t3` shim, which the app and the shim itself name in
 * `T3CODE_CLI_PATH`, or a standalone binary's own path. Script installs (a
 * repo checkout) have no single launcher and keep plain `t3`.
 */
const resolveInstallLauncher = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const shim = (yield* HostProcessEnvironment).T3CODE_CLI_PATH?.trim();
  if (shim && (yield* fs.exists(shim).pipe(Effect.orElseSucceed(() => false)))) {
    return Option.some(shim);
  }
  return (yield* HostProcessIsExecutable)
    ? Option.some(yield* HostProcessExecutablePath)
    : Option.none<string>();
});

/**
 * `t3 <subcommand>` for a person to run on this host: `t3` when it is on PATH,
 * the package runner this process came from, or else the absolute path of the
 * launcher for this install, such as the one the desktop app installs.
 */
const resolveHostCliCommand = (subcommand: string) =>
  Effect.gen(function* () {
    const [first = "", ...rest] = subcommand.trim().split(/\s+/u);
    const prefix = yield* resolveCliCommand(first);
    const command = [prefix, ...rest.map(shellWord)].join(" ");
    if (prefix !== `t3 ${first}`) return { command, launcher: false };
    if (yield* isCommandAvailable("t3")) return { command, launcher: false };
    const launcher = yield* resolveInstallLauncher;
    return Option.isSome(launcher)
      ? {
          command: [shellWord(launcher.value), first, ...rest]
            .map((part, index) => (index === 0 ? part : shellWord(part)))
            .join(" "),
          launcher: true,
        }
      : { command, launcher: false };
  });

/**
 * `t3 <subcommand>` as root, for setup a person runs once on the host. `sudo`
 * resets PATH on most distributions, which drops a user-installed Node (nvm,
 * fnm, a tarball) and with it `npx` or a global `t3`, so the command carries
 * PATH through unless Node is on root's PATH too. An absolute launcher needs
 * neither.
 */
export const resolveRootCliCommand = (subcommand: string) =>
  Effect.gen(function* () {
    const { command, launcher } = yield* resolveHostCliCommand(subcommand);
    if (launcher) return `sudo ${command}`;
    const executablePath = yield* HostProcessExecutablePath;
    const systemNode = ROOT_PATH_DIRECTORIES.some((directory) =>
      executablePath.startsWith(`${directory}/`),
    );
    return systemNode ? `sudo ${command}` : `sudo env "PATH=$PATH" ${command}`;
  });

/** Debian and Ubuntu's sudo `secure_path`, minus snap. */
const ROOT_PATH_DIRECTORIES = [
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
];
