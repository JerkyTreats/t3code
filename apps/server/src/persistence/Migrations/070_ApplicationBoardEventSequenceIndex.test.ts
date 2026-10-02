import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";

it.effect("indexes Board history with projects and V2 threads at one sequence boundary", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 69 });
    yield* sql`INSERT INTO orchestration_events (
      event_id, aggregate_kind, stream_id, stream_version, event_type,
      occurred_at, actor_kind, payload_json, metadata_json, application_event_version
    ) VALUES
      ('synthetic-legacy-thread', 'thread', 'synthetic-thread', 0, 'thread.created',
        '2026-01-01', 'server', '{}', '{}', 1),
      ('synthetic-board', 'board', 'global', 0, 'board.post-published',
        '2026-01-01', 'server', '{}', '{}', 1),
      ('synthetic-v2-thread', 'thread', 'synthetic-thread', 1, 'thread.created',
        '2026-01-01', 'server', '{}', '{}', 2)`;
    yield* runMigrations();
    const rows = yield* sql<{ readonly event_id: string }>`SELECT event_id
      FROM orchestration_events INDEXED BY idx_orchestration_events_application_high_water
      WHERE aggregate_kind IN ('project', 'board')
        OR (application_event_version = 2 AND aggregate_kind = 'thread')
      ORDER BY sequence`;
    assert.deepStrictEqual(
      rows.map(({ event_id }) => event_id),
      ["synthetic-board", "synthetic-v2-thread"],
    );
    assert.deepStrictEqual(yield* runMigrations(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
