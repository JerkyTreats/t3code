// @effect-diagnostics globalDate:off -- The injected clock uses one fixed UTC fixture timestamp.
import { assert, expect, it } from "@effect/vitest";

import {
  CODEX_CLI_VERSION,
  runServerImageSmoke,
  runServerImageSmokeWithSignals,
  SBOM_GENERATOR_IMAGE,
  SERVER_IMAGE_PLATFORM,
  ServerImageSmokeInterruptedError,
  SKOPEO_IMAGE,
  type ServerImageSmokeDependencies,
  type SmokeCommandResult,
  type SmokeCommandRunner,
  type SmokeSignalSource,
} from "./server-image-smoke.ts";

interface RecordedCommand {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly inherit: boolean;
  readonly signal?: AbortSignal;
}

const CANDIDATE_DIGEST = `sha256:${"b".repeat(64)}`;
const REVISION = "a".repeat(40);
const success = (stdout = ""): SmokeCommandResult => ({ exitCode: 0, stdout, stderr: "" });
const missing = (): SmokeCommandResult => ({ exitCode: 1, stdout: "", stderr: "missing" });

function makeRunner(
  override?: (
    command: RecordedCommand,
  ) => SmokeCommandResult | Promise<SmokeCommandResult> | undefined,
): {
  readonly commands: RecordedCommand[];
  readonly runner: SmokeCommandRunner;
} {
  const commands: RecordedCommand[] = [];
  return {
    commands,
    runner: {
      run: async (command, args, options) => {
        const recorded = {
          command,
          args: [...args],
          inherit: options.inherit === true,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        };
        commands.push(recorded);
        const overridden = override?.(recorded);
        if (overridden) return overridden;

        if (args[1] === "inspect" && !args.includes("--format")) return missing();
        if (args[0] === "run" && args.includes(SKOPEO_IMAGE) && args.includes("inspect")) {
          return success(`${CANDIDATE_DIGEST}\n`);
        }
        if (args[0] === "image" && args[1] === "inspect" && args.includes("--format")) {
          return success('"node"\n');
        }
        if (args[0] === "port") return success("127.0.0.1:49152\n");
        return success();
      },
    },
  };
}

function makeDependencies(
  commandRunner: SmokeCommandRunner,
  fetchReady: ServerImageSmokeDependencies["fetchReady"] = async () => true,
): ServerImageSmokeDependencies {
  return {
    commandRunner,
    fetchReady,
    sleep: async () => undefined,
    now: () => new Date("2026-08-16T12:34:56.000Z"),
  };
}

const smokeOptions = {
  repositoryRoot: "/workspace/project",
  resourceSuffix: "unit-test-01",
  readinessAttempts: 2,
  readinessIntervalMs: 0,
  artifactDirectory: "/tmp",
  revision: REVISION,
  buildTag: "build-unit-test-01",
} as const;

function cleanupCommands(commands: ReadonlyArray<RecordedCommand>): ReadonlyArray<string> {
  return commands
    .filter(
      (command) =>
        command.command === "docker" &&
        (command.args[0] === "rm" || command.args[0] === "volume" || command.args[0] === "image"),
    )
    .slice(-6)
    .map((command) => command.args.join(" "));
}

it("builds one attested OCI artifact, smokes that artifact, and cleans runtime resources", async () => {
  const { commands, runner } = makeRunner();

  const result = await runServerImageSmoke(smokeOptions, makeDependencies(runner));

  assert.strictEqual(result.digest, CANDIDATE_DIGEST);
  assert.strictEqual(result.created, "2026-08-16T12:34:56Z");
  const builds = commands.filter((command) => command.args[0] === "buildx");
  assert.lengthOf(builds, 1);
  const build = builds[0];
  assert.include(build?.args ?? [], SERVER_IMAGE_PLATFORM);
  assert.include(build?.args ?? [], "type=oci,dest=/tmp/t3code-server-unit-test-01.oci.tar");
  assert.include(build?.args ?? [], `type=sbom,generator=${SBOM_GENERATOR_IMAGE}`);
  assert.include(build?.args ?? [], "type=provenance,mode=max");
  assert.notInclude(build?.args ?? [], "--push");
  assert.strictEqual(build?.inherit, true);

  const artifactImport = commands.find(
    (command) =>
      command.args[0] === "run" &&
      command.args.includes(SKOPEO_IMAGE) &&
      command.args.includes("copy"),
  );
  assert.include(artifactImport?.args ?? [], "oci-archive:/candidate.oci");
  assert.include(artifactImport?.args ?? [], "docker-daemon:t3code-server-smoke:unit-test-01");

  const run = commands.find(
    (command) => command.args[0] === "run" && command.args.includes("--detach"),
  );
  assert.include(run?.args ?? [], "--read-only");
  assert.include(run?.args ?? [], "/tmp:rw,nosuid,nodev,noexec,size=64m");
  assert.include(run?.args ?? [], "type=volume,src=t3code-server-data-unit-test-01,dst=/data");
  assert.include(
    run?.args ?? [],
    "type=volume,src=t3code-server-workspace-unit-test-01,dst=/workspace",
  );

  const exec = commands.find((command) => command.args[0] === "exec");
  const validationSource = exec?.args.at(-1) ?? "";
  assert.include(validationSource, 'test "$(id -u)" -ne 0');
  assert.include(validationSource, 'test "$CODEX_HOME" = /data/codex');
  assert.include(validationSource, `codex-cli ${CODEX_CLI_VERSION}`);
  assert.include(validationSource, "test -f /data/userdata/state.sqlite");
  assert.include(validationSource, "touch /data/codex/.t3-server-image-codex-smoke");

  assert.deepStrictEqual(cleanupCommands(commands), [
    "rm --force t3code-server-smoke-unit-test-01-inspect",
    "rm --force t3code-server-smoke-unit-test-01-import",
    "rm --force t3code-server-smoke-unit-test-01",
    "volume rm --force t3code-server-workspace-unit-test-01",
    "volume rm --force t3code-server-data-unit-test-01",
    "image rm --force t3code-server-smoke:unit-test-01",
  ]);
});

