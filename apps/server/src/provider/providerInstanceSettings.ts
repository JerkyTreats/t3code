import {
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type ProviderKind,
  type ServerSettings,
  providerInstanceIdFromProviderKind,
  providerKindFromDriverKind,
} from "@t3tools/contracts";

type KnownProviderSettings = ServerSettings["providers"][ProviderKind];

export interface ResolvedProviderInstanceRoute {
  readonly instanceId: ProviderInstanceId;
  readonly provider: ProviderKind;
  readonly config: ProviderInstanceConfig | undefined;
  readonly isDefault: boolean;
  readonly enabled: boolean;
  readonly displayName?: string | undefined;
  readonly accentColor?: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function resolveProviderInstanceRoute(input: {
  readonly settings: ServerSettings;
  readonly provider?: ProviderKind | undefined;
  readonly instanceId?: ProviderInstanceId | undefined;
}): ResolvedProviderInstanceRoute | undefined {
  const fallbackProvider = input.provider ?? "codex";
  const fallbackInstanceId = providerInstanceIdFromProviderKind(fallbackProvider);
  const instanceId = input.instanceId ?? fallbackInstanceId;
  const instanceConfig = input.settings.providerInstances[instanceId];

  if (instanceConfig !== undefined) {
    const provider = providerKindFromDriverKind(instanceConfig.driver);
    if (provider === undefined) return undefined;
    if (input.provider !== undefined && provider !== input.provider) {
      return {
        instanceId: fallbackInstanceId,
        provider: fallbackProvider,
        config: undefined,
        isDefault: true,
        enabled: input.settings.providers[fallbackProvider].enabled,
      };
    }
    return {
      instanceId,
      provider,
      config: instanceConfig,
      isDefault: instanceId === providerInstanceIdFromProviderKind(provider),
      enabled: instanceConfig.enabled ?? input.settings.providers[provider].enabled,
      displayName: instanceConfig.displayName,
      accentColor: instanceConfig.accentColor,
    };
  }

  return {
    instanceId: fallbackInstanceId,
    provider: fallbackProvider,
    config: undefined,
    isDefault: true,
    enabled: input.settings.providers[fallbackProvider].enabled,
  };
}

export function resolveProviderSettingsForInstance<P extends ProviderKind>(input: {
  readonly settings: ServerSettings;
  readonly provider: P;
  readonly instanceId?: ProviderInstanceId | undefined;
}): ServerSettings["providers"][P] {
  const base = input.settings.providers[input.provider];
  const instanceId = input.instanceId ?? providerInstanceIdFromProviderKind(input.provider);
  const instanceConfig = input.settings.providerInstances[instanceId];
  if (
    instanceConfig === undefined ||
    providerKindFromDriverKind(instanceConfig.driver) !== input.provider
  ) {
    return base;
  }

  if (!isRecord(instanceConfig.config)) {
    return base;
  }

  return {
    ...base,
    ...instanceConfig.config,
    enabled: instanceConfig.enabled ?? base.enabled,
  } as ServerSettings["providers"][P];
}

export function defaultProviderInstanceRoutes(
  settings: ServerSettings,
): ReadonlyArray<ResolvedProviderInstanceRoute> {
  return (Object.keys(settings.providers) as Array<ProviderKind>).map((provider) => ({
    instanceId: providerInstanceIdFromProviderKind(provider),
    provider,
    config: undefined,
    isDefault: true,
    enabled: settings.providers[provider].enabled,
  }));
}

export function configuredProviderInstanceRoutes(
  settings: ServerSettings,
): ReadonlyArray<ResolvedProviderInstanceRoute> {
  return Object.entries(settings.providerInstances).flatMap(([rawInstanceId, config]) => {
    const instanceId = rawInstanceId as ProviderInstanceId;
    const provider = providerKindFromDriverKind(config.driver);
    if (provider === undefined) return [];
    return [
      {
        instanceId,
        provider,
        config,
        isDefault: instanceId === providerInstanceIdFromProviderKind(provider),
        enabled: config.enabled ?? settings.providers[provider].enabled,
        displayName: config.displayName,
        accentColor: config.accentColor,
      } satisfies ResolvedProviderInstanceRoute,
    ];
  });
}

export function mergeInstanceProviderSettings(
  base: KnownProviderSettings,
  config: ProviderInstanceConfig | undefined,
): KnownProviderSettings {
  if (!config || !isRecord(config.config)) return base;
  return {
    ...base,
    ...config.config,
    enabled: config.enabled ?? base.enabled,
  } as KnownProviderSettings;
}
