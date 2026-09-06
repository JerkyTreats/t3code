import {
  type DesktopLauncherActivation,
  type DesktopLauncherActivationCompletion,
  DesktopLauncherHandoffAck,
  DesktopLauncherHandoffRequest,
  DesktopLauncherReadiness,
} from "@t3tools/contracts/desktopLauncher";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { HostProcessEnvironment, HostProcessUserId } from "@t3tools/shared/hostProcess";
import * as NodeProcess from "node:process";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/;
const BOOT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HANDOFF_MARKER_PREFIX = "--t3code-launcher-handoff=";
const PRODUCT_APP_ID = "com.t3tools.t3code";
const LAUNCHER_CONTRACT_VERSION = 1 as const;

export interface DesktopLauncherRuntimeInput {
  readonly generation: string;
  readonly readinessPath: string;
  readonly artifactSha256: string;
  readonly commitHash: string;
}

export interface DesktopLauncherHandoffPaths {
  readonly runtimeRoot: string;
  readonly requestPath: string;
  readonly ackPath: string;
}

export const DesktopLauncherProcessId = Context.Reference<number>(
  "@t3tools/desktop/app/DesktopLauncherProcessId",
  { defaultValue: () => NodeProcess.pid },
);

const HANDOFF_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function resolveDesktopLauncherHandoffPaths(
  environment: NodeJS.ProcessEnv,
): DesktopLauncherHandoffPaths | undefined {
  const runtimeDirectory = environment.XDG_RUNTIME_DIR?.trim();
  if (!runtimeDirectory?.startsWith("/")) return undefined;
  const root = `${runtimeDirectory.replace(/\/+$/, "")}/t3code-desktop`;
  return {
    runtimeRoot: root,
    requestPath: `${root}/handoff-request.json`,
    ackPath: `${root}/handoff-ack.json`,
  };
}

export function resolveDesktopLauncherRuntimeInput(
  environment: NodeJS.ProcessEnv,
): Option.Option<DesktopLauncherRuntimeInput> {
  const generation = environment.T3CODE_LAUNCH_GENERATION?.trim() ?? "";
  const readinessPath = environment.T3CODE_LAUNCH_READINESS_PATH?.trim() ?? "";
  const artifactSha256 = environment.T3CODE_LAUNCH_ARTIFACT_SHA256?.trim().toLowerCase() ?? "";
  const commitHash = environment.T3CODE_LAUNCH_COMMIT_HASH?.trim().toLowerCase() ?? "";
  if (
    generation.length === 0 ||
    readinessPath.length === 0 ||
    !SHA256_PATTERN.test(artifactSha256) ||
    !COMMIT_HASH_PATTERN.test(commitHash)
  ) {
    return Option.none();
  }
  return Option.some({
    generation,
    readinessPath,
    artifactSha256,
    commitHash,
  });
}

export function resolveDesktopLauncherHandoffGeneration(commandLine: unknown): string | undefined {
  if (!Array.isArray(commandLine)) return undefined;
  const markers = commandLine.filter(
    (argument): argument is string =>
      typeof argument === "string" && argument.startsWith(HANDOFF_MARKER_PREFIX),
  );
  const marker = markers.length === 1 ? markers[0] : undefined;
  if (!marker) return undefined;
  const generation = marker.slice(HANDOFF_MARKER_PREFIX.length);
  return generation.length > 0 && generation.length <= 128 ? generation : undefined;
}

export function parseLinuxProcessStartTicks(stat: string): number | undefined {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 0) return undefined;
  const fieldsAfterCommand = stat
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/);
  const rawStartTicks = fieldsAfterCommand[19];
  if (!rawStartTicks || !/^\d+$/.test(rawStartTicks)) return undefined;
  const startTicks = Number(rawStartTicks);
  return Number.isSafeInteger(startTicks) && startTicks > 0 ? startTicks : undefined;
}

export class DesktopLauncherRuntime extends Context.Service<
  DesktopLauncherRuntime,
  {
    readonly markBackendReady: Effect.Effect<void>;
    readonly markBackendNotReady: Effect.Effect<void>;
    readonly markRendererReady: Effect.Effect<void>;
    readonly markRendererNotReady: Effect.Effect<void>;
    readonly acceptSingleInstanceHandoff: (commandLine: unknown) => Effect.Effect<boolean>;
    readonly takeLauncherActivation?: Effect.Effect<DesktopLauncherActivation | null>;
    readonly completeLauncherActivation?: (
      completion: DesktopLauncherActivationCompletion,
    ) => Effect.Effect<boolean>;
  }
