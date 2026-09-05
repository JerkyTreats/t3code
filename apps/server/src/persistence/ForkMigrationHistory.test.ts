// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { makeSqlitePersistenceLive } from "./Layers/Sqlite.ts";
import { runMigrations } from "./Migrations.ts";
import { prepareReleasedForkMigration41State } from "./Migrations/fixtures/AuthLineageFixtures.ts";

const retiredHistoricalNames = [
  [46, "CollectiveResidentRuntime"],
  [47, "CollectiveResidentTurnSettlements"],
  [48, "CollectiveWeeklyQuotaObservations"],
  [49, "CollectiveFanoutRuns"],
] as const;

const recordRetiredHistoricalNames = Effect.fn("recordRetiredHistoricalNames")(function* () {
  const sql = yield* SqlClient.SqlClient;

  // These deployed identities are journal evidence whose implementation bodies are retired.
  for (const [migrationId, name] of retiredHistoricalNames) {
    yield* sql`
      INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (${migrationId}, ${name})
    `;
  }
});

const prepareAcceptedFork45 = Effect.fn("prepareAcceptedFork45")(function* () {
  yield* prepareReleasedForkMigration41State();
  yield* runMigrations({ toMigrationInclusive: 45 });
  yield* recordRetiredHistoricalNames();
});

const prepareAcceptedFork51 = Effect.fn("prepareAcceptedFork51")(function* () {
  yield* prepareAcceptedFork45();
  yield* runMigrations({ toMigrationInclusive: 51 });
});

const tableNames = Effect.fn("tableNames")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<{ readonly name: string }>`
    SELECT name
    FROM sqlite_schema
    WHERE type = 'table'
    ORDER BY name
  `;
});

const continuationColumns = Effect.fn("continuationColumns")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<{ readonly name: string }>`
    SELECT name
    FROM pragma_table_info('projection_threads')
    WHERE name = 'linked_pull_request_json'
  `;
});

it.effect("constructs a fresh database without retired adapter tables", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const executed = yield* runMigrations();
    const tables = yield* tableNames();
    const journal = yield* sql<{
      readonly migrationId: number;
      readonly name: string;
    }>`
        SELECT migration_id AS "migrationId", name
        FROM effect_sql_migrations
        WHERE migration_id BETWEEN 46 AND 51
        ORDER BY migration_id
      `;

    assert.ok(executed.some(([migrationId]) => migrationId === 50));
    assert.deepStrictEqual(journal, [
      { migrationId: 50, name: "ThreadAdapterLaunchBindings" },
      { migrationId: 51, name: "RetireThreadAdapterAuthority" },
    ]);
    assert.ok(!tables.some(({ name }) => name === "thread_adapter_launch_bindings"));
    assert.ok(!tables.some(({ name }) => name === "thread_adapter_expired_launches"));
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);

