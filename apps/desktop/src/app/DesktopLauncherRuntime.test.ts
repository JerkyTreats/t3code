import { HostProcessEnvironment } from "@t3tools/shared/hostProcess";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DesktopLauncherHandoffAck,
  DesktopLauncherHandoffRequest,
  DesktopLauncherReadiness,
} from "@t3tools/contracts/desktopLauncher";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as DesktopConfig from "./DesktopConfig.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopLauncherRuntime from "./DesktopLauncherRuntime.ts";

const SHA256 = "a".repeat(64);
const COMMIT = "1234567890ab";
const encodeReadiness = Schema.encodeEffect(Schema.fromJsonString(DesktopLauncherReadiness));
const encodeHandoffRequest = Schema.encodeEffect(
  Schema.fromJsonString(DesktopLauncherHandoffRequest),
);

describe("DesktopLauncherRuntime", () => {
  it("parses process start ticks after command names containing spaces and parentheses", () => {
    const fields = ["S", ...Array.from({ length: 18 }, () => "1"), "987654", "1"];
    assert.equal(
      DesktopLauncherRuntime.parseLinuxProcessStartTicks(
        `42 (T3 Code ) worker) ${fields.join(" ")}`,
      ),
      987654,
    );
    assert.isUndefined(DesktopLauncherRuntime.parseLinuxProcessStartTicks("invalid"));
  });

  it("requires complete validated launcher metadata", () => {
    assert.isTrue(
      Option.isSome(
        DesktopLauncherRuntime.resolveDesktopLauncherRuntimeInput({
          T3CODE_LAUNCH_GENERATION: "generation-1",
          T3CODE_LAUNCH_READINESS_PATH: "/run/user/1000/t3code/ready.json",
          T3CODE_LAUNCH_ARTIFACT_SHA256: SHA256,
          T3CODE_LAUNCH_COMMIT_HASH: COMMIT,
        }),
      ),
    );
    assert.equal(
      DesktopLauncherRuntime.resolveDesktopLauncherHandoffGeneration([
        "/managed/T3-Code.AppImage",
        "--t3code-launcher-handoff=generation-1",
      ]),
      "generation-1",
    );
    assert.isUndefined(
      DesktopLauncherRuntime.resolveDesktopLauncherHandoffGeneration([
        "--t3code-launcher-handoff=generation-1",
        "--t3code-launcher-handoff=generation-2",
      ]),
    );
    assert.isTrue(
      Option.isNone(
        DesktopLauncherRuntime.resolveDesktopLauncherRuntimeInput({
          T3CODE_LAUNCH_GENERATION: "generation-1",
          T3CODE_LAUNCH_READINESS_PATH: "/tmp/ready.json",
          T3CODE_LAUNCH_ARTIFACT_SHA256: "not-a-hash",
          T3CODE_LAUNCH_COMMIT_HASH: COMMIT,
        }),
      ),
    );
  });

  for (const channel of ["production", "staging"] as const) {
    it.effect(`${channel} publishes only after backend and renderer readiness match`, () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-launcher-runtime-" });
        const runtimeRoot = `${root}/t3code-desktop${channel === "staging" ? "-staging" : ""}`;
        const readinessPath = `${runtimeRoot}/ready.json`;
        yield* fileSystem.makeDirectory(runtimeRoot, { recursive: true });
        yield* fileSystem.chmod(runtimeRoot, 0o700);
        const hostEnvironment = {
          XDG_RUNTIME_DIR: root,
          T3CODE_DESKTOP_CHANNEL: channel,
          T3CODE_LAUNCH_GENERATION: "generation-2",
          T3CODE_LAUNCH_READINESS_PATH: readinessPath,
          T3CODE_LAUNCH_ARTIFACT_SHA256: SHA256,
          T3CODE_LAUNCH_COMMIT_HASH: COMMIT,
        };
        {
          const bootId = (yield* fileSystem.readFileString(
            "/proc/sys/kernel/random/boot_id",
          )).trim();
          const requesterStartTicks = DesktopLauncherRuntime.parseLinuxProcessStartTicks(
            yield* fileSystem.readFileString(`/proc/${process.pid}/stat`),
          );
          if (requesterStartTicks === undefined) {
            return yield* Effect.die("requester process identity was unavailable");
          }
          const activation = {
            activationId: "12345678-1234-4234-8234-1234567890ab",
            contractVersion: 1,
            workspace: "/home/example/exact-workspace",
            action: "submit",
            prompt: "private prompt sentinel",
          } as const;
          const requestPath = `${runtimeRoot}/handoff-request.json`;
          const handoffRequest = {
            contractVersion: 1,
            productAppId: "com.t3tools.t3code",
            generation: "generation-2",
            token: "d".repeat(64),
            artifactSha256: SHA256,
            requesterPid: process.pid,
            requesterBootId: bootId,
            requesterStartTicks,
            activation,
          } as const;
          yield* fileSystem.writeFileString(
            requestPath,
            yield* encodeHandoffRequest({ ...handoffRequest, artifactSha256: "b".repeat(64) }),
          );
          yield* fileSystem.chmod(requestPath, 0o600);
          const environmentLayer = DesktopEnvironment.layer({
            dirname: "/repo/apps/desktop/dist-electron",
            homeDirectory: root,
            platform: "linux",
            processArch: "x64",
            appVersion: "1.2.3",
            appPath: "/repo",
            isPackaged: true,
            resourcesPath: "/repo/resources",
            runningUnderArm64Translation: false,
          }).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({}))));
          const runtimeLayer = DesktopLauncherRuntime.layer.pipe(
            Layer.provide(Layer.succeed(HostProcessEnvironment, hostEnvironment)),
            Layer.provideMerge(environmentLayer),
            Layer.provideMerge(NodeServices.layer),
          );
          const mismatchedArtifactRuntime =
            yield* DesktopLauncherRuntime.DesktopLauncherRuntime.pipe(Effect.provide(runtimeLayer));
          assert.isNull(yield* mismatchedArtifactRuntime.takeLauncherActivation!);
          yield* fileSystem.writeFileString(
            requestPath,
            yield* encodeHandoffRequest(handoffRequest),
          );
          yield* fileSystem.chmod(requestPath, 0o600);
          const runtime = yield* DesktopLauncherRuntime.DesktopLauncherRuntime.pipe(
            Effect.provide(runtimeLayer),
          );
          assert.deepEqual(yield* runtime.takeLauncherActivation!, activation);
          assert.isNull(yield* runtime.takeLauncherActivation!);
          assert.isFalse(
            yield* runtime.completeLauncherActivation!({
              activationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            }),
          );
          assert.isTrue(
            yield* runtime.completeLauncherActivation!({ activationId: activation.activationId }),
          );
          assert.isTrue(
            yield* runtime.completeLauncherActivation!({ activationId: activation.activationId }),
          );
          assert.isNull(yield* runtime.takeLauncherActivation!);
          yield* fileSystem.chmod(requestPath, 0o644);
          const publicFileRuntime = yield* DesktopLauncherRuntime.DesktopLauncherRuntime.pipe(
            Effect.provide(runtimeLayer),
          );
          assert.isNull(yield* publicFileRuntime.takeLauncherActivation!);
          yield* runtime.markRendererReady;
          assert.isFalse(yield* fileSystem.exists(readinessPath));
          yield* runtime.markBackendReady;
          assert.isTrue(yield* fileSystem.exists(readinessPath));
          yield* runtime.markRendererNotReady;
          assert.isFalse(yield* fileSystem.exists(readinessPath));
          yield* runtime.markRendererReady;
          assert.isTrue(yield* fileSystem.exists(readinessPath));
          const readiness = yield* fileSystem
            .readFileString(readinessPath)
            .pipe(
              Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(DesktopLauncherReadiness))),
            );
          assert.equal(readiness.generation, "generation-2");
          assert.equal(readiness.artifactSha256, SHA256);
          assert.match(readiness.bootId, /^[0-9a-f-]{36}$/);
          assert.equal(readiness.desktopMainPid, process.pid);
          assert.isAbove(readiness.desktopMainProcessStartTicks, 0);
          assert.isTrue(readiness.backendReady);
          assert.isTrue(readiness.rendererReady);
          yield* runtime.markBackendNotReady;
          assert.isFalse(yield* fileSystem.exists(readinessPath));
          yield* runtime.markBackendReady;
          assert.isTrue(yield* fileSystem.exists(readinessPath));
          yield* fileSystem.writeFileString(
            readinessPath,
            yield* encodeReadiness({ ...readiness, generation: "newer-generation" }),
          );
          yield* runtime.markRendererNotReady;
          assert.isTrue(yield* fileSystem.exists(readinessPath));
        }
      }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
    );
  }

  it("rejects unknown channels without using production handoff state", () => {
    assert.isUndefined(
      DesktopLauncherRuntime.resolveDesktopLauncherHandoffPaths({
        XDG_RUNTIME_DIR: "/run/user/1000",
        T3CODE_DESKTOP_CHANNEL: "preview",
      }),
    );
  });

  it.effect("authenticates an unmanaged primary handoff and publishes process identity", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-handoff-runtime-" });
      const runtimeRoot = `${root}/t3code-desktop`;
      const requestPath = `${runtimeRoot}/handoff-request.json`;
      const ackPath = `${runtimeRoot}/handoff-ack.json`;
      yield* fileSystem.makeDirectory(runtimeRoot, { recursive: true });
      yield* fileSystem.chmod(runtimeRoot, 0o700);
      const hostEnvironment = { XDG_RUNTIME_DIR: root };
      {
        const bootId = (yield* fileSystem.readFileString("/proc/sys/kernel/random/boot_id")).trim();
        const requesterStartTicks = DesktopLauncherRuntime.parseLinuxProcessStartTicks(
          yield* fileSystem.readFileString(`/proc/${process.pid}/stat`),
        );
        if (requesterStartTicks === undefined) {
          return yield* Effect.die("requester process identity was unavailable");
        }
        const request = {
          contractVersion: 1,
          productAppId: "com.t3tools.t3code",
          generation: "handoff-generation",
          token: "d".repeat(64),
          artifactSha256: SHA256,
          requesterPid: process.pid,
          requesterBootId: bootId,
          requesterStartTicks,
        } as const;
        yield* fileSystem.writeFileString(requestPath, yield* encodeHandoffRequest(request));
        yield* fileSystem.chmod(requestPath, 0o600);
        const environmentLayer = DesktopEnvironment.layer({
          dirname: "/repo/apps/desktop/dist-electron",
          homeDirectory: root,
          platform: "linux",
          processArch: "x64",
          appVersion: "1.2.3",
          appPath: "/repo",
          isPackaged: true,
          resourcesPath: "/repo/resources",
          runningUnderArm64Translation: false,
        }).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest({}))));
        const runtime = yield* DesktopLauncherRuntime.DesktopLauncherRuntime.pipe(
          Effect.provide(
            DesktopLauncherRuntime.layer.pipe(
              Layer.provide(Layer.succeed(HostProcessEnvironment, hostEnvironment)),
              Layer.provideMerge(environmentLayer),
              Layer.provideMerge(NodeServices.layer),
            ),
          ),
        );
        assert.isTrue(
          yield* runtime.acceptSingleInstanceHandoff([
            "/managed/T3-Code.AppImage",
            `--t3code-launcher-handoff=${request.generation}`,
          ]),
        );
        const ack = yield* fileSystem
          .readFileString(ackPath)
          .pipe(
            Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(DesktopLauncherHandoffAck))),
          );
        assert.equal(ack.primaryPid, process.pid);
        assert.equal(ack.token, request.token);
        assert.equal((yield* fileSystem.stat(ackPath)).mode & 0o777, 0o600);
        assert.isFalse(
          yield* runtime.acceptSingleInstanceHandoff([
            "/managed/T3-Code.AppImage",
            "--t3code-launcher-handoff=wrong-generation",
          ]),
        );
      }
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );
});
