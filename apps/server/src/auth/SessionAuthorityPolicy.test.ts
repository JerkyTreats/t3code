import { AuthClientId, AuthSessionId, AuthStandardClientScopes } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import * as Policy from "./SessionAuthorityPolicy.ts";

const sessionId = AuthSessionId.make("synthetic-session");
const clientId = AuthClientId.make("synthetic-client");
const now = DateTime.makeUnsafe(1_000);
const expiresAt = DateTime.makeUnsafe(2_000);
const state: Policy.SessionAuthorityState = {
  clientId,
  authorityClass: "client",
  subject: "synthetic-subject",
  method: "bearer-access-token",
  scopes: ["orchestration:read"],
  expiresAt,
  revokedAt: null,
  clientDisabledAt: null,
  clientDeletedAt: null,
};
const claims: Policy.SignedSessionAuthority = {
  sid: sessionId,
  authorityClass: "client",
  sub: state.subject,
  method: state.method,
  scopes: state.scopes,
  exp: expiresAt.epochMilliseconds,
};

it.effect("owns ordinary defaults and portal issuance independently of the session host", () =>
  Effect.gen(function* () {
    expect(Policy.normalizeAuthority(undefined)).toBe("client");
    expect(Policy.normalizeAuthority(null)).toBe("client");
    expect(Policy.normalizeAuthority("device-administrator")).toBe("device-administrator");
    const ordinary = yield* Policy.resolveIssuance();
    expect(ordinary.authorityClass).toBe("client");
    expect(ordinary.method).toBe("browser-session-cookie");
    expect(ordinary.scopes).toEqual(AuthStandardClientScopes);
    expect(ordinary.managementClass).toBeNull();
    expect(Duration.toDays(ordinary.ttl)).toBe(30);
    const enrolled = yield* Policy.resolveIssuance({
      managementClass: "portal-managed-device",
      method: "dpop-access-token",
      proofKeyThumbprint: "synthetic-proof",
    });
    expect(enrolled.authorityClass).toBe("client");
    expect(enrolled.managementClass).toBe("portal-managed-device");
    expect(enrolled.method).toBe("dpop-access-token");
    const portal = yield* Policy.resolveIssuance({
      authorityClass: "device-administrator",
      ttl: Duration.days(7),
      managementClass: "portal-managed-device",
    });
    expect(portal.authorityClass).toBe("device-administrator");
    expect(portal.method).toBe("bearer-access-token");
    expect(portal.scopes).toEqual([]);
    expect(portal.managementClass).toBeNull();
  }),
);

it.effect("rejects portal TTL, scope, method, and proof-binding amplification at the owner", () =>
  Effect.gen(function* () {
    for (const input of [
      {},
      { ttl: Duration.millis(0) },
      { ttl: Duration.days(8) },
      { ttl: Duration.hours(1), scopes: ["access:write"] as const },
      { ttl: Duration.hours(1), method: "browser-session-cookie" as const },
      { ttl: Duration.hours(1), method: "dpop-access-token" as const },
      { ttl: Duration.hours(1), proofKeyThumbprint: "synthetic-proof" },
    ]) {
      expect(
        (yield* Policy.resolveIssuance({ authorityClass: "device-administrator", ...input }).pipe(
          Effect.flip,
        ))._tag,
      ).toBe("SessionAuthorityIssuanceError");
    }
    expect(
      (yield* Policy.resolveIssuance({
        authorityClass: "device-administrator",
        ttl: Duration.millis(1),
      })).scopes,
    ).toEqual([]);
  }),
);

it.effect(
  "retains the signed and persisted decision after replacing the issuing and reconstructing hosts",
  () =>
    Effect.gen(function* () {
      const issued = yield* Policy.resolveIssuance({
        authorityClass: "device-administrator",
        ttl: Duration.hours(1),
      });
      const signed: Policy.SignedSessionAuthority = {
        ...claims,
        authorityClass: issued.authorityClass,
        scopes: issued.scopes,
        method: issued.method,
      };
      // A replacement persistence adapter supplies only explicit durable fields.
      const replacementRecord = {
        authority: issued.authorityClass,
        method: issued.method,
        scopes: issued.scopes,
      };
      const restored = {
        ...state,
        authorityClass: Policy.normalizeAuthority(replacementRecord.authority),
        method: replacementRecord.method,
        scopes: replacementRecord.scopes,
      };
      expect((yield* Policy.verifySessionAuthority(signed, restored)).authorityClass).toBe(
        "device-administrator",
      );
      expect(
        (yield* Policy.assertClientAdmission(sessionId, restored, now).pipe(Effect.flip))._tag,
      ).toBe("WebSocketAuthorityForbiddenError");
      expect(
        (yield* Policy.verifySessionAuthority(
          { ...signed, authorityClass: "client" },
          restored,
        ).pipe(Effect.flip))._tag,
      ).toBe("InvalidSessionAuthorityClassError");
      const legacyClaims = { ...claims };
      delete legacyClaims.authorityClass;
      expect(
        (yield* Policy.verifySessionAuthority(legacyClaims, { ...state, authorityClass: null }))
          .authorityClass,
      ).toBe("client");
    }),
);

