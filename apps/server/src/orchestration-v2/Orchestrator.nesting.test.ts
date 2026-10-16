import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  NodeId,
  type OrchestrationV2Command,
  OrchestrationV2DomainEventJson,
  OrchestrationV2ThreadShell,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "gpt-5.1-codex" };
const projectId = ProjectId.make("project:nesting");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Nesting commands never open a provider session"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const layerDatabase = SqlitePersistence.layerMemory;
const layerTest = Layer.mergeAll(
  layerDatabase,
  ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "thread-nesting" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: layerDatabase, runEffectWorker: false },
  ),
);

const createCommand = (
  threadId: ThreadId,
  options: { readonly nestedUnderThreadId?: ThreadId; readonly projectId?: ProjectId } = {},
): Extract<OrchestrationV2Command, { readonly type: "thread.create" }> => ({
  type: "thread.create",
  commandId: CommandId.make(`create:${threadId}`),
  threadId,
  projectId: options.projectId ?? projectId,
  title: `Thread ${threadId}`,
  modelSelection,
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  createdBy: "user",
  creationSource: "web",
  ...(options.nestedUnderThreadId === undefined
    ? {}
    : { nestedUnderThreadId: options.nestedUnderThreadId }),
});

/** Reads the nesting a thread carries in its projection, memory shell and SQL shell. */
const readNesting = Effect.fn("readNesting")(function* (threadId: ThreadId) {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const projection = yield* projections.getThreadProjection(threadId);
  const sqlShell = (yield* projections.getShellSnapshot()).threads.find(
    (shell) => shell.id === threadId,
  );
  assert.ok(sqlShell);
  const memoryShell = ProjectionStore.threadShellFromProjection(projection);
  assert.equal(memoryShell.nestedUnderThreadId, sqlShell.nestedUnderThreadId);
  return { thread: projection.thread, shell: sqlShell };
});

it.layer(layerTest)("thread nesting", (it) => {
  it.effect("nests a new thread under an ordinary thread and keeps lineage top-level", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const parentId = ThreadId.make("thread:nest-parent");
      const childId = ThreadId.make("thread:nest-child");
      yield* orchestrator.dispatch(createCommand(parentId));
      yield* orchestrator.dispatch(createCommand(childId, { nestedUnderThreadId: parentId }));

      const child = yield* readNesting(childId);
      assert.equal(child.thread.nestedUnderThreadId, parentId);
      assert.equal(child.shell.nestedUnderThreadId, parentId);
      assert.deepEqual(child.thread.lineage, {
        parentThreadId: null,
        relationshipToParent: null,
        rootThreadId: childId,
      });
      const parent = yield* readNesting(parentId);
      assert.notProperty(parent.thread, "nestedUnderThreadId");
      assert.notProperty(parent.shell, "nestedUnderThreadId");
    }),
  );

  it.effect("rejects every invalid nesting target", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const now = yield* DateTime.now;
      const parentId = ThreadId.make("thread:reject-parent");
      const nestedId = ThreadId.make("thread:reject-nested");
      const otherProjectId = ThreadId.make("thread:reject-other-project");
      const archivedId = ThreadId.make("thread:reject-archived");
      const subagentId = ThreadId.make("thread:reject-subagent");
      yield* orchestrator.dispatch(createCommand(parentId));
      yield* orchestrator.dispatch(createCommand(nestedId, { nestedUnderThreadId: parentId }));
      yield* orchestrator.dispatch(
        createCommand(otherProjectId, { projectId: ProjectId.make("project:nesting-other") }),
      );
      yield* orchestrator.dispatch(createCommand(archivedId));
      yield* orchestrator.dispatch({
        type: "thread.archive",
        commandId: CommandId.make("archive:reject-archived"),
        threadId: archivedId,
      });
      const parentThread = (yield* projections.getThreadProjection(parentId)).thread;
      yield* projections.apply({
        id: EventId.make("event:reject-subagent-created"),
        type: "thread.created",
        threadId: subagentId,
        occurredAt: now,
        payload: {
          ...parentThread,
          id: subagentId,
          lineage: {
            parentThreadId: parentId,
            relationshipToParent: "subagent",
            rootThreadId: parentId,
          },
          forkedFrom: { type: "node", nodeId: NodeId.make("node:reject-subagent") },
        },
      });

      const cases = [
        ["thread:reject-self", ThreadId.make("thread:reject-self"), "itself"],
        ["thread:reject-missing", ThreadId.make("thread:reject-ghost"), "does not exist"],
        ["thread:reject-cross-project", otherProjectId, "another project"],
        ["thread:reject-under-archived", archivedId, "archived"],
        ["thread:reject-under-subagent", subagentId, "subagent"],
        ["thread:reject-grandchild", nestedId, "itself nested"],
      ] as const;
      for (const [threadId, nestedUnderThreadId, reason] of cases) {
        const error = yield* orchestrator
          .dispatch(createCommand(ThreadId.make(threadId), { nestedUnderThreadId }))
          .pipe(Effect.flip);
        assert.equal(error._tag, "OrchestratorDispatchError", threadId);
        assert.include(
          error._tag === "OrchestratorDispatchError" ? String(error.cause) : "",
          reason,
          threadId,
        );
        const created = yield* projections.getThread(ThreadId.make(threadId)).pipe(Effect.option);
        assert.isTrue(created._tag === "None", threadId);
      }
    }),
  );

  it.effect("moves a nested thread back to top level idempotently", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const parentId = ThreadId.make("thread:clear-parent");
      const childId = ThreadId.make("thread:clear-child");
      yield* orchestrator.dispatch(createCommand(parentId));
      yield* orchestrator.dispatch(createCommand(childId, { nestedUnderThreadId: parentId }));

      for (const attempt of ["first", "repeat"]) {
        const { storedEvents } = yield* orchestrator.dispatch({
          type: "thread.metadata.update",
          commandId: CommandId.make(`clear:${attempt}`),
          threadId: childId,
          nestedUnderThreadId: null,
        });
        const updated = storedEvents.find(
          (stored) => stored.event.type === "thread.metadata-updated",
        )?.event;
        assert.ok(updated?.type === "thread.metadata-updated", attempt);
        assert.notProperty(updated.payload, "nestedUnderThreadId", attempt);
        const child = yield* readNesting(childId);
        assert.notProperty(child.thread, "nestedUnderThreadId", attempt);
        assert.notProperty(child.shell, "nestedUnderThreadId", attempt);
      }
    }),
  );

  it.effect("leaves children nested when their parent is archived or deleted", () =>
    Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const parentId = ThreadId.make("thread:orphan-parent");
      const childId = ThreadId.make("thread:orphan-child");
      yield* orchestrator.dispatch(createCommand(parentId));
      yield* orchestrator.dispatch(createCommand(childId, { nestedUnderThreadId: parentId }));

      yield* orchestrator.dispatch({
        type: "thread.archive",
        commandId: CommandId.make("archive:orphan-parent"),
        threadId: parentId,
      });
      assert.equal((yield* readNesting(childId)).shell.nestedUnderThreadId, parentId);
      yield* orchestrator.dispatch({
        type: "thread.delete",
        commandId: CommandId.make("delete:orphan-parent"),
        threadId: parentId,
      });
      const child = yield* readNesting(childId);
      assert.equal(child.thread.nestedUnderThreadId, parentId);
      assert.equal(child.shell.nestedUnderThreadId, parentId);
    }),
  );
});

