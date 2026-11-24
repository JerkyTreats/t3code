/** Runs the fork migration plan through the upstream transactional SQL migrator. */
import * as Migrator from "effect/sql/Migrator";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  DATABASE_MIGRATION_PROGRESS_MESSAGE,
  DATABASE_MIGRATIONS_FINISHED_MESSAGE,
  DATABASE_MIGRATIONS_STARTED_MESSAGE,
} from "@t3tools/shared/databaseMigrationLog";

import { makeMigrationLoader, migrationManifest } from "./ForkMigrationPlan.ts";

export { migrationEntries, migrationManifest } from "./ForkMigrationPlan.ts";

const latestMigrationId = Math.max(...migrationManifest.map(([id]) => id));

/** Whether the journal is behind this build's fork head. Reads only; never creates a journal. */
export const hasPendingMigrations = Effect.fn("hasPendingMigrations")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
  `;
  if (tables.length === 0) return true;
  const rows = yield* sql<{
    readonly latestId: number | null;
  }>`SELECT MAX(migration_id) AS latestId FROM effect_sql_migrations`;
  return (rows[0]?.latestId ?? 0) < latestMigrationId;
});

const run = Migrator.make({});

export interface RunMigrationsOptions {
  readonly toMigrationInclusive?: number | undefined;
}

/**
 * Run all pending migrations after the latest one recorded in `effect_sql_migrations`.
 * Returns the [id, name] tuples that ran.
 */
export const runMigrations = Effect.fn("runMigrations")(function* ({
  toMigrationInclusive,
}: RunMigrationsOptions = {}) {
  // Select the supported lineage once, before the upstream runner creates a journal.
  // Otherwise a populated database without a journal would look like a fresh install.
  const selected = yield* makeMigrationLoader(toMigrationInclusive);
  const sql = yield* SqlClient.SqlClient;
  const ledger = yield* sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
  `;
  const [latest] =
    ledger.length === 0
      ? []
      : yield* sql<{
          readonly id: number | null;
        }>`SELECT MAX(migration_id) AS id FROM effect_sql_migrations`;
  const latestRecordedId = latest?.id ?? 0;
  const pending = selected.filter(([id]) => id > latestRecordedId);
  // The desktop waits past its readiness budget until the finished line follows this one.
  if (pending.length > 0) yield* Effect.log(DATABASE_MIGRATIONS_STARTED_MESSAGE);
  // One transaction per migration: an index build on a large database can take minutes, and a
  // restart then resumes after the last finished migration instead of rolling all of them back.
  const executedMigrations: Array<readonly [id: number, name: string]> = [];
  for (const [index, [id, name]] of pending.entries()) {
    if (latestRecordedId > 0) {
      yield* Effect.log(DATABASE_MIGRATION_PROGRESS_MESSAGE).pipe(
        Effect.annotateLogs({
          migration: `${id}_${name}`,
          progress: `${index + 1} of ${pending.length}`,
        }),
      );
    }
    // The selection above already fixed the fresh-install decisions, so each step reuses it.
    const through = selected.filter(([selectedId]) => selectedId <= id);
    executedMigrations.push(...(yield* run({ loader: Effect.succeed(through) })));
  }
  const migrations = executedMigrations.map(([id, name]) => `${id}_${name}`);
  yield* migrations.length === 0
    ? Effect.logDebug("Database schema is current")
    : Effect.log(DATABASE_MIGRATIONS_FINISHED_MESSAGE).pipe(Effect.annotateLogs({ migrations }));
  return executedMigrations;
});
