import * as NodeCrypto from "node:crypto";

import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const DATABASE_SUFFIXES = ["", "-wal", "-shm"] as const;
const BACKUP_DIRECTORY_SUFFIX = ".pre-migration-42-backup";
const BACKUP_DATABASE_FILE = "database";
const BACKUP_MANIFEST_FILE = "manifest.json";
const SQLITE_HEADER = "SQLite format 3\0";

const BackupManifestSchema = Schema.Struct({
  version: Schema.Literal(1),
  databaseBytes: Schema.Number,
  databaseSha256: Schema.String,
});
type BackupManifest = typeof BackupManifestSchema.Type;
const BackupManifestJson = Schema.fromJsonString(BackupManifestSchema);
const decodeBackupManifest = Schema.decodeUnknownEffect(BackupManifestJson);
const encodeBackupManifest = Schema.encodeEffect(BackupManifestJson);

export const migration42BackupDirectory = (databasePath: string): string =>
  `${databasePath}${BACKUP_DIRECTORY_SUFFIX}`;

export class Migration42BackupNotFoundError extends Schema.TaggedErrorClass<Migration42BackupNotFoundError>()(
  "Migration42BackupNotFoundError",
  { databasePath: Schema.String },
) {}

export class Migration42BackupInvalidError extends Schema.TaggedErrorClass<Migration42BackupInvalidError>()(
  "Migration42BackupInvalidError",
  { databasePath: Schema.String, reason: Schema.String },
) {}

const syncFile = Effect.fn("Migration42Backup.syncFile")(function* (filePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  yield* Effect.scoped(
    fileSystem.open(filePath, { flag: "r" }).pipe(Effect.flatMap((handle) => handle.sync)),
  );
});

const syncDirectory = Effect.fn("Migration42Backup.syncDirectory")(function* (
  directoryPath: string,
) {
  if ((yield* HostProcessPlatform) === "win32") return;
  yield* syncFile(directoryPath);
});

const databaseBackupFile = (backupDirectory: string): string =>
  `${backupDirectory}/${BACKUP_DATABASE_FILE}`;

const manifestFile = (backupDirectory: string): string =>
  `${backupDirectory}/${BACKUP_MANIFEST_FILE}`;

const digestFileHex = Effect.fn("Migration42Backup.digestFileHex")(function* (filePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const hash = NodeCrypto.createHash("sha256");
  yield* Stream.runForEach(fileSystem.stream(filePath), (bytes) =>
    Effect.sync(() => {
      hash.update(bytes);
    }),
  );
  return hash.digest("hex");
});

const invalidBackup = (databasePath: string, reason: string) =>
  new Migration42BackupInvalidError({ databasePath, reason });

const validateBackupDirectory = Effect.fn("Migration42Backup.validateBackupDirectory")(function* (
  databasePath: string,
  backupDirectory: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const backupPath = databaseBackupFile(backupDirectory);
  const manifestPath = manifestFile(backupDirectory);
  if (!(yield* fileSystem.exists(backupPath))) {
    return yield* invalidBackup(databasePath, "The mandatory database snapshot is missing.");
  }
  if (!(yield* fileSystem.exists(manifestPath))) {
    return yield* invalidBackup(databasePath, "The backup manifest is missing.");
  }
  const backupInfo = yield* fileSystem.stat(backupPath);
  if (backupInfo.type !== "File") {
    return yield* invalidBackup(databasePath, "The database snapshot is not a regular file.");
  }

  const headerBytes = yield* Effect.scoped(
    fileSystem
      .open(backupPath, { flag: "r" })
      .pipe(Effect.flatMap((handle) => handle.readAlloc(SQLITE_HEADER.length))),
  );
  const header = Option.match(headerBytes, {
    onNone: () => "",
    onSome: (bytes) => new TextDecoder().decode(bytes),
  });
  if (header !== SQLITE_HEADER) {
    return yield* invalidBackup(
      databasePath,
      "The database snapshot has an invalid SQLite header.",
    );
  }
  const manifestText = yield* fileSystem.readFileString(manifestPath);
  const manifest = yield* decodeBackupManifest(manifestText).pipe(
    Effect.mapError(() => invalidBackup(databasePath, "The backup manifest is invalid.")),
  );
  if (manifest.databaseBytes !== Number(backupInfo.size)) {
    return yield* invalidBackup(databasePath, "The database snapshot size does not match.");
  }
  if (manifest.databaseSha256 !== (yield* digestFileHex(backupPath))) {
    return yield* invalidBackup(databasePath, "The database snapshot checksum does not match.");
  }
});

const migration42IsPending = Effect.fn("Migration42Backup.migration42IsPending")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const journal = yield* sql<{ readonly name: string }>`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'effect_sql_migrations'
  `;
  if (journal.length === 0) {
    const applicationTables = yield* sql<{ readonly count: number }>`
      SELECT COUNT(*) AS "count"
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
    `;
    return (applicationTables[0]?.count ?? 0) > 0;
  }
  const latest = yield* sql<{ readonly migrationId: number | null }>`
    SELECT MAX(migration_id) AS "migrationId"
    FROM effect_sql_migrations
  `;
  return (latest[0]?.migrationId ?? 0) < 42;
});

