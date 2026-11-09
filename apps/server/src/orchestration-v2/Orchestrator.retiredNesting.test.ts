import { assert, it } from "@effect/vitest";
import {
  OrchestrationV2Command,
  OrchestrationV2DomainEventJson,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

// Retired fork F31 stored `nestedUnderThreadId` on thread events, projections and commands.
// Those records must keep decoding, and every such thread lists at top level.

const instanceId = ProviderInstanceId.make("codex");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("These commands never open a provider session"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "retired-thread-nesting" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false },
  ),
);

const decodeDomainEventJson = Schema.decodeUnknownSync(OrchestrationV2DomainEventJson);
const decodeCommand = Schema.decodeUnknownSync(OrchestrationV2Command);

it("decodes a stored thread.created event that carries the retired nesting field", () => {
  const decoded = decodeDomainEventJson({
    id: "event:retired-nesting",
    type: "thread.created",
    threadId: "thread:retired-nesting",
    occurredAt: "2026-10-20T00:00:00.000Z",
    payload: {
      createdBy: "user",
      creationSource: "web",
      id: "thread:retired-nesting",
      projectId: "project:retired-nesting",
      title: "Nested before retirement",
      providerInstanceId: "codex",
      modelSelection: { instanceId: "codex", model: "gpt-5.1-codex" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: {
        parentThreadId: null,
        relationshipToParent: null,
        rootThreadId: "thread:retired-nesting",
      },
      nestedUnderThreadId: "thread:retired-nesting-parent",
      forkedFrom: null,
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-20T00:00:00.000Z",
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
  });
  assert.equal(decoded.type, "thread.created");
  if (decoded.type !== "thread.created") return;
  assert.notProperty(decoded.payload, "nestedUnderThreadId");
  assert.notProperty(
    ProjectionStore.threadShellFromProjection(ProjectionStore.emptyProjection(decoded)),
    "nestedUnderThreadId",
  );
});

it.layer(layerTest)("retired thread nesting", (it) => {
  it.effect(
    "reads a stored nested thread at top level and accepts commands from older clients",
    () =>
      Effect.gen(function* () {
        const orchestrator = yield* Orchestrator.OrchestratorV2;
        const projections = yield* ProjectionStore.ProjectionStoreV2;
        const sql = yield* SqlClient.SqlClient;
        const parentId = ThreadId.make("thread:retired-parent");
        const childId = ThreadId.make("thread:retired-child");
        const create = (threadId: ThreadId, extra: object = {}) =>
          decodeCommand({
            type: "thread.create",
            commandId: `create:${threadId}`,
            threadId,
            projectId: "project:retired-nesting",
            title: `Thread ${threadId}`,
            modelSelection: { instanceId, model: "gpt-5.1-codex" },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdBy: "user",
            creationSource: "web",
            ...extra,
          });

        yield* orchestrator.dispatch(create(parentId));
        // An older client may still ask to nest; the field is dropped and the thread is top-level.
        const nestedCreate = create(childId, { nestedUnderThreadId: parentId });
        assert.notProperty(nestedCreate, "nestedUnderThreadId");
        yield* orchestrator.dispatch(nestedCreate);
        // A projection row written while nesting existed still carries the key.
        yield* sql`UPDATE orchestration_v2_projection_threads
        SET payload_json = json_set(payload_json, '$.nestedUnderThreadId', ${parentId})
        WHERE thread_id = ${childId}`;

        const readChild = Effect.gen(function* () {
          const projection = yield* projections.getThreadProjection(childId);
          const shell = (yield* projections.getShellSnapshot()).threads.find(
            (entry) => entry.id === childId,
          );
          assert.ok(shell);
          assert.notProperty(projection.thread, "nestedUnderThreadId");
          assert.notProperty(shell, "nestedUnderThreadId");
          assert.notProperty(
            ProjectionStore.threadShellFromProjection(projection),
            "nestedUnderThreadId",
          );
        });
        yield* readChild;

        // An older client's "Move to top level" still decodes and applies as an empty update.
        const clear = decodeCommand({
          type: "thread.metadata.update",
          commandId: "clear:retired-child",
          threadId: childId,
          nestedUnderThreadId: null,
        });
        assert.notProperty(clear, "nestedUnderThreadId");
        yield* orchestrator.dispatch(clear);
        yield* readChild;
      }),
  );
});
