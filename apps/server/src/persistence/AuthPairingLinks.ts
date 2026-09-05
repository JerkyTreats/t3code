import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { AuthEnvironmentScopes } from "@t3tools/contracts";

import {
  type AuthPairingLinkRepositoryError,
  PersistenceDecodeError,
  type PersistenceErrorCorrelation,
  PersistenceSqlError,
} from "./Errors.ts";

export const AuthPairingLinkRecord = Schema.Struct({
  id: Schema.String,
  credentialDigest: Schema.String,
  method: Schema.Literals(["desktop-bootstrap", "one-time-token"]),
  scopes: Schema.fromJsonString(AuthEnvironmentScopes),
  subject: Schema.String,
  clientManagementClass: Schema.NullOr(Schema.Literal("portal-managed-device")),
  label: Schema.NullOr(Schema.String),
  proofKeyThumbprint: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
  expiresAt: Schema.DateTimeUtcFromString,
  consumedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  revokedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  revision: Schema.Int,
});
export type AuthPairingLinkRecord = typeof AuthPairingLinkRecord.Type;

export const CreateAuthPairingLinkInput = Schema.Struct({
  id: Schema.String,
  credentialDigest: Schema.String,
  method: Schema.Literals(["desktop-bootstrap", "one-time-token"]),
  scopes: AuthEnvironmentScopes,
  subject: Schema.String,
  clientManagementClass: Schema.NullOr(Schema.Literal("portal-managed-device")),
  label: Schema.NullOr(Schema.String),
  proofKeyThumbprint: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
  expiresAt: Schema.DateTimeUtcFromString,
});
export type CreateAuthPairingLinkInput = typeof CreateAuthPairingLinkInput.Type;

export const ConsumeAuthPairingLinkInput = Schema.Struct({
  credentialDigest: Schema.String,
  proofKeyThumbprint: Schema.NullOr(Schema.String),
  consumedAt: Schema.DateTimeUtcFromString,
  now: Schema.DateTimeUtcFromString,
});
export type ConsumeAuthPairingLinkInput = typeof ConsumeAuthPairingLinkInput.Type;

export const ListActiveAuthPairingLinksInput = Schema.Struct({
  now: Schema.DateTimeUtcFromString,
});
export type ListActiveAuthPairingLinksInput = typeof ListActiveAuthPairingLinksInput.Type;

export const RevokeAuthPairingLinkInput = Schema.Struct({
  id: Schema.String,
  revokedAt: Schema.DateTimeUtcFromString,
});
export type RevokeAuthPairingLinkInput = typeof RevokeAuthPairingLinkInput.Type;

export const RevokeAuthPairingLinkAtRevisionInput = Schema.Struct({
  id: Schema.String,
  expectedRevision: Schema.Int,
  revokedAt: Schema.DateTimeUtcFromString,
});
export type RevokeAuthPairingLinkAtRevisionInput = typeof RevokeAuthPairingLinkAtRevisionInput.Type;

export type AuthPairingLinkMutationOutcome =
  | { readonly _tag: "changed"; readonly revision: number }
  | { readonly _tag: "conflict"; readonly revision: number }
  | { readonly _tag: "not-found" };

export const GetAuthPairingLinkByCredentialDigestInput = Schema.Struct({
  credentialDigest: Schema.String,
});
export type GetAuthPairingLinkByCredentialDigestInput =
  typeof GetAuthPairingLinkByCredentialDigestInput.Type;

const AuthPairingLinkRawDbRow = Schema.Struct({
  id: Schema.String,
  credentialDigest: Schema.Unknown,
  method: Schema.Unknown,
  scopes: Schema.Unknown,
  subject: Schema.Unknown,
  clientManagementClass: Schema.Unknown,
  label: Schema.Unknown,
  proofKeyThumbprint: Schema.Unknown,
  createdAt: Schema.Unknown,
  expiresAt: Schema.Unknown,
  consumedAt: Schema.Unknown,
  revokedAt: Schema.Unknown,
  revision: Schema.Unknown,
});

const decodeAuthPairingLinkDbRow = Schema.decodeUnknownEffect(AuthPairingLinkRecord);

export class AuthPairingLinkRepository extends Context.Service<
  AuthPairingLinkRepository,
  {
    readonly create: (
      input: CreateAuthPairingLinkInput,
    ) => Effect.Effect<void, AuthPairingLinkRepositoryError>;
    readonly consumeAvailable: (
      input: ConsumeAuthPairingLinkInput,
    ) => Effect.Effect<Option.Option<AuthPairingLinkRecord>, AuthPairingLinkRepositoryError>;
    readonly listActive: (
      input: ListActiveAuthPairingLinksInput,
    ) => Effect.Effect<ReadonlyArray<AuthPairingLinkRecord>, AuthPairingLinkRepositoryError>;
    readonly revoke: (
      input: RevokeAuthPairingLinkInput,
    ) => Effect.Effect<boolean, AuthPairingLinkRepositoryError>;
    readonly revokeAtRevision: (
      input: RevokeAuthPairingLinkAtRevisionInput,
    ) => Effect.Effect<AuthPairingLinkMutationOutcome, AuthPairingLinkRepositoryError>;
    readonly getByCredentialDigest: (
      input: GetAuthPairingLinkByCredentialDigestInput,
    ) => Effect.Effect<Option.Option<AuthPairingLinkRecord>, AuthPairingLinkRepositoryError>;
  }
