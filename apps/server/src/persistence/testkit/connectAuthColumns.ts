// Fork migrations 114_AuthConnectDevices and 115_AuthConnectDeniedRequests add these columns with
// defaults. Proofs that retain auth rows from before 114 expect each row unchanged plus these values
// once a database reaches the journal head, as every production open does.

type Rows = ReadonlyArray<Readonly<Record<string, unknown>>>;

/** `SELECT *` rows of `auth_sessions` as they read after migration 114. */
export const sessionsWithConnectColumns = (rows: Rows) =>
  rows.map((row) => ({ proof_key_thumbprint: null, ...row }));

/** `SELECT *` rows of `auth_pairing_links` as they read after migration 115. */
const pairingLinksWithConnectColumns = (rows: Rows) =>
  rows.map((row) => ({
    requires_connect_approval: 0,
    requested_client_json: null,
    connect_denied: 0,
    ...row,
  }));

/** Retained data with its `sessions` and `pairing` rows as they read at the journal head. */
export const withConnectAuthColumns = <
  Data extends { readonly sessions?: Rows; readonly pairing?: Rows },
>(
  data: Data,
): Data => ({
  ...data,
  ...(data.sessions === undefined ? {} : { sessions: sessionsWithConnectColumns(data.sessions) }),
  ...(data.pairing === undefined ? {} : { pairing: pairingLinksWithConnectColumns(data.pairing) }),
});
