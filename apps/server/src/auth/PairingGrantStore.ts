import {
  AuthAdministrativeScopes,
  AuthStandardClientScopes,
  type AuthEnvironmentScope,
  type ServerAuthBootstrapMethod,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";
import * as AuthPairingLinks from "../persistence/AuthPairingLinks.ts";
import * as ServerSecretStore from "./ServerSecretStore.ts";
import { signPayload } from "./utils.ts";

export interface BootstrapGrant {
  readonly method: ServerAuthBootstrapMethod;
  readonly scopes: ReadonlyArray<AuthEnvironmentScope>;
  readonly subject: string;
  readonly clientManagementClass?: "portal-managed-device" | null;
  readonly label?: string;
  readonly proofKeyThumbprint?: string;
  readonly expiresAt: DateTime.DateTime;
}

export class UnknownBootstrapCredentialError extends Schema.TaggedErrorClass<UnknownBootstrapCredentialError>()(
  "UnknownBootstrapCredentialError",
  {},
) {
  override get message(): string {
    return "Unknown bootstrap credential.";
  }
}

export class ExpiredBootstrapCredentialError extends Schema.TaggedErrorClass<ExpiredBootstrapCredentialError>()(
  "ExpiredBootstrapCredentialError",
  {},
) {
  override get message(): string {
    return "Bootstrap credential expired.";
  }
}

export class BootstrapCredentialProofKeyMismatchError extends Schema.TaggedErrorClass<BootstrapCredentialProofKeyMismatchError>()(
  "BootstrapCredentialProofKeyMismatchError",
  {},
) {
  override get message(): string {
    return "Bootstrap credential proof key mismatch.";
  }
}

export class UnavailableBootstrapCredentialError extends Schema.TaggedErrorClass<UnavailableBootstrapCredentialError>()(
  "UnavailableBootstrapCredentialError",
  {},
) {
  override get message(): string {
    return "Bootstrap credential is no longer available.";
  }
}

export const BootstrapCredentialInvalidError = Schema.Union([
  UnknownBootstrapCredentialError,
  ExpiredBootstrapCredentialError,
  BootstrapCredentialProofKeyMismatchError,
  UnavailableBootstrapCredentialError,
]);
export type BootstrapCredentialInvalidError = typeof BootstrapCredentialInvalidError.Type;
export const isBootstrapCredentialInvalidError = Schema.is(BootstrapCredentialInvalidError);

export class ActivePairingLinksLoadError extends Schema.TaggedErrorClass<ActivePairingLinksLoadError>()(
  "ActivePairingLinksLoadError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to load active pairing links.";
  }
}

export class PairingLinkRevokeError extends Schema.TaggedErrorClass<PairingLinkRevokeError>()(
  "PairingLinkRevokeError",
  {
    pairingLinkId: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to revoke pairing link '${this.pairingLinkId}'.`;
  }
}

export class PairingCredentialIssueError extends Schema.TaggedErrorClass<PairingCredentialIssueError>()(
  "PairingCredentialIssueError",
  {
    pairingLinkId: Schema.String,
    subject: Schema.String,
    label: Schema.optional(Schema.String),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to issue pairing credential '${this.pairingLinkId}' for '${this.subject}'.`;
  }
}

