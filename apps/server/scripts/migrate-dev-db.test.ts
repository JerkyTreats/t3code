import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../src/persistence/Migrations.ts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrateDevDb } from "./migrate-dev-db.ts";

const withDatabase = <A, E>(
  databasePath: string,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => effect.pipe(Effect.provide(NodeSqliteClient.layer({ filename: databasePath })));

/** A migrated source db with one thread per lifecycle state. Only
 * `stopped-thread` qualifies for the clone. */
const createFixtureSource = Effect.fn("createMigrateDevDbFixtureSource")(function* (
  baseDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stateDir = path.join(baseDir, "userdata");
  const databasePath = path.join(stateDir, "state.sqlite");
  yield* fs.makeDirectory(stateDir, { recursive: true });
  yield* withDatabase(
    databasePath,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      // The real shared db carries this column from a branch build without a
      // matching migration; reproduce that drift so the filter is exercised.
      yield* sql`ALTER TABLE projection_threads ADD COLUMN monitor_json TEXT`;

      yield* sql`INSERT INTO projection_projects
        (project_id, title, workspace_root, scripts_json, created_at, updated_at, deleted_at)
        VALUES
        ('project-kept', 'Kept', '/tmp/kept', '[]', '2026-08-01', '2026-08-01', NULL),
        ('project-deleted', 'Deleted', '/tmp/deleted', '[]', '2026-08-01', '2026-08-02', '2026-08-02')`;

      const threads = [
        ["stopped-thread", "project-kept", "stopped", null, null],
        ["running-thread", "project-kept", "running", null, null],
        ["settled-thread", "project-kept", "stopped", "2026-08-01", null],
        ["monitored-thread", "project-kept", "stopped", null, '{"kind":"pr"}'],
        ["deleted-project-thread", "project-deleted", "stopped", null, null],
      ] as const;
      for (const [threadId, projectId, status, settledAt, monitorJson] of threads) {
        yield* sql`INSERT INTO projection_threads
          (thread_id, project_id, title, created_at, updated_at, settled_at, monitor_json)
          VALUES (${threadId}, ${projectId}, ${threadId}, '2026-08-01', '2026-08-01', ${settledAt}, ${monitorJson})`;
        yield* sql`INSERT INTO projection_thread_sessions (thread_id, status, updated_at)
          VALUES (${threadId}, ${status}, '2026-08-01')`;
        yield* sql`INSERT INTO orchestration_events
          (event_id, aggregate_kind, stream_id, stream_version, event_type, occurred_at, actor_kind, payload_json, metadata_json)
          VALUES (${`event-${threadId}`}, 'thread', ${threadId}, 0, 'thread.created', '2026-08-01', 'user', '{}', '{}')`;
      }
      yield* sql`INSERT INTO auth_clients
        (client_id, label, device_type, platform, granted_scopes, created_at, revision)
        VALUES
        ('client-1', 'Fixture client', 'desktop', 'linux', '["access:read"]', '2026-08-01', 0)`;
      yield* sql`INSERT INTO auth_sessions
        (session_id, client_id, subject, scopes, method, issued_at, expires_at)
        VALUES
        ('session-1', 'client-1', 'user', '["access:read"]', 'pairing', '2026-08-01', '2027-08-01')`;
      yield* sql`INSERT INTO auth_pairing_links
        (id, credential_digest, method, scopes, subject, created_at, expires_at)
        VALUES
        ('pairing-1', 'fixture-digest', 'pairing', '["access:read"]', 'user', '2026-08-01', '2027-08-01')`;
    }),
  );
  return databasePath;
});