it.effect("checks every protected claim and rejects a persisted authority substitution", () =>
  Effect.gen(function* () {
    for (const forged of [
      { ...claims, authorityClass: "device-administrator" as const },
      { ...claims, sub: "replacement-subject" },
      { ...claims, method: "browser-session-cookie" as const },
      { ...claims, exp: claims.exp + 1 },
      { ...claims, scopes: [] },
      { ...claims, scopes: ["access:write"] as const },
    ])
      expect((yield* Policy.verifySessionAuthority(forged, state).pipe(Effect.flip))._tag).toBe(
        "InvalidSessionAuthorityClassError",
      );
    expect(
      (yield* Policy.verifySessionAuthority(claims, {
        ...state,
        authorityClass: "device-administrator",
      }).pipe(Effect.flip))._tag,
    ).toBe("InvalidSessionAuthorityClassError");
    const portal = { ...state, authorityClass: "device-administrator" as const, scopes: [] };
    const signed = { ...claims, authorityClass: "device-administrator" as const, scopes: [] };
    for (const [candidateClaims, candidateState] of [
      [{ ...signed, jkt: "synthetic-proof" }, portal],
      [
        { ...signed, method: "browser-session-cookie" as const },
        { ...portal, method: "browser-session-cookie" as const },
      ],
      [
        { ...signed, scopes: ["access:read"] as const },
        { ...portal, scopes: ["access:read"] as const },
      ],
    ] as const)
      expect(
        (yield* Policy.verifySessionAuthority(candidateClaims, candidateState).pipe(Effect.flip))
          ._tag,
      ).toBe("InvalidSessionAuthorityClassError");
  }),
);

it.effect("preserves lifecycle rejection and transport-specific error ordering at the owner", () =>
  Effect.gen(function* () {
    const mutations = [
      [{ ...state, revokedAt: now }, "SessionTokenRevokedError"],
      [{ ...state, clientDeletedAt: now }, "SessionClientDeletedError"],
      [{ ...state, clientDisabledAt: now }, "SessionClientDisabledError"],
    ] as const;
    for (const [candidate, tag] of mutations) {
      expect((yield* Policy.verifySessionAuthority(claims, candidate).pipe(Effect.flip))._tag).toBe(
        tag,
      );
      expect(
        (yield* Policy.assertClientAdmission(sessionId, candidate, now).pipe(Effect.flip))._tag,
      ).toBe(tag);
      expect(
        (yield* Policy.assertWebSocketTicketIssuance(sessionId, candidate, now).pipe(Effect.flip))
          ._tag,
      ).toBe("WebSocketAuthorityForbiddenError");
    }
    const revokedAndDisabled = { ...state, revokedAt: now, clientDisabledAt: now };
    expect(
      (yield* Policy.verifySessionAuthority(claims, revokedAndDisabled).pipe(Effect.flip))._tag,
    ).toBe("SessionTokenRevokedError");
    expect(
      (yield* Policy.assertClientAdmission(sessionId, revokedAndDisabled, now).pipe(Effect.flip))
        ._tag,
    ).toBe("SessionClientDisabledError");
    expect(
      (yield* Policy.verifyWebSocketSession(sessionId, revokedAndDisabled, now).pipe(Effect.flip))
        ._tag,
    ).toBe("WebSocketSessionRevokedError");
    const expired = { ...state, expiresAt: now };
    expect(
      (yield* Policy.assertClientAdmission(sessionId, expired, now).pipe(Effect.flip))._tag,
    ).toBe("SessionTokenExpiredError");
    expect(
      (yield* Policy.verifyWebSocketSession(sessionId, expired, now).pipe(Effect.flip))._tag,
    ).toBe("WebSocketSessionExpiredError");
    for (const candidate of [
      undefined,
      expired,
      { ...state, authorityClass: "device-administrator" as const },
    ]) {
      expect(
        (yield* Policy.assertWebSocketTicketIssuance(sessionId, candidate, now).pipe(Effect.flip))
          ._tag,
      ).toBe("WebSocketAuthorityForbiddenError");
    }
    expect((yield* Policy.verifySessionAuthority(claims, undefined).pipe(Effect.flip))._tag).toBe(
      "UnknownSessionTokenError",
    );
    expect(
      (yield* Policy.verifyWebSocketSession(sessionId, undefined, now).pipe(Effect.flip))._tag,
    ).toBe("UnknownWebSocketSessionError");
    yield* Policy.assertClientAdmission(sessionId, state, now);
    yield* Policy.assertWebSocketTicketIssuance(sessionId, state, now);
  }),
);

it.effect("owns expiry boundaries and connected-session visibility without a session host", () =>
  Effect.gen(function* () {
    for (const kind of ["session", "websocket"] as const) {
      expect(
        (yield* Policy.verifyClaimExpiration(sessionId, now.epochMilliseconds, now, kind).pipe(
          Effect.flip,
        ))._tag,
      ).toBe(kind === "session" ? "SessionTokenExpiredError" : "WebSocketTokenExpiredError");
      expect(
        (yield* Policy.verifyClaimExpiration(sessionId, Number.NaN, now, kind).pipe(Effect.flip))
          ._tag,
      ).toBe("InvalidSessionExpirationClaimError");
      expect(
        (yield* Policy.verifyClaimExpiration(sessionId, expiresAt.epochMilliseconds, now, kind))
          .epochMilliseconds,
      ).toBe(expiresAt.epochMilliseconds);
    }
    const expired = { ...state, expiresAt: now };
    expect(Policy.isSessionVisible(expired, false, now.epochMilliseconds)).toBe(false);
    expect(Policy.isSessionVisible(expired, true, now.epochMilliseconds)).toBe(true);
    for (const hidden of [
      { ...state, revokedAt: now },
      { ...state, clientDisabledAt: now },
      { ...state, clientDeletedAt: now },
    ]) {
      expect(Policy.isSessionVisible(hidden, true, now.epochMilliseconds)).toBe(false);
    }
    expect(Policy.isClientEnabled({ ...state, clientDisabledAt: now })).toBe(false);
    expect(Policy.isSessionVisible(state, false, now.epochMilliseconds)).toBe(true);
  }),
);
