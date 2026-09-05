import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../../Migrations.ts";
import Migration0031 from "../031_AuthAuthorizationScopes.ts";
import Migration0032 from "../032_AuthPairingProofKeyThumbprint.ts";

export type ForkMigrationState = 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40;

export const forkMigrationStates: ReadonlyArray<ForkMigrationState> = [
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
];

const historicalMigrationNames = [
  [31, "RepairProjectionThreadShellSummary"],
  [32, "ProjectionThreadIssueLink"],
  [33, "AuthAuthorizationScopes"],
  [34, "AuthPairingProofKeyThumbprint"],
  [35, "ProjectionThreadStatusSummary"],
  [36, "ReconcileV0028MigrationHistories"],
  [37, "ProjectionThreadRuntimeSummary"],
  [38, "ProjectionThreadProposedPlanPagingIndex"],
  [39, "ProjectionThreadsSettled"],
  [40, "SettingsAdminClients"],
] as const;

const seedRoleAuth = Effect.fn("AuthLineageFixtures.seedRoleAuth")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    INSERT INTO auth_sessions (
      session_id,
      subject,
      role,
      method,
      client_label,
      client_device_type,
      client_os,
      issued_at,
      expires_at,
      last_connected_at
    ) VALUES (
      'synthetic-role-session',
      'synthetic-role-subject',
      'owner',
      'browser-session-cookie',
      'Synthetic role client',
      'desktop',
      'Synthetic OS',
      '2026-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    )
  `;
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
    ) VALUES (
      'synthetic-role-pairing',
      'synthetic-plaintext-role-credential',
      'one-time-token',
      'owner',
      'synthetic-role-subject',
      'Synthetic role pairing',
      '2026-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z'
    )
  `;
});

