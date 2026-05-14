import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ServerProvider,
  type ServerProviderModel,
  type ServerProviderState,
} from "@t3tools/contracts";

export type ProviderInstanceId = ProviderKind;
export type ProviderDriverKind = ProviderKind;

export interface ProviderInstanceEntry {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly status: ServerProviderState;
  readonly isDefault: true;
  readonly isAvailable: boolean;
  readonly snapshot: ServerProvider;
  readonly models: ReadonlyArray<ServerProviderModel>;
}

export function deriveProviderInstanceEntries(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<ProviderInstanceEntry> {
  return providers.map((snapshot) => ({
    instanceId: snapshot.provider,
    driverKind: snapshot.provider,
    displayName: snapshot.displayName?.trim() || PROVIDER_DISPLAY_NAMES[snapshot.provider],
    enabled: snapshot.enabled,
    installed: snapshot.installed,
    status: snapshot.status,
    isDefault: true,
    isAvailable: true,
    snapshot,
    models: snapshot.models,
  }));
}

export function getProviderInstanceEntry(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId,
): ProviderInstanceEntry | undefined {
  return deriveProviderInstanceEntries(providers).find((entry) => entry.instanceId === instanceId);
}

export function getProviderInstanceModels(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId,
): ReadonlyArray<ServerProviderModel> {
  return getProviderInstanceEntry(providers, instanceId)?.models ?? [];
}

export function resolveSelectableProviderInstance(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: ProviderInstanceId | undefined,
): ProviderInstanceId | undefined {
  if (instanceId) {
    const requested = getProviderInstanceEntry(providers, instanceId);
    if (requested?.enabled) {
      return instanceId;
    }
  }
  return deriveProviderInstanceEntries(providers).find((entry) => entry.enabled)?.instanceId;
}

export function resolveProviderDriverKindForInstanceSelection(
  entries: ReadonlyArray<ProviderInstanceEntry>,
  selection: ProviderInstanceId | ProviderDriverKind | null | undefined,
): ProviderDriverKind | undefined {
  return entries.find((entry) => entry.instanceId === selection)?.driverKind;
}
