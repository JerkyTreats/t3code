import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as AdminAccess from "./AdminAccess.ts";
import * as ClientConnectionRegistry from "./ClientConnectionRegistry.ts";
import * as EnvironmentAuth from "./EnvironmentAuth.ts";
import * as ServerSecretStore from "./ServerSecretStore.ts";
import * as SessionStore from "./SessionStore.ts";

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
  "session",
  "subject",
  "scope",
  "digest",
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
  expect(
    collectKeys(value).filter((key) => {
      const normalized = key.toLowerCase();
      return (
        forbiddenPublicKeys.has(normalized) ||
        forbiddenPublicKeyFragments.some((fragment) => normalized.includes(fragment))
      );
    }),
  ).toEqual([]);
};

const makeServerConfigLayer = () =>
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-admin-access-test-" });

const makeAdminAccessLayer = () => {
  const environmentAuth = EnvironmentAuth.layer.pipe(
    Layer.provideMerge(ServerSecretStore.layer),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provide(ServerEnvironment.identityLayer),
    Layer.provide(makeServerConfigLayer()),
  );
  const dependencies = Layer.mergeAll(environmentAuth, ClientConnectionRegistry.layer);
  return AdminAccess.layer.pipe(
    Layer.provideMerge(dependencies),
    Layer.provideMerge(SqlitePersistenceMemory),
  );
};

const bearerRequest = (token: string) =>
  ({
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
  }) as unknown as Parameters<
    EnvironmentAuth.EnvironmentAuth["Service"]["authenticateHttpRequest"]
  >[0];

const issueBrowserDevice = (sessions: SessionStore.SessionStore["Service"], label: string) =>
  sessions.issue({
    method: "browser-session-cookie",
    managementClass: "portal-managed-device",
    client: { label, deviceType: "desktop" },
  });

const issueElectronDevice = Effect.fn("AdminAccessTest.issueElectronDevice")(function* (
  sessions: SessionStore.SessionStore["Service"],
  label: string,
) {
  const issued = yield* sessions.issue({
    method: "bearer-access-token",
    managementClass: "portal-managed-device",
    client: { label, deviceType: "desktop" },
  });
  yield* sessions.recordClientConnection(issued.sessionId, {
    surface: "desktop",
    appVersion: "0.0.0-test",
  });
  return issued;
});