it.effect("preserves Board provenance, revisions and auth identities from accepted 51", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* prepareAcceptedFork51();
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
        ) VALUES (
          'synthetic-board-post',
          701,
          '{"kind":"agent","id":"synthetic-author","providerInstanceId":"synthetic-provider"}',
          '{"projectId":"synthetic-project","threadId":"synthetic-thread"}',
          '[{"kind":"agent","id":"synthetic-target"}]',
          'Synthetic edited body',
          '2026-01-03T00:00:00.000Z',
          2,
          702,
          '2026-01-04T00:00:00.000Z',
          '{"kind":"agent","id":"synthetic-editor"}',
          '{"projectId":"synthetic-project","threadId":"synthetic-editor-thread"}'
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
        ) VALUES
          (
            'synthetic-board-post',
            1,
            701,
            'Synthetic original body',
            '[]',
            '{"kind":"agent","id":"synthetic-author"}',
            '{"projectId":"synthetic-project","threadId":"synthetic-thread"}',
            '2026-01-03T00:00:00.000Z'
          ),
          (
            'synthetic-board-post',
            2,
            702,
            'Synthetic edited body',
            '[{"kind":"agent","id":"synthetic-target"}]',
            '{"kind":"agent","id":"synthetic-editor"}',
            '{"projectId":"synthetic-project","threadId":"synthetic-editor-thread"}',
            '2026-01-04T00:00:00.000Z'
          )
      `;

    const boardBefore = yield* sql`
        SELECT * FROM projection_board_posts WHERE post_id = 'synthetic-board-post'
      `;
    const revisionsBefore = yield* sql`
        SELECT *
        FROM projection_board_post_revisions
        WHERE post_id = 'synthetic-board-post'
        ORDER BY revision
      `;
    const clientsBefore = yield* sql`
        SELECT * FROM auth_clients ORDER BY client_id
      `;
    const sessionsBefore = yield* sql`
        SELECT * FROM auth_sessions ORDER BY session_id
      `;
    const pairingLinksBefore = yield* sql`
        SELECT id, credential_digest, method, scopes, subject, label, proof_key_thumbprint,
          created_at, expires_at, consumed_at, revoked_at, revision
        FROM auth_pairing_links ORDER BY id
      `;

    yield* runMigrations();

    const boardAfter = yield* sql`
        SELECT * FROM projection_board_posts WHERE post_id = 'synthetic-board-post'
      `;
    const revisionsAfter = yield* sql`
        SELECT *
        FROM projection_board_post_revisions
        WHERE post_id = 'synthetic-board-post'
        ORDER BY revision
      `;
    const clientsAfter = yield* sql`
        SELECT * FROM auth_clients ORDER BY client_id
      `;
    const sessionsAfter = yield* sql`
        SELECT * FROM auth_sessions ORDER BY session_id
      `;
    const pairingLinksAfter = yield* sql`
        SELECT id, credential_digest, method, scopes, subject, label, proof_key_thumbprint,
          created_at, expires_at, consumed_at, revoked_at, revision
        FROM auth_pairing_links ORDER BY id
      `;
    const historicalJournal = yield* sql<{
      readonly migrationId: number;
      readonly name: string;
    }>`
        SELECT migration_id AS "migrationId", name
        FROM effect_sql_migrations
        WHERE migration_id BETWEEN 31 AND 49
        ORDER BY migration_id
      `;

    assert.deepStrictEqual(boardAfter, boardBefore);
    assert.deepStrictEqual(revisionsAfter, revisionsBefore);
    assert.deepStrictEqual(clientsAfter, clientsBefore);
    assert.deepStrictEqual(sessionsAfter, sessionsBefore);
    assert.deepStrictEqual(pairingLinksAfter, pairingLinksBefore);
    const existingGrantClasses = yield* sql<{ readonly managementClass: string | null }>`
      SELECT client_management_class AS "managementClass" FROM auth_pairing_links ORDER BY id
    `;
    assert.deepStrictEqual(existingGrantClasses, [{ managementClass: null }]);
    assert.deepStrictEqual(historicalJournal, [
      { migrationId: 31, name: "RepairProjectionThreadShellSummary" },
      { migrationId: 32, name: "ProjectionThreadIssueLink" },
      { migrationId: 33, name: "AuthAuthorizationScopes" },
      { migrationId: 34, name: "AuthPairingProofKeyThumbprint" },
      { migrationId: 35, name: "ProjectionThreadStatusSummary" },
      { migrationId: 36, name: "ReconcileV0028MigrationHistories" },
      { migrationId: 37, name: "ProjectionThreadRuntimeSummary" },
      { migrationId: 38, name: "ProjectionThreadProposedPlanPagingIndex" },
      { migrationId: 39, name: "ProjectionThreadsSettled" },
      { migrationId: 40, name: "SettingsAdminClients" },
      { migrationId: 41, name: "ReconcileUpstreamAndSettingsAdmin" },
      { migrationId: 42, name: "ReconcileUpstreamAndSettingsAdmin" },
      { migrationId: 43, name: "ProjectionBoardPosts" },
      { migrationId: 44, name: "ProjectionBoardPostRevisions" },
      { migrationId: 45, name: "CollectiveExpeditions" },
      ...retiredHistoricalNames.map(([migrationId, name]) => ({ migrationId, name })),
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);

it.effect("cleans retired adapter state when upgrading a pre-50 history", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* prepareAcceptedFork45();
    yield* runMigrations({ toMigrationInclusive: 50 });
    yield* sql`
        INSERT INTO thread_adapter_launch_bindings (
          launch_key,
          project_id,
          created_at,
          last_used_at
        ) VALUES (
          'synthetic-launch',
          'synthetic-project',
          '2026-01-05T00:00:00.000Z',
          '2026-01-05T00:00:00.000Z'
        )
      `;
    yield* sql`
        INSERT INTO auth_clients (
          client_id,
          label,
          device_type,
          granted_scopes,
          created_at
        ) VALUES (
          'synthetic-retired-client',
          'Synthetic retired client',
          'bot',
          '["thread-adapter:operate"]',
          '2026-01-05T00:00:00.000Z'
        )
      `;
    yield* sql`
        INSERT INTO auth_sessions (
          session_id,
          client_id,
          subject,
          scopes,
          method,
          client_device_type,
          issued_at,
          expires_at
        ) VALUES (
          'synthetic-retired-session',
          'synthetic-retired-client',
          'synthetic-retired-subject',
          '["thread-adapter:operate"]',
          'synthetic-test',
          'bot',
          '2026-01-05T00:00:00.000Z',
          '2027-01-05T00:00:00.000Z'
        )
      `;
    yield* sql`
        INSERT INTO auth_pairing_links (
          id,
          credential_digest,
          method,
          scopes,
          subject,
          created_at,
          expires_at
        ) VALUES (
          'synthetic-retired-pairing',
          'synthetic-retired-digest',
          'synthetic-test',
          '["thread-adapter:operate"]',
          'synthetic-retired-subject',
          '2026-01-05T00:00:00.000Z',
          '2027-01-05T00:00:00.000Z'
        )
      `;

    yield* runMigrations();

    const tables = yield* tableNames();
    const retiredClients = yield* sql`
        SELECT client_id FROM auth_clients WHERE client_id = 'synthetic-retired-client'
      `;
    const retiredSessions = yield* sql`
        SELECT session_id FROM auth_sessions WHERE session_id = 'synthetic-retired-session'
      `;
    const retiredPairingLinks = yield* sql`
        SELECT id FROM auth_pairing_links WHERE id = 'synthetic-retired-pairing'
      `;
    const survivingSessions = yield* sql<{ readonly sessionId: string }>`
        SELECT session_id AS "sessionId"
        FROM auth_sessions
        WHERE session_id = 'synthetic-scoped-session'
      `;

    assert.deepStrictEqual(retiredClients, []);
    assert.deepStrictEqual(retiredSessions, []);
    assert.deepStrictEqual(retiredPairingLinks, []);
    assert.deepStrictEqual(survivingSessions, [{ sessionId: "synthetic-scoped-session" }]);
    assert.ok(!tables.some(({ name }) => name === "thread_adapter_launch_bindings"));
    assert.ok(!tables.some(({ name }) => name === "thread_adapter_expired_launches"));
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);

it.effect("rejects a wrong historical name before continuation writes", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* prepareAcceptedFork51();
    yield* sql`
        UPDATE effect_sql_migrations
        SET name = 'WrongForkMigration'
        WHERE migration_id = 41
      `;

    const error = yield* Effect.flip(runMigrations());

    assert.match(error.message, /Unsupported fork migration identity at 41/);
    assert.deepStrictEqual(yield* continuationColumns(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);

it.effect("rejects an unknown journal identity before continuation writes", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* prepareAcceptedFork51();
    yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (58, 'UnknownForkMigration')
      `;

    const error = yield* Effect.flip(runMigrations());

    assert.match(error.message, /Unsupported fork migration identity at 58/);
    assert.deepStrictEqual(yield* continuationColumns(), []);
  }).pipe(Effect.provide(NodeSqliteClient.layerMemory())),
);

