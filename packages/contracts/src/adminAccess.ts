import * as Schema from "effect/Schema";

import { AuthClientId, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { AuthClientMetadataDeviceType } from "./auth.ts";

export const AdminClientAuthorityState = Schema.Literals(["enabled", "disabled"]);
export type AdminClientAuthorityState = typeof AdminClientAuthorityState.Type;

export const AdminClientConnectionState = Schema.Literals(["connected", "disconnected"]);
export type AdminClientConnectionState = typeof AdminClientConnectionState.Type;

/** Public administration views exclude scopes, sessions, subjects, and current-client identity. */
export const AdminClientSummary = Schema.Struct({
  clientId: AuthClientId,
  label: Schema.optionalKey(TrimmedNonEmptyString),
  deviceType: AuthClientMetadataDeviceType,
  platform: Schema.optionalKey(TrimmedNonEmptyString),
  authorityState: AdminClientAuthorityState,
  connectionState: AdminClientConnectionState,
  createdAt: Schema.DateTimeUtc,
  lastConnectedAt: Schema.NullOr(Schema.DateTimeUtc),
  revision: NonNegativeInt,
});
export type AdminClientSummary = typeof AdminClientSummary.Type;

export const AdminPairingCodeSummary = Schema.Struct({
  pairingCodeId: TrimmedNonEmptyString,
  label: Schema.optionalKey(TrimmedNonEmptyString),
  createdAt: Schema.DateTimeUtc,
  expiresAt: Schema.DateTimeUtc,
  revision: NonNegativeInt,
});
export type AdminPairingCodeSummary = typeof AdminPairingCodeSummary.Type;

export const AdminPairingCodeIssued = Schema.Struct({
  pairingCode: AdminPairingCodeSummary,
  credential: TrimmedNonEmptyString,
});
export type AdminPairingCodeIssued = typeof AdminPairingCodeIssued.Type;

export const AdminAccessSnapshot = Schema.Struct({
  clients: Schema.Array(AdminClientSummary),
  pairingCodes: Schema.Array(AdminPairingCodeSummary),
});
export type AdminAccessSnapshot = typeof AdminAccessSnapshot.Type;

export const AdminPairingTtlSeconds = Schema.Int.check(
  Schema.isBetween({ minimum: 60, maximum: 900 }),
);
export type AdminPairingTtlSeconds = typeof AdminPairingTtlSeconds.Type;

export const AdminCreatePairingCodeInput = Schema.Struct({
  label: Schema.optionalKey(TrimmedNonEmptyString),
  ttlSeconds: AdminPairingTtlSeconds,
});
export type AdminCreatePairingCodeInput = typeof AdminCreatePairingCodeInput.Type;

export const AdminPairingCodeMutationInput = Schema.Struct({
  pairingCodeId: TrimmedNonEmptyString,
  expectedRevision: NonNegativeInt,
});
export type AdminPairingCodeMutationInput = typeof AdminPairingCodeMutationInput.Type;

export const AdminClientMutationInput = Schema.Struct({
  clientId: AuthClientId,
  expectedRevision: NonNegativeInt,
});
export type AdminClientMutationInput = typeof AdminClientMutationInput.Type;

export const AdminMutationResult = Schema.Struct({
  changed: Schema.Boolean,
  revision: NonNegativeInt,
});
export type AdminMutationResult = typeof AdminMutationResult.Type;