it.layer(NodeServices.layer)("AdminAccess", (it) => {
  it.effect("rejects current client disable and delete operations", () =>
    Effect.gen(function* () {
      const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const admin = yield* AdminAccess.AdminAccess;
      const sessions = yield* SessionStore.SessionStore;
      const owner = yield* issueBrowserDevice(sessions, "owner-client");
      const ownerSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(owner.token),
      );
      const snapshot = yield* admin.snapshot(ownerSession.clientId);
      const ownerSummary = { revision: 0 };
      expect(snapshot.clients).toHaveLength(0);

      expect(ownerSummary).toBeDefined();
      if (!ownerSummary) return;

      const disableError = yield* admin
        .setClientEnabled({
          currentClientId: ownerSession.clientId,
          clientId: ownerSession.clientId,
          expectedRevision: ownerSummary.revision,
          enabled: false,
        })
        .pipe(Effect.flip);
      const deleteError = yield* admin
        .deleteClient({
          currentClientId: ownerSession.clientId,
          clientId: ownerSession.clientId,
          expectedRevision: ownerSummary.revision,
        })
        .pipe(Effect.flip);

      expect(disableError._tag).toBe("AdminAccessNotFoundError");
      expect(deleteError._tag).toBe("AdminAccessNotFoundError");
    }).pipe(Effect.provide(makeAdminAccessLayer())),
  );

  it.effect("commits disable before exact client teardown and permits later enable", () =>
    Effect.gen(function* () {
      const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const admin = yield* AdminAccess.AdminAccess;
      const registry = yield* ClientConnectionRegistry.ClientConnectionRegistry;
      const sessions = yield* SessionStore.SessionStore;
      const owner = yield* issueBrowserDevice(sessions, "owner-client");
      const target = yield* issueBrowserDevice(sessions, "target-client");
      const other = yield* issueBrowserDevice(sessions, "other-client");
      const ownerSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(owner.token),
      );
      const targetSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(target.token),
      );
      const otherSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(other.token),
      );
      const snapshot = yield* admin.snapshot(ownerSession.clientId);
      const targetSummary = snapshot.clients.find(
        (client) => client.clientId === targetSession.clientId,
      );

      expect(targetSummary).toBeDefined();
      if (!targetSummary) return;

      const committedBeforeTeardown = yield* Deferred.make<boolean>();
      const targetStarted = yield* Deferred.make<void>();
      const otherStarted = yield* Deferred.make<void>();
      const targetConnection = yield* Effect.forkChild(
        registry.guard(
          targetSession.clientId,
          Deferred.succeed(targetStarted, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              sessions.verify(target.token).pipe(
                Effect.result,
                Effect.flatMap((result) =>
                  Deferred.succeed(committedBeforeTeardown, result._tag === "Failure"),
                ),
              ),
            ),
          ),
        ),
      );
      const otherConnection = yield* Effect.forkChild(
        registry.guard(
          otherSession.clientId,
          Deferred.succeed(otherStarted, undefined).pipe(Effect.andThen(Effect.never)),
        ),
      );
      yield* Deferred.await(targetStarted);
      yield* Deferred.await(otherStarted);

      const disabled = yield* admin.setClientEnabled({
        currentClientId: ownerSession.clientId,
        clientId: targetSession.clientId,
        expectedRevision: targetSummary.revision,
        enabled: false,
      });
      const targetExit = yield* Fiber.await(targetConnection);
      expect(yield* Deferred.await(committedBeforeTeardown)).toBe(true);
      const disabledCredential = yield* environmentAuth
        .authenticateHttpRequest(bearerRequest(target.token))
        .pipe(Effect.flip);
      const disabledSnapshot = yield* admin.snapshot(ownerSession.clientId);

      expect(disabled.changed).toBe(true);
      expect(targetExit._tag).toBe("Failure");
      if (targetExit._tag === "Failure") {
        expect(Cause.hasInterruptsOnly(targetExit.cause)).toBe(true);
      }
      expect(otherConnection.pollUnsafe()).toBeUndefined();
      expect(disabledCredential._tag).toBe("ServerAuthInvalidCredentialError");
      expect(
        disabledSnapshot.clients.find((client) => client.clientId === targetSession.clientId)
          ?.authorityState,
      ).toBe("disabled");

      const enabled = yield* admin.setClientEnabled({
        currentClientId: ownerSession.clientId,
        clientId: targetSession.clientId,
        expectedRevision: disabled.revision,
        enabled: true,
      });
      const restored = yield* environmentAuth.authenticateHttpRequest(bearerRequest(target.token));

      expect(enabled.changed).toBe(true);
      expect(restored.clientId).toBe(targetSession.clientId);
      yield* Fiber.interrupt(otherConnection);
    }).pipe(Effect.provide(makeAdminAccessLayer())),
  );

  it.effect("commits delete before exact teardown and permanently rejects credentials", () =>
    Effect.gen(function* () {
      const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const admin = yield* AdminAccess.AdminAccess;
      const registry = yield* ClientConnectionRegistry.ClientConnectionRegistry;
      const sessions = yield* SessionStore.SessionStore;
      const owner = yield* issueBrowserDevice(sessions, "owner-client");
      const target = yield* issueElectronDevice(sessions, "target-client");
      const other = yield* issueBrowserDevice(sessions, "other-client");
      const ownerSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(owner.token),
      );
      const targetSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(target.token),
      );
      const otherSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(other.token),
      );
      const snapshot = yield* admin.snapshot(ownerSession.clientId);
      const targetSummary = snapshot.clients.find(
        (client) => client.clientId === targetSession.clientId,
      );

      expect(targetSummary).toBeDefined();
      if (!targetSummary) return;

      const committedBeforeTeardown = yield* Deferred.make<boolean>();
      const targetStarted = yield* Deferred.make<void>();
      const otherStarted = yield* Deferred.make<void>();
      const targetConnection = yield* Effect.forkChild(
        registry.guard(
          targetSession.clientId,
          Deferred.succeed(targetStarted, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              sessions.verify(target.token).pipe(
                Effect.result,
                Effect.flatMap((result) =>
                  Deferred.succeed(committedBeforeTeardown, result._tag === "Failure"),
                ),
              ),
            ),
          ),
        ),
      );
      const otherConnection = yield* Effect.forkChild(
        registry.guard(
          otherSession.clientId,
          Deferred.succeed(otherStarted, undefined).pipe(Effect.andThen(Effect.never)),
        ),
      );
      yield* Deferred.await(targetStarted);
      yield* Deferred.await(otherStarted);

      const deleted = yield* admin.deleteClient({
        currentClientId: ownerSession.clientId,
        clientId: targetSession.clientId,
        expectedRevision: targetSummary.revision,
      });
      const targetExit = yield* Fiber.await(targetConnection);
      expect(yield* Deferred.await(committedBeforeTeardown)).toBe(true);
      const rejected = yield* environmentAuth
        .authenticateHttpRequest(bearerRequest(target.token))
        .pipe(Effect.flip);
      const afterDelete = yield* admin.snapshot(ownerSession.clientId);

      expect(deleted.changed).toBe(true);
      expect(targetExit._tag).toBe("Failure");
      if (targetExit._tag === "Failure") {
        expect(Cause.hasInterruptsOnly(targetExit.cause)).toBe(true);
      }
      expect(otherConnection.pollUnsafe()).toBeUndefined();
      expect(rejected._tag).toBe("ServerAuthInvalidCredentialError");
      expect(afterDelete.clients.some((client) => client.clientId === targetSession.clientId)).toBe(
        false,
      );
      yield* Fiber.interrupt(otherConnection);
    }).pipe(Effect.provide(makeAdminAccessLayer())),
  );

  it.effect("rejects a stale mutation after a revision winner commits", () =>
    Effect.gen(function* () {
      const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const admin = yield* AdminAccess.AdminAccess;
      const sessions = yield* SessionStore.SessionStore;
      const owner = yield* issueBrowserDevice(sessions, "owner-client");
      const target = yield* issueBrowserDevice(sessions, "target-client");
      const ownerSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(owner.token),
      );
      const targetSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(target.token),
      );
      const snapshot = yield* admin.snapshot(ownerSession.clientId);
      const targetSummary = snapshot.clients.find(
        (client) => client.clientId === targetSession.clientId,
      );

      expect(targetSummary).toBeDefined();
      if (!targetSummary) return;

      const winner = yield* admin.setClientEnabled({
        currentClientId: ownerSession.clientId,
        clientId: targetSession.clientId,
        expectedRevision: targetSummary.revision,
        enabled: false,
      });
      const stale = yield* admin
        .setClientEnabled({
          currentClientId: ownerSession.clientId,
          clientId: targetSession.clientId,
          expectedRevision: targetSummary.revision,
          enabled: false,
        })
        .pipe(Effect.flip);

      expect(winner.changed).toBe(true);
      expect(stale._tag).toBe("AdminAccessRevisionConflictError");
      if (stale._tag === "AdminAccessRevisionConflictError") {
        expect(stale.revision).toBe(targetSummary.revision + 1);
      }
    }).pipe(Effect.provide(makeAdminAccessLayer())),
  );

  it.effect("issues the pairing credential once and exposes only safe summaries", () =>
    Effect.gen(function* () {
      const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const admin = yield* AdminAccess.AdminAccess;
      const sessions = yield* SessionStore.SessionStore;
      const owner = yield* issueBrowserDevice(sessions, "owner-client");
      const ownerSession = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(owner.token),
      );
      const issued = yield* admin.createPairingCode({ ttlSeconds: 300, label: "new-device" });
      const snapshot = yield* admin.snapshot(ownerSession.clientId);

      expect(issued.credential.length).toBeGreaterThan(0);
      expect(snapshot.pairingCodes).toContainEqual(issued.pairingCode);
      expectPrivacySafe(issued.pairingCode);
      expectPrivacySafe(snapshot);
    }).pipe(Effect.provide(makeAdminAccessLayer())),
  );

  it.effect("hides and rejects lifecycle changes for headless operator clients", () =>
    Effect.gen(function* () {
      const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const admin = yield* AdminAccess.AdminAccess;
      const sessions = yield* SessionStore.SessionStore;
      const owner = yield* issueBrowserDevice(sessions, "owner-client");
      const issuedOperator = yield* environmentAuth.issueSession({ label: "headless-operator" });
      const operator = yield* sessions.verify(issuedOperator.token);
      yield* sessions.recordClientConnection(operator.sessionId, {
        surface: "desktop",
        appVersion: "0.0.0-spoofed",
      });
      const snapshot = yield* admin.snapshot(owner.clientId);

      expect(snapshot.clients.some((client) => client.clientId === operator.clientId)).toBe(false);

      const disableError = yield* admin
        .setClientEnabled({
          currentClientId: owner.clientId,
          clientId: operator.clientId,
          expectedRevision: 0,
          enabled: false,
        })
        .pipe(Effect.flip);
      const deleteError = yield* admin
        .deleteClient({
          currentClientId: owner.clientId,
          clientId: operator.clientId,
          expectedRevision: 0,
        })
        .pipe(Effect.flip);
      const stillAuthorized = yield* environmentAuth.authenticateHttpRequest(
        bearerRequest(operator.token),
      );

      expect(disableError._tag).toBe("AdminAccessNotFoundError");
      expect(deleteError._tag).toBe("AdminAccessNotFoundError");
      expect(stillAuthorized.clientId).toBe(operator.clientId);
    }).pipe(Effect.provide(makeAdminAccessLayer())),
  );

  it.effect("enforces the outstanding pairing limit under concurrent admission", () =>
    Effect.gen(function* () {
      const admin = yield* AdminAccess.AdminAccess;
      const outcomes = yield* Effect.all(
        Array.from({ length: 12 }, (_, index) =>
          admin
            .createPairingCode({ ttlSeconds: 300, label: `concurrent-device-${index}` })
            .pipe(Effect.result),
        ),
        { concurrency: "unbounded" },
      );

      expect(outcomes.filter((outcome) => outcome._tag === "Success")).toHaveLength(10);
      expect(outcomes.filter((outcome) => outcome._tag === "Failure")).toHaveLength(2);
      expect(
        outcomes
          .filter((outcome) => outcome._tag === "Failure")
          .every((outcome) => outcome.failure._tag === "AdminAccessOutstandingPairingLimitError"),
      ).toBe(true);
    }).pipe(Effect.provide(makeAdminAccessLayer())),
  );
});
