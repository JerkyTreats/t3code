// Upstream migrations 63 through 68 execute as fork identities 87 through 92 (PERSIST.D1, D3, D4).
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Migrator from "effect/sql/Migrator";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";

import { makeMigrationLoader, migrationManifest } from "./ForkMigrationPlan.ts";
import { runMigrations } from "./Migrations.ts";
import { layerFromPath } from "./Sqlite.ts";

const appended = [
  [87, "DropUnusedV1Projections"],
  [88, "CanonicalizeThreadPullRequestLinks"],
  [89, "CodexUsageNativeTurnIndex"],
  [90, "RepairClientSettlementTimestamps"],
  [91, "WebhookDedupe"],
  [92, "ShellStopRequestIndex"],
] as const;

const droppedV1Tables = [
  "projection_thread_activities",
  "projection_turns",
  "projection_thread_proposed_plans",
  "projection_pending_approvals",
  "projection_state",
  "checkpoint_diff_blobs",
];

const seedRetainedData = Effect.fn("seedUpstream63To68RetainedData")(function* () {
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

const readRetainedData = Effect.fn("readUpstream63To68RetainedData")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return {
    journal:
      yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 86 ORDER BY migration_id`,
    threads: yield* sql`SELECT * FROM projection_threads ORDER BY thread_id`,
    messages: yield* sql`SELECT * FROM projection_thread_messages ORDER BY message_id`,
    clients: yield* sql`SELECT * FROM auth_clients ORDER BY client_id`,
    sessions: yield* sql`SELECT * FROM auth_sessions ORDER BY session_id`,
    pairing: yield* sql`SELECT * FROM auth_pairing_links ORDER BY id`,
  };
});

const tableNames = Effect.fn("readTableNames")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master WHERE type IN ('table', 'index')
  `;
  return new Set(rows.map((row) => row.name));
});

it("orders upstream 63 after fork 83, which still deletes from projection_state", () => {
  const ids = migrationManifest.map(([id]) => id);
  assert.deepStrictEqual(migrationManifest.slice(-6), [...appended]);
  assert.isBelow(ids.indexOf(83), ids.indexOf(87));
});

it.effect("continues fork 86 through 92, retains data, and reopens without new migrations", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-upstream-63-68-" });
    const filename = path.join(directory, "statev2.sqlite");
    const rawLayer = NodeSqliteClient.layer({ filename });
    const before = yield* Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 86 });
      yield* seedRetainedData();
      const tables = yield* tableNames();
      for (const table of droppedV1Tables) assert.isTrue(tables.has(table), table);
      return yield* readRetainedData();
    }).pipe(Effect.provide(rawLayer));

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      assert.deepStrictEqual(yield* runMigrations(), appended);
      assert.deepStrictEqual(yield* readRetainedData(), before);
      const tables = yield* tableNames();
      for (const table of droppedV1Tables) assert.isFalse(tables.has(table), table);
      for (const added of [
        "scheduled_task_webhook_replay_keys",
        "scheduled_task_webhook_pending",
        "orchestration_v2_provider_turns_codex_native_id_idx",
        "orchestration_v2_projection_turn_items_stop_request_idx",
      ]) {
        assert.isTrue(tables.has(added), added);
      }
      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(scheduled_tasks)`;
      assert.isTrue(columns.some((column) => column.name === "last_run_webhook_delivery_id"));
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(rawLayer));

    yield* Effect.gen(function* () {
      assert.deepStrictEqual(yield* runMigrations(), []);
      assert.deepStrictEqual(yield* readRetainedData(), before);
    }).pipe(Effect.provide(layerFromPath(filename)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("carries 87 through 92 through a replacement migration runner", () =>
  Effect.gen(function* () {
    const independentRunner = Migrator.make({});
    yield* independentRunner({ loader: makeMigrationLoader(86) });
    assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader() }), appended);
    assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader() }), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rejects upstream-numbered 63 before continuation writes", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 62 });
    yield* sql`INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (63, 'DropUnusedV1Projections')`;
    const journal = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    const exit = yield* Effect.exit(runMigrations());
    assert.isTrue(Exit.isFailure(exit));
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
      journal,
    );
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

// Fork builds reported plain upstream versions until 2026-09-26 and then
// `<upstream base>-<10 hex>`. Only plain 0.0.35 through 0.0.38 dense client
// sweeps before 2026-09-05 match the upstream repair, as on upstream builds.
const createdAt = "2026-03-01T00:00:00.000Z";
const plusSeconds = (iso: string, seconds: number) =>
  DateTime.makeUnsafe(iso).pipe(DateTime.add({ seconds }), DateTime.formatIso);

it.effect("applies fork 90 only to affected plain-version sweeps in fork-built histories", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 89 });
    let eventNumber = 0;
    const insertSweep = Effect.fnUntraced(function* (
      prefix: string,
      startAt: string,
      appVersion: string,
    ) {
      for (let index = 0; index < 10; index++) {
        const id = `${prefix}-${index}`;
        const at = plusSeconds(startAt, index * 2);
        yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, model_selection_json, created_at, updated_at,
            settled_override, settled_at
          ) VALUES (
            ${id}, 'project-1', ${id}, '{"instanceId":"codex","model":"synthetic"}',
            ${createdAt}, ${at}, 'settled', ${at}
          )
        `;
        const version = eventNumber++;
        yield* sql`
          INSERT INTO orchestration_events (
            event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at,
            command_id, actor_kind, payload_json, metadata_json, application_event_version
          ) VALUES (
            ${`event-${version}`}, 'thread', ${id}, 0, 'thread.settled', ${at},
            ${`command-${version}`}, 'client',
            ${JSON.stringify({ threadId: id, settledAt: at, updatedAt: at })},
            ${JSON.stringify({ origin: { appVersion } })}, 1
          )
        `;
      }
    });
    yield* insertSweep("plain-0038", "2026-09-01T10:00:00.000Z", "0.0.38");
    yield* insertSweep("plain-0039", "2026-09-02T10:00:00.000Z", "0.0.39");
    yield* insertSweep("plain-0045", "2026-09-03T10:00:00.000Z", "0.0.45");
    yield* insertSweep("suffixed-0038", "2026-09-04T10:00:00.000Z", "0.0.38-0123456789");
    yield* insertSweep("suffixed-0045", "2026-09-04T12:00:00.000Z", "0.0.45-0123456789");
    yield* insertSweep("late-0038", "2026-09-06T10:00:00.000Z", "0.0.38");

    assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 90 }), [
      [90, "RepairClientSettlementTimestamps"],
    ]);
    const rows = yield* sql<{
      readonly thread_id: string;
      readonly settled_at: string;
      readonly updated_at: string;
    }>`SELECT thread_id, settled_at, updated_at FROM projection_threads ORDER BY thread_id`;
    for (const row of rows) {
      const expected = row.thread_id.startsWith("plain-0038-") ? createdAt : row.updated_at;
      assert.strictEqual(row.settled_at, expected, row.thread_id);
    }
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
