import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { makeMigrationLoader, migrationManifest } from "./ForkMigrationPlan.ts";
import { runMigrations } from "./Migrations.ts";

it.layer(Layer.fresh(NodeSqliteClient.layer({ filename: ":memory:" })))(
  "fork migration owner",
  (it) => {
    it.effect(
      "carries the fork history and fresh retirement through a replacement runner host",
      () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const independentRunner = Migrator.make({});
          const executed = yield* independentRunner({ loader: makeMigrationLoader() });

          assert.deepStrictEqual(executed, migrationManifest);
          const journal = yield* sql<{ readonly id: number; readonly name: string }>`
        SELECT migration_id AS id, name FROM effect_sql_migrations ORDER BY migration_id
      `;
          assert.deepStrictEqual(
            journal.filter(({ id }) => id >= 42 && id <= 51),
            [
              { id: 42, name: "ReconcileUpstreamAndSettingsAdmin" },
              { id: 43, name: "ProjectionBoardPosts" },
              { id: 44, name: "ProjectionBoardPostRevisions" },
              { id: 45, name: "CollectiveExpeditions" },
              { id: 50, name: "ThreadAdapterLaunchBindings" },
              { id: 51, name: "RetireThreadAdapterAuthority" },
            ],
          );
          const retired = yield* sql`
        SELECT name FROM sqlite_master WHERE name LIKE 'thread_adapter_%'
      `;
          assert.deepStrictEqual(retired, []);
          assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader() }), []);
        }),
    );
  },
);

it.layer(Layer.fresh(NodeSqliteClient.layer({ filename: ":memory:" })))(
  "migration transaction recovery",
  (it) => {
    it.effect(
      "rolls back the complete continuation on a data repair failure and retries safely",
      () =>
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* runMigrations({ toMigrationInclusive: 51 });
          // Malformed historical data makes upstream's real JSON repair fail after
          // earlier continuation migrations have already attempted their DDL.
          yield* sql`
        INSERT INTO orchestration_events (
          event_id, aggregate_kind, stream_id, stream_version, event_type,
          occurred_at, actor_kind, payload_json, metadata_json
        ) VALUES (
          'synthetic-corrupt-event', 'project', 'synthetic-project', 1,
          'project.created', '2026-01-01T00:00:00.000Z', 'server',
          'invalid json', '{}'
        )
      `;
          const failure = yield* Effect.exit(runMigrations());
          assert.isTrue(Exit.isFailure(failure));

          const journal = yield* sql<{ readonly id: number }>`
        SELECT MAX(migration_id) AS id FROM effect_sql_migrations
      `;
          assert.equal(journal[0]?.id, 51);
          const columns = yield* sql<{
            readonly name: string;
          }>`PRAGMA table_info(projection_threads)`;
          assert.isFalse(columns.some(({ name }) => name === "linked_pull_request_json"));
          assert.isFalse(columns.some(({ name }) => name === "unsettled_at"));
          const unchanged = yield* sql<{ readonly payload: string }>`
        SELECT payload_json AS payload FROM orchestration_events
        WHERE event_id = 'synthetic-corrupt-event'
      `;
          assert.equal(unchanged[0]?.payload, "invalid json");

          yield* sql`
        UPDATE orchestration_events SET payload_json = '{}'
        WHERE event_id = 'synthetic-corrupt-event'
      `;
          const retried = yield* runMigrations();
          assert.deepStrictEqual(
            retried,
            migrationManifest.filter(([id]) => id > 51),
          );
          assert.deepStrictEqual(yield* runMigrations(), []);
        }),
    );
  },
);

