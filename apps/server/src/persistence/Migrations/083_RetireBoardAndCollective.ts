import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Remove only retired aggregates. Their sequence gaps and historical journal
  // identities remain valid evidence for surviving project and thread histories.
  yield* sql`DELETE FROM orchestration_command_receipts WHERE aggregate_kind = 'board'`;
  yield* sql`DELETE FROM orchestration_events WHERE aggregate_kind = 'board'`;
  yield* sql`DELETE FROM projection_state WHERE projector = 'projection.board-posts'`;

  // Drop dependent tables before their parents, including previously retired
  // runtime tables that can remain in supported installed databases.
  yield* sql`DROP TABLE IF EXISTS collective_fanout_members`;
  yield* sql`DROP TABLE IF EXISTS collective_fanout_runs`;
  yield* sql`DROP TABLE IF EXISTS collective_resident_turn_settlements`;
  yield* sql`DROP TABLE IF EXISTS collective_resident_runtime`;
  yield* sql`DROP TABLE IF EXISTS collective_weekly_quota_observations`;
  yield* sql`DROP TABLE IF EXISTS collective_expeditions`;
  yield* sql`DROP TABLE IF EXISTS projection_board_post_revisions`;
  yield* sql`DROP TABLE IF EXISTS projection_board_posts`;

  yield* sql`DROP INDEX idx_orchestration_events_application_high_water`;
  yield* sql`
    CREATE INDEX idx_orchestration_events_application_high_water
    ON orchestration_events(sequence)
    WHERE aggregate_kind = 'project'
      OR (application_event_version = 2 AND aggregate_kind = 'thread')
  `;
});
