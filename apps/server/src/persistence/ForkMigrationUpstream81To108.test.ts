// Upstream migrations 81 through 108 execute as fork identities 105 through 132 (PERSIST.D1, D3, D5).
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  DATABASE_MIGRATION_PROGRESS_MESSAGE,
  DATABASE_MIGRATIONS_FINISHED_MESSAGE,
  DATABASE_MIGRATIONS_STARTED_MESSAGE,
} from "@t3tools/shared/databaseMigrationLog";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Logger from "effect/Logger";
import * as Migrator from "effect/sql/Migrator";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";

import { makeMigrationLoader, migrationManifest } from "./ForkMigrationPlan.ts";
import { hasPendingMigrations, runMigrations } from "./Migrations.ts";
import { layerFromPath } from "./Sqlite.ts";

const appended = [
  [105, "ProjectionMessageSearchText"],
  [106, "TurnItemConversationIndex"],
  [107, "CommandReadIndexes"],
  [108, "LastExecutedRunIndex"],
  [109, "TurnItemCounts"],
  [110, "QueuedTurnInputIndex"],
  [111, "ProjectionProjectsCustomTitle"],
  [112, "TurnItemTypeStatusIndex"],
  [113, "ShellThreadReadIndexes"],
  [114, "AuthConnectDevices"],
  [115, "AuthConnectDeniedRequests"],
  [116, "QueuedTurnInputIndexJsonValid"],
  [117, "ProviderTurnAttemptIndex"],
  [118, "TurnItemMessageOrdinalIndex"],
  [119, "TurnItemInlineWorkOutput"],
  [120, "RepairStaleTitleRegeneration"],
  [121, "IssueTrackerBindings"],
  [122, "ActiveShellIndexIndexes"],
  [123, "BackgroundRecoveryIndexes"],
  [124, "TurnStartReadIndexes"],
  [125, "DelegatedTaskReadIndexes"],
  [126, "ThreadItemCounts"],
  [127, "IssueTrackerAdditionalScopes"],
  [128, "ProjectionProjectsTrackedFolders"],
  [129, "TaskFolders"],
  [130, "WorktreePathKeyIndex"],
  [131, "DeferredSlashCommandIndex"],
  [132, "AgentFeedback"],
] as const;

const seedRetainedData = Effect.fn("seedUpstream81To108RetainedData")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO projection_projects (
    project_id, title, workspace_root, scripts_json, created_at, updated_at
  ) VALUES ('synthetic-project', 'Retained project', '/workspace/project', '[]',
    '2026-01-01', '2026-01-01')`;
  yield* sql`INSERT INTO projection_threads (
    thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode,
    creation_surface, created_at, updated_at
  ) VALUES ('synthetic-thread', 'synthetic-project', 'Retained thread',
    '{"instanceId":"synthetic-provider","model":"synthetic-model"}', 'full-access', 'default',
    'thread', '2026-01-01', '2026-01-01')`;
  yield* sql`INSERT INTO projection_thread_messages (
    message_id, thread_id, role, text, attachments_json, is_streaming, created_at, updated_at
  ) VALUES ('synthetic-message', 'synthetic-thread', 'user', 'Retained message',
    '[{"type":"file","id":"synthetic-attachment","name":"retained.txt","mimeType":"text/plain","sizeBytes":12}]',
    0, '2026-01-01', '2026-01-01')`;
  yield* sql`INSERT INTO auth_clients (
    client_id, device_type, granted_scopes, management_class, created_at, revision
  ) VALUES ('synthetic-client', 'desktop', '["orchestration:read"]', 'portal-managed-device',
    '2026-01-01', 3)`;
  yield* sql`INSERT INTO auth_sessions (
    session_id, client_id, subject, scopes, method, authority_class, issued_at, expires_at, revoked_at
  ) VALUES ('synthetic-session', 'synthetic-client', 'synthetic-subject', '["orchestration:read"]',
    'bearer-access-token', 'client', '2026-01-01', '2027-01-01', '2026-02-01')`;
  yield* sql`INSERT INTO auth_pairing_links (
    id, credential_digest, method, scopes, subject, client_management_class,
    created_at, expires_at, revoked_at, revision
  ) VALUES ('synthetic-pairing', 'synthetic-digest', 'one-time-token', '["orchestration:read"]',
    'synthetic-subject', 'portal-managed-device', '2026-01-01', '2027-01-01', '2026-02-01', 4)`;
});

// 114 and 115 add columns to the auth tables, so compare the rows the fork already owned.
const readRetainedData = Effect.fn("readUpstream81To108RetainedData")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return {
    journal:
      yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 104 ORDER BY migration_id`,
    threads: yield* sql`SELECT thread_id, project_id, title, creation_surface
      FROM projection_threads ORDER BY thread_id`,
    messages: yield* sql`SELECT message_id, thread_id, text, attachments_json
      FROM projection_thread_messages ORDER BY message_id`,
    clients: yield* sql`SELECT * FROM auth_clients ORDER BY client_id`,
    sessions: yield* sql`SELECT session_id, client_id, subject, scopes, method, authority_class,
      issued_at, expires_at, revoked_at FROM auth_sessions ORDER BY session_id`,
    pairing: yield* sql`SELECT id, credential_digest, scopes, subject, client_management_class,
      expires_at, revoked_at, revision FROM auth_pairing_links ORDER BY id`,
  };
});