it.each(["root", "root:root", "0", "00:node"])(
  "rejects configured root user %s before creating runtime resources",
  async (configuredUser) => {
    const { commands, runner } = makeRunner((command) =>
      command.args[0] === "image" &&
      command.args[1] === "inspect" &&
      command.args.includes("--format")
        ? success(`${JSON.stringify(configuredUser)}\n`)
        : undefined,
    );

    await expect(runServerImageSmoke(smokeOptions, makeDependencies(runner))).rejects.toThrow(
      "runtime user must be explicitly non-root",
    );

    assert.isFalse(
      commands.some((command) => command.args[0] === "volume" && command.args[1] === "create"),
    );
    assert.include(cleanupCommands(commands), "image rm --force t3code-server-smoke:unit-test-01");
  },
);

it("bounds readiness retries and cleans every created resource on failure", async () => {
  const { commands, runner } = makeRunner();
  let attempts = 0;

  await expect(
    runServerImageSmoke(
      smokeOptions,
      makeDependencies(runner, async () => {
        attempts += 1;
        return false;
      }),
    ),
  ).rejects.toThrow("bounded smoke window");

  assert.strictEqual(attempts, 2);
  assert.lengthOf(cleanupCommands(commands), 6);
});

it("attempts exact cleanup even when the one artifact build fails", async () => {
  const { commands, runner } = makeRunner((command) =>
    command.args[0] === "buildx"
      ? { exitCode: 17, stdout: "", stderr: "synthetic build failure" }
      : undefined,
  );

  await expect(runServerImageSmoke(smokeOptions, makeDependencies(runner))).rejects.toThrow(
    "smoke command failed",
  );

  assert.lengthOf(
    commands.filter((command) => command.args[0] === "buildx"),
    1,
  );
  assert.deepStrictEqual(cleanupCommands(commands).slice(0, 3), [
    "rm --force t3code-server-smoke-unit-test-01-inspect",
    "rm --force t3code-server-smoke-unit-test-01-import",
    "rm --force t3code-server-smoke-unit-test-01",
  ]);
});

class FakeSignalSource implements SmokeSignalSource {
  private readonly handlers = new Map<string, Set<() => void>>();

  add(signal: "SIGINT" | "SIGTERM", handler: () => void): void {
    const handlers = this.handlers.get(signal) ?? new Set();
    handlers.add(handler);
    this.handlers.set(signal, handlers);
  }

  remove(signal: "SIGINT" | "SIGTERM", handler: () => void): void {
    this.handlers.get(signal)?.delete(handler);
  }

  emit(signal: "SIGINT" | "SIGTERM"): void {
    for (const handler of this.handlers.get(signal) ?? []) handler();
  }

  listenerCount(): number {
    return [...this.handlers.values()].reduce((total, handlers) => total + handlers.size, 0);
  }
}

it.each(["SIGINT", "SIGTERM"] as const)(
  "aborts active work and completes bounded cleanup for %s",
  async (signal) => {
    let notifyBuildStarted: (() => void) | undefined;
    const buildStarted = new Promise<void>((resolve) => {
      notifyBuildStarted = resolve;
    });
    const { commands, runner } = makeRunner((command) => {
      if (command.args[0] !== "buildx") return undefined;
      notifyBuildStarted?.();
      return new Promise<SmokeCommandResult>((resolve) => {
        command.signal?.addEventListener(
          "abort",
          () => resolve({ exitCode: 143, stdout: "", stderr: "interrupted" }),
          { once: true },
        );
      });
    });
    const signalSource = new FakeSignalSource();
    const run = runServerImageSmokeWithSignals(
      smokeOptions,
      makeDependencies(runner),
      signalSource,
    );

    await buildStarted;
    signalSource.emit(signal);

    await expect(run).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ServerImageSmokeInterruptedError && error.signal === signal,
    );
    assert.lengthOf(cleanupCommands(commands), 6);
    assert.strictEqual(signalSource.listenerCount(), 0);
  },
);