it.effect("rolls back the V2 schema and baseline events together before retry", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 67 });
    yield* sql`INSERT INTO projection_projects (
      project_id, title, workspace_root, scripts_json, created_at, updated_at
    ) VALUES ('synthetic-v2-rollback', 'Retained project', '/synthetic/project', '[]',
      '2026-01-01', '2026-01-01')`;
    yield* sql`CREATE TRIGGER fail_v2_continuation BEFORE INSERT ON orchestration_events
      WHEN NEW.event_id LIKE 'migration:%' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`;
    assert.isTrue(Exit.isFailure(yield* Effect.exit(runMigrations())));
    assert.deepStrictEqual(yield* sql`SELECT MAX(migration_id) AS id FROM effect_sql_migrations`, [
      { id: 67 },
    ]);
    assert.deepStrictEqual(
      yield* sql`SELECT name FROM sqlite_master
      WHERE name = 'orchestration_v2_legacy_imports'`,
      [],
    );
    assert.deepStrictEqual(yield* sql`SELECT event_id FROM orchestration_events`, []);
    const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(orchestration_events)`;
    assert.isFalse(columns.some(({ name }) => name === "application_event_version"));
    assert.deepStrictEqual(yield* sql`SELECT title FROM projection_projects`, [
      { title: "Retained project" },
    ]);
    yield* sql`DROP TRIGGER fail_v2_continuation`;
    assert.deepStrictEqual(yield* runMigrations(), [
      [68, "OrchestrationV2"],
      [69, "RemoveRedundantProjectionIndexes"],
      [70, "ApplicationBoardEventSequenceIndex"],
      [79, "ScheduledTaskWebhooks"],
      [80, "WebhookRelayDeliveries"],
      [81, "McpAppModelContext"],
      [82, "ThreadSnapshotWindowIndexes"],
    ]);
    assert.deepStrictEqual(yield* runMigrations(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rejects a populated journal-less database before the runner creates its journal", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE synthetic_legacy_data (text TEXT)`;
    yield* sql`INSERT INTO synthetic_legacy_data VALUES ('Keep original data')`;
    const error = yield* Effect.flip(runMigrations());
    assert.match(error.message, /populated database without a migration journal/);
    assert.deepStrictEqual(
      yield* sql`SELECT name FROM sqlite_master
      WHERE name = 'effect_sql_migrations'`,
      [],
    );
    assert.deepStrictEqual(yield* sql`SELECT * FROM synthetic_legacy_data`, [
      { text: "Keep original data" },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("continues the current journal with stable upstream identities", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 70 });
    const before = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    assert.deepStrictEqual(yield* runMigrations(), [
      [79, "ScheduledTaskWebhooks"],
      [80, "WebhookRelayDeliveries"],
      [81, "McpAppModelContext"],
      [82, "ThreadSnapshotWindowIndexes"],
    ]);
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 70 ORDER BY migration_id`,
      before,
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
    assert.deepStrictEqual(yield* runMigrations(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect.each([71, 78, 999])("rejects unsupported journal identity %s before writes", (id) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 70 });
    yield* sql`INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (${id}, 'SyntheticUnsupportedMigration')`;
    const journal = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    const schema = yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`;
    const error = yield* Effect.flip(runMigrations());
    assert.equal(
      error.message,
      `Unsupported fork migration identity at ${id}: SyntheticUnsupportedMigration`,
    );
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
      journal,
    );
    assert.deepStrictEqual(yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`, schema);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rolls back upstream continuation schema and journal before retry", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 70 });
    // Fail index creation after the preceding continuation has attempted its DDL.
    yield* sql`CREATE TABLE scheduled_task_webhook_relay_deliveries (relay_delivery_id TEXT)`;
    const journal = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    const schema = yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`;
    assert.isTrue(Exit.isFailure(yield* Effect.exit(runMigrations())));
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
      journal,
    );
    assert.deepStrictEqual(yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`, schema);
    yield* sql`DROP TABLE scheduled_task_webhook_relay_deliveries`;
    assert.deepStrictEqual(
      yield* runMigrations(),
      migrationManifest.filter(([id]) => id > 70),
    );
    assert.deepStrictEqual(yield* runMigrations(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