const assertSqliteIntegrity = Effect.fn("Migration42Backup.assertSqliteIntegrity")(function* (
  databasePath: string,
  backupPath: string,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ATTACH DATABASE ${backupPath} AS migration_42_backup`;
  const rows = yield* sql<{ readonly integrity_check: string }>`
    PRAGMA migration_42_backup.integrity_check
  `.pipe(Effect.ensuring(sql`DETACH DATABASE migration_42_backup`.pipe(Effect.orDie)));
  if (rows.length !== 1 || rows[0]?.integrity_check !== "ok") {
    return yield* invalidBackup(databasePath, "SQLite rejected the generated backup image.");
  }
});

/**
 * Preserve a consistent pre-migration database exactly once while migration 42 is pending.
 *
 * SQLite creates the snapshot under its own consistency boundary. Operators may
 * remove the retained directory after accepting migration 42. Later starts inspect
 * the migration journal and do not recreate a post-migration snapshot. Migration
 * 41 remains pending regardless of its historically colliding journal name.
 */
export const backupDatabaseBeforeMigration42 = Effect.fn(
  "Migration42Backup.backupDatabaseBeforeMigration42",
)(function* (databasePath: string) {
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!(yield* migration42IsPending())) return;

  const destination = migration42BackupDirectory(databasePath);
  if (yield* fileSystem.exists(destination)) {
    yield* validateBackupDirectory(databasePath, destination);
    return;
  }

  const parentDirectory = path.dirname(destination);
  const stagingDirectory = `${destination}.staging-${process.pid}-${yield* crypto.randomUUIDv4}`;
  yield* fileSystem.makeDirectory(stagingDirectory, { recursive: false, mode: 0o700 });
  const backupPath = databaseBackupFile(stagingDirectory);

  yield* Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`VACUUM INTO ${backupPath}`;
    yield* fileSystem.chmod(backupPath, 0o600);
    yield* assertSqliteIntegrity(databasePath, backupPath);

    if (!(yield* migration42IsPending())) return;

    const backupInfo = yield* fileSystem.stat(backupPath);
    const manifest: BackupManifest = {
      version: 1,
      databaseBytes: Number(backupInfo.size),
      databaseSha256: yield* digestFileHex(backupPath),
    };
    const manifestPath = manifestFile(stagingDirectory);
    const encodedManifest = yield* encodeBackupManifest(manifest).pipe(
      Effect.mapError(() =>
        invalidBackup(databasePath, "The backup manifest could not be encoded."),
      ),
    );
    yield* fileSystem.writeFileString(manifestPath, `${encodedManifest}\n`, { mode: 0o600 });
    yield* syncFile(backupPath);
    yield* syncFile(manifestPath);
    yield* syncDirectory(stagingDirectory);
    yield* fileSystem
      .rename(stagingDirectory, destination)
      .pipe(
        Effect.catch((cause) =>
          fileSystem
            .exists(destination)
            .pipe(
              Effect.flatMap((destinationExists) =>
                destinationExists
                  ? fileSystem.remove(stagingDirectory, { recursive: true, force: true })
                  : Effect.fail(cause),
              ),
            ),
        ),
      );
    yield* validateBackupDirectory(databasePath, destination);
    yield* syncDirectory(parentDirectory);
  }).pipe(
    Effect.ensuring(
      fileSystem.remove(stagingDirectory, { recursive: true, force: true }).pipe(Effect.ignore),
    ),
  );
});

/** Restore a validated snapshot while the server and every SQLite client are closed. */
export const restoreMigration42Backup = Effect.fn("Migration42Backup.restoreMigration42Backup")(
  function* (databasePath: string) {
    const crypto = yield* Crypto.Crypto;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sourceDirectory = migration42BackupDirectory(databasePath);
    if (!(yield* fileSystem.exists(sourceDirectory))) {
      return yield* new Migration42BackupNotFoundError({ databasePath });
    }
    yield* validateBackupDirectory(databasePath, sourceDirectory);

    const restorePath = `${databasePath}.restore-${process.pid}-${yield* crypto.randomUUIDv4}`;
    yield* Effect.gen(function* () {
      yield* fileSystem.copyFile(databaseBackupFile(sourceDirectory), restorePath);
      yield* fileSystem.chmod(restorePath, 0o600);
      yield* syncFile(restorePath);
      yield* fileSystem.rename(restorePath, databasePath);
      for (const suffix of DATABASE_SUFFIXES.slice(1)) {
        yield* fileSystem.remove(`${databasePath}${suffix}`, { force: true });
      }
      yield* syncDirectory(path.dirname(databasePath));
    }).pipe(Effect.ensuring(fileSystem.remove(restorePath, { force: true }).pipe(Effect.ignore)));
  },
);
