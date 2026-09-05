import {
  AuthClientId,
  AuthSessionId,
  AuthStandardClientScopes,
  type AuthEnvironmentScope,
  type AuthSessionAuthorityClass,
  type ServerAuthSessionMethod,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

/** Owns session authority independently of cryptography, persistence and transport hosts. */
export const MAX_DEVICE_ADMINISTRATOR_SESSION_TTL = Duration.days(7);
const DEFAULT_SESSION_TTL = Duration.days(30);

export const normalizeAuthority = (
  authorityClass: AuthSessionAuthorityClass | null | undefined,
): AuthSessionAuthorityClass => authorityClass ?? "client";

export interface SessionAuthorityState {
  readonly clientId: AuthClientId;
  readonly authorityClass: AuthSessionAuthorityClass | null;
  readonly subject: string;
  readonly method: ServerAuthSessionMethod;
  readonly scopes: ReadonlyArray<AuthEnvironmentScope>;
  readonly expiresAt: DateTime.Utc;
  readonly revokedAt: DateTime.Utc | null;
  readonly clientDisabledAt: DateTime.Utc | null;
  readonly clientDeletedAt: DateTime.Utc | null;
}

export interface SignedSessionAuthority {
  readonly sid: AuthSessionId;
  readonly authorityClass?: AuthSessionAuthorityClass;
  readonly sub: string;
  readonly method: ServerAuthSessionMethod;
  readonly scopes: ReadonlyArray<AuthEnvironmentScope>;
  readonly exp: number;
  readonly jkt?: string;
}

export interface SessionIssuanceInput {
  readonly authorityClass?: AuthSessionAuthorityClass;
  readonly ttl?: Duration.Duration;
  readonly method?: ServerAuthSessionMethod;
  readonly scopes?: ReadonlyArray<AuthEnvironmentScope>;
  readonly proofKeyThumbprint?: string;
  readonly managementClass?: "portal-managed-device";
}

export class SessionAuthorityIssuanceError extends Schema.TaggedErrorClass<SessionAuthorityIssuanceError>()(
  "SessionAuthorityIssuanceError",
  { message: Schema.String },
) {}

const permitsPortalCredentialMode = (
  method: ServerAuthSessionMethod,
  scopes: ReadonlyArray<AuthEnvironmentScope>,
  proofKeyThumbprint: string | undefined,
): boolean =>
  method === "bearer-access-token" && scopes.length === 0 && proofKeyThumbprint === undefined;

export const resolveIssuance = Effect.fn("SessionAuthorityPolicy.resolveIssuance")(function* (
  input?: SessionIssuanceInput,
) {
  const authorityClass = normalizeAuthority(input?.authorityClass);
  if (authorityClass === "device-administrator") {
    if (
      input?.ttl === undefined ||
      Duration.toMillis(input.ttl) > Duration.toMillis(MAX_DEVICE_ADMINISTRATOR_SESSION_TTL) ||
      Duration.toMillis(input.ttl) <= 0
    ) {
      return yield* new SessionAuthorityIssuanceError({
        message: "Device administrator sessions require a TTL from 1 ms through 7 days.",
      });
    }
    if (
      !permitsPortalCredentialMode(
        input.method ?? "bearer-access-token",
        input.scopes ?? [],
        input.proofKeyThumbprint,
      )
    ) {
      return yield* new SessionAuthorityIssuanceError({
        message: "Invalid device administrator credential mode.",
      });
    }
  }
  return {
    authorityClass,
    ttl: input?.ttl ?? DEFAULT_SESSION_TTL,
    method:
      authorityClass === "device-administrator"
        ? ("bearer-access-token" as const)
        : (input?.method ?? "browser-session-cookie"),
    scopes:
      authorityClass === "device-administrator" ? [] : (input?.scopes ?? AuthStandardClientScopes),
    managementClass: authorityClass === "client" ? (input?.managementClass ?? null) : null,
  };
});

export class SessionTokenExpiredError extends Schema.TaggedErrorClass<SessionTokenExpiredError>()(
  "SessionTokenExpiredError",
  {
    sessionId: AuthSessionId,
    expiresAt: Schema.DateTimeUtc,
    observedAt: Schema.DateTimeUtc,
  },
) {
  override get message(): string {
    return "Session token expired.";
  }
}

export class UnknownSessionTokenError extends Schema.TaggedErrorClass<UnknownSessionTokenError>()(
  "UnknownSessionTokenError",
  {
    sessionId: AuthSessionId,
  },
) {
  override get message(): string {
    return "Unknown session token.";
  }
}

export class SessionTokenRevokedError extends Schema.TaggedErrorClass<SessionTokenRevokedError>()(
  "SessionTokenRevokedError",
  {
    sessionId: AuthSessionId,
    revokedAt: Schema.DateTimeUtc,
  },
) {
  override get message(): string {
    return "Session token revoked.";
  }
}

export class SessionClientDisabledError extends Schema.TaggedErrorClass<SessionClientDisabledError>()(
  "SessionClientDisabledError",
  { clientId: AuthClientId },
) {
  override get message(): string {
    return "The client is disabled.";
  }
}

export class SessionClientDeletedError extends Schema.TaggedErrorClass<SessionClientDeletedError>()(
  "SessionClientDeletedError",
  { clientId: AuthClientId },
) {
  override get message(): string {
    return "The client was deleted.";
  }
}

export class InvalidSessionExpirationClaimError extends Schema.TaggedErrorClass<InvalidSessionExpirationClaimError>()(
  "InvalidSessionExpirationClaimError",
  {
    sessionId: AuthSessionId,
    expirationClaim: Schema.Number,
  },
) {
  override get message(): string {
    return "Invalid `exp` claim";
  }
}

export class InvalidSessionAuthorityClassError extends Schema.TaggedErrorClass<InvalidSessionAuthorityClassError>()(
  "InvalidSessionAuthorityClassError",
  { sessionId: AuthSessionId },
) {
  override get message(): string {
    return "Session authority class does not match persisted authority.";
  }
}

export class WebSocketAuthorityForbiddenError extends Schema.TaggedErrorClass<WebSocketAuthorityForbiddenError>()(
  "WebSocketAuthorityForbiddenError",
  { sessionId: AuthSessionId },
) {
  override get message(): string {
    return "This session authority cannot use WebSocket transport.";
  }
}

export class WebSocketTokenExpiredError extends Schema.TaggedErrorClass<WebSocketTokenExpiredError>()(
  "WebSocketTokenExpiredError",
  {
    sessionId: AuthSessionId,
    expiresAt: Schema.DateTimeUtc,
    observedAt: Schema.DateTimeUtc,
  },
) {
  override get message(): string {
    return "Websocket token expired.";
  }
}

export class UnknownWebSocketSessionError extends Schema.TaggedErrorClass<UnknownWebSocketSessionError>()(
  "UnknownWebSocketSessionError",
  {
    sessionId: AuthSessionId,
  },
) {
  override get message(): string {
    return "Unknown websocket session.";
  }
}

export class WebSocketSessionExpiredError extends Schema.TaggedErrorClass<WebSocketSessionExpiredError>()(
  "WebSocketSessionExpiredError",
  {
    sessionId: AuthSessionId,
    expiresAt: Schema.DateTimeUtc,
    observedAt: Schema.DateTimeUtc,
  },
) {
  override get message(): string {
    return "Websocket session expired.";
  }
}

export class WebSocketSessionRevokedError extends Schema.TaggedErrorClass<WebSocketSessionRevokedError>()(
  "WebSocketSessionRevokedError",
  {
    sessionId: AuthSessionId,
    revokedAt: Schema.DateTimeUtc,
  },
) {
  override get message(): string {
    return "Websocket session revoked.";
  }
}

export const isExpired = (expiresAt: number, observedAt: number): boolean =>
  expiresAt <= observedAt;

export const isClientEnabled = (
  state: Pick<SessionAuthorityState, "clientDisabledAt" | "clientDeletedAt">,
): boolean => state.clientDisabledAt === null && state.clientDeletedAt === null;

export const isSessionVisible = (
  state: SessionAuthorityState,
  connected: boolean,
  observedAt: number,
): boolean =>
  state.revokedAt === null &&
  isClientEnabled(state) &&
  (connected || !isExpired(state.expiresAt.epochMilliseconds, observedAt));

export const verifyClaimExpiration = Effect.fn("SessionAuthorityPolicy.verifyClaimExpiration")(
  function* (
    sessionId: AuthSessionId,
    expirationClaim: number,
    observedAt: DateTime.Utc,
    credentialKind: "session" | "websocket",
  ) {
    const expiresAt = DateTime.make(expirationClaim);
    if (Option.isNone(expiresAt))
      return yield* new InvalidSessionExpirationClaimError({ sessionId, expirationClaim });
    if (isExpired(expirationClaim, observedAt.epochMilliseconds)) {
      if (credentialKind === "websocket")
        return yield* new WebSocketTokenExpiredError({
          sessionId,
          expiresAt: expiresAt.value,
          observedAt,
        });
      return yield* new SessionTokenExpiredError({
        sessionId,
        expiresAt: expiresAt.value,
        observedAt,
      });
    }
    return expiresAt.value;
  },
);

export const verifySessionAuthority = Effect.fn("SessionAuthorityPolicy.verifySessionAuthority")(
  function* <State extends SessionAuthorityState>(
    claims: SignedSessionAuthority,
    state: State | undefined,
  ) {
    if (state === undefined) return yield* new UnknownSessionTokenError({ sessionId: claims.sid });
    if (state.revokedAt !== null)
      return yield* new SessionTokenRevokedError({
        sessionId: claims.sid,
        revokedAt: state.revokedAt,
      });
    if (state.clientDeletedAt !== null)
      return yield* new SessionClientDeletedError({ clientId: state.clientId });
    if (state.clientDisabledAt !== null)
      return yield* new SessionClientDisabledError({ clientId: state.clientId });
    const authorityClass = normalizeAuthority(claims.authorityClass);
    if (
      authorityClass !== normalizeAuthority(state.authorityClass) ||
      claims.sub !== state.subject ||
      claims.method !== state.method ||
      claims.exp !== state.expiresAt.epochMilliseconds ||
      claims.scopes.length !== state.scopes.length ||
      claims.scopes.some((scope, index) => scope !== state.scopes[index]) ||
      (authorityClass === "device-administrator" &&
        !permitsPortalCredentialMode(claims.method, claims.scopes, claims.jkt))
    ) {
      return yield* new InvalidSessionAuthorityClassError({ sessionId: claims.sid });
    }
    return { state, authorityClass };
  },
);

export const assertClientAdmission = Effect.fn("SessionAuthorityPolicy.assertClientAdmission")(
  function* (
    sessionId: AuthSessionId,
    state: SessionAuthorityState | undefined,
    observedAt: DateTime.Utc,
  ) {
    if (state === undefined) return yield* new UnknownSessionTokenError({ sessionId });
    if (normalizeAuthority(state.authorityClass) === "device-administrator")
      return yield* new WebSocketAuthorityForbiddenError({ sessionId });
    if (state.clientDeletedAt !== null)
      return yield* new SessionClientDeletedError({ clientId: state.clientId });
    if (state.clientDisabledAt !== null)
      return yield* new SessionClientDisabledError({ clientId: state.clientId });
    if (state.revokedAt !== null)
      return yield* new SessionTokenRevokedError({ sessionId, revokedAt: state.revokedAt });
    if (isExpired(state.expiresAt.epochMilliseconds, observedAt.epochMilliseconds))
      return yield* new SessionTokenExpiredError({
        sessionId,
        expiresAt: state.expiresAt,
        observedAt,
      });
  },
);

export const assertWebSocketTicketIssuance = Effect.fn(
  "SessionAuthorityPolicy.assertWebSocketTicketIssuance",
)(function* (
  sessionId: AuthSessionId,
  state: SessionAuthorityState | undefined,
  observedAt: DateTime.Utc,
) {
  if (
    state === undefined ||
    normalizeAuthority(state.authorityClass) === "device-administrator" ||
    state.revokedAt !== null ||
    !isClientEnabled(state) ||
    isExpired(state.expiresAt.epochMilliseconds, observedAt.epochMilliseconds)
  ) {
    return yield* new WebSocketAuthorityForbiddenError({ sessionId });
  }
});

export const verifyWebSocketSession = Effect.fn("SessionAuthorityPolicy.verifyWebSocketSession")(
  function* <State extends SessionAuthorityState>(
    sessionId: AuthSessionId,
    state: State | undefined,
    observedAt: DateTime.Utc,
  ) {
    if (state === undefined) return yield* new UnknownWebSocketSessionError({ sessionId });
    if (isExpired(state.expiresAt.epochMilliseconds, observedAt.epochMilliseconds))
      return yield* new WebSocketSessionExpiredError({
        sessionId,
        expiresAt: state.expiresAt,
        observedAt,
      });
    if (state.revokedAt !== null)
      return yield* new WebSocketSessionRevokedError({ sessionId, revokedAt: state.revokedAt });
    if (
      normalizeAuthority(state.authorityClass) === "device-administrator" ||
      !isClientEnabled(state)
    )
      return yield* new WebSocketAuthorityForbiddenError({ sessionId });
    return { state, authorityClass: normalizeAuthority(state.authorityClass) };
  },
);
