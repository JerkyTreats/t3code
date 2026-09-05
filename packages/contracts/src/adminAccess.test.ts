import * as DateTime from "effect/DateTime";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  AdminAccessSnapshot,
  AdminCreatePairingCodeInput,
  AdminPairingCodeIssued,
} from "./adminAccess.ts";
import {
  AuthClientPresentationMetadata,
  AuthDeviceAdministratorScopes,
  AuthSessionAuthorityClass,
  AuthSessionState,
} from "./auth.ts";

const decodeAdminAccessSnapshot = Schema.decodeUnknownSync(AdminAccessSnapshot);
const encodeAdminAccessSnapshot = Schema.encodeSync(AdminAccessSnapshot);
const decodeAdminPairingCodeIssued = Schema.decodeUnknownSync(AdminPairingCodeIssued);
const encodeAdminPairingCodeIssued = Schema.encodeSync(AdminPairingCodeIssued);
const decodeAdminCreatePairingCodeInput = Schema.decodeUnknownSync(AdminCreatePairingCodeInput);
const decodeAdminCreatePairingCodeInputExit = Schema.decodeUnknownExit(AdminCreatePairingCodeInput);
const encodeAdminCreatePairingCodeInput = Schema.encodeSync(AdminCreatePairingCodeInput);
const decodeAuthSessionAuthorityClass = Schema.decodeUnknownSync(AuthSessionAuthorityClass);
const decodeAuthSessionAuthorityClassExit = Schema.decodeUnknownExit(AuthSessionAuthorityClass);
const decodeAuthSessionState = Schema.decodeUnknownSync(AuthSessionState);
const decodeAuthClientPresentationMetadata = Schema.decodeUnknownSync(
  AuthClientPresentationMetadata,
);

const forbiddenPublicKeys = new Set(["agent", "host", "ip", "origin", "port", "url"]);
const forbiddenPublicKeyFragments = [
  "account",
  "address",
  "credential",
  "agent",
  "endpoint",
  "hostname",
  "httpbaseurl",
  "ipaddress",
  "scope",
  "session",
  "subject",
  "token",
  "topology",
  "useragent",
  "wsbaseurl",
];

const collectKeys = (value: unknown): ReadonlyArray<string> => {
  if (Array.isArray(value)) {
    return value.flatMap(collectKeys);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => [key, ...collectKeys(child)]);
};

const expectPrivacySafe = (value: unknown) => {
  const keys = collectKeys(value);
  expect(
    keys.filter((key) => {
      const normalized = key.toLowerCase();
      return (
        forbiddenPublicKeys.has(normalized) ||
        forbiddenPublicKeyFragments.some((fragment) => normalized.includes(fragment))
      );
    }),
  ).toEqual([]);
};

const client = {
  clientId: "client-example",
  label: "Tablet",
  deviceType: "tablet" as const,
  platform: "example-platform",
  authorityState: "enabled" as const,
  connectionState: "connected" as const,
  createdAt: DateTime.makeUnsafe("2026-08-01T00:00:00.000Z"),
  lastConnectedAt: null,
  revision: 2,
};

const pairingCode = {
  pairingCodeId: "pairing-example",
  label: "New device",
  createdAt: DateTime.makeUnsafe("2026-08-02T00:00:00.000Z"),
  expiresAt: DateTime.makeUnsafe("2026-08-02T00:05:00.000Z"),
  revision: 1,
};

describe("Settings Admin contracts", () => {
  it("keeps snapshots free of credentials, authority detail, request identity, and topology", () => {
    const snapshot = decodeAdminAccessSnapshot({
      pairingCodes: [
        {
          ...pairingCode,
          credentialDigest: "synthetic-digest",
          scopes: ["orchestration:read"],
          subject: "synthetic-subject",
        },
      ],
      clients: [
        {
          ...client,
          current: true,
          grantedScopes: ["orchestration:read"],
          sessionId: "synthetic-session",
          userAgent: "synthetic-agent",
          endpointUrl: "https://example.invalid",
        },
      ],
    });
    const encoded = encodeAdminAccessSnapshot(snapshot);

    expectPrivacySafe(encoded);
  });

  it("returns a credential only in the one-time issue result", () => {
    const issued = decodeAdminPairingCodeIssued({
      pairingCode,
      credential: "synthetic-one-time-secret",
    });
    const encoded = encodeAdminPairingCodeIssued(issued);

    expect(encoded.credential).toBe("synthetic-one-time-secret");
    expectPrivacySafe(encoded.pairingCode);
  });

  it("accepts only bounded pairing lifetimes and never carries caller-selected scopes", () => {
    expect(
      encodeAdminCreatePairingCodeInput(
        decodeAdminCreatePairingCodeInput({
          label: "Phone",
          ttlSeconds: 60,
          scopes: ["access:write"],
        }),
      ),
    ).toEqual({ label: "Phone", ttlSeconds: 60 });
    expect(Exit.isFailure(decodeAdminCreatePairingCodeInputExit({ ttlSeconds: 59 }))).toBe(true);
    expect(Exit.isFailure(decodeAdminCreatePairingCodeInputExit({ ttlSeconds: 901 }))).toBe(true);
  });
});

describe("authenticated authority contract", () => {
  it("keeps device administration separate from environment scopes", () => {
    expect(AuthDeviceAdministratorScopes).toEqual([]);
    expect(decodeAuthSessionAuthorityClass("device-administrator")).toBe("device-administrator");
    expect(Exit.isFailure(decodeAuthSessionAuthorityClassExit("administrator"))).toBe(true);
  });

  it("keeps the authority class optional for sessions from older servers", () => {
    const auth = {
      policy: "remote-reachable" as const,
      bootstrapMethods: ["one-time-token" as const],
      sessionMethods: ["bearer-access-token" as const],
      sessionCookieName: "t3-session",
    };
    expect(decodeAuthSessionState({ authenticated: true, auth })).toEqual({
      authenticated: true,
      auth,
    });
  });

  it("retains rich presentation metadata", () => {
    const metadata = {
      label: "Browser",
      deviceType: "desktop" as const,
      os: "Example OS",
      osMajorVersion: 7,
      deviceModel: "Example device",
      surface: "web" as const,
      webDeployment: "hosted" as const,
      browser: "Example browser",
      appVersion: "1.2.3",
    };
    expect(decodeAuthClientPresentationMetadata(metadata)).toEqual(metadata);
  });
});
