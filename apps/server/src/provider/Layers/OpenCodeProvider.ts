import type {
  ModelCapabilities,
  OpenCodeSettings,
  ServerProvider,
  ServerProviderModel,
  ServerSettingsError,
} from "@t3tools/contracts";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { Effect, Equal, Layer, Option, Result, Stream } from "effect";

import { ServerSettingsService } from "../../serverSettings.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import { OpenCodeProvider } from "../Services/OpenCodeProvider.ts";
import {
  buildServerProvider,
  detailFromResult,
  isCommandMissingCause,
  nonEmptyTrimmed,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
} from "../providerSnapshot.ts";

const PROVIDER = "opencode" as const;
const OPEN_CODE_REFRESH_INTERVAL = "15 minutes";
const OPEN_CODE_MODELS_TIMEOUT = "8 seconds";
const EMPTY_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  contextWindowOptions: [],
  promptInjectedEffortLevels: [],
};

const OPEN_CODE_FALLBACK_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "openai/gpt-5",
    name: "openai/gpt-5",
    shortName: "gpt-5",
    subProvider: "openai",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
] as const;

function stripBenignOpenCodeProbeStderr(stderr: string): string {
  return stderr
    .split("\n")
    .filter((line) => !line.trimStart().match(/^mise\s+/i))
    .join("\n");
}

function detailFromOpenCodeVersionProbe(
  result: { readonly stdout: string; readonly stderr: string; readonly code: number },
  version: string | null,
): string | undefined {
  if (result.code !== 0) {
    return detailFromResult(result);
  }

  const filteredStderr = nonEmptyTrimmed(stripBenignOpenCodeProbeStderr(result.stderr));
  if (filteredStderr) {
    return filteredStderr;
  }

  if (version) {
    return undefined;
  }

  return detailFromResult({
    ...result,
    stderr: "",
  });
}

function buildInitialOpenCodeProviderSnapshot(settings: OpenCodeSettings): ServerProvider {
  const checkedAt = new Date().toISOString();
  const models = providerModelsFromSettings(
    OPEN_CODE_FALLBACK_MODELS,
    PROVIDER,
    settings.customModels,
    EMPTY_CAPABILITIES,
  );

  if (!settings.enabled) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: false,
      checkedAt,
      models,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "OpenCode is disabled in T3 Code settings.",
      },
    });
  }

  return buildServerProvider({
    provider: PROVIDER,
    enabled: true,
    checkedAt,
    models,
    probe: {
      installed: true,
      version: null,
      status: "warning",
      auth: { status: "unknown" },
      message: "Checking OpenCode availability...",
    },
  });
}

const runOpenCodeCommand = Effect.fn("runOpenCodeCommand")(function* (
  settings: OpenCodeSettings,
  args: ReadonlyArray<string>,
) {
  const command = ChildProcess.make(settings.binaryPath, [...args], {
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...(settings.serverUrl ? { OPENCODE_SERVER_URL: settings.serverUrl } : {}),
      ...(settings.serverPassword ? { OPENCODE_SERVER_PASSWORD: settings.serverPassword } : {}),
    },
  });
  return yield* spawnAndCollect(settings.binaryPath, command);
});

function buildOpenCodeModel(slug: string): ServerProviderModel | undefined {
  const trimmed = slug.trim();
  if (!trimmed) {
    return undefined;
  }

  const [subProvider, ...rest] = trimmed.split("/");
  const shortName = rest.join("/").trim();

  return {
    slug: trimmed,
    name: trimmed,
    ...(shortName ? { shortName } : {}),
    ...(shortName ? { subProvider } : {}),
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  };
}

function parseOpenCodeModelsOutput(stdout: string): ReadonlyArray<ServerProviderModel> {
  const seen = new Set<string>();
  const models: ServerProviderModel[] = [];

  for (const line of stdout.split("\n")) {
    const model = buildOpenCodeModel(line);
    if (!model || seen.has(model.slug)) {
      continue;
    }
    seen.add(model.slug);
    models.push(model);
  }

  return models;
}

