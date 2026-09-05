// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import {
  backupDatabaseBeforeMigration42,
  migration42BackupDirectory,
  restoreMigration42Backup,
} from "./Migration42Backup.ts";

const provideDatabase = <A, E, R>(databasePath: string, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeSqliteClient.layer({ filename: databasePath })), Effect.scoped);

const prepareDatabase = Effect.fn("Migration42BackupTest.prepareDatabase")(function* (
  migrationId: 40 | 41 | 42 | 43,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`PRAGMA journal_mode = WAL`;
  yield* sql`PRAGMA wal_autocheckpoint = 0`;
  yield* sql`
    CREATE TABLE effect_sql_migrations (
      migration_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )
  `;
  yield* sql`
    INSERT INTO effect_sql_migrations (migration_id, name)
    VALUES (
      ${migrationId},
      ${migrationId === 40 ? "ForkMigration40" : "ReconcileUpstreamAndSettingsAdmin"}
    )
  `;
  yield* sql`CREATE TABLE durable_values (value TEXT NOT NULL)`;
  yield* sql`INSERT INTO durable_values (value) VALUES ('before')`;
});

const prepareConvergedAuthSchema = Effect.fn("Migration42BackupTest.prepareConvergedAuthSchema")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
    CREATE TABLE auth_sessions (
      session_id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      client_surface TEXT,
      client_app_version TEXT,
      authority_class TEXT
    )
  `;
    yield* sql`
    CREATE TABLE auth_clients (
      client_id TEXT PRIMARY KEY,
      granted_scopes TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    )
  `;
    yield* sql`
    CREATE TABLE auth_pairing_links (
      id TEXT PRIMARY KEY,
      credential_digest TEXT NOT NULL UNIQUE
    )
  `;
  },
);

it.layer(NodeServices.layer)("migration 42 database backup", (it) => {
  it.effect("creates and restores a validated WAL-mode SQLite snapshot", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-migration-42-" });
      const databasePath = path.join(directory, "state.sqlite");

      yield* provideDatabase(
        databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* prepareDatabase(40);
          yield* backupDatabaseBeforeMigration42(databasePath);
          yield* sql`UPDATE durable_values SET value = 'after'`;
          yield* backupDatabaseBeforeMigration42(databasePath);
        }),
      );

      const backupDirectory = migration42BackupDirectory(databasePath);
      assert.equal((yield* fileSystem.stat(backupDirectory)).mode & 0o777, 0o700);
      assert.equal(
        (yield* fileSystem.stat(path.join(backupDirectory, "database"))).mode & 0o777,
        0o600,
      );
      assert.equal(
        (yield* fileSystem.stat(path.join(backupDirectory, "manifest.json"))).mode & 0o777,
        0o600,
      );

      yield* restoreMigration42Backup(databasePath);
      const restored = yield* provideDatabase(
        databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{ readonly value: string }>`SELECT value FROM durable_values`;
        }),
      );
      assert.deepStrictEqual(restored, [{ value: "before" }]);
      assert.isFalse(yield* fileSystem.exists(`${databasePath}-wal`));
      assert.isFalse(yield* fileSystem.exists(`${databasePath}-shm`));
    }),
  );

  it.effect("does not recreate a removed backup after migration 42 is accepted", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-migration-42-" });
      const databasePath = path.join(directory, "state.sqlite");
      const backupDirectory = migration42BackupDirectory(databasePath);

      yield* provideDatabase(
        databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* prepareDatabase(40);
          yield* backupDatabaseBeforeMigration42(databasePath);
          yield* prepareConvergedAuthSchema();
          yield* sql`
            INSERT INTO effect_sql_migrations (migration_id, name)
            VALUES (42, 'ReconcileUpstreamAndSettingsAdmin')
          `;
          yield* fileSystem.remove(backupDirectory, { recursive: true });
          yield* backupDatabaseBeforeMigration42(databasePath);
        }),
      );

      assert.isFalse(yield* fileSystem.exists(backupDirectory));
    }),
  );

  it.effect("backs up a canonical auth schema while migration 42 remains unjournaled", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-migration-42-" });
      const databasePath = path.join(directory, "state.sqlite");

      yield* provideDatabase(
        databasePath,
        Effect.gen(function* () {
          yield* prepareDatabase(40);
          yield* prepareConvergedAuthSchema();
          yield* backupDatabaseBeforeMigration42(databasePath);
        }),
      );

      assert.isTrue(yield* fileSystem.exists(migration42BackupDirectory(databasePath)));
    }),
  );

  it.effect("does not back up when the journal has advanced beyond migration 42", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-migration-42-" });
      const databasePath = path.join(directory, "state.sqlite");

      yield* provideDatabase(
        databasePath,
        Effect.gen(function* () {
          yield* prepareDatabase(43);
          yield* backupDatabaseBeforeMigration42(databasePath);
        }),
      );

      assert.isFalse(yield* fileSystem.exists(migration42BackupDirectory(databasePath)));
    }),
  );

  it.effect("backs up an already-journaled fork migration 41 and preserves its old backup", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-migration-42-" });
      const databasePath = path.join(directory, "state.sqlite");
      const oldBackupDirectory = `${databasePath}.pre-migration-41-backup`;
      const oldMarker = path.join(oldBackupDirectory, "retained-marker");

      yield* fileSystem.makeDirectory(oldBackupDirectory, { mode: 0o700 });
      yield* fileSystem.writeFileString(oldMarker, "retained\n", { mode: 0o600 });
      yield* provideDatabase(
        databasePath,
        Effect.gen(function* () {
          yield* prepareDatabase(41);
          yield* backupDatabaseBeforeMigration42(databasePath);
        }),
      );

      assert.isTrue(yield* fileSystem.exists(migration42BackupDirectory(databasePath)));
      assert.equal(yield* fileSystem.readFileString(oldMarker), "retained\n");
    }),
  );

  it.effect("leaves the live database unchanged when the backup image is missing or corrupt", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-migration-42-" });
      const databasePath = path.join(directory, "state.sqlite");
      const backupDirectory = migration42BackupDirectory(databasePath);
      const backupPath = path.join(backupDirectory, "database");

      yield* provideDatabase(
        databasePath,
        Effect.gen(function* () {
          yield* prepareDatabase(40);
          yield* backupDatabaseBeforeMigration42(databasePath);
        }),
      );
      const liveBefore = yield* fileSystem.readFile(databasePath);

      yield* fileSystem.writeFileString(backupPath, "corrupt", { mode: 0o600 });
      const corruptResult = yield* Effect.exit(restoreMigration42Backup(databasePath));
      assert.isTrue(Exit.isFailure(corruptResult));
      assert.deepStrictEqual(yield* fileSystem.readFile(databasePath), liveBefore);

      yield* fileSystem.remove(backupPath);
      const missingResult = yield* Effect.exit(restoreMigration42Backup(databasePath));
      assert.isTrue(Exit.isFailure(missingResult));
      assert.deepStrictEqual(yield* fileSystem.readFile(databasePath), liveBefore);
    }),
  );

  it.effect("produces an integral snapshot while another connection writes", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-migration-42-" });
      const databasePath = path.join(directory, "state.sqlite");

      yield* provideDatabase(
        databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* prepareDatabase(40);
          for (let index = 0; index < 2_000; index += 1) {
            yield* sql`INSERT INTO durable_values (value) VALUES (${`seed-${index}`})`;
          }
        }),
      );

      const backup = provideDatabase(
        databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`PRAGMA busy_timeout = 5000`;
          yield* backupDatabaseBeforeMigration42(databasePath);
        }),
      );
      const writer = provideDatabase(
        databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`PRAGMA busy_timeout = 5000`;
          for (let index = 0; index < 100; index += 1) {
            yield* sql`INSERT INTO durable_values (value) VALUES (${`writer-${index}`})`;
          }
        }),
      );
      yield* Effect.all([backup, writer], { concurrency: "unbounded" });
      yield* restoreMigration42Backup(databasePath);

      const integrity = yield* provideDatabase(
        databasePath,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          return yield* sql<{ readonly integrity_check: string }>`PRAGMA integrity_check`;
        }),
      );
      assert.deepStrictEqual(integrity, [{ integrity_check: "ok" }]);
      assert.isTrue(NodeFS.statSync(databasePath).isFile());
    }),
  );
});
