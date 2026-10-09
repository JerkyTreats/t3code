import { assert, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import type { ProviderAdapterV2Shape } from "@t3tools/provider-core/server/ProviderAdapter";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";

const instanceId = ProviderInstanceId.make("codex-personal");
const driver = ProviderDriverKind.make("codex");
const adapter: ProviderAdapterV2Shape = {
  instanceId,
  driver,
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" }),
  openSession: () => Effect.die("Import admission must not open a provider"),
};
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "retired-native-admission" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    {
      databaseLayer: layerDatabase,
      runEffectWorker: false,
      retiredNativeSessions: {
        contains: (nativeDriver, nativeId) =>
          nativeDriver === "codex" && nativeId === "retired-native",
      },
    },
  ),
);

it.effect(
  "rejects retired imports before any database mutation, including alternate provider names",
  () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const sql = yield* SqlClient.SqlClient;
      for (const [providerInstance, refDriver] of [
        [instanceId, driver],
        [instanceId, ProviderDriverKind.make("codex-personal")],
        [ProviderInstanceId.make("unavailable-codex"), driver],
      ] as const) {
        const threadId = ThreadId.make(`retired-import-${providerInstance}-${refDriver}`);
        const before = yield* sql<{ changes: number }>`SELECT total_changes() AS changes`;
        const rejected = yield* orchestrator
          .dispatch({
            type: "thread.create",
            commandId: CommandId.make(`retired-import-${providerInstance}-${refDriver}`),
            threadId,
            projectId: ProjectId.make("project:retired-import"),
            title: "Retired native alias",
            modelSelection: { instanceId: providerInstance, model: "gpt-5.4" },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdBy: "user",
            creationSource: "web",
            importedNativeThread: {
              ref: { driver: refDriver, nativeId: "retired-native", strength: "strong" },
            },
          })
          .pipe(Effect.flip);
        assert.equal(rejected._tag, "OrchestratorCommandRejectedError");
        assert.deepEqual(yield* sql`SELECT total_changes() AS changes`, before);
        assert.isNull(yield* projections.getThreadShell(threadId));
      }
      for (const providerInstance of [instanceId, ProviderInstanceId.make("unavailable-codex")]) {
        const threadId = ThreadId.make(`allowed-native-import-${providerInstance}`);
        yield* orchestrator.dispatch({
          type: "thread.create",
          commandId: CommandId.make(`allowed-native-import-${providerInstance}`),
          threadId,
          projectId: ProjectId.make("project:retired-import"),
          title: "Allowed native import",
          modelSelection: { instanceId: providerInstance, model: "gpt-5.4" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdBy: "user",
          creationSource: "web",
          importedNativeThread: { ref: { driver, nativeId: "allowed-native", strength: "strong" } },
        });
        assert.equal((yield* projections.getThreadShell(threadId))?.title, "Allowed native import");
      }
    }).pipe(Effect.provide(layerTest)),
);
