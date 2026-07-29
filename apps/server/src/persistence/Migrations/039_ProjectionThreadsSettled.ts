import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN settled_override TEXT
    CHECK (
      settled_override IS NULL
      OR settled_override IN ('settled', 'active')
    )
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN settled_at TEXT
  `;
});
