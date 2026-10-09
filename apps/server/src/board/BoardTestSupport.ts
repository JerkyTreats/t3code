import { EventId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { BoardLive } from "../orchestration/Layers/Board.ts";
import { BoardQueryLive } from "../orchestration/Layers/BoardQuery.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { layer as OrchestrationEventStoreLive } from "../persistence/OrchestrationEventStore.ts";
import { layer as OrchestrationCommandReceiptRepositoryLive } from "../persistence/OrchestrationCommandReceipts.ts";
import { layerMemory as SqlitePersistenceMemory } from "../persistence/Sqlite.ts";

/** Synthetic current-host fixture shared by Board and authenticated transport proofs. */
export const BoardTestLayer = BoardLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      BoardQueryLive,
      ProjectionStore.layer,
      OrchestrationEventStoreLive,
      OrchestrationCommandReceiptRepositoryLive,
      NodeCrypto.layer,
    ),
  ),
  Layer.provideMerge(SqlitePersistenceMemory),
);

export const seedBoardThread = Effect.fn("seedBoardThread")(function* (
  threadId: ThreadId,
  projectId: ProjectId,
) {
  const projection = yield* ProjectionStore.ProjectionStoreV2;
  const now = yield* DateTime.now;
  const providerInstanceId = ProviderInstanceId.make("codex");
  yield* projection.apply({
    id: EventId.make(`seed:${threadId}`),
    type: "thread.created",
    threadId,
    occurredAt: now,
    payload: {
      createdBy: "user",
      creationSource: "web",
      id: threadId,
      projectId,
      title: "Synthetic Board source",
      providerInstanceId,
      modelSelection: { instanceId: providerInstanceId, model: "synthetic-model" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
  });
});
