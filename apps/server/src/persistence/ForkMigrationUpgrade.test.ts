// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderItemId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { OrchestrationEventStoreLive } from "./Layers/OrchestrationEventStore.ts";
import { ProjectionProjectRepositoryLive } from "./Layers/ProjectionProjects.ts";
import { ProjectionThreadMessageRepositoryLive } from "./Layers/ProjectionThreadMessages.ts";
import { ProjectionThreadRepositoryLive } from "./Layers/ProjectionThreads.ts";
import { makeSqlitePersistenceLive } from "./Layers/Sqlite.ts";
import { runMigrations } from "./Migrations.ts";
import {
  forkMigrationStates,
  prepareForkMigrationState,
  prepareReleasedForkMigration41State,
} from "./Migrations/fixtures/AuthLineageFixtures.ts";
import { OrchestrationEventStore } from "./Services/OrchestrationEventStore.ts";
import { ProjectionProjectRepository } from "./Services/ProjectionProjects.ts";
import { ProjectionThreadMessageRepository } from "./Services/ProjectionThreadMessages.ts";
import { ProjectionThreadRepository } from "./Services/ProjectionThreads.ts";

const retiredHistoricalNames = [
  [46, "CollectiveResidentRuntime"],
  [47, "CollectiveResidentTurnSettlements"],
  [48, "CollectiveWeeklyQuotaObservations"],
  [49, "CollectiveFanoutRuns"],
] as const;

const historicalNames = new Map([
  [31, "RepairProjectionThreadShellSummary"],
  [32, "ProjectionThreadIssueLink"],
  [33, "AuthAuthorizationScopes"],
  [34, "AuthPairingProofKeyThumbprint"],
  [35, "ProjectionThreadStatusSummary"],
  [36, "ReconcileV0028MigrationHistories"],
  [37, "ProjectionThreadRuntimeSummary"],
  [38, "ProjectionThreadProposedPlanPagingIndex"],
  [39, "ProjectionThreadsSettled"],
  [40, "SettingsAdminClients"],
]);

const projectId = ProjectId.make("synthetic-upgrade-project");
const threadId = ThreadId.make("synthetic-upgrade-thread");
const messageId = MessageId.make("synthetic-upgrade-message");
const eventId = EventId.make("synthetic-upgrade-event");
const commandId = CommandId.make("synthetic-upgrade-command");
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5.6-sol",
};
const attachment = {
  type: "file" as const,
  id: "synthetic-attachment",
  name: "migration-proof.txt",
  mimeType: "text/plain",
  sizeBytes: 57,
};
const eventMetadata = {
  providerTurnId: "synthetic-provider-turn",
  providerItemId: ProviderItemId.make("synthetic-provider-item"),
  adapterKey: "codex",
  ingestedAt: "2026-07-01T00:00:02.000Z",
  historyImport: true,
  origin: {
    surface: "desktop" as const,
    appVersion: "0.0.38",
  },
};

const recordRetiredHistoricalNames = Effect.fn("recordRetiredHistoricalNames")(function* () {
  const sql = yield* SqlClient.SqlClient;
  for (const [migrationId, name] of retiredHistoricalNames) {
    yield* sql`
      INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (${migrationId}, ${name})
    `;
  }
});

const prepareAcceptedFork51 = Effect.fn("prepareAcceptedFork51")(function* () {
  yield* prepareReleasedForkMigration41State();
  yield* runMigrations({ toMigrationInclusive: 45 });
  yield* recordRetiredHistoricalNames();
  yield* runMigrations({ toMigrationInclusive: 51 });
});

