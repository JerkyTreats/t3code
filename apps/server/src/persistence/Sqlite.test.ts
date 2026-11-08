// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import type * as NodeWorkerThreads from "node:worker_threads";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { prepareReleasedForkMigration41State } from "./Migrations/fixtures/AuthLineageFixtures.ts";
import { migration42BackupDirectory, restoreMigration42Backup } from "./Migration42Backup.ts";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import { vi } from "vite-plus/test";

import * as SqlitePersistence from "./Sqlite.ts";

const workers = vi.hoisted((): Array<NodeWorkerThreads.Worker> => []);

vi.mock("node:worker_threads", async (importOriginal) => {
  const actual = await importOriginal<typeof NodeWorkerThreads>();
  class RecordedWorker extends actual.Worker {
    constructor(...args: ConstructorParameters<typeof actual.Worker>) {
      super(...args);
      workers.push(this);
    }
  }
  return { ...actual, Worker: RecordedWorker };
});

it.effect("keeps writes moving past a 48 MiB WAL while a reader retains its snapshot", () => {
  const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-sqlite-burst-"));
  const dbPath = NodePath.join(tempDir, "state.sqlite");
  const persistence = SqlitePersistence.layerFromPath(dbPath).pipe(
    Layer.provide(NodeServices.layer),
  );

  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const checkpointWorker = workers.at(-1)!;
    yield* sql`CREATE TABLE burst_probe(id INTEGER PRIMARY KEY, payload BLOB)`;
    yield* sql`INSERT INTO burst_probe VALUES (1, NULL)`;
    yield* sql`PRAGMA wal_checkpoint(TRUNCATE)`;
    const reader = yield* Effect.acquireRelease(
      Effect.sync(() => new NodeSqlite.DatabaseSync(dbPath, { readOnly: true })),
      (database) => Effect.sync(() => database.close()),
    );
    reader.exec("BEGIN");
    assert.equal(reader.prepare("SELECT COUNT(*) AS count FROM burst_probe").get()?.count, 1);

    yield* sql.withTransaction(
      sql`INSERT INTO burst_probe VALUES (2, zeroblob(${48 * 1024 * 1024}))`,
    );
    const state = yield* Effect.callback<{
      readonly log: number;
      readonly checkpointed: number;
      readonly blocked: boolean;
    }>((resume) => {
      const onMessage = (message: {
        readonly type?: string;
        readonly log?: number;
        readonly checkpointed?: number;
        readonly blocked?: boolean;
      }) => {
        if (
          message.type === "checkpoint" &&
          typeof message.log === "number" &&
          message.log > 10_000 &&
          typeof message.checkpointed === "number" &&
          typeof message.blocked === "boolean"
        ) {
          checkpointWorker.off("message", onMessage);
          resume(
            Effect.succeed({
              log: message.log,
              checkpointed: message.checkpointed,
              blocked: message.blocked,
            }),
          );
        }
      };
      checkpointWorker.on("message", onMessage);
      checkpointWorker.ref();
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node workers do not accept a target origin.
      checkpointWorker.postMessage("barrier");
      return Effect.sync(() => checkpointWorker.off("message", onMessage));
    });
    assert.isBelow(state.checkpointed, state.log);
    assert.isFalse(state.blocked);

    yield* sql.withTransaction(sql`INSERT INTO burst_probe VALUES (3, NULL)`);
    assert.equal(reader.prepare("SELECT COUNT(*) AS count FROM burst_probe").get()?.count, 1);
    reader.exec("COMMIT");
    assert.equal(reader.prepare("SELECT COUNT(*) AS count FROM burst_probe").get()?.count, 3);
  }).pipe(
    Effect.scoped,
    Effect.provide(persistence),
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(tempDir, { recursive: true, force: true }))),
  );
});

// Linux names an open, already-deleted file "<path> (deleted)" in /proc/self/fd.
// SQLite names its temp files "etilqs_*" and, without TMPDIR, puts them in
// /var/tmp while os.tmpdir() is /tmp, so match the name, not the directory.
const openDeletedTempFiles = () =>
  NodeFS.readdirSync("/proc/self/fd").flatMap((fd) => {
    try {
      const target = NodeFS.readlinkSync(`/proc/self/fd/${fd}`);
      return target.includes("/etilqs_") && target.endsWith(" (deleted)") ? [target] : [];
    } catch {
      return [];
    }
  });

