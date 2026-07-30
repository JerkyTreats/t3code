// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, assert, describe, it } from "@effect/vitest";

import {
  assertContainedPath,
  DESKTOP_ARTIFACT_SMOKE_MARKERS,
  DesktopArtifactSmokeCleanupError,
  makeIsolatedDesktopEnvironment,
  parseDesktopArtifactSmokeArgs,
  runDesktopArtifactSmoke,
  validateAppImagePath,
  waitForCapturedProcessGroupsToExit,
} from "./desktop-artifact-smoke.ts";

const temporaryDirectories: string[] = [];
const SETSID_PATH = "/usr/bin/setsid";
const DESKTOP_ARTIFACT_SMOKE_SCRIPT_PATH = fileURLToPath(
  new URL("./desktop-artifact-smoke.ts", import.meta.url),
);

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "desktop-artifact-smoke-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeExecutable(path: string, source: string): void {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function makeFakeAppImage(appRunSource: string, extractionSource = ""): string {
  const directory = makeTemporaryDirectory();
  const appImagePath = join(directory, "T3-Code-9.9.9-x64.AppImage");
  writeExecutable(
    appImagePath,
    `#!/bin/sh
set -eu
if [ "\${1:-}" != "--appimage-extract" ]; then
  exit 64
fi
mkdir -p squashfs-root
${extractionSource}
cat > squashfs-root/AppRun <<'APP_RUN'
${appRunSource}
APP_RUN
chmod 755 squashfs-root/AppRun
`,
  );
  return appImagePath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("desktop-artifact-smoke", () => {
  it("parses an AppImage path and bounded timeout options", () => {
    assert.deepEqual(
      parseDesktopArtifactSmokeArgs([
        "--appimage",
        "/tmp/example.AppImage",
        "--startup-timeout-ms",
        "5000",
        "--shutdown-timeout-ms",
        "1000",
        "--keep-temp",
      ]),
      {
        appImagePath: "/tmp/example.AppImage",
        startupTimeoutMs: 5000,
        shutdownTimeoutMs: 1000,
        keepTemporaryDirectory: true,
      },
    );
  });

  it("rejects invalid timeout and argument combinations", () => {
    assert.throws(
      () => parseDesktopArtifactSmokeArgs(["example.AppImage", "--startup-timeout-ms", "0"]),
      /positive integer/,
    );
    assert.throws(
      () => parseDesktopArtifactSmokeArgs(["first.AppImage", "second.AppImage"]),
      /Only one AppImage/,
    );
    assert.throws(() => parseDesktopArtifactSmokeArgs([]), /AppImage path is required/);
  });

  it("validates executable AppImage files and path containment", () => {
    const directory = makeTemporaryDirectory();
    const appImagePath = join(directory, "example.AppImage");
    const childDirectory = join(directory, "child");
    writeExecutable(appImagePath, "#!/bin/sh\nexit 0\n");
    mkdirSync(childDirectory);

    assert.equal(validateAppImagePath(appImagePath), appImagePath);
    assert.equal(assertContainedPath(directory, childDirectory), childDirectory);
    assert.throws(() => assertContainedPath(directory, directory), /contained below/);
  });

  it("removes hostile inherited runtime and credential variables", () => {
    const temporaryRoot = makeTemporaryDirectory();
    const environment = makeIsolatedDesktopEnvironment(temporaryRoot, {
      PATH: "/usr/bin",
      T3CODE_PORT: "3773",
      T3CODE_HOST: "0.0.0.0",
      T3CODE_RELAY_URL: "https://relay.example.invalid",
      RELAY_URL_SECRET: "secret",
      CLERK_SECRET_KEY: "secret",
      OPENAI_API_KEY: "secret",
      GITHUB_TOKEN: "secret",
      T3CODE_OTLP_TRACES_URL: "https://telemetry.example.invalid",
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://telemetry.example.invalid",
      NODE_OPTIONS: "--require=/tmp/injected.cjs",
      HTTPS_PROXY: "https://proxy.example.invalid",
    });

    assert.equal(environment.PATH, "/usr/bin:/bin");
    assert.equal(environment.T3CODE_PORT, undefined);
    assert.equal(environment.T3CODE_HOST, undefined);
    assert.equal(environment.T3CODE_RELAY_URL, undefined);
    assert.equal(environment.RELAY_URL_SECRET, undefined);
    assert.equal(environment.CLERK_SECRET_KEY, undefined);
    assert.equal(environment.OPENAI_API_KEY, undefined);
    assert.equal(environment.GITHUB_TOKEN, undefined);
    assert.equal(environment.T3CODE_OTLP_TRACES_URL, undefined);
    assert.equal(environment.OTEL_EXPORTER_OTLP_ENDPOINT, undefined);
    assert.equal(environment.NODE_OPTIONS, undefined);
    assert.equal(environment.HTTPS_PROXY, undefined);
    assert.equal(environment.T3CODE_NO_BROWSER, "1");
    assert.equal(environment.T3CODE_DISABLE_AUTO_UPDATE, "1");
    assert.equal(environment.T3CODE_TELEMETRY_ENABLED, "0");
    assert.equal(environment.T3CODE_HOME, join(temporaryRoot, "t3-home"));
  });

  it("waits until every captured process group exits", async () => {
    let currentTime = 0;
    let existenceChecks = 0;
    await waitForCapturedProcessGroupsToExit(new Set([1234]), 100, {
      groupExists: () => {
        existenceChecks += 1;
        return currentTime < 50;
      },
      now: () => currentTime,
      sleep: async (durationMs) => {
        currentTime += durationMs;
      },
    });

    assert.equal(currentTime, 50);
    assert.equal(existenceChecks, 3);
  });

  it("fails closed when a captured process group survives the cleanup bound", async () => {
    let currentTime = 0;
    let failure: unknown;
    try {
      await waitForCapturedProcessGroupsToExit(new Set([5678]), 50, {
        groupExists: () => true,
        now: () => currentTime,
        sleep: async (durationMs) => {
          currentTime += durationMs;
        },
      });
    } catch (cause) {
      failure = cause;
    }

    assert.instanceOf(failure, Error);
    assert.match(failure.message, /process groups survived cleanup: 5678/);
    assert.equal(currentTime, 50);
  });

  it("retains temporary files when cleanup failure follows output overflow", async () => {
    const supervisorPath = join(makeTemporaryDirectory(), "failing-supervisor.py");
    writeFileSync(
      supervisorPath,
      `import os
import sys
os.write(3, b"cleanup-failed\\n")
sys.stdout.write("x" * ${2 * 1024 * 1024 + 1})
sys.exit(125)
`,
    );
    const appImagePath = makeFakeAppImage("#!/bin/sh\nexit 0\n");

    let failure: unknown;
    try {
      await runDesktopArtifactSmoke(
        {
          appImagePath,
          startupTimeoutMs: 1_000,
          shutdownTimeoutMs: 1_000,
        },
        { processSupervisorPath: supervisorPath },
      );
    } catch (cause) {
      failure = cause;
    }

    assert.instanceOf(failure, DesktopArtifactSmokeCleanupError);
    assert.isTrue(existsSync(failure.temporaryRoot));
    temporaryDirectories.push(failure.temporaryRoot);
  });

  it("retains temporary files after an unmarked process supervisor crash", async () => {
    const supervisorPath = join(makeTemporaryDirectory(), "crashing-supervisor.py");
    writeFileSync(supervisorPath, "import sys\nsys.exit(125)\n");
    const appImagePath = makeFakeAppImage("#!/bin/sh\nexit 0\n");

    let failure: unknown;
    try {
      await runDesktopArtifactSmoke(
        {
          appImagePath,
          startupTimeoutMs: 1_000,
          shutdownTimeoutMs: 1_000,
        },
        { processSupervisorPath: supervisorPath },
      );
    } catch (cause) {
      failure = cause;
    }

    assert.instanceOf(failure, DesktopArtifactSmokeCleanupError);
    assert.isTrue(existsSync(failure.temporaryRoot));
    temporaryDirectories.push(failure.temporaryRoot);
  });

  it("does not retain the event loop for the full shutdown bound", () => {
    const appImagePath = makeFakeAppImage(`#!/bin/sh
trap 'exit 0' TERM INT
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.backendListening}'
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.rendererReady}'
while true; do sleep 1; done
`);
    const startedAt = process.hrtime.bigint();

    execFileSync(
      process.execPath,
      [
        DESKTOP_ARTIFACT_SMOKE_SCRIPT_PATH,
        appImagePath,
        "--startup-timeout-ms",
        "2000",
        "--shutdown-timeout-ms",
        "5000",
      ],
      {
        encoding: "utf8",
        timeout: 3_500,
      },
    );

    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    assert.isBelow(elapsedMs, 3_000);
  });

  it("extracts and launches an AppImage until both readiness markers appear", async () => {
    const appImagePath = makeFakeAppImage(`#!/bin/sh
trap 'exit 0' TERM INT
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.backendListening}'
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.rendererReady}'
while true; do sleep 1; done
`);

    const result = await runDesktopArtifactSmoke({
      appImagePath,
      startupTimeoutMs: 5_000,
      shutdownTimeoutMs: 2_000,
    });

    assert.include(result.output, DESKTOP_ARTIFACT_SMOKE_MARKERS.backendListening);
    assert.include(result.output, DESKTOP_ARTIFACT_SMOKE_MARKERS.rendererReady);
  });

  it("isolates extraction from inherited credentials", async () => {
    const previousToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "must-not-reach-extraction";
    try {
      const appImagePath = makeFakeAppImage(
        `#!/bin/sh
trap 'exit 0' TERM INT
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.backendListening}'
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.rendererReady}'
while true; do sleep 1; done
`,
        `if [ -n "\${GITHUB_TOKEN:-}" ]; then
  echo "extraction inherited GITHUB_TOKEN" >&2
  exit 86
fi`,
      );

      await runDesktopArtifactSmoke({
        appImagePath,
        startupTimeoutMs: 5_000,
        shutdownTimeoutMs: 2_000,
      });
    } finally {
      if (previousToken === undefined) {
        delete process.env.GITHUB_TOKEN;
      } else {
        process.env.GITHUB_TOKEN = previousToken;
      }
    }
  });

  it("fails when the packaged entry exits before renderer readiness", async () => {
    const appImagePath = makeFakeAppImage(`#!/bin/sh
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.backendListening}'
exit 7
`);

    let failure: unknown;
    try {
      await runDesktopArtifactSmoke({
        appImagePath,
        startupTimeoutMs: 5_000,
        shutdownTimeoutMs: 2_000,
      });
    } catch (cause) {
      failure = cause;
    }

    assert.instanceOf(failure, Error);
    assert.match(failure.message, /exit code 7|renderer-ready|renderer ready|required markers/);
  });

  it("rejects readiness markers emitted in reverse order", async () => {
    const appImagePath = makeFakeAppImage(`#!/bin/sh
trap 'exit 0' TERM INT
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.rendererReady}'
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.backendListening}'
while true; do sleep 1; done
`);

    let failure: unknown;
    try {
      await runDesktopArtifactSmoke({
        appImagePath,
        startupTimeoutMs: 1_000,
        shutdownTimeoutMs: 1_000,
      });
    } catch (cause) {
      failure = cause;
    }

    assert.instanceOf(failure, Error);
    assert.match(failure.message, /did not emit required markers/);
  });

  it("rejects generic readiness text that does not use machine markers", async () => {
    const appImagePath = makeFakeAppImage(`#!/bin/sh
echo 'backend ready'
echo 'renderer ready'
exit 0
`);

    let failure: unknown;
    try {
      await runDesktopArtifactSmoke({
        appImagePath,
        startupTimeoutMs: 1_000,
        shutdownTimeoutMs: 1_000,
      });
    } catch (cause) {
      failure = cause;
    }

    assert.instanceOf(failure, Error);
    assert.match(failure.message, /exited before required markers/);
  });

  const descendantCleanupTest = existsSync(SETSID_PATH) ? it : it.skip;

  descendantCleanupTest(
    "terminates an independently grouped packaged descendant before removing temporary files",
    async () => {
      const appImagePath = makeFakeAppImage(`#!/bin/sh
trap 'exit 0' TERM INT
${SETSID_PATH} /bin/sleep 60 &
descendant_pid=$!
echo "descendant=$descendant_pid"
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.backendListening}'
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.rendererReady}'
while true; do sleep 1; done
`);

      const result = await runDesktopArtifactSmoke({
        appImagePath,
        startupTimeoutMs: 5_000,
        shutdownTimeoutMs: 2_000,
      });
      const descendantMatch = /descendant=(\d+)/u.exec(result.output);
      assert.ok(descendantMatch);
      const descendantPid = Number(descendantMatch[1]);

      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          process.kill(descendantPid, 0);
        } catch (cause) {
          assert.equal((cause as NodeJS.ErrnoException).code, "ESRCH");
          return;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      }

      assert.fail(`Packaged descendant ${descendantPid} survived process-group cleanup.`);
    },
  );

  descendantCleanupTest(
    "captures a detached child when its packaged parent exits immediately",
    async () => {
      const descendantPidPath = join(makeTemporaryDirectory(), "fast-descendant.pid");
      const appImagePath = makeFakeAppImage(`#!/bin/sh
${SETSID_PATH} /bin/sleep 60 &
printf '%s' "$!" > '${descendantPidPath}'
exit 0
`);

      let failure: unknown;
      try {
        await runDesktopArtifactSmoke({
          appImagePath,
          startupTimeoutMs: 5_000,
          shutdownTimeoutMs: 2_000,
        });
      } catch (cause) {
        failure = cause;
      }
      assert.instanceOf(failure, Error);
      assert.match(failure.message, /exited before required markers/);

      const descendantPid = Number(readFileSync(descendantPidPath, "utf8"));
      assert.ok(Number.isSafeInteger(descendantPid));
      let processLookupFailure: unknown;
      try {
        process.kill(descendantPid, 0);
      } catch (cause) {
        processLookupFailure = cause;
      }
      assert.equal((processLookupFailure as NodeJS.ErrnoException).code, "ESRCH");
    },
  );

  descendantCleanupTest(
    "drains adopted children while a packaged descendant creates detached sessions",
    async () => {
      const descendantPidPath = join(makeTemporaryDirectory(), "racing-descendants.pid");
      const appImagePath = makeFakeAppImage(`#!/bin/sh
trap 'exit 0' TERM INT
(
  while true; do
    ${SETSID_PATH} /bin/sleep 60 &
    printf '%s\\n' "$!" >> '${descendantPidPath}'
    /bin/sleep 0.01
  done
) &
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.backendListening}'
echo '${DESKTOP_ARTIFACT_SMOKE_MARKERS.rendererReady}'
while true; do /bin/sleep 1; done
`);

      await runDesktopArtifactSmoke({
        appImagePath,
        startupTimeoutMs: 5_000,
        shutdownTimeoutMs: 2_000,
      });

      const descendantPids = readFileSync(descendantPidPath, "utf8").trim().split("\n").map(Number);
      assert.isAbove(descendantPids.length, 0);
      for (const descendantPid of descendantPids) {
        let processLookupFailure: unknown;
        try {
          process.kill(descendantPid, 0);
        } catch (cause) {
          processLookupFailure = cause;
        }
        assert.equal((processLookupFailure as NodeJS.ErrnoException).code, "ESRCH");
      }
    },
  );
});