const preservedFixtureRows = Effect.fn("preservedFixtureRows")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projects = yield* sql`
    SELECT
      project_id,
      title,
      workspace_root,
      default_model_selection_json,
      default_thread_env_mode,
      favicon_path,
      scripts_json,
      created_at,
      updated_at,
      deleted_at
    FROM projection_projects
    WHERE project_id = ${projectId}
  `;
  const threads = yield* sql`
    SELECT
      thread_id,
      project_id,
      title,
      model_selection_json,
      runtime_mode,
      interaction_mode,
      branch,
      worktree_path,
      latest_turn_id,
      created_at,
      updated_at,
      archived_at,
      settled_override,
      settled_at,
      snoozed_until,
      snoozed_at,
      pinned_at,
      pin_order_key,
      title_regeneration_request_id,
      title_regeneration_started_at,
      latest_user_message_at,
      pending_approval_count,
      pending_user_input_count,
      has_actionable_proposed_plan,
      deleted_at
    FROM projection_threads
    WHERE thread_id = ${threadId}
  `;
  const messages = yield* sql`
    SELECT
      message_id,
      thread_id,
      turn_id,
      role,
      text,
      attachments_json,
      is_streaming,
      created_at,
      updated_at
    FROM projection_thread_messages
    WHERE message_id = ${messageId}
  `;
  const events = yield* sql`
    SELECT
      sequence,
      event_id,
      aggregate_kind,
      stream_id,
      stream_version,
      event_type,
      occurred_at,
      command_id,
      causation_event_id,
      correlation_id,
      actor_kind,
      payload_json,
      metadata_json
    FROM orchestration_events
    WHERE event_id = ${eventId}
  `;
  const clients = yield* sql`
    SELECT *
    FROM auth_clients
    WHERE client_id = 'synthetic-managed-client'
  `;
  const sessions = yield* sql`
    SELECT *
    FROM auth_sessions
    WHERE session_id = 'synthetic-device-administrator-session'
  `;
  return { projects, threads, messages, events, clients, sessions };
});

const seedAccepted51Fixture = Effect.fn("seedAccepted51Fixture")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* prepareAcceptedFork51();
  yield* sql`
    INSERT INTO projection_projects (
      project_id,
      title,
      workspace_root,
      default_model_selection_json,
      default_thread_env_mode,
      favicon_path,
      scripts_json,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      ${projectId},
      'Synthetic upgrade project',
      '/synthetic/upgrade-project',
      ${encodeJson(modelSelection)},
      'worktree',
      '/synthetic/favicon.svg',
      '[]',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:01.000Z',
      NULL
    )
  `;
  yield* sql`
    INSERT INTO projection_threads (
      thread_id,
      project_id,
      title,
      model_selection_json,
      runtime_mode,
      interaction_mode,
      branch,
      worktree_path,
      latest_turn_id,
      created_at,
      updated_at,
      archived_at,
      settled_override,
      settled_at,
      snoozed_until,
      snoozed_at,
      pinned_at,
      pin_order_key,
      title_regeneration_request_id,
      title_regeneration_started_at,
      latest_user_message_at,
      pending_approval_count,
      pending_user_input_count,
      has_actionable_proposed_plan,
      deleted_at
    ) VALUES (
      ${threadId},
      ${projectId},
      'Synthetic upgrade thread',
      ${encodeJson(modelSelection)},
      'full-access',
      'default',
      'synthetic-preserved-branch',
      '/synthetic/worktree',
      NULL,
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:02.000Z',
      NULL,
      'active',
      NULL,
      '2026-07-02T00:00:00.000Z',
      '2026-07-01T00:00:03.000Z',
      '2026-07-01T00:00:04.000Z',
      'synthetic-pin-order',
      NULL,
      NULL,
      '2026-07-01T00:00:02.000Z',
      2,
      3,
      1,
      NULL
    )
  `;
  yield* sql`
    INSERT INTO projection_thread_messages (
      message_id,
      thread_id,
      turn_id,
      role,
      text,
      attachments_json,
      is_streaming,
      created_at,
      updated_at
    ) VALUES (
      ${messageId},
      ${threadId},
      NULL,
      'user',
      'Preserve this message',
      ${encodeJson([attachment])},
      0,
      '2026-07-01T00:00:02.000Z',
      '2026-07-01T00:00:02.000Z'
    )
  `;
  yield* sql`
    INSERT INTO orchestration_events (
      event_id,
      aggregate_kind,
      stream_id,
      stream_version,
      event_type,
      occurred_at,
      command_id,
      causation_event_id,
      correlation_id,
      actor_kind,
      payload_json,
      metadata_json
    ) VALUES (
      ${eventId},
      'thread',
      ${threadId},
      0,
      'thread.message-sent',
      '2026-07-01T00:00:02.000Z',
      'synthetic-upgrade-command',
      NULL,
      'synthetic-upgrade-command',
      'client',
      ${encodeJson({
        threadId,
        messageId,
        role: "user",
        text: "Preserve this message",
        attachments: [attachment],
        turnId: null,
        streaming: false,
        createdAt: "2026-07-01T00:00:02.000Z",
        updatedAt: "2026-07-01T00:00:02.000Z",
      })},
      ${encodeJson(eventMetadata)}
    )
  `;
  yield* sql`
    INSERT INTO auth_clients (
      client_id,
      label,
      device_type,
      platform,
      granted_scopes,
      management_class,
      created_at,
      last_connected_at,
      disabled_at,
      deleted_at,
      revision
    ) VALUES (
      'synthetic-managed-client',
      'Synthetic managed device',
      'desktop',
      'Synthetic OS',
      '["access:read","access:write"]',
      'portal-managed-device',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:01.000Z',
      NULL,
      NULL,
      7
    )
  `;
  // The portal principal and its enrolled device are distinct clients.
  yield* sql`
    INSERT INTO auth_clients (
      client_id, device_type, granted_scopes, management_class, created_at
    ) VALUES (
      'synthetic-portal-client', 'bot', '[]', NULL, '2026-07-01T00:00:00.000Z'
    )
  `;
  yield* sql`
    INSERT INTO auth_sessions (
      session_id,
      client_id,
      subject,
      scopes,
      method,
      client_label,
      client_ip_address,
      client_user_agent,
      client_device_type,
      client_os,
      client_browser,
      client_surface,
      client_app_version,
      authority_class,
      issued_at,
      expires_at,
      last_connected_at,
      revoked_at
    ) VALUES (
      'synthetic-device-administrator-session',
      'synthetic-portal-client',
      'synthetic-device-administrator',
      '[]',
      'bearer-access-token',
      'Synthetic managed device',
      '192.0.2.1',
      'Synthetic migration proof',
      'desktop',
      'Synthetic OS',
      'Synthetic Browser',
      'desktop',
      '0.0.38',
      'device-administrator',
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T01:00:00.000Z',
      '2026-07-01T00:00:01.000Z',
      NULL
    )
  `;
  return yield* preservedFixtureRows();
});

