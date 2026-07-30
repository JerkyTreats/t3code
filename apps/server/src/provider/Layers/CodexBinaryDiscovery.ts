// @effect-diagnostics nodeBuiltinImport:off
import nodePath from "node:path";
import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import * as Duration from "effect/Duration";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import type { ServerProviderBinary } from "@t3tools/contracts";
import { resolveSpawnCommand, stripWrappingQuotes } from "@t3tools/shared/shell";
import { collectUint8StreamText } from "../../stream/collectUint8StreamText.ts";

const PROBE_TIMEOUT = 2_000;
const MAX_CANDIDATES = 32;
const MAX_PROBE_OUTPUT_BYTES = 16 * 1024;

export function collectCodexBinaryCandidates(input: {
  readonly configuredBinaryPath: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}): ReadonlyArray<Omit<ServerProviderBinary, "version">> {
  const platform = input.platform ?? process.platform;
  const path = platform === "win32" ? nodePath.win32 : nodePath.posix;
  const delimiter = platform === "win32" ? ";" : ":";
  const executables = platform === "win32" ? ["codex.exe", "codex.cmd"] : ["codex"];
  const source =
    input.environment.WSL_DISTRO_NAME || input.environment.WSL_INTEROP ? "wsl-path" : "path";
  const candidates: Array<Omit<ServerProviderBinary, "version">> = [];
  const seen = new Set<string>();
  const add = (path: string, candidateSource: ServerProviderBinary["source"]) => {
    const trimmed = path.trim();
    if (!trimmed || seen.has(trimmed) || candidates.length >= MAX_CANDIDATES) return;
    seen.add(trimmed);
    candidates.push({ path: trimmed, source: candidateSource });
  };

  const configured = input.configuredBinaryPath.trim();
  add(configured, "configured");

  const pathValue = input.environment.PATH ?? input.environment.Path ?? "";
  for (const directory of pathValue.split(delimiter)) {
    const trimmedDirectory = stripWrappingQuotes(directory.trim());
    if (!trimmedDirectory) continue;
    for (const executable of executables) {
      add(path.join(trimmedDirectory, executable), source);
    }
  }
  return candidates;
}

function parseVersion(output: string): string | undefined {
  return output.match(/\bv?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/)?.[1];
}

function collectText(stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>) {
  return collectUint8StreamText({
    stream,
    maxBytes: MAX_PROBE_OUTPUT_BYTES,
  }).pipe(
    Effect.map((collected) => collected.text),
    Effect.orElseSucceed(() => ""),
  );
}

export const discoverCodexBinaries = Effect.fn("discoverCodexBinaries")(function* (input: {
  readonly configuredBinaryPath: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const path = (input.platform ?? process.platform) === "win32" ? nodePath.win32 : nodePath.posix;
  const candidates = collectCodexBinaryCandidates(input);
  return yield* Effect.forEach(
    candidates,
    (candidate) =>
      Effect.gen(function* () {
        const requiresDirectAccessCheck =
          path.isAbsolute(candidate.path) ||
          candidate.path.includes("/") ||
          candidate.path.includes("\\");
        const executable = requiresDirectAccessCheck
          ? yield* Effect.promise(() =>
              access(candidate.path, fsConstants.X_OK).then(
                () => true,
                () => false,
              ),
            )
          : true;
        if (!executable) return Option.none<ServerProviderBinary>();
        const spawnCommand = yield* resolveSpawnCommand(candidate.path, ["--version"], {
          env: input.environment,
          extendEnv: true,
        });
        const child = yield* spawner.spawn(
          ChildProcess.make(spawnCommand.command, spawnCommand.args, {
            env: input.environment,
            extendEnv: true,
            forceKillAfter: "2 seconds",
            shell: spawnCommand.shell,
          }),
        );
        const [stdout, stderr, code] = yield* Effect.all(
          [collectText(child.stdout), collectText(child.stderr), child.exitCode],
          { concurrency: "unbounded" },
        );
        if (code !== 0) return Option.none<ServerProviderBinary>();
        const version = parseVersion(`${stdout}\n${stderr}`);
        return version
          ? Option.some({ ...candidate, version } satisfies ServerProviderBinary)
          : Option.none<ServerProviderBinary>();
      }).pipe(
        Effect.timeoutOption(Duration.millis(PROBE_TIMEOUT)),
        Effect.map(Option.flatten),
        Effect.orElseSucceed(() => Option.none()),
        Effect.scoped,
      ),
    { concurrency: 4 },
  ).pipe(Effect.map((results) => results.flatMap((result) => Option.toArray(result))));
});

export const CodexBinaryDiscoveryService = Context.Reference<typeof discoverCodexBinaries>(
  "t3/provider/CodexBinaryDiscoveryService",
  {
    defaultValue: () => discoverCodexBinaries,
  },
);