export const checkOpenCodeProviderStatus = Effect.fn("checkOpenCodeProviderStatus")(
  function* (): Effect.fn.Return<
    ServerProvider,
    ServerSettingsError,
    ChildProcessSpawner.ChildProcessSpawner | ServerSettingsService
  > {
    const serverSettings = yield* ServerSettingsService;
    const openCodeSettings = yield* serverSettings.getSettings.pipe(
      Effect.map((settings) => settings.providers.opencode),
    );
    const checkedAt = new Date().toISOString();
    const models = providerModelsFromSettings(
      OPEN_CODE_FALLBACK_MODELS,
      PROVIDER,
      openCodeSettings.customModels,
      EMPTY_CAPABILITIES,
    );

    if (!openCodeSettings.enabled) {
      return buildServerProvider({
        provider: PROVIDER,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "OpenCode is disabled in T3 Code settings.",
        },
      });
    }

    const versionProbe = yield* runOpenCodeCommand(openCodeSettings, ["--version"]).pipe(
      Effect.timeoutOption("4 seconds"),
      Effect.result,
    );

    if (Result.isFailure(versionProbe)) {
      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models,
        probe: {
          installed: !isCommandMissingCause(versionProbe.failure),
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: isCommandMissingCause(versionProbe.failure)
            ? "OpenCode CLI is not installed or not on PATH."
            : `Failed to execute OpenCode health check: ${versionProbe.failure instanceof Error ? versionProbe.failure.message : String(versionProbe.failure)}.`,
        },
      });
    }

    if (Option.isNone(versionProbe.success)) {
      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models,
        probe: {
          installed: true,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "OpenCode health check timed out.",
        },
      });
    }

    const versionResult = versionProbe.success.value;
    const version =
      parseGenericCliVersion(versionResult.stdout) ?? parseGenericCliVersion(versionResult.stderr);
    const detail = detailFromOpenCodeVersionProbe(versionResult, version);
    const discoveredModels =
      versionResult.code === 0
        ? yield* runOpenCodeCommand(openCodeSettings, ["models"]).pipe(
            Effect.timeoutOption(OPEN_CODE_MODELS_TIMEOUT),
            Effect.result,
            Effect.map((modelsProbe) => {
              if (Result.isFailure(modelsProbe) || Option.isNone(modelsProbe.success)) {
                return OPEN_CODE_FALLBACK_MODELS;
              }

              const result = modelsProbe.success.value;
              if (result.code !== 0) {
                return OPEN_CODE_FALLBACK_MODELS;
              }

              const parsedModels = parseOpenCodeModelsOutput(result.stdout);
              return parsedModels.length > 0 ? parsedModels : OPEN_CODE_FALLBACK_MODELS;
            }),
          )
        : OPEN_CODE_FALLBACK_MODELS;

    return buildServerProvider({
      provider: PROVIDER,
      enabled: true,
      checkedAt,
      models: providerModelsFromSettings(
        discoveredModels,
        PROVIDER,
        openCodeSettings.customModels,
        EMPTY_CAPABILITIES,
      ),
      probe: {
        installed: versionResult.code === 0,
        version,
        status: versionResult.code === 0 ? "ready" : "warning",
        auth: { status: "unknown" },
        ...(detail ? { message: detail } : {}),
      },
    });
  },
);

export const OpenCodeProviderLive = Layer.effect(
  OpenCodeProvider,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const checkProvider = checkOpenCodeProviderStatus().pipe(
      Effect.provideService(ServerSettingsService, serverSettings),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    return yield* makeManagedServerProvider<OpenCodeSettings>({
      getSettings: serverSettings.getSettings.pipe(
        Effect.map((settings) => settings.providers.opencode),
        Effect.orDie,
      ),
      streamSettings: serverSettings.streamChanges.pipe(
        Stream.map((settings) => settings.providers.opencode),
      ),
      haveSettingsChanged: (previous, next) => !Equal.equals(previous, next),
      initialSnapshot: buildInitialOpenCodeProviderSnapshot,
      checkProvider,
      refreshInterval: OPEN_CODE_REFRESH_INTERVAL,
    });
  }),
);