const readInitializedFixture = Effect.fn("readInitializedFixture")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projects = yield* ProjectionProjectRepository;
  const threads = yield* ProjectionThreadRepository;
  const messages = yield* ProjectionThreadMessageRepository;
  const events = yield* OrchestrationEventStore;

  const project = Option.getOrNull(yield* projects.getById({ projectId }));
  const thread = Option.getOrNull(yield* threads.getById({ threadId }));
  const messageRows = yield* messages.listByThreadId({ threadId });
  const eventRows = yield* Stream.runCollect(events.readAll()).pipe(
    Effect.map((chunk) => Array.from(chunk)),
  );
  const preserved = yield* preservedFixtureRows();
  const journal = yield* sql<{ readonly migrationId: number; readonly name: string }>`
    SELECT migration_id AS "migrationId", name
    FROM effect_sql_migrations
    ORDER BY migration_id
  `;
  const executed = yield* runMigrations();

  return { project, thread, messageRows, eventRows, preserved, journal, executed };
});

for (const state of forkMigrationStates) {
  it.effect(`upgrades the released historical ${state} prefix`, () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* prepareForkMigrationState(state);
      yield* runMigrations();

      const historicalPrefix = yield* sql<{
        readonly migrationId: number;
        readonly name: string;
      }>`
        SELECT migration_id AS "migrationId", name
        FROM effect_sql_migrations
        WHERE migration_id BETWEEN 31 AND ${state}
        ORDER BY migration_id
      `;
      const latest = yield* sql<{ readonly migrationId: number; readonly name: string }>`
        SELECT migration_id AS "migrationId", name
        FROM effect_sql_migrations
        ORDER BY migration_id DESC
        LIMIT 1
      `;

      assert.deepStrictEqual(
        historicalPrefix,
        Array.from({ length: state - 30 }, (_, index) => {
          const migrationId = index + 31;
          return { migrationId, name: historicalNames.get(migrationId)! };
        }),
      );
      assert.deepStrictEqual(latest, [{ migrationId: 58, name: "PairingEnrollmentClass" }]);
    }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
  );
}

it.effect("rejects a historical identity after a canonical suffix starts", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 32 });
    yield* sql`
      INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (33, 'AuthAuthorizationScopes')
    `;

    const error = yield* Effect.flip(runMigrations());
    const laterJournal = yield* sql`
      SELECT migration_id
      FROM effect_sql_migrations
      WHERE migration_id >= 34
    `;

    assert.match(error.message, /Unsupported fork migration lineage at 33/);
    assert.deepStrictEqual(laterJournal, []);
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);

it.effect("rejects an isolated retired 49 journal identity", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 45 });
    yield* sql`
      INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (49, 'CollectiveFanoutRuns')
    `;

    const error = yield* Effect.flip(runMigrations());
    const continuationJournal = yield* sql`
      SELECT migration_id
      FROM effect_sql_migrations
      WHERE migration_id >= 50
    `;

    assert.match(
      error.message,
      /Unsupported fork migration lineage: incomplete retired 46 through 49 group/,
    );
    assert.deepStrictEqual(continuationJournal, []);
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);

