import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";
import Migration0031 from "./031_AuthAuthorizationScopes.ts";
import Migration0032 from "./032_AuthPairingProofKeyThumbprint.ts";

type HistoricalForkState = 32 | 33 | 34 | 35;

const historicalForkStates: ReadonlyArray<HistoricalForkState> = [32, 33, 34, 35];
const historicalMigrationNames = [
  [31, "RepairProjectionThreadShellSummary"],
  [32, "ProjectionThreadIssueLink"],
  [33, "AuthAuthorizationScopes"],
  [34, "AuthPairingProofKeyThumbprint"],
  [35, "ProjectionThreadStatusSummary"],
] as const;
const decodeUnknownJsonString = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);

const prepareHistoricalForkState = Effect.fn("prepareHistoricalForkState")(function* (
  state: HistoricalForkState,
) {
  const sql = yield* SqlClient.SqlClient;

  yield* runMigrations({ toMigrationInclusive: 30 });
  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN issue_link_json TEXT
  `;

  if (state >= 33) {
    yield* Migration0031;
  }
  if (state >= 34) {
    yield* Migration0032;
  }
  if (state >= 35) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN active_plan_progress_json TEXT
    `;
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN latest_runtime_activity_at TEXT
    `;
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN status_summary_updated_at TEXT
    `;
  }

  for (const [migrationId, name] of historicalMigrationNames) {
    if (migrationId > state) {
      break;
    }
    yield* sql`
      INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (${migrationId}, ${name})
    `;
  }
});

const seedAuthRows = Effect.fn("seedAuthRows")(function* (
  scoped: boolean,
  includeProofKey: boolean,
) {
  const sql = yield* SqlClient.SqlClient;

  if (scoped) {
    if (includeProofKey) {
      yield* sql`
        INSERT INTO auth_pairing_links (
          id,
          credential,
          method,
          scopes,
          subject,
          label,
          created_at,
          expires_at,
          proof_key_thumbprint
        )
        VALUES (
          'link-existing',
          'credential-existing',
          'desktop-bootstrap',
          '["threads:read"]',
          'desktop',
          'Existing link',
          '2026-05-29T00:00:00.000Z',
          '2026-05-29T01:00:00.000Z',
          'thumbprint-existing'
        )
      `;
    } else {
      yield* sql`
        INSERT INTO auth_pairing_links (
          id,
          credential,
          method,
          scopes,
          subject,
          label,
          created_at,
          expires_at
        )
        VALUES (
          'link-existing',
          'credential-existing',
          'desktop-bootstrap',
          '["threads:read"]',
          'desktop',
          'Existing link',
          '2026-05-29T00:00:00.000Z',
          '2026-05-29T01:00:00.000Z'
        )
      `;
    }

    yield* sql`
      INSERT INTO auth_sessions (
        session_id,
        subject,
        scopes,
        method,
        client_label,
        client_device_type,
        issued_at,
        expires_at
      )
      VALUES (
        'session-existing',
        'desktop',
        '["threads:read"]',
        'browser-session-cookie',
        'Existing session',
        'desktop',
        '2026-05-29T00:00:00.000Z',
        '2026-05-29T01:00:00.000Z'
      )
    `;
    return;
  }

  yield* sql`
    INSERT INTO auth_pairing_links (
      id,
      credential,
      method,
      role,
      subject,
      label,
      created_at,
      expires_at
    )
    VALUES (
      'link-legacy',
      'credential-legacy',
      'desktop-bootstrap',
      'owner',
      'desktop',
      'Legacy link',
      '2026-05-29T00:00:00.000Z',
      '2026-05-29T01:00:00.000Z'
    )
  `;
  yield* sql`
    INSERT INTO auth_sessions (
      session_id,
      subject,
      role,
      method,
      client_label,
      client_device_type,
      issued_at,
      expires_at
    )
    VALUES (
      'session-legacy',
      'desktop',
      'owner',
      'browser-session-cookie',
      'Legacy session',
      'desktop',
      '2026-05-29T00:00:00.000Z',
      '2026-05-29T01:00:00.000Z'
    )
  `;
});

