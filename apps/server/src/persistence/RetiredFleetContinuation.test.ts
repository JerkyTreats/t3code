// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "./Migrations.ts";

const history = [
  [71, "ThreadFleets"],
  [72, "FleetDefinitions"],
  [73, "BrokerDecisions"],
  [74, "AgentCreationRequests"],
  [75, "FleetTypeIdentity"],
  [76, "FleetAutomaticAttachment"],
  [77, "RetireFleetExecution"],
  [78, "ManualRecoveryAdmission"],
] as const;
const continuation = [
  [79, "ScheduledTaskWebhooks"],
  [80, "WebhookRelayDeliveries"],
  [81, "McpAppModelContext"],
  [82, "ThreadSnapshotWindowIndexes"],
] as const;

// Synthetic retired evidence, not the removed Fleet implementation. The existing
// production tables and SQL fences must survive without their creator being loaded.
const seedRetiredProduction = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* runMigrations({ toMigrationInclusive: 70 });
  for (const [id, name] of history) {
    yield* sql`INSERT INTO effect_sql_migrations (migration_id, name, created_at)
      VALUES (${id}, ${name}, '2026-10-01 00:00:00')`;
  }
  yield* sql`CREATE TABLE fleet_retirement (id INTEGER PRIMARY KEY, retired_at TEXT, reason TEXT)`;
  yield* sql`INSERT INTO fleet_retirement VALUES (1, '2026-10-01',
    'Fleet retired; verified owned conversations permanently purged')`;
  yield* sql`CREATE TABLE fleet_retired_threads (thread_id TEXT PRIMARY KEY)`;
  yield* sql`INSERT INTO fleet_retired_threads VALUES ('synthetic-retired-thread')`;
  yield* sql`CREATE TABLE fleet_purged_executions (execution_id TEXT PRIMARY KEY)`;
  yield* sql`INSERT INTO fleet_purged_executions VALUES ('synthetic-retired-execution')`;
  yield* sql`CREATE TABLE manual_recovery_guard (id INTEGER PRIMARY KEY, native_fences_ready INTEGER)`;
  yield* sql`INSERT INTO manual_recovery_guard VALUES (1, 1)`;
  yield* sql`CREATE TABLE manual_recovery_native_fences (fingerprint TEXT PRIMARY KEY)`;
  yield* sql`INSERT INTO manual_recovery_native_fences VALUES ('synthetic-fingerprint')`;
  yield* sql`CREATE TRIGGER synthetic_retired_event BEFORE INSERT ON orchestration_events
    WHEN NEW.stream_id IN (SELECT thread_id FROM fleet_retired_threads)
    BEGIN SELECT RAISE(ABORT, 'Fleet conversations are retired'); END`;
  yield* sql`CREATE TRIGGER synthetic_fence_immutable BEFORE DELETE ON manual_recovery_native_fences
    BEGIN SELECT RAISE(ABORT, 'Recovery identities cannot be released'); END`;
  yield* sql`INSERT INTO checkpoint_diff_blobs VALUES
    ('synthetic-surviving-thread', 1, 2, 'synthetic retained diff', '2026-10-01')`;
});