const schemaNames = Effect.fn("readSchemaNames")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger')
  `;
  return new Set(rows.map((row) => row.name));
});

it("appends upstream 81 through 108 in source order after fork 104 as the fork head", () => {
  const ids = migrationManifest.map(([id]) => id);
  const start = ids.indexOf(105);
  assert.deepStrictEqual(migrationManifest.slice(start), [...appended]);
  assert.equal(ids.indexOf(104) + 1, start);
  assert.equal(Math.max(...ids), 132);
});

it.effect("continues fork 104 through 132, retains data, and reopens without new migrations", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-upstream-81-108-" });
    const filename = path.join(directory, "statev2.sqlite");
    const rawLayer = NodeSqliteClient.layer({ filename });
    const before = yield* Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 104 });
      yield* seedRetainedData();
      assert.isTrue(yield* hasPendingMigrations());
      return yield* readRetainedData();
    }).pipe(Effect.provide(rawLayer));

    const messages: string[] = [];
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      assert.deepStrictEqual(yield* runMigrations(), [...appended]);
      assert.deepStrictEqual(yield* readRetainedData(), before);
      const names = yield* schemaNames();
      for (const added of [
        "orchestration_v2_projection_turn_items_conversation_idx",
        "orchestration_v2_projection_turn_item_counts",
        "auth_connect_devices",
        "issue_tracker_bindings",
        "orchestration_v2_projection_thread_item_counts",
        "task_folders",
        "agent_feedback",
      ]) {
        assert.isTrue(names.has(added), added);
      }
      const pairingColumns = yield* sql<{
        readonly name: string;
      }>`PRAGMA table_info(auth_pairing_links)`;
      for (const column of [
        "client_management_class",
        "requires_connect_approval",
        "requested_client_json",
        "connect_denied",
      ]) {
        assert.isTrue(
          pairingColumns.some((entry) => entry.name === column),
          column,
        );
      }
      assert.isFalse(yield* hasPendingMigrations());
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(
      Effect.provide(rawLayer),
      Effect.provideService(
        Logger.CurrentLoggers,
        new Set([Logger.make(({ message }) => messages.push(String(message)))]),
      ),
    );
    // Desktop readiness reads these lines: started, one progress line per migration, finished.
    assert.equal(messages[0], DATABASE_MIGRATIONS_STARTED_MESSAGE);
    assert.equal(
      messages.filter((message) => message === DATABASE_MIGRATION_PROGRESS_MESSAGE).length,
      appended.length,
    );
    assert.include(messages, DATABASE_MIGRATIONS_FINISHED_MESSAGE);

    yield* Effect.gen(function* () {
      assert.isFalse(yield* hasPendingMigrations());
      assert.deepStrictEqual(yield* runMigrations(), []);
      assert.deepStrictEqual(yield* readRetainedData(), before);
    }).pipe(Effect.provide(layerFromPath(filename)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("carries 105 through 132 through a replacement migration runner", () =>
  Effect.gen(function* () {
    const independentRunner = Migrator.make({});
    yield* independentRunner({ loader: makeMigrationLoader(104) });
    assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader() }), appended);
    assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader() }), []);
    assert.deepStrictEqual(yield* runMigrations(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

// Upstream builds record these names at their own ids; the fork owns different migrations there.
it.effect.each([
  { id: 81, name: "ProjectionMessageSearchText" },
  { id: 90, name: "AuthConnectDevices" },
  { id: 104, name: "ProjectionProjectsTrackedFolders" },
  { id: 105, name: "TaskFolders" },
])("rejects an upstream-numbered $id journal row before writes", ({ id, name }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: id - 1 });
    yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${id}, ${name})`;
    const journal = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    const schema = yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`;
    const error = yield* Effect.flip(runMigrations());
    assert.equal(error.message, `Unsupported fork migration identity at ${id}: ${name}`);
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
      journal,
    );
    assert.deepStrictEqual(yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`, schema);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rolls back only the failing migration in 105 through 132 and resumes after it", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-upstream-81-108-resume-" });
    const filename = path.join(directory, "statev2.sqlite");
    const rawLayer = NodeSqliteClient.layer({ filename });
    const before = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 104 });
      yield* seedRetainedData();
      // 109 creates its table and first triggers before this trigger name collides.
      yield* sql`CREATE TABLE synthetic_blocker (id TEXT)`;
      yield* sql`CREATE TRIGGER orchestration_v2_turn_item_counts_delete
        AFTER DELETE ON synthetic_blocker BEGIN SELECT 1; END`;
      return yield* readRetainedData();
    }).pipe(Effect.provide(rawLayer));

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      assert.isTrue(Exit.isFailure(yield* Effect.exit(runMigrations())));
      const journal = yield* sql<{ readonly id: number }>`
        SELECT MAX(migration_id) AS id FROM effect_sql_migrations`;
      assert.deepStrictEqual(journal, [{ id: 108 }]);
      const names = yield* schemaNames();
      assert.isTrue(names.has("orchestration_v2_projection_turn_items_conversation_idx"));
      assert.isTrue(names.has("orchestration_v2_projection_runs_last_executed_idx"));
      for (const rolledBack of [
        "orchestration_v2_projection_turn_item_counts",
        "orchestration_v2_turn_item_counts_insert",
        "orchestration_v2_turn_item_counts_update",
      ]) {
        assert.isFalse(names.has(rolledBack), rolledBack);
      }
      assert.deepStrictEqual(yield* readRetainedData(), before);
      yield* sql`DROP TABLE synthetic_blocker`;
    }).pipe(Effect.provide(rawLayer));

    yield* Effect.gen(function* () {
      assert.deepStrictEqual(
        yield* runMigrations(),
        appended.filter(([id]) => id > 108),
      );
      assert.deepStrictEqual(yield* readRetainedData(), before);
    }).pipe(Effect.provide(rawLayer));

    yield* Effect.gen(function* () {
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(layerFromPath(filename)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
