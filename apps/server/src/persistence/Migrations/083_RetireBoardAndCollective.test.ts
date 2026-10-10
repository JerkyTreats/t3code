import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import { prepareReleasedForkMigration41State } from "./fixtures/AuthLineageFixtures.ts";

const retiredIdentities = [
  [43, "ProjectionBoardPosts"],
  [44, "ProjectionBoardPostRevisions"],
  [45, "CollectiveExpeditions"],
  [46, "CollectiveResidentRuntime"],
  [47, "CollectiveResidentTurnSettlements"],
  [48, "CollectiveWeeklyQuotaObservations"],
  [49, "CollectiveFanoutRuns"],
  [70, "ApplicationBoardEventSequenceIndex"],
] as const;

const retiredTables = new Set([
  "collective_fanout_members",
  "collective_fanout_runs",
  "collective_resident_turn_settlements",
  "collective_resident_runtime",
  "collective_weekly_quota_observations",
  "collective_expeditions",
  "projection_board_post_revisions",
  "projection_board_posts",
]);

const inspectRetiredSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql`SELECT name FROM sqlite_master
    WHERE name GLOB 'collective_*' OR name GLOB '*board*'`;
});

// Minimal synthetic installed schema captures ownership and real foreign-key
// dependencies without retaining retired product contracts or implementations.
const prepareInstalledState = Effect.fn("prepareInstalledState")(function* (throughId: number) {
  const sql = yield* SqlClient.SqlClient;
  yield* prepareReleasedForkMigration41State();
  yield* runMigrations({ toMigrationInclusive: throughId });
  for (const [id, name] of retiredIdentities) {
    if (id <= throughId) {
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${id}, ${name})`;
    }
  }
  yield* sql`CREATE TABLE collective_expeditions (id TEXT PRIMARY KEY)`;
  yield* sql`CREATE TABLE collective_fanout_runs (id TEXT PRIMARY KEY)`;
  yield* sql`CREATE TABLE collective_fanout_members (
    id TEXT PRIMARY KEY, run_id TEXT REFERENCES collective_fanout_runs(id),
    expedition_id TEXT REFERENCES collective_expeditions(id))`;
  yield* sql`CREATE TABLE collective_resident_runtime (
    id TEXT PRIMARY KEY, expedition_id TEXT REFERENCES collective_expeditions(id))`;
  yield* sql`CREATE TABLE collective_resident_turn_settlements (
    id TEXT PRIMARY KEY, expedition_id TEXT REFERENCES collective_expeditions(id),
    parent_id TEXT REFERENCES collective_resident_turn_settlements(id))`;
  for (const name of [
    "collective_weekly_quota_observations",
    "projection_board_post_revisions",
    "projection_board_posts",
  ]) {
    yield* sql`CREATE TABLE ${sql(name)} (id TEXT PRIMARY KEY)`;
  }
  yield* sql`INSERT INTO collective_expeditions VALUES ('synthetic-expedition')`;
  yield* sql`INSERT INTO collective_fanout_runs VALUES ('synthetic-run')`;
  yield* sql`INSERT INTO collective_fanout_members
    VALUES ('synthetic-member', 'synthetic-run', 'synthetic-expedition')`;
  yield* sql`INSERT INTO collective_resident_runtime
    VALUES ('synthetic-runtime', 'synthetic-expedition')`;
  yield* sql`INSERT INTO collective_resident_turn_settlements
    VALUES ('synthetic-parent', 'synthetic-expedition', NULL),
      ('synthetic-child', 'synthetic-expedition', 'synthetic-parent')`;
  yield* runMigrations({ toMigrationInclusive: 82 });
  if (throughId >= 70) {
    yield* sql`DROP INDEX idx_orchestration_events_application_high_water`;
    yield* sql`CREATE INDEX idx_orchestration_events_application_high_water
      ON orchestration_events(sequence) WHERE aggregate_kind IN ('project', 'board')
        OR (application_event_version = 2 AND aggregate_kind = 'thread')`;
  }

  for (const [sequence, kind] of [
    [901, "project"],
    [902, "board"],
    [903, "thread"],
    [904, "board"],
  ] as const) {
    yield* sql`INSERT INTO orchestration_events (
      sequence, event_id, aggregate_kind, stream_id, stream_version, event_type,
      occurred_at, actor_kind, payload_json, metadata_json, application_event_version
    ) VALUES (${sequence}, ${`synthetic-${sequence}`}, ${kind}, ${`synthetic-${kind}`}, ${sequence},
      ${`${kind}.synthetic`}, '2026-01-01', 'server', '{}', '{}', 2)`;
    yield* sql`INSERT INTO orchestration_command_receipts (
      command_id, aggregate_kind, aggregate_id, accepted_at, result_sequence, status,
      payload_fingerprint
    ) VALUES (${`synthetic-${sequence}`}, ${kind}, ${`synthetic-${kind}`},
      '2026-01-01', ${sequence}, 'accepted', 'synthetic-fingerprint')`;
  }
  yield* sql`INSERT INTO projection_state VALUES
    ('projection.board-posts', 904, '2026-01-01'),
    ('projection.projects', 903, '2026-01-01')`;
});

const readSurvivingData = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql<{ readonly name: string }>`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'effect_sql_migrations'
    ORDER BY name`;
  return yield* Effect.forEach(
    tables.filter(({ name }) => !retiredTables.has(name)),
    ({ name }) =>
      Effect.gen(function* () {
        const rows =
          name === "orchestration_events" || name === "orchestration_command_receipts"
            ? yield* sql`SELECT * FROM ${sql(name)} WHERE aggregate_kind != 'board'`
            : name === "projection_state"
              ? yield* sql`SELECT * FROM projection_state WHERE projector != 'projection.board-posts'`
              : yield* sql`SELECT * FROM ${sql(name)}`;
        return { name, rows };
      }),
    { concurrency: 1 },
  );
});

it.effect("fresh databases omit retired schema and execution identities", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations();
    assert.deepStrictEqual(yield* inspectRetiredSchema, []);
    assert.deepStrictEqual(
      yield* sql`SELECT migration_id FROM effect_sql_migrations
        WHERE migration_id BETWEEN 43 AND 49 OR migration_id = 70`,
      [],
    );
    assert.deepStrictEqual(yield* runMigrations(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect.each([43, 49, 82])(
  "retires installed history %s while preserving all surviving rows and journal evidence",
  (throughId) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* prepareInstalledState(throughId);
      const before = yield* readSurvivingData;
      const journal = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
      assert.deepStrictEqual(yield* runMigrations(), [[83, "RetireBoardAndCollective"]]);
      assert.deepStrictEqual(yield* inspectRetiredSchema, []);
      assert.deepStrictEqual(yield* readSurvivingData, before);
      assert.deepStrictEqual(
        yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id < 83 ORDER BY migration_id`,
        journal,
      );
      assert.deepStrictEqual(
        yield* sql`SELECT sequence FROM orchestration_events ORDER BY sequence`,
        [{ sequence: 901 }, { sequence: 903 }],
      );
      assert.deepStrictEqual(
        yield* sql`SELECT seq FROM sqlite_sequence WHERE name = 'orchestration_events'`,
        [{ seq: 904 }],
      );
      assert.deepStrictEqual(
        yield* sql`SELECT MAX(sequence) AS sequence FROM orchestration_events
        INDEXED BY idx_orchestration_events_application_high_water
        WHERE aggregate_kind = 'project' OR (application_event_version = 2 AND aggregate_kind = 'thread')`,
        [{ sequence: 903 }],
      );
      assert.deepStrictEqual(yield* sql`PRAGMA foreign_key_check`, []);
      // Removed tail events must not let a future append reuse an issued cursor.
      assert.deepStrictEqual(
        yield* sql`INSERT INTO orchestration_events (
        event_id, aggregate_kind, stream_id, stream_version, event_type,
        occurred_at, actor_kind, payload_json, metadata_json, application_event_version
      ) VALUES ('synthetic-next', 'project', 'synthetic-next', 0, 'project.synthetic',
        '2026-01-02', 'server', '{}', '{}', 2) RETURNING sequence`,
        [{ sequence: 905 }],
      );
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("rolls back retirement data and journal together before retrying", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* prepareInstalledState(82);
    yield* sql`CREATE TRIGGER fail_retirement BEFORE DELETE ON orchestration_events
      WHEN OLD.aggregate_kind = 'board' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`;
    const journal = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    const schema = yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`;
    const receipts = yield* sql`SELECT * FROM orchestration_command_receipts ORDER BY command_id`;
    assert.isTrue(Exit.isFailure(yield* Effect.exit(runMigrations())));
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`,
      journal,
    );
    assert.deepStrictEqual(yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`, schema);
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM orchestration_command_receipts ORDER BY command_id`,
      receipts,
    );
    yield* sql`DROP TRIGGER fail_retirement`;
    assert.deepStrictEqual(yield* runMigrations(), [[83, "RetireBoardAndCollective"]]);
    assert.deepStrictEqual(yield* inspectRetiredSchema, []);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