const seedScopedAuth = Effect.fn("AuthLineageFixtures.seedScopedAuth")(function* (
  includeProofKey: boolean,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    INSERT INTO auth_sessions (
      session_id,
      subject,
      scopes,
      method,
      client_label,
      client_device_type,
      client_os,
      issued_at,
      expires_at,
      last_connected_at
    ) VALUES (
      'synthetic-scoped-session',
      'synthetic-scoped-subject',
      '["orchestration:read"]',
      'browser-session-cookie',
      'Synthetic scoped client',
      'desktop',
      'Synthetic OS',
      '2026-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z'
    )
  `;
  if (includeProofKey) {
    yield* sql`
      INSERT INTO auth_pairing_links (
        id,
        credential,
        method,
        scopes,
        subject,
        label,
        proof_key_thumbprint,
        created_at,
        expires_at
      ) VALUES (
        'synthetic-scoped-pairing',
        'synthetic-plaintext-scoped-credential',
        'one-time-token',
        '["orchestration:read"]',
        'synthetic-scoped-subject',
        'Synthetic scoped pairing',
        'synthetic-proof-key',
        '2026-01-01T00:00:00.000Z',
        '2027-01-01T00:00:00.000Z'
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
      ) VALUES (
        'synthetic-scoped-pairing',
        'synthetic-plaintext-scoped-credential',
        'one-time-token',
        '["orchestration:read"]',
        'synthetic-scoped-subject',
        'Synthetic scoped pairing',
        '2026-01-01T00:00:00.000Z',
        '2027-01-01T00:00:00.000Z'
      )
    `;
  }
});

const applyForkSettingsAdmin = Effect.fn("AuthLineageFixtures.applyForkSettingsAdmin")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`
    CREATE TABLE auth_clients (
      client_id TEXT PRIMARY KEY,
      label TEXT,
      device_type TEXT NOT NULL DEFAULT 'unknown',
      platform TEXT,
      granted_scopes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_connected_at TEXT,
      disabled_at TEXT,
      deleted_at TEXT,
      revision INTEGER NOT NULL DEFAULT 0
    )
  `;
    yield* sql`ALTER TABLE auth_sessions ADD COLUMN client_id TEXT`;
    yield* sql`
    INSERT INTO auth_clients (
      client_id,
      label,
      device_type,
      platform,
      granted_scopes,
      created_at,
      last_connected_at,
      disabled_at,
      deleted_at,
      revision
    )
    SELECT
      'legacy:' || session_id,
      client_label,
      client_device_type,
      client_os,
      scopes,
      issued_at,
      last_connected_at,
      NULL,
      NULL,
      0
    FROM auth_sessions
  `;
    yield* sql`
    UPDATE auth_sessions
    SET client_id = 'legacy:' || session_id
    WHERE client_id IS NULL
  `;
    yield* sql`
    CREATE INDEX idx_auth_sessions_client
    ON auth_sessions(client_id, revoked_at, expires_at)
  `;
    yield* sql`DROP INDEX idx_auth_pairing_links_active`;
    yield* sql`DROP TABLE auth_pairing_links`;
    yield* sql`
    CREATE TABLE auth_pairing_links (
      id TEXT PRIMARY KEY,
      credential_digest TEXT NOT NULL UNIQUE,
      method TEXT NOT NULL,
      scopes TEXT NOT NULL,
      subject TEXT NOT NULL,
      label TEXT,
      proof_key_thumbprint TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      revoked_at TEXT,
      revision INTEGER NOT NULL DEFAULT 0
    )
  `;
    yield* sql`
    CREATE INDEX idx_auth_pairing_links_active
    ON auth_pairing_links(revoked_at, consumed_at, expires_at)
  `;
    yield* sql`
    UPDATE auth_clients
    SET revision = 7
    WHERE client_id = 'legacy:synthetic-scoped-session'
  `;
    yield* sql`
    INSERT INTO auth_pairing_links (
      id,
      credential_digest,
      method,
      scopes,
      subject,
      label,
      proof_key_thumbprint,
      created_at,
      expires_at,
      revision
    ) VALUES (
      'synthetic-digest-pairing',
      'synthetic-keyed-digest',
      'one-time-token',
      '["orchestration:read"]',
      'synthetic-scoped-subject',
      'Synthetic digest pairing',
      'synthetic-proof-key',
      '2026-01-01T00:00:00.000Z',
      '2027-01-01T00:00:00.000Z',
      4
    )
  `;
  },
);

export const prepareForkMigrationState = Effect.fn("AuthLineageFixtures.prepareForkMigrationState")(
  function* (state: ForkMigrationState) {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 30 });

    if (state >= 32) {
      yield* sql`ALTER TABLE projection_threads ADD COLUMN issue_link_json TEXT`;
    }
    if (state >= 33) {
      yield* Migration0031;
    }
    if (state >= 34) {
      yield* Migration0032;
    }
    if (state >= 35) {
      yield* sql`ALTER TABLE projection_threads ADD COLUMN active_plan_progress_json TEXT`;
      yield* sql`ALTER TABLE projection_threads ADD COLUMN latest_runtime_activity_at TEXT`;
      yield* sql`ALTER TABLE projection_threads ADD COLUMN status_summary_updated_at TEXT`;
    }
    if (state >= 38) {
      yield* sql`
      CREATE INDEX idx_projection_thread_proposed_plans_thread_created_id
      ON projection_thread_proposed_plans(thread_id, created_at, plan_id)
    `;
    }
    if (state >= 39) {
      yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN settled_override TEXT
      CHECK (
        settled_override IS NULL
        OR settled_override IN ('settled', 'active')
      )
    `;
      yield* sql`ALTER TABLE projection_threads ADD COLUMN settled_at TEXT`;
    }

    if (state <= 32) {
      yield* seedRoleAuth();
    } else {
      yield* seedScopedAuth(state >= 34);
    }
    if (state >= 40) {
      yield* applyForkSettingsAdmin();
    }

    for (const [migrationId, name] of historicalMigrationNames) {
      if (migrationId > state) break;
      yield* sql`
      INSERT INTO effect_sql_migrations (migration_id, name)
      VALUES (${migrationId}, ${name})
    `;
    }
  },
);

export const prepareReleasedForkMigration41State = Effect.fn(
  "AuthLineageFixtures.prepareReleasedForkMigration41State",
)(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* prepareForkMigrationState(40);
  yield* sql`
    INSERT INTO effect_sql_migrations (migration_id, name)
    VALUES (41, 'ReconcileUpstreamAndSettingsAdmin')
  `;
});