>()("@t3tools/desktop/app/DesktopLauncherRuntime") {}

export class DesktopLauncherProcessIdentityError extends Schema.TaggedErrorClass<DesktopLauncherProcessIdentityError>()(
  "DesktopLauncherProcessIdentityError",
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

const encodeReadiness = Schema.encodeEffect(Schema.fromJsonString(DesktopLauncherReadiness));
const decodeReadiness = Schema.decodeUnknownEffect(Schema.fromJsonString(DesktopLauncherReadiness));
const decodeHandoffRequest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(DesktopLauncherHandoffRequest),
  { onExcessProperty: "error" },
);
const encodeHandoffAck = Schema.encodeEffect(Schema.fromJsonString(DesktopLauncherHandoffAck));

export const layer = Layer.effect(
  DesktopLauncherRuntime,
  Effect.gen(function* () {
    const desktopEnvironment = yield* DesktopEnvironment.DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const mainProcessId = yield* DesktopLauncherProcessId;
    const hostEnvironment = yield* HostProcessEnvironment;
    const rawInput = resolveDesktopLauncherRuntimeInput(hostEnvironment);
    const handoffPaths = resolveDesktopLauncherHandoffPaths(hostEnvironment);
    const runtimeRootInfo = handoffPaths
      ? yield* fileSystem.stat(handoffPaths.runtimeRoot).pipe(Effect.option)
      : Option.none();
    const physicalRuntimeRoot = handoffPaths
      ? yield* fileSystem.realPath(handoffPaths.runtimeRoot).pipe(Effect.option)
      : Option.none<string>();
    const currentUid = yield* HostProcessUserId;
    const hasPrivateRuntimeRoot =
      handoffPaths !== undefined &&
      Option.isSome(runtimeRootInfo) &&
      runtimeRootInfo.value.type === "Directory" &&
      (runtimeRootInfo.value.mode & 0o077) === 0 &&
      currentUid !== undefined &&
      Option.contains(runtimeRootInfo.value.uid, currentUid) &&
      Option.isSome(physicalRuntimeRoot) &&
      physicalRuntimeRoot.value === handoffPaths.runtimeRoot;
    const input =
      desktopEnvironment.platform === "linux" &&
      desktopEnvironment.isPackaged &&
      !desktopEnvironment.isDevelopment &&
      handoffPaths &&
      hasPrivateRuntimeRoot &&
      Option.isSome(rawInput) &&
      rawInput.value.readinessPath === `${handoffPaths.runtimeRoot}/ready.json`
        ? rawInput
        : Option.none<DesktopLauncherRuntimeInput>();
    const backendReady = yield* Ref.make(false);
    const rendererReady = yield* Ref.make(false);
    const stateMutex = yield* Semaphore.make(1);
    const activationMutex = yield* Semaphore.make(1);

    const readProcessIdentity = (pid: number) =>
      Effect.gen(function* () {
        const bootId = (yield* fileSystem.readFileString("/proc/sys/kernel/random/boot_id"))
          .trim()
          .toLowerCase();
        const processStartTicks = parseLinuxProcessStartTicks(
          yield* fileSystem.readFileString(`/proc/${pid}/stat`),
        );
        if (!BOOT_ID_PATTERN.test(bootId) || processStartTicks === undefined) {
          return yield* new DesktopLauncherProcessIdentityError({
            reason: "Linux process identity metadata is invalid.",
          });
        }
        return { bootId, processStartTicks } as const;
      });

    const readAuthenticatedHandoffRequest = Effect.fn(
      "desktop.launcher.readAuthenticatedHandoffRequest",
    )(function* (expected?: DesktopLauncherRuntimeInput) {
      if (
        desktopEnvironment.platform !== "linux" ||
        desktopEnvironment.isDevelopment ||
        !desktopEnvironment.isPackaged ||
        !handoffPaths ||
        !hasPrivateRuntimeRoot
      ) {
        return Option.none<DesktopLauncherHandoffRequest>();
      }
      const requestInfo = yield* fileSystem.stat(handoffPaths.requestPath).pipe(Effect.option);
      const physicalRequest = yield* fileSystem
        .realPath(handoffPaths.requestPath)
        .pipe(Effect.option);
      if (
        Option.isNone(requestInfo) ||
        requestInfo.value.type !== "File" ||
        (requestInfo.value.mode & 0o777) !== 0o600 ||
        Number(requestInfo.value.size) > 96 * 1_024 ||
        currentUid === undefined ||
        !Option.contains(requestInfo.value.uid, currentUid) ||
        Option.isNone(physicalRequest) ||
        physicalRequest.value !== handoffPaths.requestPath
      ) {
        return Option.none<DesktopLauncherHandoffRequest>();
      }
      const request = yield* fileSystem
        .readFileString(handoffPaths.requestPath)
        .pipe(Effect.flatMap(decodeHandoffRequest), Effect.option);
      if (
        Option.isNone(request) ||
        request.value.productAppId !== PRODUCT_APP_ID ||
        !HANDOFF_TOKEN_PATTERN.test(request.value.token) ||
        (expected !== undefined &&
          (request.value.generation !== expected.generation ||
            request.value.artifactSha256 !== expected.artifactSha256))
      ) {
        return Option.none<DesktopLauncherHandoffRequest>();
      }
      const requesterIdentity = yield* readProcessIdentity(request.value.requesterPid).pipe(
        Effect.option,
      );
      if (
        Option.isNone(requesterIdentity) ||
        requesterIdentity.value.bootId !== request.value.requesterBootId ||
        requesterIdentity.value.processStartTicks !== request.value.requesterStartTicks
      ) {
        return Option.none<DesktopLauncherHandoffRequest>();
      }
      return request;
    });

    const startupRequest = Option.isSome(input)
      ? yield* readAuthenticatedHandoffRequest(input.value).pipe(
          Effect.catchCause(() => Effect.succeed(Option.none())),
        )
      : Option.none<DesktopLauncherHandoffRequest>();
    const pendingActivation = yield* Ref.make(
      Option.flatMap(startupRequest, (request) => Option.fromNullishOr(request.activation)),
    );
    const takenActivationId = yield* Ref.make(Option.none<string>());
    const completedActivationId = yield* Ref.make(Option.none<string>());

    const publishIfReady = Effect.gen(function* () {
      if (
        Option.isNone(input) ||
        !(yield* Ref.get(backendReady)) ||
        !(yield* Ref.get(rendererReady))
      ) {
        return;
      }
      const { bootId, processStartTicks } = yield* readProcessIdentity(mainProcessId);
      const readiness = {
        contractVersion: LAUNCHER_CONTRACT_VERSION,
        productAppId: PRODUCT_APP_ID,
        generation: input.value.generation,
        artifactSha256: input.value.artifactSha256,
        version: desktopEnvironment.appVersion,
        commitHash: input.value.commitHash,
        desktopMainPid: mainProcessId,
        bootId,
        desktopMainProcessStartTicks: processStartTicks,
        backendReady: true,
        rendererReady: true,
      } as const;
      const encoded = yield* encodeReadiness(readiness);
      const directory = path.dirname(input.value.readinessPath);
      const temporaryPath = `${input.value.readinessPath}.${mainProcessId}.tmp`;
      yield* fileSystem.makeDirectory(directory, { recursive: true });
      yield* fileSystem
        .writeFileString(temporaryPath, `${encoded}\n`)
        .pipe(
          Effect.andThen(fileSystem.chmod(temporaryPath, 0o600)),
          Effect.andThen(fileSystem.rename(temporaryPath, input.value.readinessPath)),
          Effect.ensuring(fileSystem.remove(temporaryPath, { force: true }).pipe(Effect.ignore)),
        );
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Could not publish desktop launcher readiness.").pipe(
          Effect.annotateLogs({ cause }),
        ),
      ),
      Effect.withSpan("desktop.launcher.publishIfReady"),
    );

    const withdrawCurrentGeneration = Effect.gen(function* () {
      if (Option.isNone(input)) return;
      if (!(yield* fileSystem.exists(input.value.readinessPath).pipe(Effect.orDie))) return;
      const encodedReadiness = yield* fileSystem
        .readFileString(input.value.readinessPath)
        .pipe(Effect.orDie);
      const readiness = yield* decodeReadiness(encodedReadiness).pipe(Effect.option);
      if (
        Option.isSome(readiness) &&
        readiness.value.generation === input.value.generation &&
        readiness.value.artifactSha256 === input.value.artifactSha256
      ) {
        yield* fileSystem.remove(input.value.readinessPath, { force: true }).pipe(Effect.orDie);
      }
    });

    const transition = (target: Ref.Ref<boolean>, ready: boolean) =>
      stateMutex.withPermits(1)(
        Ref.set(target, ready).pipe(
          Effect.andThen(ready ? publishIfReady : withdrawCurrentGeneration),
        ),
      );

    const acceptSingleInstanceHandoff = Effect.fn("desktop.launcher.acceptSingleInstanceHandoff")(
      function* (commandLine: unknown) {
        if (
          desktopEnvironment.platform !== "linux" ||
          desktopEnvironment.isDevelopment ||
          !desktopEnvironment.isPackaged
        ) {
          return false;
        }
        const generation = resolveDesktopLauncherHandoffGeneration(commandLine);
        if (!generation || !handoffPaths) return false;
        const request = yield* readAuthenticatedHandoffRequest(
          Option.isSome(input) ? input.value : undefined,
        );
        if (
          Option.isNone(request) ||
          request.value.generation !== generation ||
          (Option.isSome(input) && request.value.artifactSha256 !== input.value.artifactSha256)
        ) {
          return false;
        }
        const primaryIdentity = yield* readProcessIdentity(mainProcessId);
        const ack = yield* encodeHandoffAck({
          contractVersion: LAUNCHER_CONTRACT_VERSION,
          productAppId: PRODUCT_APP_ID,
          generation,
          token: request.value.token,
          primaryPid: mainProcessId,
          primaryBootId: primaryIdentity.bootId,
          primaryStartTicks: primaryIdentity.processStartTicks,
          accepted: true,
        });
        const temporaryPath = `${handoffPaths.ackPath}.${mainProcessId}.tmp`;
        yield* fileSystem
          .writeFileString(temporaryPath, `${ack}\n`)
          .pipe(
            Effect.andThen(fileSystem.chmod(temporaryPath, 0o600)),
            Effect.andThen(fileSystem.rename(temporaryPath, handoffPaths.ackPath)),
            Effect.ensuring(fileSystem.remove(temporaryPath, { force: true }).pipe(Effect.ignore)),
          );
        return true;
      },
    );

    const takeLauncherActivation = activationMutex.withPermits(1)(
      Effect.gen(function* () {
        const activation = yield* Ref.get(pendingActivation);
        if (Option.isNone(activation) || Option.isSome(yield* Ref.get(takenActivationId))) {
          return null;
        }
        yield* Ref.set(takenActivationId, Option.some(activation.value.activationId));
        return activation.value;
      }),
    );

    const completeLauncherActivation = (completion: DesktopLauncherActivationCompletion) =>
      activationMutex.withPermits(1)(
        Effect.gen(function* () {
          const completedId = yield* Ref.get(completedActivationId);
          if (Option.contains(completedId, completion.activationId)) {
            return true;
          }
          const activation = yield* Ref.get(pendingActivation);
          const takenId = yield* Ref.get(takenActivationId);
          if (
            Option.isNone(activation) ||
            Option.isNone(takenId) ||
            activation.value.activationId !== completion.activationId ||
            takenId.value !== completion.activationId
          ) {
            return false;
          }
          yield* Ref.set(pendingActivation, Option.none<DesktopLauncherActivation>());
          yield* Ref.set(takenActivationId, Option.none());
          yield* Ref.set(completedActivationId, Option.some(completion.activationId));
          return true;
        }),
      );

    yield* Effect.addFinalizer(() =>
      withdrawCurrentGeneration.pipe(Effect.catchCause(() => Effect.void)),
    );

    return DesktopLauncherRuntime.of({
      markBackendReady: transition(backendReady, true),
      markBackendNotReady: transition(backendReady, false),
      markRendererReady: transition(rendererReady, true),
      markRendererNotReady: transition(rendererReady, false),
      acceptSingleInstanceHandoff: (commandLine) =>
        acceptSingleInstanceHandoff(commandLine).pipe(
          Effect.catchCause(() => Effect.succeed(false)),
        ),
      takeLauncherActivation,
      completeLauncherActivation,
    });
  }),
);