it("decodes a nested shell under a schema that predates nesting", () => {
  const { nestedUnderThreadId: _nesting, ...preNestingFields } = OrchestrationV2ThreadShell.fields;
  const PreNestingShell = Schema.Struct(preNestingFields);
  const now = DateTime.makeUnsafe("2026-10-15T00:00:00.000Z");
  const threadId = ThreadId.make("thread:compat-shell");
  const shell = ProjectionStore.threadShellFromProjection(
    ProjectionStore.emptyProjection({
      id: EventId.make("event:compat-shell"),
      type: "thread.created",
      threadId,
      occurredAt: now,
      payload: {
        createdBy: "user",
        creationSource: "web",
        id: threadId,
        projectId,
        title: "Compat",
        providerInstanceId: instanceId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        activeProviderThreadId: null,
        lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
        nestedUnderThreadId: ThreadId.make("thread:compat-parent"),
        forkedFrom: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        lastVisitedAt: null,
        deletedAt: null,
      },
    }),
  );
  const encoded = Schema.encodeSync(OrchestrationV2ThreadShell)(shell);
  assert.equal(encoded.nestedUnderThreadId, "thread:compat-parent");
  const decoded = Schema.decodeSync(PreNestingShell)(encoded);
  assert.equal(decoded.id, threadId);
  assert.notProperty(decoded, "nestedUnderThreadId");
});

it("decodes a stored thread event written before nesting existed", () => {
  const decoded = Schema.decodeSync(OrchestrationV2DomainEventJson)({
    id: "event:pre-nesting",
    type: "thread.created",
    threadId: "thread:pre-nesting",
    occurredAt: "2026-09-01T00:00:00.000Z",
    payload: {
      createdBy: "user",
      creationSource: "web",
      id: "thread:pre-nesting",
      projectId: "project:pre-nesting",
      title: "Before nesting",
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
        rootThreadId: "thread:pre-nesting",
      },
      forkedFrom: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
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
