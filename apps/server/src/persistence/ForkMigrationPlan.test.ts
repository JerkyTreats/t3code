import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Migrator from "effect/unstable/sql/Migrator";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { makeMigrationLoader, migrationManifest } from "./ForkMigrationPlan.ts";
import { runMigrations } from "./Migrations.ts";

it.layer(Layer.fresh(NodeSqliteClient.layerMemory()))("fork migration owner", (it) => {
  it.effect("carries the fork history and fresh retirement through a replacement runner host", () =>
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
});

it.layer(Layer.fresh(NodeSqliteClient.layerMemory()))("migration transaction recovery", (it) => {
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
});