it.effect("preserves an accepted 51 database through initialization and reopen", () => {
  const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-fork-upgrade-"));
  const dbPath = NodePath.join(tempDir, "state.sqlite");
  const rawFileLayer = NodeSqliteClient.layer({ filename: dbPath });
  const persistenceLayer = makeSqlitePersistenceLive(dbPath).pipe(
    Layer.provide(NodeServices.layer),
  );
  const repositoriesLayer = Layer.mergeAll(
    OrchestrationEventStoreLive,
    ProjectionProjectRepositoryLive,
    ProjectionThreadRepositoryLive,
    ProjectionThreadMessageRepositoryLive,
  ).pipe(Layer.provideMerge(persistenceLayer));

  return Effect.gen(function* () {
    const before = yield* seedAccepted51Fixture().pipe(Effect.provide(rawFileLayer));
    const first = yield* readInitializedFixture().pipe(Effect.provide(repositoriesLayer));

    assert.deepStrictEqual(first.preserved, before);
    assert.deepStrictEqual(first.executed, []);
    assert.deepStrictEqual(first.project, {
      projectId,
      title: "Synthetic upgrade project",
      workspaceRoot: "/synthetic/upgrade-project",
      defaultModelSelection: modelSelection,
      defaultThreadEnvMode: "worktree",
      autoPull: false,
      faviconPath: "/synthetic/favicon.svg",
      projectIcon: null,
      scripts: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:01.000Z",
      deletedAt: null,
    });
    assert.deepStrictEqual(first.thread, {
      threadId,
      projectId,
      title: "Synthetic upgrade thread",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "synthetic-preserved-branch",
      worktreePath: "/synthetic/worktree",
      linkedPullRequest: null,
      latestTurnId: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:02.000Z",
      archivedAt: null,
      settledOverride: "active",
      settledAt: null,
      unsettledAt: null,
      snoozedUntil: "2026-07-02T00:00:00.000Z",
      snoozedAt: "2026-07-01T00:00:03.000Z",
      pinnedAt: "2026-07-01T00:00:04.000Z",
      pinOrderKey: "synthetic-pin-order",
      titleRegenerationRequestId: null,
      titleRegenerationStartedAt: null,
      latestUserMessageAt: "2026-07-01T00:00:02.000Z",
      pendingApprovalCount: 2,
      pendingUserInputCount: 3,
      hasActionableProposedPlan: 1,
      deletedAt: null,
    });
    assert.deepStrictEqual(first.messageRows, [
      {
        messageId,
        threadId,
        turnId: null,
        role: "user",
        text: "Preserve this message",
        attachments: [attachment],
        isStreaming: false,
        createdAt: "2026-07-01T00:00:02.000Z",
        updatedAt: "2026-07-01T00:00:02.000Z",
      },
    ]);
    assert.deepStrictEqual(first.eventRows, [
      {
        sequence: 1,
        eventId,
        aggregateKind: "thread",
        aggregateId: threadId,
        occurredAt: "2026-07-01T00:00:02.000Z",
        commandId,
        causationEventId: null,
        correlationId: commandId,
        metadata: eventMetadata,
        type: "thread.message-sent",
        payload: {
          threadId,
          messageId,
          role: "user",
          text: "Preserve this message",
          attachments: [attachment],
          turnId: null,
          streaming: false,
          createdAt: "2026-07-01T00:00:02.000Z",
          updatedAt: "2026-07-01T00:00:02.000Z",
        },
      },
    ]);
    assert.deepStrictEqual(first.preserved.clients, [
      {
        client_id: "synthetic-managed-client",
        label: "Synthetic managed device",
        device_type: "desktop",
        platform: "Synthetic OS",
        granted_scopes: '["access:read","access:write"]',
        management_class: "portal-managed-device",
        created_at: "2026-07-01T00:00:00.000Z",
        last_connected_at: "2026-07-01T00:00:01.000Z",
        disabled_at: null,
        deleted_at: null,
        revision: 7,
      },
    ]);
    assert.equal(first.preserved.sessions[0]?.client_id, "synthetic-portal-client");
    assert.equal(first.preserved.sessions[0]?.authority_class, "device-administrator");

    const reopened = yield* readInitializedFixture().pipe(Effect.provide(repositoriesLayer));
    assert.deepStrictEqual(reopened, first);
  }).pipe(
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(tempDir, { recursive: true, force: true }))),
  );
});
