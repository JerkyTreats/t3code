import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));
const decodeUnknownJsonString = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);

layer("035_ProjectionThreadStatusSummary", (it) => {
  it.effect("adds nullable status summary columns idempotently", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 34 });
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
          'thread-migration-plan',
          'project-migration-plan',
          'Thread Migration Plan',
          '{"provider":"codex","model":"gpt-5-codex"}',
          'full-access',
          'default',
          NULL,
          NULL,
          'turn-migration-plan',
          '2026-05-01T00:00:01.000Z',
          0,
          0,
          0,
          '2026-05-01T00:00:00.000Z',
          '2026-05-01T00:00:02.000Z',
          NULL,
          NULL
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
        VALUES (
          'activity-migration-plan',
          'thread-migration-plan',
          'turn-migration-plan',
          'info',
          'turn.plan.updated',
          'Plan updated',
          '{"plan":[{"step":"Inspect","status":"completed"},{"step":"Implement","status":"in_progress"},{"step":"Verify","status":"pending"}]}',
          1,
          '2026-05-01T00:00:03.000Z'
        )
      `;
      yield* runMigrations({ toMigrationInclusive: 35 });
      yield* runMigrations({ toMigrationInclusive: 35 });

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_threads)
      `;
      const byName = new Map(columns.map((column) => [column.name, column] as const));

      assert.strictEqual(byName.get("active_plan_progress_json")?.notnull, 0);
      assert.strictEqual(byName.get("latest_runtime_activity_at")?.notnull, 0);
      assert.strictEqual(byName.get("status_summary_updated_at")?.notnull, 0);

      const rows = yield* sql<{
        readonly activePlanProgressJson: string | null;
        readonly latestRuntimeActivityAt: string | null;
        readonly statusSummaryUpdatedAt: string | null;
      }>`
        SELECT
          active_plan_progress_json AS "activePlanProgressJson",
          latest_runtime_activity_at AS "latestRuntimeActivityAt",
          status_summary_updated_at AS "statusSummaryUpdatedAt"
        FROM projection_threads
        WHERE thread_id = 'thread-migration-plan'
      `;
      assert.deepStrictEqual(decodeUnknownJsonString(rows[0]?.activePlanProgressJson ?? "null"), {
        completedAllSteps: false,
        currentStepNumber: 2,
        totalSteps: 3,
        turnId: "turn-migration-plan",
        activityId: "activity-migration-plan",
        updatedAt: "2026-05-01T00:00:03.000Z",
      });
      assert.strictEqual(rows[0]?.latestRuntimeActivityAt, "2026-05-01T00:00:03.000Z");
      assert.strictEqual(rows[0]?.statusSummaryUpdatedAt, "2026-05-01T00:00:03.000Z");
    }),
  );
});
