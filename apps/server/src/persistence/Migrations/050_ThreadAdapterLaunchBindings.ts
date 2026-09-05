import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE thread_adapter_launch_bindings (
      launch_key TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE INDEX thread_adapter_launch_bindings_last_used
    ON thread_adapter_launch_bindings (last_used_at)
  `;
  yield* sql`
    CREATE TABLE thread_adapter_expired_launches (
      launch_key TEXT PRIMARY KEY CHECK (length(launch_key) = 64),
      project_id TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TRIGGER thread_adapter_expired_launches_capacity
    BEFORE INSERT ON thread_adapter_expired_launches
    WHEN (SELECT COUNT(*) FROM thread_adapter_expired_launches) >= 512
      AND NOT EXISTS (
        SELECT 1 FROM thread_adapter_expired_launches WHERE launch_key = NEW.launch_key
      )
    BEGIN
      SELECT RAISE(ABORT, 'thread adapter expired launch capacity exhausted');
    END
  `;
  yield* sql`
    CREATE TRIGGER thread_adapter_launch_bindings_capacity
    BEFORE INSERT ON thread_adapter_launch_bindings
    WHEN (SELECT COUNT(*) FROM thread_adapter_launch_bindings) >= 512
      AND NOT EXISTS (
        SELECT 1 FROM thread_adapter_launch_bindings WHERE launch_key = NEW.launch_key
      )
    BEGIN
      SELECT RAISE(ABORT, 'thread adapter launch binding capacity exhausted');
    END
  `;
  yield* sql`
    CREATE TRIGGER thread_adapter_launch_bindings_expiry_tombstone
    AFTER DELETE ON thread_adapter_launch_bindings
    WHEN NOT EXISTS (
      SELECT 1
      FROM orchestration_events
      WHERE command_id = 'server-bootstrap:server-bootstrap:thread-adapter:' || substr(OLD.launch_key, 1, 40) || ':thread-create'
        AND event_type = 'thread.created'
    )
    BEGIN
      INSERT OR IGNORE INTO thread_adapter_expired_launches (launch_key, project_id)
      VALUES (OLD.launch_key, OLD.project_id);
    END
  `;
});
