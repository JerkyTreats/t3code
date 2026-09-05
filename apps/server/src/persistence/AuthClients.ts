import {
  AuthClientId,
  AuthClientMetadataDeviceType,
  AuthEnvironmentScopes,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { PersistenceDecodeError, PersistenceSqlError } from "./Errors.ts";

export const AuthClientRecord = Schema.Struct({
  clientId: AuthClientId,
  label: Schema.NullOr(Schema.String),
  deviceType: AuthClientMetadataDeviceType,
  platform: Schema.NullOr(Schema.String),
  grantedScopes: Schema.fromJsonString(AuthEnvironmentScopes),
  createdAt: Schema.DateTimeUtcFromString,
  lastConnectedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  disabledAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  deletedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  revision: Schema.Int,
});
export type AuthClientRecord = typeof AuthClientRecord.Type;

const AuthClientRawDbRow = Schema.Struct({
  clientId: Schema.String,
  label: Schema.Unknown,
  deviceType: Schema.Unknown,
  platform: Schema.Unknown,
  grantedScopes: Schema.Unknown,
  createdAt: Schema.Unknown,
  lastConnectedAt: Schema.Unknown,
  disabledAt: Schema.Unknown,
  deletedAt: Schema.Unknown,
  revision: Schema.Unknown,
});

export type AuthClientMutationOutcome =
  | { readonly _tag: "changed"; readonly revision: number }
  | { readonly _tag: "unchanged"; readonly revision: number }
  | { readonly _tag: "conflict"; readonly revision: number }
  | { readonly _tag: "not-found" };

const decodeClient = Schema.decodeUnknownEffect(AuthClientRecord);

function mapError(operation: string, decodeOperation: string) {
  return (cause: unknown) =>
    Schema.isSchemaError(cause)
      ? PersistenceDecodeError.fromSchemaError(decodeOperation, cause)
      : new PersistenceSqlError({ operation, cause });
}

export class AuthClientRepository extends Context.Service<
  AuthClientRepository,
  {
    readonly listVisible: Effect.Effect<
      ReadonlyArray<AuthClientRecord>,
      PersistenceSqlError | PersistenceDecodeError
    >;
    readonly setEnabled: (input: {
      readonly clientId: AuthClientId;
      readonly expectedRevision: number;
      readonly enabled: boolean;
      readonly changedAt: DateTime.DateTime;
    }) => Effect.Effect<AuthClientMutationOutcome, PersistenceSqlError | PersistenceDecodeError>;
    readonly delete: (input: {
      readonly clientId: AuthClientId;
      readonly expectedRevision: number;
      readonly deletedAt: DateTime.DateTime;
    }) => Effect.Effect<AuthClientMutationOutcome, PersistenceSqlError | PersistenceDecodeError>;
  }
>()("t3/persistence/AuthClients/AuthClientRepository") {}

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const isPortalManagedDevice = sql.literal(
    "auth_clients.management_class = 'portal-managed-device'",
  );

  const listVisibleRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: AuthClientRawDbRow,
    execute: () => sql`
      SELECT
        client_id AS "clientId",
        label AS "label",
        device_type AS "deviceType",
        platform AS "platform",
        granted_scopes AS "grantedScopes",
        created_at AS "createdAt",
        last_connected_at AS "lastConnectedAt",
        disabled_at AS "disabledAt",
        deleted_at AS "deletedAt",
        revision AS "revision"
      FROM auth_clients
      WHERE deleted_at IS NULL
        AND ${isPortalManagedDevice}
      ORDER BY created_at DESC, client_id DESC
    `,
  });

  const getRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ clientId: AuthClientId }),
    Result: AuthClientRawDbRow,
    execute: ({ clientId }) => sql`
      SELECT
        client_id AS "clientId",
        label AS "label",
        device_type AS "deviceType",
        platform AS "platform",
        granted_scopes AS "grantedScopes",
        created_at AS "createdAt",
        last_connected_at AS "lastConnectedAt",
        disabled_at AS "disabledAt",
        deleted_at AS "deletedAt",
        revision AS "revision"
      FROM auth_clients
      WHERE client_id = ${clientId}
        AND ${isPortalManagedDevice}
    `,
  });

  const readOutcome = Effect.fn("AuthClientRepository.readMutationOutcome")(function* (
    clientId: AuthClientId,
    expectedRevision: number,
    desiredEnabled?: boolean,
  ) {
    const row = yield* getRow({ clientId });
    if (row._tag === "None" || row.value.deletedAt !== null) {
      return { _tag: "not-found" } satisfies AuthClientMutationOutcome;
    }
    const decoded = yield* decodeClient(row.value);
    if (decoded.revision !== expectedRevision) {
      return { _tag: "conflict", revision: decoded.revision } satisfies AuthClientMutationOutcome;
    }
    if (desiredEnabled !== undefined && (decoded.disabledAt === null) === desiredEnabled) {
      return { _tag: "unchanged", revision: decoded.revision } satisfies AuthClientMutationOutcome;
    }
    return null;
  });

  const listVisible = listVisibleRows(undefined).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, (row) => decodeClient(row))),
    Effect.mapError(
      mapError("AuthClientRepository.listVisible:query", "AuthClientRepository.listVisible:decode"),
    ),
  );

  const setEnabled: AuthClientRepository["Service"]["setEnabled"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const changedAt = DateTime.formatIso(input.changedAt);
          const existing = yield* readOutcome(
            input.clientId,
            input.expectedRevision,
            input.enabled,
          );
          if (existing !== null) return existing;
          const rows = yield* sql<{ readonly revision: number }>`
          UPDATE auth_clients
          SET disabled_at = ${input.enabled ? null : changedAt}, revision = revision + 1
          WHERE client_id = ${input.clientId}
            AND deleted_at IS NULL
            AND revision = ${input.expectedRevision}
            AND ${isPortalManagedDevice}
          RETURNING revision AS "revision"
        `;
          const changed = rows[0];
          if (changed) return { _tag: "changed", revision: changed.revision } as const;
          const fallback: AuthClientMutationOutcome = {
            _tag: "conflict",
            revision: input.expectedRevision,
          };
          return (
            (yield* readOutcome(input.clientId, input.expectedRevision, input.enabled)) ?? fallback
          );
        }),
      )
      .pipe(
        Effect.mapError(
          mapError(
            "AuthClientRepository.setEnabled:transaction",
            "AuthClientRepository.setEnabled:decode",
          ),
        ),
      );

  const deleteClient: AuthClientRepository["Service"]["delete"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const deletedAt = DateTime.formatIso(input.deletedAt);
          const existing = yield* readOutcome(input.clientId, input.expectedRevision);
          if (existing !== null) return existing;
          const rows = yield* sql<{ readonly revision: number }>`
          UPDATE auth_clients
          SET deleted_at = ${deletedAt}, revision = revision + 1
          WHERE client_id = ${input.clientId}
            AND deleted_at IS NULL
            AND revision = ${input.expectedRevision}
            AND ${isPortalManagedDevice}
          RETURNING revision AS "revision"
        `;
          const changed = rows[0];
          if (!changed) {
            const fallback: AuthClientMutationOutcome = {
              _tag: "conflict",
              revision: input.expectedRevision,
            };
            return (yield* readOutcome(input.clientId, input.expectedRevision)) ?? fallback;
          }
          yield* sql`
          UPDATE auth_sessions
          SET revoked_at = ${deletedAt}
          WHERE client_id = ${input.clientId}
            AND revoked_at IS NULL
        `;
          return { _tag: "changed", revision: changed.revision } as const;
        }),
      )
      .pipe(
        Effect.mapError(
          mapError("AuthClientRepository.delete:transaction", "AuthClientRepository.delete:decode"),
        ),
      );

  return AuthClientRepository.of({ listVisible, setEnabled, delete: deleteClient });
});

export const layer = Layer.effect(AuthClientRepository, make);