it.effect("reopens an initialized file database without applying more migrations", () => {
  const tempDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-fork-history-"));
  const dbPath = NodePath.join(tempDir, "state.sqlite");
  const persistenceLayer = makeSqlitePersistenceLive(dbPath).pipe(
    Layer.provide(NodeServices.layer),
  );

  return Effect.gen(function* () {
    const firstJournal = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        INSERT INTO projection_projects (
          project_id,
          title,
          workspace_root,
          scripts_json,
          created_at,
          updated_at
        ) VALUES (
          'synthetic-reopen-project',
          'Synthetic reopen project',
          '/synthetic/workspace',
          '{}',
          '2026-01-06T00:00:00.000Z',
          '2026-01-06T00:00:00.000Z'
        )
      `;
      return yield* sql<{ readonly migrationId: number; readonly name: string }>`
        SELECT migration_id AS "migrationId", name
        FROM effect_sql_migrations
        ORDER BY migration_id
      `;
    }).pipe(Effect.provide(persistenceLayer));

    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const executed = yield* runMigrations();
      const secondJournal = yield* sql<{
        readonly migrationId: number;
        readonly name: string;
      }>`
        SELECT migration_id AS "migrationId", name
        FROM effect_sql_migrations
        ORDER BY migration_id
      `;
      const projects = yield* sql<{ readonly projectId: string }>`
        SELECT project_id AS "projectId"
        FROM projection_projects
        WHERE project_id = 'synthetic-reopen-project'
      `;

      assert.deepStrictEqual(executed, []);
      assert.deepStrictEqual(secondJournal, firstJournal);
      assert.deepStrictEqual(projects, [{ projectId: "synthetic-reopen-project" }]);
    }).pipe(Effect.provide(persistenceLayer));
  }).pipe(
    Effect.ensuring(Effect.sync(() => NodeFS.rmSync(tempDir, { recursive: true, force: true }))),
  );
});
