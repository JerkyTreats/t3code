import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("039_ProjectionThreadsSettled", (it) => {
  it.effect("adds nullable settlement state without rewriting schema 38 rows", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 38 });
      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          created_at,
          updated_at
        )
        VALUES (
          'thread-legacy',
          'project-legacy',
          'Legacy thread',
          '{"instanceId":"codex","model":"gpt-5.4"}',
          'full-access',
          'default',
          '2026-07-01T00:00:00.000Z',
          '2026-07-02T00:00:00.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 39 });

      const rows = yield* sql<{
        readonly settledOverride: string | null;
        readonly settledAt: string | null;
        readonly updatedAt: string;
      }>`
        SELECT
          settled_override AS "settledOverride",
          settled_at AS "settledAt",
          updated_at AS "updatedAt"
        FROM projection_threads
        WHERE thread_id = 'thread-legacy'
      `;
      assert.deepStrictEqual(rows, [
        {
          settledOverride: null,
          settledAt: null,
          updatedAt: "2026-07-02T00:00:00.000Z",
        },
      ]);
    }),
  );

  it.effect("accepts only null, settled, or active overrides", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 39 });

      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          created_at,
          updated_at,
          settled_override
        )
        VALUES (
          'thread-settled',
          'project-1',
          'Settled thread',
          '{"instanceId":"codex","model":"gpt-5.4"}',
          'full-access',
          'default',
          '2026-07-01T00:00:00.000Z',
          '2026-07-01T00:00:00.000Z',
          'settled'
        )
      `;
      yield* sql`
        UPDATE projection_threads
        SET settled_override = 'active'
        WHERE thread_id = 'thread-settled'
      `;

      const invalid = yield* Effect.exit(
        sql`
          UPDATE projection_threads
          SET settled_override = 'hidden'
          WHERE thread_id = 'thread-settled'
        `,
      );
      assert.isTrue(invalid._tag === "Failure");
    }),
  );
});