const seedProjectionRows = Effect.fn("seedProjectionRows")(function* (
  preserveExistingSummary: boolean,
  includeIssueLink: boolean,
) {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    INSERT INTO projection_threads (
      thread_id,
      project_id,
      title,
      model_selection_json,
      runtime_mode,
      interaction_mode,
      branch,
      worktree_path,
      latest_turn_id,
      latest_user_message_at,
      pending_approval_count,
      pending_user_input_count,
      has_actionable_proposed_plan,
      created_at,
      updated_at,
      archived_at,
      deleted_at
    )
    VALUES (
      'thread-migration-plan',
      'project-migration-plan',
      'Thread Migration Plan',
      '{"provider":"codex","model":"gpt-5-codex"}',
      'full-access',
      'default',
      NULL,
      NULL,
      'turn-migration-plan',
      '2026-05-01T00:00:01.000Z',
      0,
      0,
      0,
      '2026-05-01T00:00:00.000Z',
      '2026-05-01T00:00:02.000Z',
      NULL,
      NULL
    )
  `;

  if (includeIssueLink) {
    yield* sql`
      UPDATE projection_threads
      SET issue_link_json = '{"number":28}'
      WHERE thread_id = 'thread-migration-plan'
    `;
  }

  yield* sql`
    INSERT INTO projection_thread_activities (
      activity_id,
      thread_id,
      turn_id,
      tone,
      kind,
      summary,
      payload_json,
      sequence,
      created_at
    )
    VALUES (
      'activity-migration-plan',
      'thread-migration-plan',
      'turn-migration-plan',
      'info',
      'turn.plan.updated',
      'Plan updated',
      '{"plan":[{"step":"Inspect","status":"completed"},{"step":"Implement","status":"in_progress"},{"step":"Verify","status":"pending"}]}',
      1,
      '2026-05-01T00:00:03.000Z'
    )
  `;

  if (preserveExistingSummary) {
    yield* sql`
      UPDATE projection_threads
      SET
        active_plan_progress_json = '{"preserved":true}',
        latest_runtime_activity_at = '2026-05-01T00:00:04.000Z',
        status_summary_updated_at = '2026-05-01T00:00:05.000Z'
      WHERE thread_id = 'thread-migration-plan'
    `;
  }
});

const assertCanonicalSchemaAndRows = Effect.fn("assertCanonicalSchemaAndRows")(function* (
  expectAuthRows: boolean,
  expectedProofKey: string | null,
  expectPreservedSummary: boolean,
  expectedIssueLink: string | null,
) {
  const sql = yield* SqlClient.SqlClient;

  const pairingColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(auth_pairing_links)
  `;
  const sessionColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(auth_sessions)
  `;
  const projectionColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  const pairingColumnNames = new Set(pairingColumns.map((column) => column.name));
  const sessionColumnNames = new Set(sessionColumns.map((column) => column.name));
  const projectionColumnNames = new Set(projectionColumns.map((column) => column.name));

  assert.isTrue(pairingColumnNames.has("scopes"));
  assert.isFalse(pairingColumnNames.has("role"));
  assert.isTrue(pairingColumnNames.has("proof_key_thumbprint"));
  assert.isTrue(sessionColumnNames.has("scopes"));
  assert.isFalse(sessionColumnNames.has("role"));
  for (const column of [
    "latest_user_message_at",
    "pending_approval_count",
    "pending_user_input_count",
    "has_actionable_proposed_plan",
    "issue_link_json",
    "active_plan_progress_json",
    "latest_runtime_activity_at",
    "status_summary_updated_at",
  ]) {
    assert.isTrue(projectionColumnNames.has(column), `Missing projection column ${column}`);
  }

  const pairingRows = yield* sql<{
    readonly id: string;
    readonly scopes: string;
    readonly proofKeyThumbprint: string | null;
  }>`
    SELECT
      id,
      scopes,
      proof_key_thumbprint AS "proofKeyThumbprint"
    FROM auth_pairing_links
  `;
  const sessionRows = yield* sql<{ readonly sessionId: string; readonly scopes: string }>`
    SELECT session_id AS "sessionId", scopes
    FROM auth_sessions
  `;

  if (expectAuthRows) {
    assert.deepStrictEqual(pairingRows, [
      {
        id: "link-existing",
        scopes: '["threads:read"]',
        proofKeyThumbprint: expectedProofKey,
      },
    ]);
    assert.deepStrictEqual(sessionRows, [
      {
        sessionId: "session-existing",
        scopes: '["threads:read"]',
      },
    ]);
  } else {
    assert.deepStrictEqual(pairingRows, []);
    assert.deepStrictEqual(sessionRows, []);
  }

  const projectionRows = yield* sql<{
    readonly activePlanProgressJson: string | null;
    readonly latestRuntimeActivityAt: string | null;
    readonly statusSummaryUpdatedAt: string | null;
    readonly issueLinkJson: string | null;
  }>`
    SELECT
      active_plan_progress_json AS "activePlanProgressJson",
      latest_runtime_activity_at AS "latestRuntimeActivityAt",
      status_summary_updated_at AS "statusSummaryUpdatedAt",
      issue_link_json AS "issueLinkJson"
    FROM projection_threads
    WHERE thread_id = 'thread-migration-plan'
  `;
  const projectionRow = projectionRows[0];
  assert.strictEqual(projectionRow?.issueLinkJson, expectedIssueLink);

  if (expectPreservedSummary) {
    assert.strictEqual(projectionRow?.activePlanProgressJson, '{"preserved":true}');
    assert.strictEqual(projectionRow?.latestRuntimeActivityAt, "2026-05-01T00:00:04.000Z");
    assert.strictEqual(projectionRow?.statusSummaryUpdatedAt, "2026-05-01T00:00:05.000Z");
  } else {
    assert.deepStrictEqual(
      decodeUnknownJsonString(projectionRow?.activePlanProgressJson ?? "null"),
      {
        completedAllSteps: false,
        currentStepNumber: 2,
        totalSteps: 3,
        turnId: "turn-migration-plan",
        activityId: "activity-migration-plan",
        updatedAt: "2026-05-01T00:00:03.000Z",
      },
    );
    assert.strictEqual(projectionRow?.latestRuntimeActivityAt, "2026-05-01T00:00:03.000Z");
    assert.strictEqual(projectionRow?.statusSummaryUpdatedAt, "2026-05-01T00:00:03.000Z");
  }
});

for (const state of historicalForkStates) {
  const historicalStateLayer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

  historicalStateLayer(`036_ReconcileV0028MigrationHistories state ${state}`, (it) => {
    it.effect("reconciles the historical fork schema without rewriting its ledger", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const scoped = state >= 33;
        const hasProofKey = state >= 34;
        const hasStatusSummary = state >= 35;

        yield* prepareHistoricalForkState(state);
        yield* seedAuthRows(scoped, hasProofKey);
        yield* seedProjectionRows(hasStatusSummary, true);

        const historicalLedgerBefore = yield* sql<{
          readonly migrationId: number;
          readonly name: string;
        }>`
          SELECT migration_id AS "migrationId", name
          FROM effect_sql_migrations
          WHERE migration_id BETWEEN 31 AND ${state}
          ORDER BY migration_id
        `;

        const executed = yield* runMigrations({ toMigrationInclusive: 36 });
        assert.deepStrictEqual(executed, [[36, "ReconcileV0028MigrationHistories"]]);

        const historicalLedgerAfter = yield* sql<{
          readonly migrationId: number;
          readonly name: string;
        }>`
          SELECT migration_id AS "migrationId", name
          FROM effect_sql_migrations
          WHERE migration_id BETWEEN 31 AND ${state}
          ORDER BY migration_id
        `;
        assert.deepStrictEqual(historicalLedgerAfter, historicalLedgerBefore);

        yield* assertCanonicalSchemaAndRows(
          scoped,
          hasProofKey ? "thumbprint-existing" : null,
          hasStatusSummary,
          '{"number":28}',
        );
      }),
    );
  });
}

const partialForkLayer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

partialForkLayer("036_ReconcileV0028MigrationHistories partial fork state", (it) => {
  it.effect("restores missing shell summary columns from the old state 32 history", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* prepareHistoricalForkState(32);
      yield* sql`ALTER TABLE projection_threads DROP COLUMN latest_user_message_at`;
      yield* sql`ALTER TABLE projection_threads DROP COLUMN pending_approval_count`;
      yield* sql`ALTER TABLE projection_threads DROP COLUMN pending_user_input_count`;
      yield* sql`ALTER TABLE projection_threads DROP COLUMN has_actionable_proposed_plan`;
      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          latest_turn_id,
          created_at,
          updated_at,
          archived_at,
          deleted_at
        )
        VALUES (
          'thread-partial-shell',
          'project-partial-shell',
          'Partial Shell',
          '{"provider":"codex","model":"gpt-5-codex"}',
          'full-access',
          'default',
          NULL,
          '2026-05-01T00:00:00.000Z',
          '2026-05-01T00:00:02.000Z',
          NULL,
          NULL
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 36 });

      const rows = yield* sql<{
        readonly latestUserMessageAt: string | null;
        readonly pendingApprovalCount: number;
        readonly pendingUserInputCount: number;
        readonly hasActionableProposedPlan: number;
        readonly statusSummaryUpdatedAt: string | null;
      }>`
        SELECT
          latest_user_message_at AS "latestUserMessageAt",
          pending_approval_count AS "pendingApprovalCount",
          pending_user_input_count AS "pendingUserInputCount",
          has_actionable_proposed_plan AS "hasActionableProposedPlan",
          status_summary_updated_at AS "statusSummaryUpdatedAt"
        FROM projection_threads
        WHERE thread_id = 'thread-partial-shell'
      `;
      assert.deepStrictEqual(rows, [
        {
          latestUserMessageAt: null,
          pendingApprovalCount: 0,
          pendingUserInputCount: 0,
          hasActionableProposedPlan: 0,
          statusSummaryUpdatedAt: "2026-05-01T00:00:02.000Z",
        },
      ]);
    }),
  );
});

const freshUpstreamLayer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

freshUpstreamLayer("036_ReconcileV0028MigrationHistories fresh upstream", (it) => {
  it.effect("preserves active auth rows from a fresh upstream state 32", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 32 });
      yield* seedAuthRows(true, true);
      yield* seedProjectionRows(false, false);

      const upstreamLedgerBefore = yield* sql<{
        readonly migrationId: number;
        readonly name: string;
      }>`
        SELECT migration_id AS "migrationId", name
        FROM effect_sql_migrations
        WHERE migration_id BETWEEN 31 AND 35
        ORDER BY migration_id
      `;
      assert.deepStrictEqual(upstreamLedgerBefore, [
        { migrationId: 31, name: "AuthAuthorizationScopes" },
        { migrationId: 32, name: "AuthPairingProofKeyThumbprint" },
      ]);

      const executed = yield* runMigrations({ toMigrationInclusive: 36 });
      assert.deepStrictEqual(executed, [[36, "ReconcileV0028MigrationHistories"]]);

      const upstreamLedgerAfter = yield* sql<{
        readonly migrationId: number;
        readonly name: string;
      }>`
        SELECT migration_id AS "migrationId", name
        FROM effect_sql_migrations
        WHERE migration_id BETWEEN 31 AND 35
        ORDER BY migration_id
      `;
      assert.deepStrictEqual(upstreamLedgerAfter, upstreamLedgerBefore);

      yield* assertCanonicalSchemaAndRows(true, "thumbprint-existing", false, null);
    }),
  );
});