export class PairingCredentialRandomGenerationError extends Schema.TaggedErrorClass<PairingCredentialRandomGenerationError>()(
  "PairingCredentialRandomGenerationError",
  {
    operation: Schema.Literals(["generate-id", "generate-token"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to generate pairing credential data during '${this.operation}'.`;
  }
}

export class BootstrapCredentialConsumeError extends Schema.TaggedErrorClass<BootstrapCredentialConsumeError>()(
  "BootstrapCredentialConsumeError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to consume bootstrap credential.";
  }
}

export class BootstrapCredentialConsumeAvailableError extends Schema.TaggedErrorClass<BootstrapCredentialConsumeAvailableError>()(
  "BootstrapCredentialConsumeAvailableError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to atomically consume an available bootstrap credential.";
  }
}

export class BootstrapCredentialLookupError extends Schema.TaggedErrorClass<BootstrapCredentialLookupError>()(
  "BootstrapCredentialLookupError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Failed to look up bootstrap credential state.";
  }
}

export const BootstrapCredentialInternalError = Schema.Union([
  ActivePairingLinksLoadError,
  PairingLinkRevokeError,
  PairingCredentialIssueError,
  PairingCredentialRandomGenerationError,
  BootstrapCredentialConsumeError,
  BootstrapCredentialConsumeAvailableError,
  BootstrapCredentialLookupError,
]);
export type BootstrapCredentialInternalError = typeof BootstrapCredentialInternalError.Type;
export const isBootstrapCredentialInternalError = Schema.is(BootstrapCredentialInternalError);

export const BootstrapCredentialError = Schema.Union([
  BootstrapCredentialInvalidError,
  BootstrapCredentialInternalError,
]);
export type BootstrapCredentialError = typeof BootstrapCredentialError.Type;
export const isBootstrapCredentialError = Schema.is(BootstrapCredentialError);

export const PORTAL_MANAGED_DEVICE_PAIRING_SUBJECT = "portal-managed-device-enrollment";

export interface IssuedBootstrapCredential {
  readonly id: string;
  readonly credential: string;
  readonly label?: string;
  readonly proofKeyThumbprint?: string;
  readonly expiresAt: DateTime.Utc;
}

export interface ActivePairingLink {
  readonly id: string;
  readonly scopes: ReadonlyArray<AuthEnvironmentScope>;
  readonly subject: string;
  readonly clientManagementClass?: "portal-managed-device" | null;
  readonly label?: string;
  readonly createdAt: DateTime.Utc;
  readonly expiresAt: DateTime.Utc;
  readonly revision: number;
}

export class PairingGrantStore extends Context.Service<
  PairingGrantStore,
  {
    readonly issueOneTimeToken: (input?: {
      readonly ttl?: Duration.Duration;
      readonly scopes?: ReadonlyArray<AuthEnvironmentScope>;
      readonly subject?: string;
      readonly clientManagementClass?: "portal-managed-device";
      readonly label?: string;
      readonly proofKeyThumbprint?: string;
      /**
       * "startup" marks the credential the server mints for itself at boot,
       * which gets the long dev TTL when a dev URL is configured.
       */
      readonly purpose?: "startup";
    }) => Effect.Effect<IssuedBootstrapCredential, BootstrapCredentialInternalError>;
    readonly listActive: () => Effect.Effect<
      ReadonlyArray<ActivePairingLink>,
      BootstrapCredentialInternalError
    >;
    readonly revoke: (id: string) => Effect.Effect<boolean, BootstrapCredentialInternalError>;
    readonly revokeAtRevision: (input: {
      readonly id: string;
      readonly expectedRevision: number;
    }) => Effect.Effect<
      AuthPairingLinks.AuthPairingLinkMutationOutcome,
      BootstrapCredentialInternalError
    >;
    readonly consume: (
      credential: string,
      input?: {
        readonly proofKeyThumbprint?: string;
      },
    ) => Effect.Effect<BootstrapGrant, BootstrapCredentialError>;
  }
>()("t3/auth/PairingGrantStore") {}

interface StoredBootstrapGrant extends BootstrapGrant {
  readonly remainingUses: number | "unbounded";
}

type ConsumeResult =
  | {
      readonly _tag: "error";
      readonly reason: "not-found" | "expired";
      readonly error: BootstrapCredentialError;
    }
  | {
      readonly _tag: "success";
      readonly grant: BootstrapGrant;
    };

const DEFAULT_ONE_TIME_TOKEN_TTL_MINUTES = Duration.minutes(5);
// The desktop-bootstrap grant rides on a trusted IPC channel (fd3 or
// stdin) at backend launch, so it doesn't have to be short-lived the
// way a user-facing pairing link does. Letting it live for the
// lifetime of the backend process (24h is more than long enough for
// practical desktop use, and well under "forever" in case the seed
// gets logged anywhere by accident) means a page reload past the 5-min
// window can still recover by re-bootstrapping rather than locking
// the user out of the backend.
const DESKTOP_BOOTSTRAP_TTL_HOURS = Duration.hours(24);
// A dev server's startup token is read off a log by whoever (or whatever) is
// driving the session, often minutes later — after a `node --watch` restart, a
// detour into another task, or a hand-off to the person actually doing the
// testing. Five minutes turns that into a restart-the-server loop for no
// security benefit: the token only unlocks a local dev backend, and its holder
// could read the log anyway. Same reasoning (and duration) as the desktop
// bootstrap grant above. Only applies when a dev URL is configured; user-issued
// pairing links and real servers keep the 5-minute default.
const DEV_STARTUP_TTL_HOURS = Duration.hours(24);
const PAIRING_TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PAIRING_TOKEN_LENGTH = 12;
const PAIRING_TOKEN_REJECTION_LIMIT =
  Math.floor(256 / PAIRING_TOKEN_ALPHABET.length) * PAIRING_TOKEN_ALPHABET.length;

export const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const config = yield* ServerConfig.ServerConfig;
  const pairingLinks = yield* AuthPairingLinks.AuthPairingLinkRepository;
  const secretStore = yield* ServerSecretStore.ServerSecretStore;
  const credentialDigestSecret = yield* secretStore.getOrCreateRandom(
    "pairing-credential-digest-key",
    32,
  );
  const seededGrantsRef = yield* Ref.make(new Map<string, StoredBootstrapGrant>());
  const generatePairingToken = Effect.gen(function* () {
    let credential = "";
    while (credential.length < PAIRING_TOKEN_LENGTH) {
      const bytes = yield* crypto
        .randomBytes(PAIRING_TOKEN_LENGTH)
        .pipe(
          Effect.mapError(
            (cause) =>
              new PairingCredentialRandomGenerationError({ operation: "generate-token", cause }),
          ),
        );
      for (const byte of bytes) {
        if (byte >= PAIRING_TOKEN_REJECTION_LIMIT) {
          continue;
        }
        credential += PAIRING_TOKEN_ALPHABET[byte % PAIRING_TOKEN_ALPHABET.length]!;
        if (credential.length === PAIRING_TOKEN_LENGTH) {
          return credential;
        }
      }
    }
    return credential;
  });
  const digestCredential = (credential: string) => signPayload(credential, credentialDigestSecret);

  const seedGrant = (credential: string, grant: StoredBootstrapGrant) =>
    Ref.update(seededGrantsRef, (current) => {
      const next = new Map(current);
      next.set(credential, grant);
      return next;
    });

  if (config.desktopBootstrapToken) {
    const now = yield* DateTime.now;
    yield* seedGrant(config.desktopBootstrapToken, {
      method: "desktop-bootstrap",
      scopes: AuthAdministrativeScopes,
      subject: "desktop-bootstrap",
      expiresAt: DateTime.add(now, {
        milliseconds: Duration.toMillis(DESKTOP_BOOTSTRAP_TTL_HOURS),
      }),
      // Unbounded uses so the renderer can re-exchange the seed for a
      // fresh bearer session after a page reload (or after the prior
      // bearer expires). The seed itself stays inside the desktop
      // process and the rendered page, both of which the user already
      // implicitly trusts.
      remainingUses: "unbounded",
    });
  }

  const listActive: PairingGrantStore["Service"]["listActive"] = Effect.fn(
    "PairingGrantStore.listActive",
  )(
    function* () {
      const now = yield* DateTime.now;
      const rows = yield* pairingLinks.listActive({ now });

      return rows.map((row) =>
        row.label
          ? ({
              id: row.id,
              scopes: row.scopes,
              subject: row.subject,
              clientManagementClass: row.clientManagementClass,
              label: row.label,
              createdAt: row.createdAt,
              expiresAt: row.expiresAt,
              revision: row.revision,
            } satisfies ActivePairingLink)
          : ({
              id: row.id,
              scopes: row.scopes,
              subject: row.subject,
              clientManagementClass: row.clientManagementClass,
              createdAt: row.createdAt,
              expiresAt: row.expiresAt,
              revision: row.revision,
            } satisfies ActivePairingLink),
      );
    },
    Effect.mapError((cause) => new ActivePairingLinksLoadError({ cause })),
  );

  const revoke: PairingGrantStore["Service"]["revoke"] = Effect.fn("PairingGrantStore.revoke")(
    function* (id) {
      const revokedAt = yield* DateTime.now;
      const revoked = yield* pairingLinks
        .revoke({
          id,
          revokedAt,
        })
        .pipe(Effect.mapError((cause) => new PairingLinkRevokeError({ pairingLinkId: id, cause })));
      return revoked;
    },
  );

  const revokeAtRevision: PairingGrantStore["Service"]["revokeAtRevision"] = Effect.fn(
    "PairingGrantStore.revokeAtRevision",
  )(function* (input) {
    const revokedAt = yield* DateTime.now;
    const outcome = yield* pairingLinks
      .revokeAtRevision({ ...input, revokedAt })
      .pipe(
        Effect.mapError((cause) => new PairingLinkRevokeError({ pairingLinkId: input.id, cause })),
      );
    return outcome;
  });

  const issueOneTimeToken: PairingGrantStore["Service"]["issueOneTimeToken"] = Effect.fn(
    "PairingGrantStore.issueOneTimeToken",
  )(function* (input) {
    const id = yield* crypto.randomUUIDv4.pipe(
      Effect.mapError(
        (cause) => new PairingCredentialRandomGenerationError({ operation: "generate-id", cause }),
      ),
    );
    const credential = yield* generatePairingToken;
    const isDevStartupToken = config.devUrl !== undefined && input?.purpose === "startup";
    const ttl =
      input?.ttl ??
      (isDevStartupToken ? DEV_STARTUP_TTL_HOURS : DEFAULT_ONE_TIME_TOKEN_TTL_MINUTES);
    const now = yield* DateTime.now;
    const expiresAt = DateTime.add(now, { milliseconds: Duration.toMillis(ttl) });
    const issued: IssuedBootstrapCredential = {
      id,
      credential,
      ...(input?.label ? { label: input.label } : {}),
      ...(input?.proofKeyThumbprint ? { proofKeyThumbprint: input.proofKeyThumbprint } : {}),
      expiresAt,
    };
    const subject = input?.subject ?? "one-time-token";
    yield* pairingLinks
      .create({
        id,
        credentialDigest: digestCredential(credential),
        method: "one-time-token",
        scopes: input?.scopes ?? AuthStandardClientScopes,
        subject,
        clientManagementClass: input?.clientManagementClass ?? null,
        label: input?.label ?? null,
        proofKeyThumbprint: input?.proofKeyThumbprint ?? null,
        createdAt: now,
        expiresAt: expiresAt,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new PairingCredentialIssueError({
              pairingLinkId: id,
              subject,
              ...(input?.label ? { label: input.label } : {}),
              cause,
            }),
        ),
      );
    return issued;
  });

  const consume: PairingGrantStore["Service"]["consume"] = Effect.fn("PairingGrantStore.consume")(
    function* (credential, input) {
      const now = yield* DateTime.now;
      const seededResult: ConsumeResult = yield* Ref.modify(
        seededGrantsRef,
        (current): readonly [ConsumeResult, Map<string, StoredBootstrapGrant>] => {
          const grant = current.get(credential);
          if (!grant) {
            return [
              {
                _tag: "error",
                reason: "not-found",
                error: new UnknownBootstrapCredentialError({}),
              },
              current,
            ];
          }

          const next = new Map(current);
          if (DateTime.isGreaterThanOrEqualTo(now, grant.expiresAt)) {
            next.delete(credential);
            return [
              {
                _tag: "error",
                reason: "expired",
                error: new ExpiredBootstrapCredentialError({}),
              },
              next,
            ];
          }

          if (grant.proofKeyThumbprint && grant.proofKeyThumbprint !== input?.proofKeyThumbprint) {
            return [
              {
                _tag: "error",
                reason: "not-found",
                error: new BootstrapCredentialProofKeyMismatchError({}),
              },
              next,
            ];
          }

          const remainingUses = grant.remainingUses;
          if (typeof remainingUses === "number") {
            if (remainingUses <= 1) {
              next.delete(credential);
            } else {
              next.set(credential, {
                ...grant,
                remainingUses: remainingUses - 1,
              });
            }
          }

          return [
            {
              _tag: "success",
              grant: {
                method: grant.method,
                scopes: grant.scopes,
                subject: grant.subject,
                ...(grant.label ? { label: grant.label } : {}),
                ...(grant.proofKeyThumbprint
                  ? { proofKeyThumbprint: grant.proofKeyThumbprint }
                  : {}),
                expiresAt: grant.expiresAt,
              } satisfies BootstrapGrant,
            },
            next,
          ];
        },
      );

      if (seededResult._tag === "success") {
        return seededResult.grant;
      }
      if (seededResult.reason !== "not-found") {
        return yield* seededResult.error;
      }

      const consumed = yield* pairingLinks
        .consumeAvailable({
          credentialDigest: digestCredential(credential),
          proofKeyThumbprint: input?.proofKeyThumbprint ?? null,
          consumedAt: now,
          now,
        })
        .pipe(Effect.mapError((cause) => new BootstrapCredentialConsumeAvailableError({ cause })));

      if (Option.isSome(consumed)) {
        return {
          method: consumed.value.method,
          scopes: consumed.value.scopes,
          subject: consumed.value.subject,
          clientManagementClass: consumed.value.clientManagementClass,
          ...(consumed.value.label ? { label: consumed.value.label } : {}),
          ...(consumed.value.proofKeyThumbprint
            ? { proofKeyThumbprint: consumed.value.proofKeyThumbprint }
            : {}),
          expiresAt: consumed.value.expiresAt,
        } satisfies BootstrapGrant;
      }

      const matching = yield* pairingLinks
        .getByCredentialDigest({ credentialDigest: digestCredential(credential) })
        .pipe(Effect.mapError((cause) => new BootstrapCredentialLookupError({ cause })));
      if (Option.isNone(matching)) {
        return yield* new UnknownBootstrapCredentialError({});
      }

      if (matching.value.revokedAt !== null) {
        return yield* new UnavailableBootstrapCredentialError({});
      }

      if (matching.value.consumedAt !== null) {
        return yield* new UnknownBootstrapCredentialError({});
      }

      if (DateTime.isGreaterThanOrEqualTo(now, matching.value.expiresAt)) {
        return yield* new ExpiredBootstrapCredentialError({});
      }

      if (
        matching.value.proofKeyThumbprint !== null &&
        matching.value.proofKeyThumbprint !== input?.proofKeyThumbprint
      ) {
        return yield* new BootstrapCredentialProofKeyMismatchError({});
      }

      return yield* new UnavailableBootstrapCredentialError({});
    },
  );

  return PairingGrantStore.of({
    issueOneTimeToken,
    listActive,
    revoke,
    revokeAtRevision,
    consume,
  });
});

export const layer = Layer.effect(PairingGrantStore, make).pipe(
  Layer.provideMerge(AuthPairingLinks.layer),
  Layer.provide(ServerSecretStore.layer),
);
