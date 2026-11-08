// Upstream migration 80 executes as fork identity 104 (PERSIST.D1, D3, D4).
import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { migrationManifest } from "./ForkMigrationPlan.ts";
import { runMigrations } from "./Migrations.ts";

it("appends upstream 80 after fork 103", () => {
  assert.deepStrictEqual(migrationManifest.slice(-2), [
    [103, "DelegatedRecoveryIndexes"],
    [104, "ScheduledTaskThreadMode"],
  ]);
});

it.effect("continues fork 103 to 104, keeping a task with a thread in that thread", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 103 });
    const insertTask = (taskId: string, threadId: string | null) => sql`
      INSERT INTO scheduled_tasks (
        task_id, title, prompt, enabled, schedule_json, project_id, thread_id,
        workspace_strategy_json, model_selection_json, runtime_mode, interaction_mode,
        created_by, creation_source, created_at, updated_at, last_run_status, run_count
      ) VALUES (
        ${taskId}, 'Synthetic task', 'Synthetic prompt', 1, '{}', 'synthetic-project', ${threadId},
        '{}', '{}', 'full-access', 'default', 'synthetic-user', 'synthetic', '2026-01-01',
        '2026-01-01', 'never', 0
      )
    `;
    yield* insertTask("task-with-thread", "synthetic-thread");
    yield* insertTask("task-without-thread", null);

    assert.deepStrictEqual(yield* runMigrations(), [[104, "ScheduledTaskThreadMode"]]);
    const tasks = yield* sql<{
      readonly task_id: string;
      readonly thread_mode: string;
    }>`SELECT task_id, thread_mode FROM scheduled_tasks ORDER BY task_id`;
    assert.deepStrictEqual(tasks, [
      { task_id: "task-with-thread", thread_mode: "continue" },
      { task_id: "task-without-thread", thread_mode: "new_thread" },
    ]);
    assert.deepStrictEqual(yield* runMigrations(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
