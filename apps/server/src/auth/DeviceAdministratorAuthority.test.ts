import * as NodeServices from "@effect/platform-node/NodeServices";
import { AuthClientId, AuthStandardClientScopes } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import type * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { guardDeviceAdministratorHttpRequest } from "./http.ts";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as ServerConfig from "../config.ts";
import * as AdminAccess from "./AdminAccess.ts";
import * as ClientConnectionRegistry from "./ClientConnectionRegistry.ts";
import * as EnvironmentAuth from "./EnvironmentAuth.ts";
import * as PairingGrantStore from "./PairingGrantStore.ts";
import * as SessionStore from "./SessionStore.ts";

const runtime = AdminAccess.layer.pipe(
  Layer.provideMerge(ClientConnectionRegistry.layer),
  Layer.provideMerge(EnvironmentAuth.runtimeLayer),
);
const config = ServerConfig.layerTest(process.cwd(), { prefix: "t3-authority-proof-" });

it.layer(NodeServices.layer)("persisted external device authority", (it) => {
  it.effect("keeps explicit enrollment and portal authority across database close and reopen", () =>
    Effect.gen(function* () {
      const issued = yield* Effect.gen(function* () {
        const admin = yield* AdminAccess.AdminAccess;
        const auth = yield* EnvironmentAuth.EnvironmentAuth;
        const sql = yield* SqlClient.SqlClient;
        const portal = yield* auth.issueSession({
          authorityClass: "device-administrator",
          scopes: [],
          ttl: Duration.days(7),
        });
        const managed = yield* admin.createPairingCode({
          ttlSeconds: 300,
          label: "Managed device",
        });
        const ordinary = yield* auth.createPairingLink({
          subject: PairingGrantStore.PORTAL_MANAGED_DEVICE_PAIRING_SUBJECT,
          label: "Managed device",
        });
        const rows = yield* sql<{
          credential_digest: string;
          client_management_class: string | null;
        }>`SELECT credential_digest, client_management_class FROM auth_pairing_links`;
        expect(rows.map((row) => row.client_management_class).sort()).toEqual([
          null,
          "portal-managed-device",
        ]);
        expect(rows.every((row) => !row.credential_digest.includes(managed.credential))).toBe(true);
        expect(rows.every((row) => !row.credential_digest.includes(ordinary.credential))).toBe(
          true,
        );
        return { portal, managed, ordinary };
      }).pipe(Effect.provide(runtime), Effect.scoped);
      const enrolled = yield* Effect.gen(function* () {
        const auth = yield* EnvironmentAuth.EnvironmentAuth;
        const sessions = yield* SessionStore.SessionStore;
        const admin = yield* AdminAccess.AdminAccess;
        const portal = yield* sessions.verify(issued.portal.token);
        expect(portal.authorityClass).toBe("device-administrator");
        const managed = yield* auth.createBrowserSession(issued.managed.credential, {
          deviceType: "desktop",
        });
        const spoofed = yield* auth.createBrowserSession(issued.ordinary.credential, {
          deviceType: "desktop",
        });
        const managedSession = yield* sessions.verify(managed.sessionToken);
        const spoofedSession = yield* sessions.verify(spoofed.sessionToken);
        const inventory = yield* admin.snapshot(portal.clientId);
        expect(inventory.clients.map((client) => client.clientId)).toEqual([
          managedSession.clientId,
        ]);
        expect(Object.keys(inventory.clients[0]!).sort()).toEqual([
          "authorityState",
          "clientId",
          "connectionState",
          "createdAt",
          "deviceType",
          "label",
          "lastConnectedAt",
          "revision",
        ]);
        for (const clientId of [
          portal.clientId,
          spoofedSession.clientId,
          AuthClientId.make("missing-client"),
        ]) {
          const failure = yield* admin
            .setClientEnabled({
              currentClientId: portal.clientId,
              clientId,
              expectedRevision: 0,
              enabled: false,
            })
            .pipe(Effect.flip);
          expect(failure._tag).toBe("AdminAccessNotFoundError");
        }
        return managed;
      }).pipe(Effect.provide(runtime), Effect.scoped);
      yield* Effect.gen(function* () {
        const sessions = yield* SessionStore.SessionStore;
        const admin = yield* AdminAccess.AdminAccess;
        const portal = yield* sessions.verify(issued.portal.token);
        const managed = yield* sessions.verify(enrolled.sessionToken);
        expect(
          (yield* admin.snapshot(portal.clientId)).clients.map((client) => client.clientId),
        ).toEqual([managed.clientId]);
      }).pipe(Effect.provide(runtime), Effect.scoped);
    }).pipe(Effect.provide(config)),
  );

  it.effect(
    "rejects authority substitution, excessive lifetime, proof binding, and portal tickets",
    () =>
      Effect.gen(function* () {
        const sessions = yield* SessionStore.SessionStore;
        const sql = yield* SqlClient.SqlClient;
        for (const input of [
          { authorityClass: "device-administrator" as const },
          { authorityClass: "device-administrator" as const, ttl: Duration.days(8) },
          {
            authorityClass: "device-administrator" as const,
            ttl: Duration.hours(1),
            scopes: AuthStandardClientScopes,
          },
          {
            authorityClass: "device-administrator" as const,
            ttl: Duration.hours(1),
            proofKeyThumbprint: "spoofed-proof",
          },
        ])
          expect((yield* sessions.issue(input).pipe(Effect.flip))._tag).toBe(
            "SessionCredentialIssueError",
          );
        const portal = yield* sessions.issue({
          authorityClass: "device-administrator",
          ttl: Duration.hours(1),
        });
        expect((yield* sessions.issueWebSocketToken(portal.sessionId).pipe(Effect.flip))._tag).toBe(
          "WebSocketAuthorityForbiddenError",
        );
        yield* sql`UPDATE auth_sessions SET authority_class = 'client' WHERE session_id = ${portal.sessionId}`;
        expect((yield* sessions.verify(portal.token).pipe(Effect.flip))._tag).toBe(
          "InvalidSessionAuthorityClassError",
        );
        const client = yield* sessions.issue({
          subject: "device-administrator",
          scopes: ["access:read", "access:write"],
        });
        expect((yield* sessions.verify(client.token)).authorityClass).toBe("client");
        yield* sql`UPDATE auth_sessions SET authority_class = 'device-administrator' WHERE session_id = ${client.sessionId}`;
        expect((yield* sessions.verify(client.token).pipe(Effect.flip))._tag).toBe(
          "InvalidSessionAuthorityClassError",
        );
      }).pipe(Effect.provide(runtime.pipe(Layer.provide(config)))),
  );

  it.effect(
    "uses atomic digest consumption, fixed scopes, revision checks, expiry and grant eligibility",
    () =>
      Effect.gen(function* () {
        const admin = yield* AdminAccess.AdminAccess;
        const grants = yield* PairingGrantStore.PairingGrantStore;
        const auth = yield* EnvironmentAuth.EnvironmentAuth;
        const issued = yield* admin.createPairingCode({ ttlSeconds: 60 });
        expect(Object.keys(issued.pairingCode).sort()).toEqual([
          "createdAt",
          "expiresAt",
          "pairingCodeId",
          "revision",
        ]);
        const outcomes = yield* Effect.all(
          [
            grants.consume(issued.credential).pipe(Effect.result),
            grants.consume(issued.credential).pipe(Effect.result),
          ],
          { concurrency: "unbounded" },
        );
        expect(outcomes.filter((outcome) => outcome._tag === "Success")).toHaveLength(1);
        const success = outcomes.find((outcome) => outcome._tag === "Success");
        if (success?._tag === "Success") {
          expect(success.success.scopes).toEqual(AuthStandardClientScopes);
          expect(success.success.clientManagementClass).toBe("portal-managed-device");
        }
        const revocable = yield* admin.createPairingCode({ ttlSeconds: 60 });
        expect(
          (yield* admin
            .revokePairingCode({
              pairingCodeId: revocable.pairingCode.pairingCodeId,
              expectedRevision: 1,
            })
            .pipe(Effect.flip))._tag,
        ).toBe("AdminAccessRevisionConflictError");
        expect(
          (yield* admin.revokePairingCode({
            pairingCodeId: revocable.pairingCode.pairingCodeId,
            expectedRevision: 0,
          })).changed,
        ).toBe(true);
        expect((yield* grants.consume(revocable.credential).pipe(Effect.flip))._tag).toBe(
          "UnavailableBootstrapCredentialError",
        );
        const ordinary = yield* auth.createPairingLink({
          subject: PairingGrantStore.PORTAL_MANAGED_DEVICE_PAIRING_SUBJECT,
        });
        expect(
          (yield* admin
            .revokePairingCode({ pairingCodeId: ordinary.id, expectedRevision: 0 })
            .pipe(Effect.flip))._tag,
        ).toBe("AdminAccessNotFoundError");
        const expiring = yield* admin.createPairingCode({ ttlSeconds: 60 });
        yield* TestClock.adjust(Duration.seconds(61));
        expect((yield* grants.consume(expiring.credential).pipe(Effect.flip))._tag).toBe(
          "ExpiredBootstrapCredentialError",
        );
        expect(
          (yield* admin
            .revokePairingCode({
              pairingCodeId: expiring.pairingCode.pairingCodeId,
              expectedRevision: 0,
            })
            .pipe(Effect.flip))._tag,
        ).toBe("AdminAccessNotFoundError");
      }).pipe(Effect.provide(runtime.pipe(Layer.provide(config)))),
  );

  it.effect("enforces no-store and portal denial before a replacement HTTP host dispatches", () =>
    Effect.gen(function* () {
      const sessions = yield* SessionStore.SessionStore;
      const portal = yield* sessions.issue({
        authorityClass: "device-administrator",
        ttl: Duration.hours(1),
      });
      const client = yield* sessions.issue({ method: "bearer-access-token" });
      let dispatched = 0;
      const context = yield* Effect.context<SessionStore.SessionStore>();
      const handler = HttpEffect.toWebHandlerWith<
        SessionStore.SessionStore,
        SessionStore.SessionStore | HttpServerRequest.HttpServerRequest
      >(context)(
        guardDeviceAdministratorHttpRequest.pipe(
          Effect.andThen(
            Effect.sync(() => {
              dispatched++;
              return HttpServerResponse.empty({ status: 204 });
            }),
          ),
          Effect.catchTag("EnvironmentOperationForbiddenError", () =>
            Effect.succeed(HttpServerResponse.empty({ status: 403 })),
          ),
        ),
      );
      for (const [pathname, headers, status] of [
        ["/api/auth/admin/clients", { authorization: `Bearer ${portal.token}` }, 204],
        ["/api/auth/admin/clients", { authorization: `Bearer ${client.token}` }, 403],
        [
          "/api/auth/admin/clients",
          { authorization: `Bearer ${portal.token}`, origin: "https://service.example.test" },
          403,
        ],
        ["/api/auth/admin/clients", { cookie: `${sessions.cookieName}=${portal.token}` }, 403],
        ["/api/auth/session", { authorization: `Bearer ${portal.token}` }, 403],
        ["/oauth/token", { authorization: `Bearer ${portal.token}` }, 403],
        ["/api/cloud", { authorization: `Bearer ${portal.token}` }, 403],
        [
          "/",
          {
            authorization: `Bearer ${portal.token}`,
            cookie: `${sessions.cookieName}=${client.token}`,
          },
          403,
        ],
      ] as const) {
        const response = yield* Effect.promise(() =>
          handler(new Request(`https://service.example.test${pathname}`, { headers })),
        );
        expect(response.status).toBe(status);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
      expect(dispatched).toBe(1);
      yield* sessions.revoke(portal.sessionId);
      const response = yield* Effect.promise(() =>
        handler(
          new Request("https://service.example.test/", {
            headers: { authorization: `Bearer ${portal.token}` },
          }),
        ),
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(dispatched).toBe(1);
    }).pipe(Effect.provide(runtime.pipe(Layer.provide(config)))),
  );

  it.effect("rechecks persisted admission after an earlier successful authentication", () =>
    Effect.gen(function* () {
      const sessions = yield* SessionStore.SessionStore;
      const sql = yield* SqlClient.SqlClient;
      for (const transition of ["disable", "delete", "revoke"] as const) {
        const client = yield* sessions.issue();
        yield* sessions.verify(client.token);
        yield* sessions.assertClientAdmission(client.sessionId);
        if (transition === "disable")
          yield* sql`UPDATE auth_clients SET disabled_at = '1970-01-01T00:00:00.000Z' WHERE client_id = ${client.clientId}`;
        if (transition === "delete")
          yield* sql`UPDATE auth_clients SET deleted_at = '1970-01-01T00:00:00.000Z' WHERE client_id = ${client.clientId}`;
        if (transition === "revoke") yield* sessions.revoke(client.sessionId);
        expect(
          (yield* sessions.assertClientAdmission(client.sessionId).pipe(Effect.flip))._tag,
        ).toBe(
          transition === "disable"
            ? "SessionClientDisabledError"
            : transition === "delete"
              ? "SessionClientDeletedError"
              : "SessionTokenRevokedError",
        );
      }
    }).pipe(Effect.provide(runtime.pipe(Layer.provide(config)))),
  );

  it.effect("revokes only the exact active credential after its durable write", () =>
    Effect.gen(function* () {
      const sessions = yield* SessionStore.SessionStore;
      const registry = yield* ClientConnectionRegistry.ClientConnectionRegistry;
      const target = yield* sessions.issue();
      const other = yield* sessions.issue();
      const started = yield* Deferred.make<void>();
      const otherStarted = yield* Deferred.make<void>();
      const events = yield* Stream.toQueue(sessions.streamChanges, { capacity: "unbounded" });
      const listener = yield* Stream.fromQueue(events).pipe(
        Stream.runForEach((change) =>
          change.type === "clientRemoved"
            ? registry.disconnectSession(change.sessionId)
            : Effect.void,
        ),
        Effect.forkChild,
      );
      const targetFiber = yield* registry
        .guardSession(
          target.sessionId,
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
        )
        .pipe(Effect.forkChild);
      const otherFiber = yield* registry
        .guardSession(
          other.sessionId,
          Deferred.succeed(otherStarted, undefined).pipe(Effect.andThen(Effect.never)),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Deferred.await(otherStarted);
      yield* sessions.revoke(target.sessionId);
      expect((yield* Fiber.await(targetFiber))._tag).toBe("Failure");
      expect((yield* sessions.verify(target.token).pipe(Effect.flip))._tag).toBe(
        "SessionTokenRevokedError",
      );
      expect(otherFiber.pollUnsafe()).toBeUndefined();
      yield* Fiber.interrupt(otherFiber);
      yield* Fiber.interrupt(listener);
      expect(DateTime.isDateTime(other.expiresAt)).toBe(true);
    }).pipe(Effect.provide(runtime.pipe(Layer.provide(config)))),
  );
});
