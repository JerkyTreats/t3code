import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ServerConfig,
  type VcsListRefsResult,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { type ClientCacheKind, MobileDatabase } from "../persistence/mobile-database";
import { make } from "./environment-cache-store";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const encodeServerConfig = Schema.encodeSync(ServerConfig);
const REFS: VcsListRefsResult = {
  refs: [
    {
      name: "main",
      current: true,
      isDefault: true,
      worktreePath: "/repo",
    },
  ],
  isRepo: true,
  hasPrimaryRemote: true,
  repositoryIdentity: "/repo/.git",
  nextCursor: null,
  totalCount: 1,
};

function cacheId(environmentId: EnvironmentId, kind: ClientCacheKind, cacheKey: string) {
  return `${environmentId}:${kind}:${cacheKey}`;
}

function makeDatabase() {
  const values = new Map<string, string>();
  const removed: Array<string> = [];
  const database = MobileDatabase.of({
    loadCache: (environmentId, kind, cacheKey) =>
      Effect.succeed(Option.fromUndefinedOr(values.get(cacheId(environmentId, kind, cacheKey)))),
    saveCache: (environmentId, kind, cacheKey, _schemaVersion, payload) =>
      Effect.sync(() => {
        values.set(cacheId(environmentId, kind, cacheKey), payload);
      }),
    removeCache: (environmentId, kind, cacheKey) =>
      Effect.sync(() => {
        const id = cacheId(environmentId, kind, cacheKey);
        removed.push(id);
        values.delete(id);
      }),
    clearCacheKind: (environmentId, kind) =>
      Effect.sync(() => {
        for (const key of values.keys()) {
          if (key.startsWith(`${environmentId}:${kind}:`)) values.delete(key);
        }
      }),
    clearEnvironmentCache: (environmentId) =>
      Effect.sync(() => {
        for (const key of values.keys()) {
          if (key.startsWith(`${environmentId}:`)) values.delete(key);
        }
      }),
    clearAllCaches: Effect.sync(() => values.clear()),
    inspectCaches: Effect.succeed([]),
    loadPreferencesJson: Effect.succeed(Option.none()),
    savePreferencesJson: () => Effect.void,
  });
  return { database, removed, values };
}

