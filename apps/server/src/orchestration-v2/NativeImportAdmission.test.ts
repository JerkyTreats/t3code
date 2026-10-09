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
    { name: "native-import-admission" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    {
      databaseLayer: layerDatabase,
      runEffectWorker: false,
    },
  ),
);

it.effect("imports native conversations with registered and unavailable provider instances", () =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    for (const providerInstance of [instanceId, ProviderInstanceId.make("unavailable-codex")]) {
      const threadId = ThreadId.make(`allowed-native-import-${providerInstance}`);
      yield* orchestrator.dispatch({
        type: "thread.create",
        commandId: CommandId.make(`allowed-native-import-${providerInstance}`),
        threadId,
        projectId: ProjectId.make("project:native-import"),
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