it.layer(NodeServices.layer)("migrate-dev-db", (it) => {
  it.effect("keeps only stopped threads from live projects and clears auth state", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const sourceDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-src-" });
      const destDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-dest-" });
      const source = yield* createFixtureSource(sourceDir);

      const result = yield* runMigrateDevDb(
        { baseDir: destDir, source, projects: 5, threadsPerProject: 10 },
        { sharedHome: sourceDir },
      );

      assert.equal(result.databasePath, path.join(destDir, "userdata", "state.sqlite"));
      const kept = yield* withDatabase(
        result.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const threads = yield* sql<{ thread_id: string }>`
            SELECT thread_id FROM projection_threads ORDER BY thread_id`;
          const events = yield* sql<{ stream_id: string }>`
            SELECT stream_id FROM orchestration_events`;
          const [clients] = yield* sql<{ count: number }>`
            SELECT COUNT(*) AS count FROM auth_clients`;
          const [sessions] = yield* sql<{ count: number }>`
            SELECT COUNT(*) AS count FROM auth_sessions`;
          const [pairingLinks] = yield* sql<{ count: number }>`
            SELECT COUNT(*) AS count FROM auth_pairing_links`;
          return {
            threads,
            events,
            clientCount: clients?.count ?? 0,
            sessionCount: sessions?.count ?? 0,
            pairingLinkCount: pairingLinks?.count ?? 0,
          };
        }),
      );
      assert.deepStrictEqual(
        kept.threads.map((row) => row.thread_id),
        ["stopped-thread"],
      );
      assert.deepStrictEqual(
        kept.events.map((row) => row.stream_id),
        ["stopped-thread"],
      );
      assert.equal(kept.clientCount, 0);
      assert.equal(kept.sessionCount, 0);
      assert.equal(kept.pairingLinkCount, 0);
    }),
  );

  it.effect("rejects an unsupported migration identity before replacing the destination", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const sourceDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-slot-" });
      const destDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-slot-dest-" });
      const source = yield* createFixtureSource(sourceDir);
      const destination = path.join(destDir, "userdata", "state.sqlite");
      yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
      yield* withDatabase(
        destination,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`CREATE TABLE destination_marker (value TEXT NOT NULL)`;
          yield* sql`INSERT INTO destination_marker VALUES ('preserved')`;
        }),
      );
      yield* withDatabase(
        source,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`UPDATE effect_sql_migrations
            SET name = 'SomebodyElsesMigration' WHERE migration_id = 1`;
        }),
      );

      const error = yield* runMigrateDevDb(
        { baseDir: destDir, source, projects: 5, threadsPerProject: 10 },
        { sharedHome: sourceDir },
      ).pipe(Effect.flip);
      assert.equal(error._tag, "MigrateDevDbPhaseError");
      if (error._tag === "MigrateDevDbPhaseError") {
        assert.equal(error.phase, "migrate");
      }
      const marker = yield* withDatabase(
        destination,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{ value: string }>`SELECT value FROM destination_marker`;
        }),
      );
      assert.deepStrictEqual(marker, [{ value: "preserved" }]);
      assert.equal(yield* fs.exists(`${destination}.migrate-dev-db-tmp`), false);
    }),
  );

  it.effect("accepts a characterized historical migration prefix", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const sourceDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-history-" });
      const destDir = yield* fs.makeTempDirectoryScoped({
        prefix: "migrate-dev-db-history-dest-",
      });
      const source = yield* createFixtureSource(sourceDir);
      yield* withDatabase(
        source,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`UPDATE effect_sql_migrations
            SET name = 'RepairProjectionThreadShellSummary' WHERE migration_id = 31`;
        }),
      );

      const result = yield* runMigrateDevDb(
        { baseDir: destDir, source, projects: 5, threadsPerProject: 10 },
        { sharedHome: sourceDir },
      );
      const journal = yield* withDatabase(
        result.databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{ name: string }>`
            SELECT name FROM effect_sql_migrations WHERE migration_id = 31`;
        }),
      );
      assert.deepStrictEqual(journal, [{ name: "RepairProjectionThreadShellSummary" }]);
    }),
  );

  it.effect("refuses while a dev server holds the destination", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const sourceDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-busy-" });
      const destDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-busy-dest-" });
      const source = yield* createFixtureSource(sourceDir);
      // This test process stands in for a live dev server.
      const stateDir = path.join(destDir, "userdata");
      yield* fs.makeDirectory(stateDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(stateDir, "server-runtime.json"),
        `{"version":1,"pid":${process.pid}}`,
      );

      const error = yield* runMigrateDevDb(
        { baseDir: destDir, source, projects: 5, threadsPerProject: 10 },
        { sharedHome: sourceDir },
      ).pipe(Effect.flip);
      assert.equal(error._tag, "MigrateDevDbServerRunningError");
      if (error._tag === "MigrateDevDbServerRunningError") {
        assert.equal(error.pid, process.pid);
      }
    }),
  );

  it.effect("refuses a source that resolves to a destination path", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const sharedDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-overlap-" });
      const destDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-overlap-dest-" });
      // A leftover snapshot from a prior failed run, passed as --source: it
      // must not be deleted before it is read.
      const leftoverSnapshot = path.join(destDir, "userdata", "state.sqlite.migrate-dev-db-tmp");
      yield* fs.makeDirectory(path.dirname(leftoverSnapshot), { recursive: true });
      yield* fs.writeFileString(leftoverSnapshot, "not a real db");

      const error = yield* runMigrateDevDb(
        { baseDir: destDir, source: leftoverSnapshot, projects: 5, threadsPerProject: 10 },
        { sharedHome: sharedDir },
      ).pipe(Effect.flip);
      assert.equal(error._tag, "MigrateDevDbSourceIsDestinationError");
      assert.equal(yield* fs.exists(leftoverSnapshot), true);
    }),
  );

  it.effect("refuses to rebuild the shared home", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const sourceDir = yield* fs.makeTempDirectoryScoped({ prefix: "migrate-dev-db-shared-" });
      const source = yield* createFixtureSource(sourceDir);

      const error = yield* runMigrateDevDb(
        { baseDir: sourceDir, source, projects: 5, threadsPerProject: 10 },
        { sharedHome: sourceDir },
      ).pipe(Effect.flip);
      assert.equal(error._tag, "MigrateDevDbSharedHomeError");
    }),
  );
});
