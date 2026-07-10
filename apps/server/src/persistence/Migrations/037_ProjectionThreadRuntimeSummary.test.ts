import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";
import Migration0037 from "./037_ProjectionThreadRuntimeSummary.ts";

const decodeUnknownJsonString = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);
const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));
const freshLayer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));
const allColumnsLayer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));
const releasedMigration36Layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("037_ProjectionThreadRuntimeSummary", (it) => {
  it.effect("upgrades the released migration 36 schema", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 32 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (36, 'ReconcileV0028MigrationHistories')
      `;

      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          branch,
          worktree_path,
          latest_turn_id,
          latest_user_message_at,
          pending_approval_count,
          pending_user_input_count,
          has_actionable_proposed_plan,
          created_at,
          updated_at,
          archived_at,
          deleted_at
        )
        VALUES (
          'thread-runtime-summary',
          'project-runtime-summary',
          'Runtime Summary',
          '{"provider":"codex","model":"gpt-5-codex"}',
          'full-access',
          'default',
          NULL,
          NULL,
          'turn-runtime-summary',
          NULL,
          0,
          0,
          0,
          '2026-07-01T00:00:00.000Z',
          '2026-07-01T00:00:02.000Z',
          NULL,
          NULL
        )
      `;
      yield* sql`
        INSERT INTO projection_thread_messages (
          message_id,
          thread_id,
          turn_id,
          role,
          text,
          is_streaming,
          created_at,
          updated_at
        )
        VALUES (
          'message-runtime-summary',
          'thread-runtime-summary',
          'turn-runtime-summary',
          'user',
          'Continue',
          0,
          '2026-07-01T00:00:03.000Z',
          '2026-07-01T00:00:03.000Z'
        )
      `;
      yield* sql`
        INSERT INTO projection_thread_activities (
          activity_id,
          thread_id,
          turn_id,
          tone,
          kind,
          summary,
          payload_json,
          sequence,
          created_at
        )
        VALUES
          (
            'activity-runtime-plan',
            'thread-runtime-summary',
            'turn-runtime-summary',
            'info',
            'turn.plan.updated',
            'Plan updated',
            '{"plan":[{"step":"Inspect","status":"completed"},{"step":"Implement","status":"in_progress"}]}',
            1,
            '2026-07-01T00:00:04.000Z'
          ),
          (
            'activity-runtime-output',
            'thread-runtime-summary',
            'turn-runtime-summary',
            'tool',
            'tool.output',
            'Runtime output',
            '{"ok":true}',
            2,
            '2026-07-01T00:00:05.000Z'
          )
      `;
      yield* sql`
        INSERT INTO projection_thread_proposed_plans (
          plan_id,
          thread_id,
          turn_id,
          plan_markdown,
          created_at,
          updated_at
        )
        VALUES (
          'plan-runtime-summary',
          'thread-runtime-summary',
          'turn-runtime-summary',
          '# Plan',
          '2026-07-01T00:00:06.000Z',
          '2026-07-01T00:00:07.000Z'
        )
      `;
      yield* sql`
        INSERT INTO projection_pending_approvals (
          request_id,
          thread_id,
          turn_id,
          status,
          decision,
          created_at,
          resolved_at
        )
        VALUES (
          'approval-runtime-summary',
          'thread-runtime-summary',
          'turn-runtime-summary',
          'resolved',
          'approved',
          '2026-07-01T00:00:08.000Z',
          '2026-07-01T00:00:09.000Z'
        )
      `;

      const migration36Before = yield* sql<{ readonly name: string }>`
        SELECT name
        FROM effect_sql_migrations
        WHERE migration_id = 36
      `;
      const executed = yield* runMigrations({ toMigrationInclusive: 37 });
      assert.deepStrictEqual(executed, [[37, "ProjectionThreadRuntimeSummary"]]);
      const migration36After = yield* sql<{ readonly name: string }>`
        SELECT name
        FROM effect_sql_migrations
        WHERE migration_id = 36
      `;
      assert.deepStrictEqual(migration36After, migration36Before);

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      const columnNames = new Set(columns.map((column) => column.name));
      assert.isTrue(columnNames.has("active_plan_progress_json"));
      assert.isTrue(columnNames.has("latest_runtime_activity_at"));
      assert.isTrue(columnNames.has("status_summary_updated_at"));

      const rows = yield* sql<{
        readonly latestUserMessageAt: string | null;
        readonly activePlanProgressJson: string | null;
        readonly latestRuntimeActivityAt: string | null;
        readonly statusSummaryUpdatedAt: string | null;
      }>`
        SELECT
          latest_user_message_at AS "latestUserMessageAt",
          active_plan_progress_json AS "activePlanProgressJson",
          latest_runtime_activity_at AS "latestRuntimeActivityAt",
          status_summary_updated_at AS "statusSummaryUpdatedAt"
        FROM projection_threads
        WHERE thread_id = 'thread-runtime-summary'
      `;
      assert.equal(rows[0]?.latestUserMessageAt, "2026-07-01T00:00:03.000Z");
      assert.deepStrictEqual(decodeUnknownJsonString(rows[0]?.activePlanProgressJson ?? "null"), {
        completedAllSteps: false,
        currentStepNumber: 2,
        totalSteps: 2,
        turnId: "turn-runtime-summary",
        activityId: "activity-runtime-plan",
        updatedAt: "2026-07-01T00:00:04.000Z",
      });
      assert.equal(rows[0]?.latestRuntimeActivityAt, "2026-07-01T00:00:05.000Z");
      assert.equal(rows[0]?.statusSummaryUpdatedAt, "2026-07-01T00:00:09.000Z");
    }),
  );
});

freshLayer("037_ProjectionThreadRuntimeSummary clean migration", (it) => {
  it.effect("migrates a clean database through migration 37", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const executed = yield* runMigrations({ toMigrationInclusive: 37 });
      assert.equal(executed.at(-1)?.[0], 37);

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      const columnNames = new Set(columns.map((column) => column.name));
      assert.isTrue(columnNames.has("active_plan_progress_json"));
      assert.isTrue(columnNames.has("latest_runtime_activity_at"));
      assert.isTrue(columnNames.has("status_summary_updated_at"));
      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 37 }), []);
    }),
  );
});

releasedMigration36Layer("037_ProjectionThreadRuntimeSummary released migration 36", (it) => {
  it.effect("retains the released migration 36 runtime summary schema", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 36 });
      const migration = yield* sql<{ readonly name: string }>`
        SELECT name
        FROM effect_sql_migrations
        WHERE migration_id = 36
      `;
      assert.deepStrictEqual(migration, [{ name: "ReconcileV0028MigrationHistories" }]);

      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_threads)
      `;
      const columnNames = new Set(columns.map((column) => column.name));
      assert.isTrue(columnNames.has("active_plan_progress_json"));
      assert.isTrue(columnNames.has("latest_runtime_activity_at"));
      assert.isTrue(columnNames.has("status_summary_updated_at"));
    }),
  );
});

allColumnsLayer("037_ProjectionThreadRuntimeSummary all columns", (it) => {
  it.effect("reruns safely when every runtime summary column already exists", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 32 });
      yield* sql`
        ALTER TABLE projection_threads
        ADD COLUMN active_plan_progress_json TEXT
      `;
      yield* sql`
        ALTER TABLE projection_threads
        ADD COLUMN latest_runtime_activity_at TEXT
      `;
      yield* sql`
        ALTER TABLE projection_threads
        ADD COLUMN status_summary_updated_at TEXT
      `;
      yield* Migration0037;
    }),
  );
});
