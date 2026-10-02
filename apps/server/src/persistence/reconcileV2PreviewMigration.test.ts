import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "./Migrations.ts";

// Preview ledgers are not a characterized fork lineage. Startup must never
// renumber their identities or discard their retained import progress.
describe("V2 preview fork rejection", () => {
  for (const previewId of [53, 54]) {
    it.effect(`rejects preview identity ${previewId} before continuation writes`, () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* runMigrations({ toMigrationInclusive: 67 });
        yield* sql`UPDATE effect_sql_migrations SET name = 'OrchestrationV2'
          WHERE migration_id = ${previewId}`;
        yield* sql`CREATE TABLE synthetic_preview_progress (imported_message_count INTEGER)`;
        yield* sql`INSERT INTO synthetic_preview_progress VALUES (42)`;
        const history = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
        const error = yield* Effect.flip(runMigrations());
        assert.match(error.message, /Unsupported fork migration identity/);
        assert.deepStrictEqual(
          yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
          history,
        );
        assert.deepStrictEqual(yield* sql`SELECT * FROM synthetic_preview_progress`, [
          { imported_message_count: 42 },
        ]);
        assert.deepStrictEqual(
          yield* sql`SELECT name FROM sqlite_master
          WHERE name = 'orchestration_v2_legacy_imports'`,
          [],
        );
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
    );
  }
});
