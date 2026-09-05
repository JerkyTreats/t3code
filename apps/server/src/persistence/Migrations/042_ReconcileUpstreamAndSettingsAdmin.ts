import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

type TableInfoRow = {
  readonly name: string;
};

const allowedDeviceTypes = "'desktop', 'mobile', 'tablet', 'bot', 'unknown'";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const tableColumns = Effect.fn("Migration0042.tableColumns")(function* (table: string) {
    const rows = yield* sql<TableInfoRow>`
      SELECT name
      FROM pragma_table_info(${table})
    `;
    return new Set(rows.map((row) => row.name));
  });

  const projectionThreadColumns = yield* tableColumns("projection_threads");
  if (!projectionThreadColumns.has("settled_override")) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN settled_override TEXT`;
  }
  if (!projectionThreadColumns.has("settled_at")) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN settled_at TEXT`;
  }
  if (!projectionThreadColumns.has("snoozed_until")) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN snoozed_until TEXT`;
  }
  if (!projectionThreadColumns.has("snoozed_at")) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN snoozed_at TEXT`;
  }
  if (!projectionThreadColumns.has("title_regeneration_request_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN title_regeneration_request_id TEXT
    `;
  }
  if (!projectionThreadColumns.has("title_regeneration_started_at")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN title_regeneration_started_at TEXT
    `;
  }
  if (!projectionThreadColumns.has("pinned_at")) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN pinned_at TEXT`;
  }
  if (!projectionThreadColumns.has("pin_order_key")) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN pin_order_key TEXT`;
  }

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_turns_thread_keyset
    ON projection_turns(thread_id, requested_at, turn_id)
  `;

  const projectionProjectColumns = yield* tableColumns("projection_projects");
  if (!projectionProjectColumns.has("default_thread_env_mode")) {
    yield* sql`
      ALTER TABLE projection_projects
      ADD COLUMN default_thread_env_mode TEXT
    `;
  }
  if (!projectionProjectColumns.has("favicon_path")) {
    yield* sql`ALTER TABLE projection_projects ADD COLUMN favicon_path TEXT`;
  }

  const authClientColumns = yield* tableColumns("auth_clients");
  const authSessionColumns = yield* tableColumns("auth_sessions");

  yield* sql`
    CREATE TABLE auth_clients_reconcile_0042 (
      client_id TEXT PRIMARY KEY,
      label TEXT,
      device_type TEXT NOT NULL DEFAULT 'unknown',
      platform TEXT,
      granted_scopes TEXT NOT NULL,
      management_class TEXT,
      created_at TEXT NOT NULL,
      last_connected_at TEXT,
      disabled_at TEXT,
      deleted_at TEXT,
      revision INTEGER NOT NULL DEFAULT 0
    )
  `;

  const hasClientIdentity = authClientColumns.has("client_id");
  if (hasClientIdentity) {
    const invalidClientIdentities = yield* sql<{ readonly count: number }>`
      SELECT COUNT(*) AS "count"
      FROM auth_clients
      WHERE client_id IS NULL
        OR TRIM(client_id) = ''
    `;
    if ((invalidClientIdentities[0]?.count ?? 0) > 0) {
      return yield* Effect.die(
        new Error("Migration 42 cannot preserve auth_clients rows with an empty client_id."),
      );
    }
    const standaloneClientFilter = authSessionColumns.has("client_id")
      ? sql.literal(`
          AND NOT EXISTS (
            SELECT 1
            FROM auth_sessions
            WHERE auth_sessions.client_id = auth_clients.client_id
          )
        `)
      : sql.literal("");
    const label = authClientColumns.has("label") ? sql("label") : sql.literal("NULL");
    const deviceType = authClientColumns.has("device_type")
      ? sql("device_type")
      : sql.literal("'unknown'");
    const platform = authClientColumns.has("platform") ? sql("platform") : sql.literal("NULL");
    const lastConnectedAt = authClientColumns.has("last_connected_at")
      ? sql("last_connected_at")
      : sql.literal("NULL");
    const disabledAt = authClientColumns.has("disabled_at")
      ? sql("disabled_at")
      : sql.literal("NULL");
    const deletedAt = authClientColumns.has("deleted_at") ? sql("deleted_at") : sql.literal("NULL");
    const revision = authClientColumns.has("revision") ? sql("revision") : sql.literal("0");
    const grantedScopes = authClientColumns.has("granted_scopes")
      ? sql("granted_scopes")
      : sql.literal("'[]'");
    const managementClass = authClientColumns.has("management_class")
      ? sql("management_class")
      : sql.literal("NULL");
    const createdAt = authClientColumns.has("created_at")
      ? sql("created_at")
      : sql.literal("'1970-01-01T00:00:00.000Z'");

    yield* sql`
      INSERT INTO auth_clients_reconcile_0042 (
        client_id,
        label,
        device_type,
        platform,
        granted_scopes,
        management_class,
        created_at,
        last_connected_at,
        disabled_at,
        deleted_at,
        revision
      )
      SELECT
        client_id,
        ${label},
        CASE
          WHEN ${deviceType} IN (${sql.literal(allowedDeviceTypes)}) THEN ${deviceType}
          ELSE 'unknown'
        END,
        ${platform},
        COALESCE(${grantedScopes}, '[]'),
        CASE
          WHEN ${managementClass} = 'portal-managed-device'
            THEN 'portal-managed-device'
          ELSE NULL
        END,
        COALESCE(${createdAt}, '1970-01-01T00:00:00.000Z'),
        ${lastConnectedAt},
        ${disabledAt},
        ${deletedAt},
        COALESCE(${revision}, 0)
      FROM auth_clients
      WHERE 1 = 1
        ${standaloneClientFilter}
    `;
  } else if (authClientColumns.size > 0) {
    const unidentifiedClients = yield* sql<{ readonly count: number }>`
      SELECT COUNT(*) AS "count"
      FROM auth_clients
    `;
    if ((unidentifiedClients[0]?.count ?? 0) > 0) {
      return yield* Effect.die(
        new Error("Migration 42 cannot preserve auth_clients rows without client_id."),
      );
    }
  }

  yield* sql`
    CREATE TABLE auth_sessions_reconcile_0042 (
      session_id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      scopes TEXT NOT NULL,
      method TEXT NOT NULL,
      client_label TEXT,
      client_ip_address TEXT,
      client_user_agent TEXT,
      client_device_type TEXT NOT NULL DEFAULT 'unknown',
      client_os TEXT,
      client_browser TEXT,
      client_surface TEXT,
      client_app_version TEXT,
      authority_class TEXT,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_connected_at TEXT,
      revoked_at TEXT
    )
  `;

  const hasScopedSessions = authSessionColumns.has("scopes");
  if (hasScopedSessions) {
    const requiredSessionColumns = ["session_id", "subject", "method", "issued_at", "expires_at"];
    if (!requiredSessionColumns.every((column) => authSessionColumns.has(column))) {
      return yield* Effect.die(
        new Error(
          "Migration 42 cannot preserve a scoped auth_sessions table with missing required columns.",
        ),
      );
    }

    const existingClientId = authSessionColumns.has("client_id")
      ? sql("client_id")
      : sql.literal("NULL");
    const clientLabel = authSessionColumns.has("client_label")
      ? sql("client_label")
      : sql.literal("NULL");
    const clientIpAddress = authSessionColumns.has("client_ip_address")
      ? sql("client_ip_address")
      : sql.literal("NULL");
    const clientUserAgent = authSessionColumns.has("client_user_agent")
      ? sql("client_user_agent")
      : sql.literal("NULL");
    const clientDeviceType = authSessionColumns.has("client_device_type")
      ? sql("client_device_type")
      : sql.literal("'unknown'");
    const clientOs = authSessionColumns.has("client_os") ? sql("client_os") : sql.literal("NULL");
    const clientBrowser = authSessionColumns.has("client_browser")
      ? sql("client_browser")
      : sql.literal("NULL");
    const clientSurface = authSessionColumns.has("client_surface")
      ? sql("client_surface")
      : sql.literal("NULL");
    const clientAppVersion = authSessionColumns.has("client_app_version")
      ? sql("client_app_version")
      : sql.literal("NULL");
    const authorityClass = authSessionColumns.has("authority_class")
      ? sql("authority_class")
      : sql.literal("NULL");
    const lastConnectedAt = authSessionColumns.has("last_connected_at")
      ? sql("last_connected_at")
      : sql.literal("NULL");
    const revokedAt = authSessionColumns.has("revoked_at")
      ? sql("revoked_at")
      : sql.literal("NULL");

    yield* sql`
      CREATE TABLE auth_session_client_map_reconcile_0042 (
        session_id TEXT PRIMARY KEY,
        source_client_id TEXT,
        client_id TEXT NOT NULL
      )
    `;
    yield* sql`
      INSERT INTO auth_session_client_map_reconcile_0042 (
        session_id,
        source_client_id,
        client_id
      )
      SELECT
        session_id,
        ${existingClientId},
        CASE
          WHEN ${existingClientId} IS NOT NULL
            AND TRIM(${existingClientId}) <> ''
            AND ${existingClientId} NOT LIKE 'legacy:%'
            THEN ${existingClientId}
          ELSE 'migrated-' || lower(hex(randomblob(16)))
        END
      FROM auth_sessions
    `;

    const sourceClientJoin = hasClientIdentity
      ? sql.literal(
          "LEFT JOIN auth_clients AS source_client ON source_client.client_id = session_client_map.source_client_id",
        )
      : sql.literal("");
    const mappedLabel =
      hasClientIdentity && authClientColumns.has("label")
        ? sql.literal("COALESCE(source_client.label, auth_sessions.client_label)")
        : clientLabel;
    const mappedDeviceType =
      hasClientIdentity && authClientColumns.has("device_type")
        ? sql.literal("COALESCE(source_client.device_type, auth_sessions.client_device_type)")
        : clientDeviceType;
    const mappedPlatform =
      hasClientIdentity && authClientColumns.has("platform")
        ? sql.literal("COALESCE(source_client.platform, auth_sessions.client_os)")
        : clientOs;
    const mappedScopes =
      hasClientIdentity && authClientColumns.has("granted_scopes")
        ? sql.literal("COALESCE(source_client.granted_scopes, auth_sessions.scopes)")
        : sql("scopes");
    const mappedManagementClass =
      hasClientIdentity && authClientColumns.has("management_class")
        ? sql.literal(
            "CASE WHEN source_client.management_class = 'portal-managed-device' THEN 'portal-managed-device' ELSE NULL END",
          )
        : sql.literal("NULL");
    const mappedCreatedAt =
      hasClientIdentity && authClientColumns.has("created_at")
        ? sql.literal("COALESCE(source_client.created_at, auth_sessions.issued_at)")
        : sql("issued_at");
    const mappedLastConnectedAt =
      hasClientIdentity && authClientColumns.has("last_connected_at")
        ? sql.literal("COALESCE(source_client.last_connected_at, auth_sessions.last_connected_at)")
        : lastConnectedAt;
    const mappedDisabledAt =
      hasClientIdentity && authClientColumns.has("disabled_at")
        ? sql.literal("source_client.disabled_at")
        : sql.literal("NULL");
    const mappedDeletedAt =
      hasClientIdentity && authClientColumns.has("deleted_at")
        ? sql.literal("source_client.deleted_at")
        : sql.literal("NULL");
    const mappedRevision =
      hasClientIdentity && authClientColumns.has("revision")
        ? sql.literal("COALESCE(source_client.revision, 0)")
        : sql.literal("0");

    yield* sql`
      INSERT OR IGNORE INTO auth_clients_reconcile_0042 (
        client_id,
        label,
        device_type,
        platform,
        granted_scopes,
        management_class,
        created_at,
        last_connected_at,
        disabled_at,
        deleted_at,
        revision
      )
      SELECT
        session_client_map.client_id,
        ${mappedLabel},
        CASE
          WHEN ${mappedDeviceType} IN (${sql.literal(allowedDeviceTypes)})
            THEN ${mappedDeviceType}
          ELSE 'unknown'
        END,
        ${mappedPlatform},
        ${mappedScopes},
        ${mappedManagementClass},
        ${mappedCreatedAt},
        ${mappedLastConnectedAt},
        ${mappedDisabledAt},
        ${mappedDeletedAt},
        ${mappedRevision}
      FROM auth_sessions
      JOIN auth_session_client_map_reconcile_0042 AS session_client_map
        USING (session_id)
      ${sourceClientJoin}
    `;

    yield* sql`
      INSERT INTO auth_sessions_reconcile_0042 (
        session_id,
        client_id,
        subject,
        scopes,
        method,
        client_label,
        client_ip_address,
        client_user_agent,
        client_device_type,
        client_os,
        client_browser,
        client_surface,
        client_app_version,
        authority_class,
        issued_at,
        expires_at,
        last_connected_at,
        revoked_at
      )
      SELECT
        auth_sessions.session_id,
        session_client_map.client_id,
        subject,
        scopes,
        method,
        ${clientLabel},
        ${clientIpAddress},
        ${clientUserAgent},
        CASE
          WHEN ${clientDeviceType} IN (${sql.literal(allowedDeviceTypes)})
            THEN ${clientDeviceType}
          ELSE 'unknown'
        END,
        ${clientOs},
        ${clientBrowser},
        ${clientSurface},
        ${clientAppVersion},
        ${authorityClass},
        issued_at,
        expires_at,
        ${lastConnectedAt},
        ${revokedAt}
      FROM auth_sessions
      JOIN auth_session_client_map_reconcile_0042 AS session_client_map
        USING (session_id)
    `;
    yield* sql`DROP TABLE auth_session_client_map_reconcile_0042`;
  }

  yield* sql`DROP INDEX IF EXISTS idx_auth_sessions_active`;
  yield* sql`DROP INDEX IF EXISTS idx_auth_sessions_client`;
  yield* sql`DROP TABLE IF EXISTS auth_sessions`;
  yield* sql`DROP TABLE IF EXISTS auth_clients`;
  yield* sql`ALTER TABLE auth_clients_reconcile_0042 RENAME TO auth_clients`;
  yield* sql`ALTER TABLE auth_sessions_reconcile_0042 RENAME TO auth_sessions`;
  yield* sql`
    CREATE INDEX idx_auth_sessions_active
    ON auth_sessions(revoked_at, expires_at, issued_at)
  `;
  yield* sql`
    CREATE INDEX idx_auth_sessions_client
    ON auth_sessions(client_id, revoked_at, expires_at)
  `;

  const authPairingLinkColumns = yield* tableColumns("auth_pairing_links");
  yield* sql`
    CREATE TABLE auth_pairing_links_reconcile_0042 (
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

  const requiredDigestPairingColumns = [
    "id",
    "credential_digest",
    "method",
    "scopes",
    "subject",
    "created_at",
    "expires_at",
  ];
  if (requiredDigestPairingColumns.every((column) => authPairingLinkColumns.has(column))) {
    const label = authPairingLinkColumns.has("label") ? sql("label") : sql.literal("NULL");
    const proofKeyThumbprint = authPairingLinkColumns.has("proof_key_thumbprint")
      ? sql("proof_key_thumbprint")
      : sql.literal("NULL");
    const consumedAt = authPairingLinkColumns.has("consumed_at")
      ? sql("consumed_at")
      : sql.literal("NULL");
    const revokedAt = authPairingLinkColumns.has("revoked_at")
      ? sql("revoked_at")
      : sql.literal("NULL");
    const revision = authPairingLinkColumns.has("revision") ? sql("revision") : sql.literal("0");

    yield* sql`
      INSERT INTO auth_pairing_links_reconcile_0042 (
        id,
        credential_digest,
        method,
        scopes,
        subject,
        label,
        proof_key_thumbprint,
        created_at,
        expires_at,
        consumed_at,
        revoked_at,
        revision
      )
      SELECT
        id,
        credential_digest,
        method,
        scopes,
        subject,
        ${label},
        ${proofKeyThumbprint},
        created_at,
        expires_at,
        ${consumedAt},
        ${revokedAt},
        COALESCE(${revision}, 0)
      FROM auth_pairing_links
      WHERE credential_digest IS NOT NULL
        AND TRIM(credential_digest) <> ''
    `;
  }

  yield* sql`DROP INDEX IF EXISTS idx_auth_pairing_links_active`;
  yield* sql`DROP TABLE IF EXISTS auth_pairing_links`;
  yield* sql`
    ALTER TABLE auth_pairing_links_reconcile_0042
    RENAME TO auth_pairing_links
  `;
  yield* sql`
    CREATE INDEX idx_auth_pairing_links_active
    ON auth_pairing_links(revoked_at, consumed_at, expires_at)
  `;

  const orphanedSessions = yield* sql<{ readonly count: number }>`
    SELECT COUNT(*) AS "count"
    FROM auth_sessions
    LEFT JOIN auth_clients USING (client_id)
    WHERE auth_clients.client_id IS NULL
  `;
  if (orphanedSessions[0]?.count !== 0) {
    return yield* Effect.die(
      new Error("Migration 42 left an auth session without a durable client."),
    );
  }
});