>()("t3/persistence/AuthPairingLinks/AuthPairingLinkRepository") {}

function toPersistenceSqlOrDecodeError(
  sqlOperation: string,
  decodeOperation: string,
  correlation?: PersistenceErrorCorrelation,
) {
  return (cause: unknown): AuthPairingLinkRepositoryError =>
    Schema.isSchemaError(cause)
      ? PersistenceDecodeError.fromSchemaError(decodeOperation, cause, correlation)
      : new PersistenceSqlError({
          operation: sqlOperation,
          ...(correlation === undefined ? {} : { correlation }),
          cause,
        });
}

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const createPairingLinkRow = SqlSchema.void({
    Request: CreateAuthPairingLinkInput,
    execute: (input) =>
      sql`
        INSERT INTO auth_pairing_links (
          id,
          credential_digest,
          method,
          scopes,
          subject,
          client_management_class,
          label,
          proof_key_thumbprint,
          created_at,
          expires_at,
          consumed_at,
          revoked_at
        )
        VALUES (
          ${input.id},
          ${input.credentialDigest},
          ${input.method},
          ${JSON.stringify(input.scopes)},
          ${input.subject},
          ${input.clientManagementClass},
          ${input.label},
          ${input.proofKeyThumbprint},
          ${input.createdAt},
          ${input.expiresAt},
          NULL,
          NULL
        )
      `,
  });

  const consumeAvailablePairingLinkRow = SqlSchema.findOneOption({
    Request: ConsumeAuthPairingLinkInput,
    Result: AuthPairingLinkRawDbRow,
    execute: ({ credentialDigest, proofKeyThumbprint, consumedAt, now }) =>
      sql`
        UPDATE auth_pairing_links
        SET consumed_at = ${consumedAt}
        WHERE credential_digest = ${credentialDigest}
          AND revoked_at IS NULL
          AND consumed_at IS NULL
          AND expires_at > ${now}
          AND (
            proof_key_thumbprint IS NULL
            OR proof_key_thumbprint = ${proofKeyThumbprint}
          )
        RETURNING
          id AS "id",
          credential_digest AS "credentialDigest",
          method AS "method",
          scopes AS "scopes",
          subject AS "subject",
          client_management_class AS "clientManagementClass",
          label AS "label",
          proof_key_thumbprint AS "proofKeyThumbprint",
          created_at AS "createdAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          revoked_at AS "revokedAt",
          revision AS "revision"
      `,
  });

  const listActivePairingLinkRows = SqlSchema.findAll({
    Request: ListActiveAuthPairingLinksInput,
    Result: AuthPairingLinkRawDbRow,
    execute: ({ now }) =>
      sql`
        SELECT
          id AS "id",
          credential_digest AS "credentialDigest",
          method AS "method",
          scopes AS "scopes",
          subject AS "subject",
          client_management_class AS "clientManagementClass",
          label AS "label",
          proof_key_thumbprint AS "proofKeyThumbprint",
          created_at AS "createdAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          revoked_at AS "revokedAt",
          revision AS "revision"
        FROM auth_pairing_links
        WHERE revoked_at IS NULL
          AND consumed_at IS NULL
          AND expires_at > ${now}
        ORDER BY created_at DESC, id DESC
      `,
  });

  const revokePairingLinkRow = SqlSchema.findAll({
    Request: RevokeAuthPairingLinkInput,
    Result: Schema.Struct({ id: Schema.String }),
    execute: ({ id, revokedAt }) =>
      sql`
        UPDATE auth_pairing_links
        SET revoked_at = ${revokedAt}
        WHERE id = ${id}
          AND revoked_at IS NULL
          AND consumed_at IS NULL
        RETURNING id AS "id"
      `,
  });

  const revokePairingLinkAtRevisionRow = SqlSchema.findAll({
    Request: RevokeAuthPairingLinkAtRevisionInput,
    Result: Schema.Struct({ revision: Schema.Int }),
    execute: ({ id, expectedRevision, revokedAt }) =>
      sql`
        UPDATE auth_pairing_links
        SET revoked_at = ${revokedAt}, revision = revision + 1
        WHERE id = ${id}
          AND revoked_at IS NULL
          AND consumed_at IS NULL
          AND client_management_class = 'portal-managed-device'
          AND expires_at > ${revokedAt}
          AND revision = ${expectedRevision}
        RETURNING revision AS "revision"
      `,
  });

  const readPairingLinkRevisionRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ id: Schema.String, revokedAt: Schema.DateTimeUtcFromString }),
    Result: Schema.Struct({ revision: Schema.Int }),
    execute: ({ id, revokedAt }) => sql`
      SELECT revision AS "revision"
      FROM auth_pairing_links
      WHERE id = ${id}
        AND revoked_at IS NULL
        AND consumed_at IS NULL
          AND client_management_class = 'portal-managed-device'
          AND expires_at > ${revokedAt}
    `,
  });

  const getPairingLinkRowByCredentialDigest = SqlSchema.findOneOption({
    Request: GetAuthPairingLinkByCredentialDigestInput,
    Result: AuthPairingLinkRawDbRow,
    execute: ({ credentialDigest }) =>
      sql`
        SELECT
          id AS "id",
          credential_digest AS "credentialDigest",
          method AS "method",
          scopes AS "scopes",
          subject AS "subject",
          client_management_class AS "clientManagementClass",
          label AS "label",
          proof_key_thumbprint AS "proofKeyThumbprint",
          created_at AS "createdAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          revoked_at AS "revokedAt",
          revision AS "revision"
        FROM auth_pairing_links
        WHERE credential_digest = ${credentialDigest}
      `,
  });

  const create: AuthPairingLinkRepository["Service"]["create"] = (input) =>
    createPairingLinkRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "AuthPairingLinkRepository.create:query",
          "AuthPairingLinkRepository.create:encodeRequest",
          { pairingLinkId: input.id },
        ),
      ),
    );

  const consumeAvailable: AuthPairingLinkRepository["Service"]["consumeAvailable"] = (input) =>
    consumeAvailablePairingLinkRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "AuthPairingLinkRepository.consumeAvailable:query",
          "AuthPairingLinkRepository.consumeAvailable:decodeRow",
        ),
      ),
      Effect.flatMap((rowOption) =>
        Option.match(rowOption, {
          onNone: () => Effect.succeed(Option.none()),
          onSome: (row) =>
            decodeAuthPairingLinkDbRow(row).pipe(
              Effect.mapError((cause) =>
                PersistenceDecodeError.fromSchemaError(
                  "AuthPairingLinkRepository.consumeAvailable:decodeRow",
                  cause,
                  { pairingLinkId: row.id },
                ),
              ),
              Effect.map(Option.some),
            ),
        }),
      ),
    );

  const listActive: AuthPairingLinkRepository["Service"]["listActive"] = (input) =>
    listActivePairingLinkRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "AuthPairingLinkRepository.listActive:query",
          "AuthPairingLinkRepository.listActive:decodeRows",
        ),
      ),
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) =>
          decodeAuthPairingLinkDbRow(row).pipe(
            Effect.mapError((cause) =>
              PersistenceDecodeError.fromSchemaError(
                "AuthPairingLinkRepository.listActive:decodeRows",
                cause,
                { pairingLinkId: row.id },
              ),
            ),
          ),
        ),
      ),
    );

  const revoke: AuthPairingLinkRepository["Service"]["revoke"] = (input) =>
    revokePairingLinkRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "AuthPairingLinkRepository.revoke:query",
          "AuthPairingLinkRepository.revoke:decodeRows",
          { pairingLinkId: input.id },
        ),
      ),
      Effect.map((rows) => rows.length > 0),
    );

  const revokeAtRevision: AuthPairingLinkRepository["Service"]["revokeAtRevision"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const changed = yield* revokePairingLinkAtRevisionRow(input);
          if (changed[0] !== undefined) {
            return { _tag: "changed", revision: changed[0].revision } as const;
          }
          const current = yield* readPairingLinkRevisionRow({
            id: input.id,
            revokedAt: input.revokedAt,
          });
          return Option.isSome(current)
            ? ({ _tag: "conflict", revision: current.value.revision } as const)
            : ({ _tag: "not-found" } as const);
        }),
      )
      .pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "AuthPairingLinkRepository.revokeAtRevision:transaction",
            "AuthPairingLinkRepository.revokeAtRevision:decode",
            { pairingLinkId: input.id },
          ),
        ),
      );

  const getByCredentialDigest: AuthPairingLinkRepository["Service"]["getByCredentialDigest"] = (
    input,
  ) =>
    getPairingLinkRowByCredentialDigest(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "AuthPairingLinkRepository.getByCredentialDigest:query",
          "AuthPairingLinkRepository.getByCredentialDigest:decodeRow",
        ),
      ),
      Effect.flatMap((rowOption) =>
        Option.match(rowOption, {
          onNone: () => Effect.succeed(Option.none()),
          onSome: (row) =>
            decodeAuthPairingLinkDbRow(row).pipe(
              Effect.mapError((cause) =>
                PersistenceDecodeError.fromSchemaError(
                  "AuthPairingLinkRepository.getByCredentialDigest:decodeRow",
                  cause,
                  { pairingLinkId: row.id },
                ),
              ),
              Effect.map(Option.some),
            ),
        }),
      ),
    );

  return {
    create,
    consumeAvailable,
    listActive,
    revoke,
    revokeAtRevision,
    getByCredentialDigest,
  } satisfies AuthPairingLinkRepository["Service"];
});

export const layer = Layer.effect(AuthPairingLinkRepository, make);
