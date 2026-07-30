/**
 * Test helpers for constructing a `ProviderAdapterRegistryShape` mock from a
 * kind-keyed adapter map.
 *
 * Tests historically assembled a `registry` object with only `getByProvider`
 * + `listProviders` populated. Slice D grew the shape with `getByInstance`
 * and `listInstances`; this helper fills both in from a single kind-keyed
 * input so individual fixtures can stay concise.
 *
 * Non-default instance ids (e.g. `codex_personal`) are not addressable via
 * the shim returned here — the legacy test fixtures only ever had
 * single-instance-per-driver data anyway.
 *
 * @module provider/testUtils/providerAdapterRegistryMock
 */
import {
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";

import { ProviderUnsupportedError, type ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import type { ProviderAdapterRegistryShape } from "../Services/ProviderAdapterRegistry.ts";

export type KindAdapterMap = Partial<
  Record<ProviderDriverKind, ProviderAdapterShape<ProviderAdapterError>>
>;

export interface InstanceAdapterMockEntry {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: ProviderDriverKind;
  readonly adapter: ProviderAdapterShape<ProviderAdapterError>;
}

export const makeInstanceAdapterRegistryMock = (
  entries: ReadonlyArray<InstanceAdapterMockEntry>,
): ProviderAdapterRegistryShape => {
  const byInstanceId = new Map(entries.map((entry) => [entry.instanceId, entry]));
  const getEntry = (
    instanceId: ProviderInstanceId,
  ): Effect.Effect<InstanceAdapterMockEntry, ProviderUnsupportedError> => {
    const entry = byInstanceId.get(instanceId);
    return entry
      ? Effect.succeed(entry)
      : Effect.fail(
          new ProviderUnsupportedError({
            provider: ProviderDriverKind.make(instanceId),
          }),
        );
  };
  return {
    getByInstance: (instanceId) => getEntry(instanceId).pipe(Effect.map((entry) => entry.adapter)),
    getInstanceInfo: (instanceId) =>
      getEntry(instanceId).pipe(
        Effect.map((entry) => ({
          instanceId,
          driverKind: entry.driverKind,
          displayName: undefined,
          enabled: true,
          continuationIdentity: {
            driverKind: entry.driverKind,
            continuationKey: `${entry.driverKind}:instance:${instanceId}`,
          },
        })),
      ),
    listInstances: () => Effect.succeed(entries.map((entry) => entry.instanceId)),
    listProviders: () => Effect.succeed([...new Set(entries.map((entry) => entry.driverKind))]),
    streamChanges: Stream.empty,
    subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), (pubsub) =>
      PubSub.subscribe(pubsub),
    ),
  };
};

/**
 * Build a `ProviderAdapterRegistryShape` from a kind-keyed adapter map.
 * Every adapter present in the map is addressable via both the legacy
 * `getByProvider(kind)` path and the new `getByInstance(id)` path (where
 * `id = defaultInstanceIdForDriver(kind)`).
 */
export const makeAdapterRegistryMock = (adapters: KindAdapterMap): ProviderAdapterRegistryShape => {
  const entries: InstanceAdapterMockEntry[] = [];
  for (const [kind, adapter] of Object.entries(adapters)) {
    if (!adapter) continue;
    const driverKind = ProviderDriverKind.make(kind);
    entries.push({
      instanceId: defaultInstanceIdForDriver(driverKind),
      driverKind,
      adapter,
    });
  }
  return makeInstanceAdapterRegistryMock(entries);
};
