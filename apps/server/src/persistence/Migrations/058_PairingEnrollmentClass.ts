import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // Existing grants do not acquire device-management authority from their
  // subject or presentation metadata. Only a new explicit issuer can set it.
  yield* sql`
    ALTER TABLE auth_pairing_links
    ADD COLUMN client_management_class TEXT
    CHECK (client_management_class IS NULL OR client_management_class = 'portal-managed-device')
  `;
});