describe("mobile SQLite environment cache store", () => {
  it.effect("defaults newer environment and provider settings when loading a legacy config", () =>
    Effect.gen(function* () {
      const memory = makeDatabase();
      const store = yield* make().pipe(Effect.provideService(MobileDatabase, memory.database));
      const encodedConfig = encodeServerConfig({
        environment: {
          environmentId: ENVIRONMENT_ID,
          label: "Legacy environment",
          platform: {
            os: "linux",
            arch: "x64",
          },
          serverVersion: "0.0.29",
          capabilities: {
            repositoryIdentity: true,
            threadSyncV2: false,
            threadSettlement: false,
          },
        },
        auth: {
          policy: "loopback-browser",
          bootstrapMethods: ["one-time-token"],
          sessionMethods: ["browser-session-cookie", "bearer-access-token"],
          sessionCookieName: "t3_session",
        },
        cwd: "/repo",
        keybindingsConfigPath: "/repo/keybindings.json",
        keybindings: [],
        issues: [],
        providers: [],
        availableEditors: [],
        observability: {
          logsDirectoryPath: "/tmp/logs",
          localTracingEnabled: false,
          otlpTracesEnabled: false,
          otlpMetricsEnabled: false,
        },
        settings: DEFAULT_SERVER_SETTINGS,
      });
      const { threadSettlement: _threadSettlement, ...legacyCapabilities } =
        encodedConfig.environment.capabilities;
      const encodedProviderSettings = encodedConfig.settings.providers;
      if (encodedProviderSettings?.codex === undefined) {
        throw new Error("Expected encoded default Codex settings.");
      }
      const { launchArgs: _launchArgs, ...legacyCodexSettings } = encodedProviderSettings.codex;
      memory.values.set(
        cacheId(ENVIRONMENT_ID, "server-config", "config"),
        JSON.stringify({
          schemaVersion: 1,
          environmentId: ENVIRONMENT_ID,
          config: {
            ...encodedConfig,
            environment: {
              ...encodedConfig.environment,
              capabilities: legacyCapabilities,
            },
            settings: {
              ...encodedConfig.settings,
              providers: {
                ...encodedProviderSettings,
                codex: legacyCodexSettings,
              },
            },
          },
        }),
      );

      const config = Option.getOrThrow(yield* store.loadServerConfig(ENVIRONMENT_ID));

      expect(config.environment.capabilities.threadSettlement).toBe(false);
      expect(config.settings.providers.codex.launchArgs).toBe("");
    }),
  );

  it.effect("decodes legacy shell rows with current settlement defaults", () =>
    Effect.gen(function* () {
      const memory = makeDatabase();
      const store = yield* make().pipe(Effect.provideService(MobileDatabase, memory.database));
      memory.values.set(
        cacheId(ENVIRONMENT_ID, "shell", "snapshot"),
        JSON.stringify({
          schemaVersion: 1,
          environmentId: ENVIRONMENT_ID,
          snapshot: {
            snapshotSequence: 4,
            projects: [],
            threads: [
              {
                id: "thread-legacy",
                projectId: "project-legacy",
                title: "Legacy thread",
                modelSelection: {
                  instanceId: "codex",
                  model: "gpt-test",
                },
                runtimeMode: "full-access",
                branch: null,
                worktreePath: null,
                latestTurn: null,
                createdAt: "2026-07-01T00:00:00.000Z",
                updatedAt: "2026-07-01T00:01:00.000Z",
                session: null,
                latestUserMessageAt: null,
                hasPendingApprovals: false,
                hasPendingUserInput: false,
                hasActionableProposedPlan: false,
              },
            ],
            updatedAt: "2026-07-01T00:01:00.000Z",
          },
        }),
      );

      const snapshot = Option.getOrThrow(yield* store.loadShell(ENVIRONMENT_ID));

      expect(snapshot.threads[0]).toMatchObject({
        interactionMode: "default",
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        activePlanProgress: null,
        latestRuntimeActivityAt: null,
        statusSummaryUpdatedAt: null,
      });
    }),
  );

  it.effect("round-trips schema-validated VCS refs", () =>
    Effect.gen(function* () {
      const memory = makeDatabase();
      const store = yield* make().pipe(Effect.provideService(MobileDatabase, memory.database));

      yield* store.saveVcsRefs(ENVIRONMENT_ID, "/repo", REFS);

      expect(yield* store.loadVcsRefs(ENVIRONMENT_ID, "/repo")).toEqual(Option.some(REFS));
      expect(Option.getOrThrow(yield* store.loadVcsRefs(ENVIRONMENT_ID, "/repo"))).toMatchObject({
        repositoryIdentity: "/repo/.git",
      });
    }),
  );

  it.effect("deletes a corrupt cache record and treats it as a miss", () =>
    Effect.gen(function* () {
      const memory = makeDatabase();
      const store = yield* make().pipe(Effect.provideService(MobileDatabase, memory.database));
      const id = cacheId(ENVIRONMENT_ID, "vcs-refs", "/repo");
      memory.values.set(id, "{not-json");

      expect(yield* store.loadVcsRefs(ENVIRONMENT_ID, "/repo")).toEqual(Option.none());
      expect(memory.removed).toEqual([id]);
    }),
  );

  it.effect("clears one environment without touching another", () =>
    Effect.gen(function* () {
      const memory = makeDatabase();
      const store = yield* make().pipe(Effect.provideService(MobileDatabase, memory.database));
      const otherEnvironmentId = EnvironmentId.make("environment-2");
      yield* store.saveVcsRefs(ENVIRONMENT_ID, "/repo", REFS);
      yield* store.saveVcsRefs(otherEnvironmentId, "/repo", REFS);

      yield* store.clear(ENVIRONMENT_ID);

      expect(yield* store.loadVcsRefs(ENVIRONMENT_ID, "/repo")).toEqual(Option.none());
      expect(yield* store.loadVcsRefs(otherEnvironmentId, "/repo")).toEqual(Option.some(REFS));
    }),
  );

  it.effect("clears every ref snapshot for only the selected environment", () =>
    Effect.gen(function* () {
      const memory = makeDatabase();
      const store = yield* make().pipe(Effect.provideService(MobileDatabase, memory.database));
      const otherEnvironmentId = EnvironmentId.make("environment-2");
      yield* store.saveVcsRefs(ENVIRONMENT_ID, "/repo-a", REFS);
      yield* store.saveVcsRefs(ENVIRONMENT_ID, "/repo-b", REFS);
      yield* store.saveVcsRefs(otherEnvironmentId, "/repo-a", REFS);

      yield* store.clearVcsRefs(ENVIRONMENT_ID);

      expect(yield* store.loadVcsRefs(ENVIRONMENT_ID, "/repo-a")).toEqual(Option.none());
      expect(yield* store.loadVcsRefs(ENVIRONMENT_ID, "/repo-b")).toEqual(Option.none());
      expect(yield* store.loadVcsRefs(otherEnvironmentId, "/repo-a")).toEqual(Option.some(REFS));
    }),
  );
});
