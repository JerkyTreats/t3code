import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_board_posts
    ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  `;
  yield* sql`
    ALTER TABLE projection_board_posts
    ADD COLUMN updated_event_sequence INTEGER NOT NULL DEFAULT 0
  `;
  yield* sql`
    ALTER TABLE projection_board_posts
    ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''
  `;
  yield* sql`
    ALTER TABLE projection_board_posts
    ADD COLUMN last_editor_json TEXT NOT NULL DEFAULT '{}'
  `;
  yield* sql`
    ALTER TABLE projection_board_posts
    ADD COLUMN last_editor_source_json TEXT
  `;

  yield* sql`
    UPDATE projection_board_posts
    SET
      updated_event_sequence = event_sequence,
      updated_at = created_at,
      author_json = json_object(
        'kind',
        'agent',
        'id',
        'legacy-' || substr(post_id, 1, 505),
        'providerInstanceId',
        json_extract(author_json, '$.providerInstanceId')
      ),
      last_editor_json = json_object('kind', 'agent'),
      last_editor_source_json = json_object('projectId', project_id, 'threadId', thread_id)
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projection_board_posts_updated_sequence
    ON projection_board_posts(updated_event_sequence)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_board_post_revisions (
      post_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      event_sequence INTEGER NOT NULL UNIQUE,
      body TEXT NOT NULL,
      targets_json TEXT NOT NULL,
      editor_json TEXT NOT NULL,
      editor_source_json TEXT,
      edited_at TEXT NOT NULL,
      PRIMARY KEY (post_id, revision)
    )
  `;

  yield* sql`
    INSERT INTO projection_board_post_revisions (
      post_id,
      revision,
      event_sequence,
      body,
      targets_json,
      editor_json,
      editor_source_json,
      edited_at
    )
    SELECT
      post_id,
      1,
      event_sequence,
      body,
      targets_json,
      json_object('kind', 'agent'),
      json_object('projectId', project_id, 'threadId', thread_id),
      created_at
    FROM projection_board_posts
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_board_post_revisions_history
    ON projection_board_post_revisions(post_id, revision DESC)
  `;
});
