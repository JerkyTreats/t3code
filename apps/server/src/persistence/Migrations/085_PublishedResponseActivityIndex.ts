import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Shell reads find the latest published answer without sorting the transcript.
  yield* sql`
    CREATE INDEX orchestration_v2_projection_messages_latest_assistant_idx
    ON orchestration_v2_projection_messages(thread_id, updated_at DESC, message_id DESC)
    WHERE role = 'assistant' AND streaming = 0
  `;
});
