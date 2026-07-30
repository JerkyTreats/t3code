import { describe, expect, it } from "@effect/vitest";
import {
  BearerConnectionCredential,
  BearerConnectionProfile,
  BearerConnectionRegistration,
  BearerConnectionTarget,
  RelayConnectionRegistration,
  RelayConnectionTarget,
} from "@t3tools/client-runtime/connection";
import { registerConnectionInCatalog } from "@t3tools/client-runtime/platform";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

import { CONNECTION_CATALOG_KEY, LEGACY_CONNECTIONS_KEY, make } from "./catalog-store";
import { MobileSecureStorage } from "../persistence/mobile-secure-storage";

function makeStorage(initial: Readonly<Record<string, string>>) {
  const values = new Map(Object.entries(initial));
  const deleted: Array<string> = [];
  const storage = MobileSecureStorage.of({
    getItem: (key) => Effect.sync(() => values.get(key) ?? null),
    setItem: (key, value) =>
      Effect.sync(() => {
        values.set(key, value);
      }),
    removeItem: (key) =>
      Effect.sync(() => {
        deleted.push(key);
        values.delete(key);
      }),
  });
  return { deleted, storage, values };
}

describe("mobile connection catalog storage", () => {
  it.effect("restores bearer credentials and relay targets from the current secure catalog", () =>
    Effect.gen(function* () {
      const memory = makeStorage({});
      const firstStore = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );
      const bearerEnvironmentId = EnvironmentId.make("saved-bearer");
      const relayEnvironmentId = EnvironmentId.make("saved-relay");
      const connectionId = `bearer:${bearerEnvironmentId}`;

      yield* firstStore.update((document) =>
        registerConnectionInCatalog(
          registerConnectionInCatalog(
            document,
            new BearerConnectionRegistration({
              target: new BearerConnectionTarget({
                environmentId: bearerEnvironmentId,
                label: "Saved desktop",
                connectionId,
              }),
              profile: new BearerConnectionProfile({
                connectionId,
                environmentId: bearerEnvironmentId,
                label: "Saved desktop",
                httpBaseUrl: "https://desktop.example.test",
                wsBaseUrl: "wss://desktop.example.test",
              }),
              credential: new BearerConnectionCredential({
                token: "saved-token",
              }),
            }),
          ),
          new RelayConnectionRegistration({
            target: new RelayConnectionTarget({
              environmentId: relayEnvironmentId,
              label: "Saved relay",
            }),
          }),
        ),
      );

      const restoredStore = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );
      const restored = yield* restoredStore.read;

      expect(restored.targets).toMatchObject([
        {
          _tag: "BearerConnectionTarget",
          environmentId: bearerEnvironmentId,
          connectionId,
        },
        {
          _tag: "RelayConnectionTarget",
          environmentId: relayEnvironmentId,
        },
      ]);
      expect(restored.credentials).toMatchObject([
        {
          connectionId,
          credential: {
            _tag: "BearerConnectionCredential",
            token: "saved-token",
          },
        },
      ]);
    }),
  );

  it.effect("recovers from a corrupt current catalog", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [CONNECTION_CATALOG_KEY]: "{not-json",
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toEqual([]);
      expect(memory.deleted).toEqual([CONNECTION_CATALOG_KEY]);
    }),
  );

  it.effect("replaces and removes a corrupt legacy catalog", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [LEGACY_CONNECTIONS_KEY]: JSON.stringify({ connections: [{ invalid: true }] }),
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toEqual([]);
      expect(memory.deleted).toEqual([LEGACY_CONNECTIONS_KEY]);
      expect(memory.values.has(CONNECTION_CATALOG_KEY)).toBe(true);
    }),
  );

  it.effect("falls back to valid legacy data when the current catalog is corrupt", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [CONNECTION_CATALOG_KEY]: "{not-json",
        [LEGACY_CONNECTIONS_KEY]: JSON.stringify({
          connections: [
            {
              environmentId: "legacy-environment",
              environmentLabel: "Legacy",
              pairingUrl: "https://legacy.example.test/pair",
              displayUrl: "https://legacy.example.test",
              httpBaseUrl: "https://legacy.example.test",
              wsBaseUrl: "wss://legacy.example.test",
              bearerToken: "legacy-token",
              authenticationMethod: "bearer",
            },
          ],
        }),
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toHaveLength(1);
      expect(memory.deleted).toEqual([CONNECTION_CATALOG_KEY, LEGACY_CONNECTIONS_KEY]);

      yield* catalog.update((document) => document);
      expect(memory.values.has(CONNECTION_CATALOG_KEY)).toBe(true);
      expect(memory.values.has(LEGACY_CONNECTIONS_KEY)).toBe(false);
    }),
  );
});
