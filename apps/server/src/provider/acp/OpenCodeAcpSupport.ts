import { type OpenCodeSettings } from "@t3tools/contracts";
import { Effect, Layer, Scope } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import type * as EffectAcpErrors from "effect-acp/errors";

import {
  AcpSessionRuntime,
  type AcpSessionRuntimeOptions,
  type AcpSessionRuntimeShape,
  type AcpSpawnInput,
} from "./AcpSessionRuntime.ts";

type OpenCodeAcpRuntimeSettings = Pick<
  OpenCodeSettings,
  "binaryPath" | "serverPassword" | "serverUrl"
>;

export interface OpenCodeAcpRuntimeInput extends Omit<
  AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly openCodeSettings: OpenCodeAcpRuntimeSettings | null | undefined;
}

export interface OpenCodeAcpModelSelectionErrorContext {
  readonly cause: EffectAcpErrors.AcpError;
  readonly step: "set-model";
}

export function buildOpenCodeAcpSpawnInput(
  openCodeSettings: OpenCodeAcpRuntimeSettings | null | undefined,
  cwd: string,
): AcpSpawnInput {
  return {
    command: openCodeSettings?.binaryPath || "opencode",
    args: ["acp", "--cwd", cwd],
    cwd,
    env: {
      ...(openCodeSettings?.serverUrl ? { OPENCODE_SERVER_URL: openCodeSettings.serverUrl } : {}),
      ...(openCodeSettings?.serverPassword
        ? { OPENCODE_SERVER_PASSWORD: openCodeSettings.serverPassword }
        : {}),
    },
  };
}

export const makeOpenCodeAcpRuntime = (
  input: OpenCodeAcpRuntimeInput,
): Effect.Effect<AcpSessionRuntimeShape, EffectAcpErrors.AcpError, Scope.Scope> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildOpenCodeAcpSpawnInput(input.openCodeSettings, input.cwd),
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime).pipe(Effect.provide(acpContext));
  });

export function applyOpenCodeAcpModelSelection<E>(input: {
  readonly runtime: Pick<AcpSessionRuntimeShape, "setModel">;
  readonly model: string | null | undefined;
  readonly mapError: (context: OpenCodeAcpModelSelectionErrorContext) => E;
}): Effect.Effect<void, E> {
  const model = input.model?.trim();
  if (!model) {
    return Effect.void;
  }

  return input.runtime.setModel(model).pipe(
    Effect.mapError((cause) =>
      input.mapError({
        cause,
        step: "set-model",
      }),
    ),
  );
}
