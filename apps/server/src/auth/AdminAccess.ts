import {
  type AdminAccessSnapshot,
  type AdminClientSummary,
  type AdminCreatePairingCodeInput,
  type AdminMutationResult,
  type AdminPairingCodeIssued,
  type AdminPairingCodeSummary,
  AuthClientId,
  AuthStandardClientScopes,
  NonNegativeInt,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as AuthClients from "../persistence/AuthClients.ts";
import * as ClientConnectionRegistry from "./ClientConnectionRegistry.ts";
import * as PairingGrantStore from "./PairingGrantStore.ts";
import * as SessionStore from "./SessionStore.ts";

export class AdminAccessInternalError extends Schema.TaggedErrorClass<AdminAccessInternalError>()(
  "AdminAccessInternalError",
  { cause: Schema.Defect() },
) {}

export class AdminAccessNotFoundError extends Schema.TaggedErrorClass<AdminAccessNotFoundError>()(
  "AdminAccessNotFoundError",
  { resource: Schema.Literals(["client", "pairing-code"]) },
) {}

export class AdminAccessRevisionConflictError extends Schema.TaggedErrorClass<AdminAccessRevisionConflictError>()(
  "AdminAccessRevisionConflictError",
  { revision: NonNegativeInt },
) {}

export class AdminAccessOutstandingPairingLimitError extends Schema.TaggedErrorClass<AdminAccessOutstandingPairingLimitError>()(
  "AdminAccessOutstandingPairingLimitError",
  { limit: Schema.Int },
) {}

export const AdminAccessMutationError = Schema.Union([
  AdminAccessInternalError,
  AdminAccessNotFoundError,
  AdminAccessRevisionConflictError,
]);
export type AdminAccessMutationError = typeof AdminAccessMutationError.Type;

const isAdminAccessMutationError = Schema.is(AdminAccessMutationError);

export class AdminAccess extends Context.Service<
  AdminAccess,
  {
    readonly snapshot: (
      currentClientId: AuthClientId,
    ) => Effect.Effect<AdminAccessSnapshot, AdminAccessInternalError>;
    readonly createPairingCode: (
      input: AdminCreatePairingCodeInput,
    ) => Effect.Effect<
      AdminPairingCodeIssued,
      AdminAccessInternalError | AdminAccessOutstandingPairingLimitError
    >;
    readonly revokePairingCode: (input: {
      readonly pairingCodeId: string;
      readonly expectedRevision: number;
    }) => Effect.Effect<AdminMutationResult, AdminAccessMutationError>;
    readonly setClientEnabled: (input: {
      readonly currentClientId: AuthClientId;
      readonly clientId: AuthClientId;
      readonly expectedRevision: number;
      readonly enabled: boolean;
    }) => Effect.Effect<AdminMutationResult, AdminAccessMutationError>;
    readonly deleteClient: (input: {
      readonly currentClientId: AuthClientId;
      readonly clientId: AuthClientId;
      readonly expectedRevision: number;
    }) => Effect.Effect<AdminMutationResult, AdminAccessMutationError>;
  }
>()("t3/auth/AdminAccess") {}

export const make = Effect.gen(function* () {
  const clients = yield* AuthClients.AuthClientRepository;
  const pairingGrants = yield* PairingGrantStore.PairingGrantStore;
  const sessions = yield* SessionStore.SessionStore;
  const connections = yield* ClientConnectionRegistry.ClientConnectionRegistry;
  const pairingAdmission = yield* Semaphore.make(1);
  const maximumOutstandingPairingCodes = 10;

  const pairingSummary = (link: PairingGrantStore.ActivePairingLink): AdminPairingCodeSummary => ({
    pairingCodeId: link.id,
    ...(link.label === undefined ? {} : { label: link.label }),
    createdAt: DateTime.toUtc(link.createdAt),
    expiresAt: DateTime.toUtc(link.expiresAt),
    revision: link.revision,
  });

  const snapshot: AdminAccess["Service"]["snapshot"] = Effect.fn("AdminAccess.snapshot")(
    function* (currentClientId) {
      const [pairingLinks, clientRows, connectedClientIds] = yield* Effect.all(
        [pairingGrants.listActive(), clients.listVisible, sessions.connectedClientIds],
        { concurrency: "unbounded" },
      );
      return {
        pairingCodes: pairingLinks
          .filter((link) => link.clientManagementClass === "portal-managed-device")
          .map(pairingSummary),
        clients: clientRows
          .filter((client) => client.clientId !== currentClientId)
          .map((client): AdminClientSummary => ({
            clientId: client.clientId,
            ...(client.label === null ? {} : { label: client.label }),
            deviceType: client.deviceType,
            ...(client.platform === null ? {} : { platform: client.platform }),
            authorityState: client.disabledAt === null ? "enabled" : "disabled",
            connectionState: connectedClientIds.has(client.clientId) ? "connected" : "disconnected",
            createdAt: client.createdAt,
            lastConnectedAt: client.lastConnectedAt,
            revision: client.revision,
          })),
      } satisfies AdminAccessSnapshot;
    },
    Effect.mapError((cause) => new AdminAccessInternalError({ cause })),
  );

  const createPairingCodeUnlocked = Effect.fn("AdminAccess.createPairingCode")(
    function* (input: AdminCreatePairingCodeInput) {
      const activeBeforeIssue = yield* pairingGrants.listActive();
      const outstandingClientPairings = activeBeforeIssue.filter(
        (link) => link.clientManagementClass === "portal-managed-device",
      );
      if (outstandingClientPairings.length >= maximumOutstandingPairingCodes) {
        return yield* new AdminAccessOutstandingPairingLimitError({
          limit: maximumOutstandingPairingCodes,
        });
      }
      const issued = yield* pairingGrants.issueOneTimeToken({
        scopes: AuthStandardClientScopes,
        clientManagementClass: "portal-managed-device",
        subject: PairingGrantStore.PORTAL_MANAGED_DEVICE_PAIRING_SUBJECT,
        ttl: Duration.seconds(input.ttlSeconds),
        ...(input.label === undefined ? {} : { label: input.label }),
      });
      const links = yield* pairingGrants.listActive();
      const created = links.find((link) => link.id === issued.id);
      if (created === undefined) {
        return yield* new AdminAccessInternalError({
          cause: new Error("Issued pairing code was not durably readable."),
        });
      }
      return {
        pairingCode: pairingSummary(created),
        credential: issued.credential,
      } satisfies AdminPairingCodeIssued;
    },
    Effect.mapError((cause) =>
      cause._tag === "AdminAccessInternalError" ||
      cause._tag === "AdminAccessOutstandingPairingLimitError"
        ? cause
        : new AdminAccessInternalError({ cause }),
    ),
  );
  const createPairingCode: AdminAccess["Service"]["createPairingCode"] = (input) =>
    pairingAdmission.withPermits(1)(createPairingCodeUnlocked(input));

  const mutationResult = (
    outcome:
      | AuthClients.AuthClientMutationOutcome
      | import("../persistence/AuthPairingLinks.ts").AuthPairingLinkMutationOutcome,
    resource: "client" | "pairing-code",
  ): Effect.Effect<AdminMutationResult, AdminAccessMutationError> => {
    switch (outcome._tag) {
      case "changed":
        return Effect.succeed({ changed: true, revision: outcome.revision });
      case "unchanged":
        return Effect.succeed({ changed: false, revision: outcome.revision });
      case "conflict":
        return Effect.fail(new AdminAccessRevisionConflictError({ revision: outcome.revision }));
      case "not-found":
        return Effect.fail(new AdminAccessNotFoundError({ resource }));
    }
  };

  const revokePairingCode: AdminAccess["Service"]["revokePairingCode"] = Effect.fn(
    "AdminAccess.revokePairingCode",
  )(
    function* (input) {
      const outcome = yield* pairingGrants.revokeAtRevision({
        id: input.pairingCodeId,
        expectedRevision: input.expectedRevision,
      });
      return yield* mutationResult(outcome, "pairing-code");
    },
    Effect.mapError((cause) =>
      isAdminAccessMutationError(cause) ? cause : new AdminAccessInternalError({ cause }),
    ),
  );

  const setClientEnabled: AdminAccess["Service"]["setClientEnabled"] = Effect.fn(
    "AdminAccess.setClientEnabled",
  )(
    function* (input) {
      if (!input.enabled && input.clientId === input.currentClientId) {
        return yield* new AdminAccessNotFoundError({ resource: "client" });
      }
      const changedAt = yield* DateTime.now;
      const outcome = yield* clients.setEnabled({
        clientId: input.clientId,
        expectedRevision: input.expectedRevision,
        enabled: input.enabled,
        changedAt,
      });
      const result = yield* mutationResult(outcome, "client");
      if (result.changed) {
        if (!input.enabled) {
          yield* connections.disconnect(input.clientId);
        }
      }
      return result;
    },
    Effect.mapError((cause) =>
      isAdminAccessMutationError(cause) ? cause : new AdminAccessInternalError({ cause }),
    ),
  );

  const deleteClient: AdminAccess["Service"]["deleteClient"] = Effect.fn(
    "AdminAccess.deleteClient",
  )(
    function* (input) {
      if (input.clientId === input.currentClientId) {
        return yield* new AdminAccessNotFoundError({ resource: "client" });
      }
      const deletedAt = yield* DateTime.now;
      const outcome = yield* clients.delete({
        clientId: input.clientId,
        expectedRevision: input.expectedRevision,
        deletedAt,
      });
      const result = yield* mutationResult(outcome, "client");
      if (result.changed) {
        yield* connections.disconnect(input.clientId);
      }
      return result;
    },
    Effect.mapError((cause) =>
      isAdminAccessMutationError(cause) ? cause : new AdminAccessInternalError({ cause }),
    ),
  );

  return AdminAccess.of({
    snapshot,
    createPairingCode,
    revokePairingCode,
    setClientEnabled,
    deleteClient,
  });
});

export const layer = Layer.effect(AdminAccess, make).pipe(Layer.provideMerge(AuthClients.layer));
