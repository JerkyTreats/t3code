// Upstream migrations 73 through 79 execute as fork identities 97 through 103 (PERSIST.D1, D3, D4).
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Migrator from "effect/sql/Migrator";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";

import { makeMigrationLoader, migrationManifest } from "./ForkMigrationPlan.ts";
import { runMigrations } from "./Migrations.ts";
import { layerFromPath } from "./Sqlite.ts";

const appended = [
  [97, "ActiveTurnItemIndexes"],
  [98, "ExcludeAttachmentPlaceholdersFromSearch"],
  [99, "SubagentDeliveryState"],
  [100, "ProjectionProjectsPinArchive"],
  [101, "RepairBooleanSettledOverride"],
  [102, "DropOrchestrationEventCorrelationIndex"],
  [103, "DelegatedRecoveryIndexes"],
] as const;

const seedRetainedData = Effect.fn("seedUpstream73To79RetainedData")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO projection_projects (
    project_id, title, workspace_root, scripts_json, created_at, updated_at
  ) VALUES ('synthetic-project', 'Retained project', '/workspace/project', '[]',
    '2026-01-01', '2026-01-01')`;
  yield* sql`INSERT INTO auth_clients (
    client_id, device_type, granted_scopes, management_class, created_at, revision
  ) VALUES ('synthetic-client', 'desktop', '["orchestration:read"]', 'portal-managed-device',
    '2026-01-01', 3)`;
});

const readRetainedData = Effect.fn("readUpstream73To79RetainedData")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return {
    journal:
      yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 96 ORDER BY migration_id`,
    projects: yield* sql<{
      readonly project_id: string;
      readonly title: string;
      readonly workspace_root: string;
    }>`SELECT project_id, title, workspace_root FROM projection_projects ORDER BY project_id`,
    clients: yield* sql`SELECT * FROM auth_clients ORDER BY client_id`,
  };
});

const schemaNames = Effect.fn("readSchemaNames")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master WHERE type IN ('table', 'index')
  `;
  return new Set(rows.map((row) => row.name));
});

it("appends upstream 73 through 79 in source order after fork 96", () => {
  const ids = migrationManifest.map(([id]) => id);
  const start = ids.indexOf(97);
  assert.deepStrictEqual(migrationManifest.slice(start, start + 7), [...appended]);
  assert.isBelow(ids.indexOf(96), ids.indexOf(97));
});

it.effect("continues fork 96 through 103, retains data, and reopens without new migrations", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-upstream-73-79-" });
    const filename = path.join(directory, "statev2.sqlite");
    const rawLayer = NodeSqliteClient.layer({ filename });
    const before = yield* Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 96 });
      yield* seedRetainedData();
      return yield* readRetainedData();
    }).pipe(Effect.provide(rawLayer));

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 103 }), appended);
      assert.deepStrictEqual(yield* readRetainedData(), before);
      const names = yield* schemaNames();
      for (const added of [
        "orchestration_v2_projection_turn_items_active_ordinal_idx",
        "orchestration_v2_projection_turn_items_active_run_idx",
        "orchestration_v2_projection_subagents_settled_idx",
        "orchestration_v2_projection_threads_subagent_result_idx",
        "orchestration_v2_projection_runs_delegated_delivery_idx",
      ]) {
        assert.isTrue(names.has(added), added);
      }
      assert.isFalse(names.has("idx_orch_events_correlation_id"));
      const projectColumns = yield* sql<{
        readonly name: string;
      }>`PRAGMA table_info(projection_projects)`;
      for (const column of ["pinned_at", "archived_at"]) {
        assert.isTrue(
          projectColumns.some((entry) => entry.name === column),
          column,
        );
      }
      const pinState = yield* sql<{
        readonly pinned_at: string | null;
        readonly archived_at: string | null;
      }>`SELECT pinned_at, archived_at FROM projection_projects`;
      assert.deepStrictEqual(pinState, [{ pinned_at: null, archived_at: null }]);
      const subagentColumns = yield* sql<{
        readonly name: string;
      }>`PRAGMA table_info(orchestration_v2_projection_subagents)`;
      assert.isTrue(subagentColumns.some((entry) => entry.name === "completion_delivery_state"));
      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 103 }), []);
    }).pipe(Effect.provide(rawLayer));

    yield* Effect.gen(function* () {
      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 103 }), []);
      assert.deepStrictEqual(yield* readRetainedData(), before);
    }).pipe(Effect.provide(layerFromPath(filename)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("carries 97 through 103 through a replacement migration runner", () =>
  Effect.gen(function* () {
    const independentRunner = Migrator.make({});
    yield* independentRunner({ loader: makeMigrationLoader(96) });
    assert.deepStrictEqual(
      yield* independentRunner({ loader: makeMigrationLoader(103) }),
      appended,
    );
    assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader(103) }), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
