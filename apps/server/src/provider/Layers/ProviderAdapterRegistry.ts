/**
 * ProviderAdapterRegistryLive - In-memory provider adapter lookup layer.
 *
 * Binds provider kinds (codex/claudeAgent/...) to concrete adapter services.
 * This layer only performs adapter lookup; it does not route session-scoped
 * calls or own provider lifecycle workflows.
 *
 * @module ProviderAdapterRegistryLive
 */
import { Effect, Layer, Option, Schema } from "effect";
import {
  providerDriverKindFromProviderKind,
  providerInstanceIdFromProviderKind,
  ProviderKind,
} from "@t3tools/contracts";

import { ProviderUnsupportedError, type ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import {
  ProviderAdapterRegistry,
  type ProviderAdapterRegistryShape,
} from "../Services/ProviderAdapterRegistry.ts";
import { ClaudeAdapter } from "../Services/ClaudeAdapter.ts";
import { CodexAdapter } from "../Services/CodexAdapter.ts";
import { CursorAdapter } from "../Services/CursorAdapter.ts";
import { OpenCodeAdapter } from "../Services/OpenCodeAdapter.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import {
  configuredProviderInstanceRoutes,
  defaultProviderInstanceRoutes,
  resolveProviderInstanceRoute,
} from "../providerInstanceSettings.ts";

export interface ProviderAdapterRegistryLiveOptions {
  readonly adapters?: ReadonlyArray<ProviderAdapterShape<ProviderAdapterError>>;
}

const makeProviderAdapterRegistry = Effect.fn("makeProviderAdapterRegistry")(function* (
  options?: ProviderAdapterRegistryLiveOptions,
) {
  const cursorAdapterOption = yield* Effect.serviceOption(CursorAdapter);
  const openCodeAdapterOption = yield* Effect.serviceOption(OpenCodeAdapter);
  const adapters =
    options?.adapters !== undefined
      ? options.adapters
      : [
          yield* CodexAdapter,
          yield* ClaudeAdapter,
          ...(cursorAdapterOption._tag === "Some" ? [cursorAdapterOption.value] : []),
          ...(openCodeAdapterOption._tag === "Some" ? [openCodeAdapterOption.value] : []),
        ];
  const byProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  const serverSettingsOption = yield* Effect.serviceOption(ServerSettingsService);

  const getByProvider: ProviderAdapterRegistryShape["getByProvider"] = (provider) => {
    const adapter = byProvider.get(provider);
    if (!adapter) {
      return Effect.fail(new ProviderUnsupportedError({ provider }));
    }
    return Effect.succeed(adapter);
  };

  const getInstanceInfo: ProviderAdapterRegistryShape["getInstanceInfo"] = (instanceId) =>
    Effect.gen(function* () {
      const serverSettings = Option.getOrUndefined(serverSettingsOption);
      if (!serverSettings) {
        const provider = Schema.is(ProviderKind)(instanceId) ? instanceId : undefined;
        if (!provider || !byProvider.has(provider)) {
          return yield* new ProviderUnsupportedError({ provider: instanceId });
        }
        return {
          instanceId,
          driverKind: providerDriverKindFromProviderKind(provider),
          provider,
          enabled: true,
        };
      }

      const settings = yield* serverSettings.getSettings.pipe(
        Effect.mapError((cause) => new ProviderUnsupportedError({ provider: instanceId, cause })),
      );
      const route = resolveProviderInstanceRoute({ settings, instanceId });
      if (!route) {
        return yield* new ProviderUnsupportedError({ provider: instanceId });
      }
      return {
        instanceId: route.instanceId,
        driverKind: providerDriverKindFromProviderKind(route.provider),
        provider: route.provider,
        displayName: route.displayName,
        accentColor: route.accentColor,
        enabled: route.enabled,
      };
    });

  const getByInstance: ProviderAdapterRegistryShape["getByInstance"] = (instanceId) =>
    getInstanceInfo!(instanceId).pipe(Effect.flatMap((info) => getByProvider(info.provider)));

  const listProviders: ProviderAdapterRegistryShape["listProviders"] = () =>
    Effect.sync(() => Array.from(byProvider.keys()));

  const listInstances: ProviderAdapterRegistryShape["listInstances"] = () =>
    Effect.gen(function* () {
      const serverSettings = Option.getOrUndefined(serverSettingsOption);
      if (!serverSettings) {
        return Array.from(byProvider.keys()).map(providerInstanceIdFromProviderKind);
      }
      const settings = yield* serverSettings.getSettings;
      return [
        ...defaultProviderInstanceRoutes(settings),
        ...configuredProviderInstanceRoutes(settings),
      ]
        .filter((route) => byProvider.has(route.provider))
        .map((route) => route.instanceId);
    }).pipe(
      Effect.orElseSucceed(() =>
        Array.from(byProvider.keys()).map(providerInstanceIdFromProviderKind),
      ),
    );

  return {
    getByProvider,
    getByInstance,
    getInstanceInfo,
    listProviders,
    listInstances,
  } satisfies ProviderAdapterRegistryShape;
});

export const ProviderAdapterRegistryLive = Layer.effect(
  ProviderAdapterRegistry,
  makeProviderAdapterRegistry(),
);
