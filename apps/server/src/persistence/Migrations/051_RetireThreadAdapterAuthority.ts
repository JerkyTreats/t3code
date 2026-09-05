import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

const retiredScope = "thread-adapter:operate";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    DELETE FROM auth_pairing_links
    WHERE EXISTS (
      SELECT 1
      FROM json_each(auth_pairing_links.scopes)
      WHERE json_each.value = ${retiredScope}
    )
  `;
  yield* sql`
    DELETE FROM auth_sessions
    WHERE EXISTS (
      SELECT 1
      FROM json_each(auth_sessions.scopes)
      WHERE json_each.value = ${retiredScope}
    )
  `;
  yield* sql`
    DELETE FROM auth_clients
    WHERE EXISTS (
      SELECT 1
      FROM json_each(auth_clients.granted_scopes)
      WHERE json_each.value = ${retiredScope}
    )
  `;

  yield* sql`DROP TABLE IF EXISTS thread_adapter_expired_launches`;
  yield* sql`DROP TABLE IF EXISTS thread_adapter_launch_bindings`;
});
