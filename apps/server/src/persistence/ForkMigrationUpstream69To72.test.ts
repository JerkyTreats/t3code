// Upstream migrations 69 through 72 execute as fork identities 93 through 96 (PERSIST.D1, D3, D4).
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
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
  [93, "ThreadMessageSearch"],
  [94, "PeerLinks"],
  [95, "PeerLinkFence"],
  [96, "WaitingLinkRequestIndex"],
] as const;

const seedRetainedData = Effect.fn("seedUpstream69To72RetainedData")(function* () {
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

const readRetainedData = Effect.fn("readUpstream69To72RetainedData")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return {
    journal:
      yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 92 ORDER BY migration_id`,
    projects: yield* sql`SELECT * FROM projection_projects ORDER BY project_id`,
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

it("appends upstream 69 through 72 in source order after fork 92", () => {
  const ids = migrationManifest.map(([id]) => id);
  assert.deepStrictEqual(migrationManifest.slice(-4), [...appended]);
  assert.isBelow(ids.indexOf(92), ids.indexOf(93));
});

it.effect("continues fork 92 through 96, retains data, and reopens without new migrations", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-upstream-69-72-" });
    const filename = path.join(directory, "statev2.sqlite");
    const rawLayer = NodeSqliteClient.layer({ filename });
    const before = yield* Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 92 });
      yield* seedRetainedData();
      return yield* readRetainedData();
    }).pipe(Effect.provide(rawLayer));

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      assert.deepStrictEqual(yield* runMigrations(), appended);
      assert.deepStrictEqual(yield* readRetainedData(), before);
      const names = yield* schemaNames();
      for (const added of [
        "peer_environment_links",
        "orchestration_v2_projection_turn_items_waiting_link_idx",
      ]) {
        assert.isTrue(names.has(added), added);
      }
      const columns = yield* sql<{
        readonly name: string;
      }>`PRAGMA table_info(peer_environment_links)`;
      assert.isTrue(columns.some((column) => column.name === "fenced"));
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(rawLayer));

    yield* Effect.gen(function* () {
      assert.deepStrictEqual(yield* runMigrations(), []);
      assert.deepStrictEqual(yield* readRetainedData(), before);
    }).pipe(Effect.provide(layerFromPath(filename)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("carries 93 through 96 through a replacement migration runner", () =>
  Effect.gen(function* () {
    const independentRunner = Migrator.make({});
    yield* independentRunner({ loader: makeMigrationLoader(92) });
    assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader() }), appended);
    assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader() }), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rejects upstream-numbered 70 before continuation writes", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 69 });
    yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (70, 'PeerLinks')`;
    const journal = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    const exit = yield* Effect.exit(runMigrations());
    assert.isTrue(Exit.isFailure(exit));
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
      journal,
    );
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
