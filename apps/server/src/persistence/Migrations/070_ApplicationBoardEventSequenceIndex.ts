import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Include retained Board history in the shared application sequence boundary. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DROP INDEX idx_orchestration_events_application_high_water`;
  yield* sql`
    CREATE INDEX idx_orchestration_events_application_high_water
    ON orchestration_events(sequence)
    WHERE aggregate_kind IN ('project', 'board')
      OR (application_event_version = 2 AND aggregate_kind = 'thread')
  `;
});
