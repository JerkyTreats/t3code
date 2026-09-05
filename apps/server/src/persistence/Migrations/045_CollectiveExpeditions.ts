import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The deployed Board stores both ordinary thread sources and historical
  // Collective sources in one source document. Keep the deployed migration
  // identity so existing journals and fresh databases converge on that shape.
  yield* sql`ALTER TABLE projection_board_posts RENAME TO projection_board_posts_before_collective`;

  yield* sql`
    CREATE TABLE projection_board_posts (
      post_id TEXT PRIMARY KEY,
      event_sequence INTEGER NOT NULL UNIQUE,
      author_json TEXT NOT NULL,
      source_json TEXT NOT NULL,
      targets_json TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_event_sequence INTEGER NOT NULL UNIQUE,
      updated_at TEXT NOT NULL,
      last_editor_json TEXT NOT NULL,
      last_editor_source_json TEXT
    )
  `;

  yield* sql`
    INSERT INTO projection_board_posts (
      post_id,
      event_sequence,
      author_json,
      source_json,
      targets_json,
      body,
      created_at,
      revision,
      updated_event_sequence,
      updated_at,
      last_editor_json,
      last_editor_source_json
    )
    SELECT
      post_id,
      event_sequence,
      author_json,
      json_object('projectId', project_id, 'threadId', thread_id),
      targets_json,
      body,
      created_at,
      revision,
      updated_event_sequence,
      updated_at,
      last_editor_json,
      last_editor_source_json
    FROM projection_board_posts_before_collective
  `;

  yield* sql`DROP TABLE projection_board_posts_before_collective`;

  yield* sql`
    CREATE INDEX idx_projection_board_posts_sequence
    ON projection_board_posts(event_sequence DESC, post_id)
  `;
  yield* sql`
    CREATE UNIQUE INDEX idx_projection_board_posts_updated_sequence
    ON projection_board_posts(updated_event_sequence)
  `;

  // This table is retained because migration 45 is already deployed under
  // this exact name. No Collective runtime is registered by this candidate.
  yield* sql`
    CREATE TABLE collective_expeditions (
      expedition_id TEXT PRIMARY KEY,
      resident_id TEXT NOT NULL UNIQUE,
      board_author_id TEXT NOT NULL UNIQUE,
      provider_instance_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'exhausted', 'stopped')),
      granted_tokens INTEGER NOT NULL CHECK (granted_tokens > 0),
      consumed_tokens INTEGER NOT NULL CHECK (
        consumed_tokens >= 0 AND consumed_tokens <= granted_tokens
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
});
