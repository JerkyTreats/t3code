import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";
import migrateCreationSurface from "./067_ProjectionThreadCreationSurface.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))(
  "067_ProjectionThreadCreationSurface",
  (it) => {
    it.effect("preserves existing threads without assigning an origin", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* runMigrations({ toMigrationInclusive: 66 });
        yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, model_selection_json, runtime_mode,
            created_at, updated_at
          ) VALUES (
            'older-thread', 'project-1', 'Older thread',
            '{"instanceId":"codex","model":"gpt-5"}', 'full-access',
            '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
          )
        `;
        yield* runMigrations({ toMigrationInclusive: 67 });
        const rows = yield* sql<{ readonly surface: string | null }>`
          SELECT creation_surface AS surface FROM projection_threads
          WHERE thread_id = 'older-thread'
        `;
        assert.deepEqual(rows, [{ surface: null }]);
        yield* migrateCreationSurface;
      }),
    );
  },
);