it.effect.skipIf(HostProcess.Platform.defaultValue() !== "linux")(
  "keeps a write transaction's statement journal off the temp directory",
  () => {
    const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-sqlite-temp-"));
    const persistence = SqlitePersistence.layerFromPath(
      NodePath.join(tempDir, "state.sqlite"),
    ).pipe(Layer.provide(NodeServices.layer));

    return Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE journal_probe(id INTEGER PRIMARY KEY, payload TEXT NOT NULL)`;
      for (let id = 0; id < 64; id++) {
        yield* sql`INSERT INTO journal_probe VALUES (${id}, ${"x".repeat(4096)})`;
      }
      const before = new Set(openDeletedTempFiles());
      const opened = yield* sql.withTransaction(
        Effect.gen(function* () {
          // A multi-row update can fail halfway, so SQLite journals every page
          // it changes, here well past the 64 KiB it holds in memory by default.
          yield* sql`UPDATE journal_probe SET payload = payload || 'y'`;
          return openDeletedTempFiles().filter((target) => !before.has(target));
        }),
      );
      assert.deepEqual(opened, []);
    }).pipe(
      Effect.provide(persistence),
      Effect.ensuring(Effect.sync(() => NodeFS.rmSync(tempDir, { recursive: true, force: true }))),
    );
  },
);

it.effect("drops planner statistics a database already has", () => {
  const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-sqlite-stats-"));
  const dbPath = NodePath.join(tempDir, "state.sqlite");
  const persistence = () =>
    SqlitePersistence.layerFromPath(dbPath).pipe(Layer.provide(NodeServices.layer));

  return Effect.gen(function* () {
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE walk_probe(node_id TEXT PRIMARY KEY, parent_node_id TEXT)`;
      yield* sql`INSERT INTO walk_probe VALUES ('node-1', NULL), ('node-2', 'node-1')`;
      yield* sql`ANALYZE walk_probe`;
    }).pipe(Effect.provide(persistence()));

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const stats = yield* sql<{ readonly count: number }>`
        SELECT COUNT(*) AS count FROM sqlite_stat1
      `;
      assert.equal(stats[0]?.count, 0);
      // A connection still using the old stats scans the table at each step.
      const plan = yield* sql<{ readonly detail: string }>`
        EXPLAIN QUERY PLAN
        WITH RECURSIVE retained(node_id) AS (
          SELECT 'node-2'
          UNION
          SELECT parent.parent_node_id FROM walk_probe AS parent
          INNER JOIN retained ON parent.node_id = retained.node_id
        )
        SELECT node_id FROM retained
      `;
      assert.include(
        plan.map((row) => row.detail),
        "SEARCH parent USING INDEX sqlite_autoindex_walk_probe_1 (node_id=?)",
      );
    }).pipe(Effect.provide(persistence()));
  }).pipe(
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(tempDir, { recursive: true, force: true }))),
  );
});

it.effect("only fsyncs the database file at WAL checkpoints", () => {
  const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-sqlite-sync-"));
  const dbPath = NodePath.join(tempDir, "state.sqlite");

  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly synchronous: number }>`PRAGMA synchronous`;
    // 1 is NORMAL.
    assert.equal(rows[0]?.synchronous, 1);
  }).pipe(
    Effect.provide(SqlitePersistence.layerFromPath(dbPath).pipe(Layer.provide(NodeServices.layer))),
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(tempDir, { recursive: true, force: true }))),
  );
});

it.effect("applies busy_timeout in the shared persistence setup", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly timeout: number }>`PRAGMA busy_timeout`;
    assert.equal(rows[0]?.timeout, 5000);
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect(
  "creates the pre42 snapshot through real SQLite startup before migration and restores it",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-sqlite-backup-proof-" });
      const filename = path.join(directory, "state.sqlite");
      yield* prepareReleasedForkMigration41State().pipe(
        Effect.provide(NodeSqliteClient.layer({ filename })),
        Effect.scoped,
      );
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{
          migrationId: number;
        }>`SELECT MAX(migration_id) AS migrationId FROM effect_sql_migrations`;
        assert.isAtLeast(rows[0]!.migrationId, 58);
        assert.isTrue(
          yield* fs.exists(path.join(migration42BackupDirectory(filename), "database")),
        );
      }).pipe(Effect.provide(SqlitePersistence.layerFromPath(filename)), Effect.scoped);
      yield* restoreMigration42Backup(filename);
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql<{
          migrationId: number;
        }>`SELECT MAX(migration_id) AS migrationId FROM effect_sql_migrations`;
        assert.equal(rows[0]!.migrationId, 41);
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename })), Effect.scoped);
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("enables checkpoint_fullfsync in the shared persistence setup", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      readonly checkpoint_fullfsync: number;
    }>`PRAGMA checkpoint_fullfsync`;
    assert.equal(rows[0]?.checkpoint_fullfsync, 1);
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);