const retainedState = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return {
    journal:
      yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 78 ORDER BY migration_id`,
    retirement: yield* sql`SELECT * FROM fleet_retirement`,
    threads: yield* sql`SELECT * FROM fleet_retired_threads`,
    executions: yield* sql`SELECT * FROM fleet_purged_executions`,
    native: yield* sql`SELECT * FROM manual_recovery_native_fences`,
    checkpoints: yield* sql`SELECT * FROM checkpoint_diff_blobs`,
    fences: yield* sql`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name`,
  };
});

it.effect(
  "continues retired production once and preserves its history and fences after reopen",
  () => {
    const directory = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "retired-fleet-continuation-"),
    );
    const filename = NodePath.join(directory, "synthetic.sqlite");
    return Effect.gen(function* () {
      const before = yield* Effect.gen(function* () {
        yield* seedRetiredProduction;
        const before = yield* retainedState;
        assert.deepStrictEqual(yield* runMigrations(), continuation);
        assert.deepStrictEqual(yield* retainedState, before);
        return before;
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename })));
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        assert.deepStrictEqual(yield* runMigrations(), []);
        assert.deepStrictEqual(yield* retainedState, before);
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(sql`
        INSERT INTO orchestration_events (event_id, aggregate_kind, stream_id, stream_version,
          event_type, occurred_at, actor_kind, payload_json, metadata_json)
        VALUES ('synthetic-reimport', 'thread', 'synthetic-retired-thread', 1,
          'thread.created', '2026-10-01', 'server', '{}', '{}')
      `),
          ),
        );
        assert.isTrue(
          Exit.isFailure(yield* Effect.exit(sql`DELETE FROM manual_recovery_native_fences`)),
        );
        assert.deepStrictEqual(yield* retainedState, before);
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename })));
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => NodeFS.rmSync(directory, { recursive: true, force: true })),
      ),
    );
  },
);

it.effect.each([
  ["incomplete history", "DELETE FROM effect_sql_migrations WHERE migration_id = 74"],
  [
    "different identity",
    "UPDATE effect_sql_migrations SET name = 'UnknownFleet' WHERE migration_id = 74",
  ],
  ["missing retirement marker", "DELETE FROM fleet_retirement"],
  ["unready native fences", "UPDATE manual_recovery_guard SET native_fences_ready = 0"],
  ["missing retirement table", "DROP TABLE fleet_purged_executions"],
] as const)("rejects %s without changing schema or journal", ([_label, mutation]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* seedRetiredProduction;
    yield* sql.unsafe(mutation);
    const before = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    assert.isTrue(Exit.isFailure(yield* Effect.exit(runMigrations())));
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
      before,
    );
    assert.deepStrictEqual(
      yield* sql`SELECT name FROM pragma_table_info('scheduled_tasks')
      WHERE name = 'webhook_token'`,
      [],
    );
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rolls back all new schema and journal rows before retrying retired production", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* seedRetiredProduction;
    // Fail in upstream 80 after 79 attempts real DDL. The upstream runner treats
    // journal insertion failures as migration locks, so fail index creation.
    yield* sql`CREATE TABLE scheduled_task_webhook_relay_deliveries (relay_delivery_id TEXT)`;
    const before = yield* retainedState;
    assert.isTrue(Exit.isFailure(yield* Effect.exit(runMigrations())));
    assert.deepStrictEqual(yield* retainedState, before);
    assert.deepStrictEqual(
      yield* sql`SELECT name FROM pragma_table_info('scheduled_tasks')
    WHERE name = 'webhook_token'`,
      [],
    );
    assert.deepStrictEqual(
      yield* sql`SELECT name FROM sqlite_master WHERE name IN
    ('scheduled_task_webhook_deliveries', 'mcp_app_model_context')`,
      [],
    );
    yield* sql`DROP TABLE scheduled_task_webhook_relay_deliveries`;
    assert.deepStrictEqual(yield* runMigrations(), continuation);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("creates current upstream schema without Fleet history or Fleet tables", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations();
    assert.deepStrictEqual(
      yield* sql`SELECT name FROM sqlite_master
    WHERE name LIKE '%fleet%' OR name LIKE 'manual_recovery_%'`,
      [],
    );
    assert.deepStrictEqual(
      yield* sql`SELECT name FROM effect_sql_migrations WHERE migration_id BETWEEN 71 AND 78`,
      [],
    );
    assert.deepStrictEqual(
      yield* sql`SELECT name FROM sqlite_master
    WHERE name IN ('scheduled_task_webhook_deliveries', 'scheduled_task_webhook_relay_deliveries', 'mcp_app_model_context')
    ORDER BY name`,
      [
        { name: "mcp_app_model_context" },
        { name: "scheduled_task_webhook_deliveries" },
        { name: "scheduled_task_webhook_relay_deliveries" },
      ],
    );
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
