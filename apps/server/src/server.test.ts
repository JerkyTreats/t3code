// @effect-diagnostics nodeBuiltinImport:off
import * as NodeHttp from "node:http";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeSocket from "@effect/platform-node/NodeSocket";
import { assert, it } from "@effect/vitest";
import {
  AdminAccessSnapshot,
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ProviderDriverKind,
  ThreadId,
  WsServerImportAcpRegistrySessionRpc,
  AdminMutationResult,
  AdminPairingCodeIssued,
  DEFAULT_SERVER_SETTINGS,
  EnvironmentAuthorizationError,
  EnvironmentHttpApi,
  ORCHESTRATION_V2_WS_METHODS,
  ServerSettings,
  WS_METHODS,
  WsSubscribeBackgroundPolicyRpc,
  type BackgroundPolicySnapshot,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import {
  HttpBody,
  HttpClient,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from "effect/http";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { Rpc, RpcClient, RpcGroup, RpcSerialization, RpcServer } from "effect/rpc";
import * as Socket from "effect/socket/Socket";
import * as ServerConfig from "./config.ts";
import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import * as SessionStore from "./auth/SessionStore.ts";
import * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import * as AdminAccess from "./auth/AdminAccess.ts";
import * as ClientConnectionRegistry from "./auth/ClientConnectionRegistry.ts";
import { requiredScopeForRpcMethod } from "./auth/RpcAuthorization.ts";
import {
  adminHttpApiLayer,
  layer as authHttpApiLayer,
  layerAuthenticatedAuth as environmentAuthenticatedAuthLayer,
  failEnvironmentAuthInvalid,
} from "./auth/http.ts";
import { layerFromPath } from "./persistence/Sqlite.ts";
import * as AnalyticsService from "./telemetry/AnalyticsService.ts";
import { deviceAdministratorBoundaryLayer } from "./server.ts";
import { assetFileResponse } from "./http.ts";
import {
  authorizeClientRpc,
  withAdmittedWebSocketConnection,
  serveAdmittedWebSocketConnection,
  readClientConnectionOrigin,
  makeImportedAcpThreadLaunchInput,
} from "./ws.ts";
import type { ThreadLaunchInput } from "./orchestration-v2/ThreadLaunchService.ts";

class AuthorityTestApi extends HttpApi.make("environment")
  .add(EnvironmentHttpApi.groups.auth)
  .add(EnvironmentHttpApi.groups.admin) {}

const AuthorityRpcGroup = RpcGroup.make(
  Rpc.make(WS_METHODS.serverGetSettings, {
    payload: Schema.Struct({}),
    success: ServerSettings,
    error: EnvironmentAuthorizationError,
  }),
  WsSubscribeBackgroundPolicyRpc,
  WsServerImportAcpRegistrySessionRpc,
);

const backgroundPolicy: BackgroundPolicySnapshot = {
  hostPower: {
    source: "unknown",
    idle: "unknown",
    idleSeconds: null,
    locked: "unknown",
    suspended: false,
    onBattery: "unknown",
    lowPowerMode: "unknown",
    thermalState: "unknown",
    stale: true,
    updatedAt: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
  },
  leases: [],
  activeForegroundLeaseCount: 0,
  activeScopeKeys: [],
  shouldRunOpportunisticWork: true,
  updatedAt: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
};
const makeClient = RpcClient.make(AuthorityRpcGroup);
const withClient = <A, E, R>(
  url: string,
  cookie: string,
  use: (client: Effect.Success<typeof makeClient>) => Effect.Effect<A, E, R>,
) =>
  makeClient.pipe(
    Effect.flatMap(use),
    Effect.provide(
      RpcClient.layerProtocolSocket().pipe(
        Layer.provide(
          Socket.layerWebSocket(url).pipe(
            Layer.provide(
              Layer.succeed(
                Socket.WebSocketConstructor,
                (socketUrl, protocols) =>
                  new NodeSocket.NodeWS.WebSocket(
                    socketUrl,
                    protocols as string | string[] | undefined,
                    { headers: { cookie } },
                  ) as unknown as globalThis.WebSocket,
              ),
            ),
          ),
        ),
        Layer.provideMerge(RpcSerialization.layerJson),
      ),
    ),
  );

const authLayerFor = (config: ServerConfig.ServerConfig["Service"]) =>
  EnvironmentAuth.layer.pipe(
    Layer.provideMerge(layerFromPath(config.dbPath)),
    Layer.provideMerge(ServerSecretStore.layer),
    Layer.provide(ServerEnvironment.layerIdentity),
    Layer.provide(ServerConfig.layer(config)),
  );

const buildAuthorityHost = Effect.gen(function* () {
  const configContext = yield* Layer.build(
    ServerConfig.layerTest(process.cwd(), { prefix: "t3-v2-authority-host-" }),
  );
  const config = Context.get(configContext, ServerConfig.ServerConfig);
  const runtime = AdminAccess.layer.pipe(
    Layer.provideMerge(ClientConnectionRegistry.sessionRevocationLayer),
    Layer.provideMerge(ClientConnectionRegistry.layer),
    Layer.provideMerge(authLayerFor(config)),
    Layer.provideMerge(ServerConfig.layer(config)),
  );
  const context = yield* Layer.build(runtime);
  const auth = Context.get(context, EnvironmentAuth.EnvironmentAuth);
  const sessions = Context.get(context, SessionStore.SessionStore);
  const connections = Context.get(context, ClientConnectionRegistry.ClientConnectionRegistry);
  const admin = Context.get(context, AdminAccess.AdminAccess);
  const importedLaunches: ThreadLaunchInput[] = [];
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const assetDirectory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-authority-mcp-asset-" });
  const htmlAsset = path.join(assetDirectory, "app.html");
  yield* fs.writeFileString(htmlAsset, "<html><body>Synthetic MCP app</body></html>");
  const webSocketRoutes = HttpRouter.add(
    "GET",
    "/ws",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const session = yield* auth
        .authenticateWebSocketUpgrade(request)
        .pipe(
          Effect.catchIf(EnvironmentAuth.isServerAuthCredentialError, () =>
            failEnvironmentAuthInvalid("invalid_credential"),
          ),
        );
      const clientOrigin = readClientConnectionOrigin(request);
      const handlers = AuthorityRpcGroup.toLayer({
        [WS_METHODS.serverImportAcpRegistrySession]: (input) =>
          authorizeClientRpc(
            sessions,
            session,
            requiredScopeForRpcMethod(WS_METHODS.serverImportAcpRegistrySession),
            Effect.sync(() => {
              const threadId = ThreadId.make(`import-${input.sessionId}`);
              importedLaunches.push(
                makeImportedAcpThreadLaunchInput({
                  input,
                  commandId: CommandId.make(`import-command-${input.sessionId}`),
                  threadId,
                  driver: ProviderDriverKind.make("opencode"),
                  model: "synthetic-model",
                  clientOrigin,
                }),
              );
              return { threadId, imported: true };
            }),
          ),
        [WS_METHODS.serverGetSettings]: () =>
          authorizeClientRpc(
            sessions,
            session,
            requiredScopeForRpcMethod(WS_METHODS.serverGetSettings),
            Effect.succeed(DEFAULT_SERVER_SETTINGS),
          ),
        [WS_METHODS.subscribeBackgroundPolicy]: () =>
          Stream.unwrap(
            authorizeClientRpc(
              sessions,
              session,
              requiredScopeForRpcMethod(WS_METHODS.subscribeBackgroundPolicy),
              Effect.succeed(Stream.concat(Stream.make(backgroundPolicy), Stream.never)),
            ),
          ),
      });
      return yield* withAdmittedWebSocketConnection(
        { connections, sessions, session, clientOrigin },
        Effect.gen(function* () {
          const { protocol, httpEffect } = yield* RpcServer.makeProtocolWithHttpEffectWebsocket;
          yield* RpcServer.make(AuthorityRpcGroup, { disableTracing: true }).pipe(
            Effect.provideService(RpcServer.Protocol, protocol),
            Effect.provide(handlers.pipe(Layer.provideMerge(RpcSerialization.layerJson))),
            Effect.forkScoped,
          );
          return yield* httpEffect;
        }),
      );
    }).pipe(Effect.catchTags({ EnvironmentAuthInvalidError: HttpServerRespondable.toResponse })),
  );
  const apiRoutes = HttpApiBuilder.layer(AuthorityTestApi).pipe(
    Layer.provide(authHttpApiLayer),
    Layer.provide(adminHttpApiLayer),
    Layer.provide(environmentAuthenticatedAuthLayer),
  );
  const routes = Layer.mergeAll(
    apiRoutes,
    webSocketRoutes,
    HttpRouter.add("GET", "/", HttpServerResponse.text("public app")),
    HttpRouter.add(
      "GET",
      "/.well-known/t3/environment",
      HttpServerResponse.jsonUnsafe({ id: "synthetic" }),
    ),
    HttpRouter.add(
      "GET",
      "/api/connect/link-state",
      HttpServerResponse.jsonUnsafe({ linked: false }),
    ),
    HttpRouter.add("POST", "/api/observability/v1/traces", HttpServerResponse.empty()),
    HttpRouter.add("POST", "/api/projects/mutate", HttpServerResponse.empty()),
    HttpRouter.add(
      "GET",
      "/api/assets/synthetic-mcp-app.html",
      assetFileResponse({ path: htmlAsset, mimeType: "text/html", renderIntent: "mcp-app" }),
    ),
  ).pipe(
    Layer.provide(deviceAdministratorBoundaryLayer),
    Layer.provide(RpcSerialization.layerJson),
  );
  yield* Layer.build(
    HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
      Layer.provide(Layer.succeedContext(context)),
    ),
  );
  const server = yield* HttpServer.HttpServer;
  assert.notEqual(typeof server.address, "string");
  const port =
    typeof server.address === "string" || !("port" in server.address) ? 0 : server.address.port;
  return {
    config,
    sessions,
    auth,
    admin,
    connections,
    importedLaunches,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
  };
});
const AuthorityHttpServerLive = HttpServer.layerTestClient.pipe(
  Layer.provide(NodeHttpClient.layerNodeHttp),
  Layer.provideMerge(NodeHttpServer.layer(() => NodeHttp.createServer(), { port: 0 })),
);
const json = Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const requestJson = (method: "POST" | "GET", path: string, token: string, payload?: unknown) =>
  method === "GET"
    ? HttpClient.get(path, { headers: { authorization: `Bearer ${token}` } })
    : HttpClient.post(path, {
        headers: { authorization: `Bearer ${token}` },
        body: HttpBody.text(json(payload), "application/json"),
      });
const decodeSnapshot = Schema.decodeUnknownEffect(Schema.toCodecJson(AdminAccessSnapshot));
const decodeMutation = Schema.decodeUnknownEffect(Schema.toEncoded(AdminMutationResult));
const decodePairing = Schema.decodeUnknownEffect(Schema.toCodecJson(AdminPairingCodeIssued));

it.layer(Layer.merge(NodeServices.layer, RpcSerialization.layerJson))(
  "v2 authority transport replacement",
  (it) => {
    it.effect("routes ACP import creation surface from each admitted RPC connection", () =>
      Effect.gen(function* () {
        const host = yield* buildAuthorityHost;
        const ordinary = yield* host.sessions.issue({});
        const cookie = `${host.sessions.cookieName}=${ordinary.token}`;
        for (const surface of ["thread", undefined] as const) {
          const url = surface === undefined ? host.wsUrl : `${host.wsUrl}?clientSurface=${surface}`;
          yield* withClient(url, cookie, (client) =>
            client[WS_METHODS.serverImportAcpRegistrySession]({
              projectId: ProjectId.make("synthetic-import-project"),
              instanceId: ProviderInstanceId.make("synthetic-import-instance"),
              sessionId: `synthetic-import-${surface ?? "legacy"}`,
            }),
          );
        }
        assert.equal(host.importedLaunches.length, 2);
        assert.equal(host.importedLaunches[0]?.creationSurface, "thread");
        assert.equal(host.importedLaunches[1]?.creationSurface, undefined);
        assert.equal("creationSurface" in host.importedLaunches[1]!, false);
        for (const launch of host.importedLaunches) {
          assert.equal(launch.createdBy, "user");
          assert.equal(launch.creationSource, "web");
        }
      }).pipe(Effect.provide(AuthorityHttpServerLive)),
    );

    it.effect("confines portal credentials before public, v2 and preflight dispatch", () =>
      Effect.gen(function* () {
        const host = yield* buildAuthorityHost;
        const portal = yield* host.sessions.issue({
          authorityClass: "device-administrator",
          ttl: Duration.hours(1),
        });
        const ordinary = yield* host.sessions.issue({});
        const cookie = `${host.sessions.cookieName}=${ordinary.token}`;
        const assetResponse = yield* HttpClient.get("/api/assets/synthetic-mcp-app.html", {
          headers: { cookie },
        });
        assert.equal(assetResponse.status, 200);
        assert.include(yield* assetResponse.text, "Synthetic MCP app");
        for (const scheme of ["Bearer ", "Bearer   ", "bearer ", "bEaReR\t", "DPoP   ", "dpop\t"]) {
          for (const path of [
            "/",
            "/.well-known/t3/environment",
            "/api/auth/session",
            "/api/connect/link-state",
            "/ws",
            "/api/assets/synthetic-mcp-app.html",
            "/mcp",
            "/mcp/preview",
            "/mcp/device",
            "/mcp/pull-requests",
          ]) {
            const response = yield* HttpClient.get(path, {
              headers: { authorization: `${scheme}${portal.token}  `, cookie },
            });
            assert.equal(response.status, 401);
            assert.equal(response.headers["cache-control"], "no-store");
          }
          const response = yield* HttpClient.options("/api/auth/admin/clients", {
            headers: {
              authorization: `${scheme}${portal.token}`,
              origin: "https://portal.example.test",
              "access-control-request-method": "GET",
            },
          });
          assert.equal(response.status, 401);
          assert.equal(response.headers["cache-control"], "no-store");
        }
        for (const path of [
          "/api/auth/websocket-ticket",
          "/api/projects/mutate",
          "/api/observability/v1/traces",
        ]) {
          const response = yield* requestJson("POST", path, portal.token, {});
          assert.equal(response.status, 401);
          assert.equal(response.headers["cache-control"], "no-store");
        }
        const session = yield* host.sessions.verify(portal.token);
        for (const method of [
          ...Object.values(ORCHESTRATION_V2_WS_METHODS),
          WS_METHODS.serverGetSettings,
          WS_METHODS.subscribeBackgroundPolicy,
          WS_METHODS.serverRunStorageCleanup,
          WS_METHODS.serverGetStorageCleanupReport,
          WS_METHODS.serverCheckOtlpEndpoint,
          WS_METHODS.pullRequestsReviewGuide,
          WS_METHODS.pullRequestsGenerateReviewGuide,
          WS_METHODS.pullRequestsReportState,
          WS_METHODS.filesystemGetMetadata,
        ]) {
          const outcome = yield* authorizeClientRpc(
            host.sessions,
            session,
            requiredScopeForRpcMethod(method),
            Effect.succeed("forbidden"),
          ).pipe(Effect.result);
          assert.equal(outcome._tag, "Failure");
        }
        const response = yield* requestJson("GET", "/api/auth/admin/clients", portal.token);
        assert.equal(response.status, 200);
        assert.equal(response.headers["cache-control"], "no-store");
        const snapshot = yield* response.json.pipe(Effect.flatMap(decodeSnapshot));
        assert.deepEqual(snapshot, { clients: [], pairingCodes: [] });
      }).pipe(Effect.provide(AuthorityHttpServerLive)),
    );

    it.effect(
      "executes all six Admin routes and commits exact-device disable before closing its live background policy subscription",
      () =>
        Effect.gen(function* () {
          const host = yield* buildAuthorityHost;
          const portal = yield* host.sessions.issue({
            authorityClass: "device-administrator",
            ttl: Duration.hours(1),
          });
          const pairedResponse = yield* requestJson(
            "POST",
            "/api/auth/admin/client-pairing-codes",
            portal.token,
            { label: "Managed device", ttlSeconds: 300 },
          );
          assert.equal(pairedResponse.status, 200);
          const paired = yield* pairedResponse.json.pipe(Effect.flatMap(decodePairing));
          const browser = yield* host.auth.createBrowserSession(paired.credential, {
            deviceType: "mobile",
          });
          const managed = yield* host.sessions.verify(browser.sessionToken);
          const ready = yield* Deferred.make<void>();
          const connection = yield* withClient(
            host.wsUrl,
            `${host.sessions.cookieName}=${browser.sessionToken}`,
            (client) =>
              client[WS_METHODS.subscribeBackgroundPolicy]({}).pipe(
                Stream.tap(() => Deferred.succeed(ready, undefined)),
                Stream.runDrain,
              ),
          ).pipe(Effect.result, Effect.forkChild);
          yield* Deferred.await(ready);
          const inventoryResponse = yield* requestJson(
            "GET",
            "/api/auth/admin/clients",
            portal.token,
          );
          const inventory = yield* inventoryResponse.json.pipe(Effect.flatMap(decodeSnapshot));
          const device = inventory.clients.find((client) => client.clientId === managed.clientId);
          assert.isDefined(device);
          assert.equal(device?.connectionState, "connected");
          const revocableResponse = yield* requestJson(
            "POST",
            "/api/auth/admin/client-pairing-codes",
            portal.token,
            { ttlSeconds: 300 },
          );
          const revocable = yield* revocableResponse.json.pipe(Effect.flatMap(decodePairing));
          const revoke = yield* requestJson(
            "POST",
            "/api/auth/admin/pairing-codes/revoke",
            portal.token,
            {
              pairingCodeId: revocable.pairingCode.pairingCodeId,
              expectedRevision: revocable.pairingCode.revision,
            },
          );
          assert.equal(revoke.status, 200);
          const disabledResponse = yield* requestJson(
            "POST",
            "/api/auth/admin/clients/disable",
            portal.token,
            { clientId: managed.clientId, expectedRevision: device?.revision },
          );
          const disabled = yield* disabledResponse.json.pipe(Effect.flatMap(decodeMutation));
          assert.equal(disabledResponse.status, 200);
          assert.isTrue(disabled.changed);
          yield* Fiber.join(connection);
          assert.equal(
            (yield* host.sessions.assertClientAdmission(managed.sessionId).pipe(Effect.result))
              ._tag,
            "Failure",
          );
          const disabledInventory = yield* host.admin.snapshot(portal.clientId);
          assert.equal(
            disabledInventory.clients.find((client) => client.clientId === managed.clientId)
              ?.authorityState,
            "disabled",
          );
          const enabledResponse = yield* requestJson(
            "POST",
            "/api/auth/admin/clients/enable",
            portal.token,
            { clientId: managed.clientId, expectedRevision: disabled.revision },
          );
          const enabled = yield* enabledResponse.json.pipe(Effect.flatMap(decodeMutation));
          assert.equal(enabledResponse.status, 200);
          yield* Effect.scoped(
            withClient(
              host.wsUrl,
              `${host.sessions.cookieName}=${browser.sessionToken}`,
              (client) => client[WS_METHODS.serverGetSettings]({}),
            ),
          );
          const deleted = yield* requestJson(
            "POST",
            "/api/auth/admin/clients/delete",
            portal.token,
            {
              clientId: managed.clientId,
              expectedRevision: enabled.revision,
            },
          );
          assert.equal(deleted.status, 200);
          assert.equal(
            (yield* host.sessions.verify(browser.sessionToken).pipe(Effect.result))._tag,
            "Failure",
          );
        }).pipe(Effect.provide(AuthorityHttpServerLive)),
    );

    it.effect(
      "observes independent-runtime revocation before RPC and later closes only the exact live session",
      () =>
        Effect.gen(function* () {
          const host = yield* buildAuthorityHost;
          const operatorContext = yield* Layer.build(authLayerFor(host.config));
          const operator = Context.get(operatorContext, SessionStore.SessionStore);
          assert.notStrictEqual(operator, host.sessions);
          const target = yield* host.sessions.issue({ subject: "revocation-target" });
          const peer = yield* host.sessions.issue({ subject: "revocation-peer" });
          const targetStarted = yield* Deferred.make<void>();
          const peerStarted = yield* Deferred.make<void>();
          const revoked = yield* Deferred.make<void>();
          const rpcChecked = yield* Deferred.make<void>();
          const checkPeer = yield* Deferred.make<void>();
          const peerChecked = yield* Deferred.make<void>();
          const targetConnection = yield* withClient(
            host.wsUrl,
            `${host.sessions.cookieName}=${target.token}`,
            (client) =>
              Effect.gen(function* () {
                const subscription = yield* client[WS_METHODS.subscribeBackgroundPolicy]({}).pipe(
                  Stream.tap(() => Deferred.succeed(targetStarted, undefined)),
                  Stream.runDrain,
                  Effect.forkChild,
                );
                yield* Deferred.await(revoked);
                const denied = yield* client[WS_METHODS.serverGetSettings]({}).pipe(Effect.result);
                assert.equal(denied._tag, "Failure");
                if (denied._tag === "Failure")
                  assert.equal(denied.failure._tag, "EnvironmentAuthorizationError");
                yield* Deferred.succeed(rpcChecked, undefined);
                yield* Fiber.join(subscription);
              }),
          ).pipe(Effect.result, Effect.forkChild);
          const peerConnection = yield* withClient(
            host.wsUrl,
            `${host.sessions.cookieName}=${peer.token}`,
            (client) =>
              Effect.gen(function* () {
                const subscription = yield* client[WS_METHODS.subscribeBackgroundPolicy]({}).pipe(
                  Stream.tap(() => Deferred.succeed(peerStarted, undefined)),
                  Stream.runDrain,
                  Effect.forkChild,
                );
                yield* Deferred.await(checkPeer);
                yield* client[WS_METHODS.serverGetSettings]({});
                yield* Deferred.succeed(peerChecked, undefined);
                yield* Fiber.join(subscription);
              }),
          ).pipe(Effect.result, Effect.forkChild);
          yield* Deferred.await(targetStarted);
          yield* Deferred.await(peerStarted);
          assert.isTrue(yield* operator.revoke(target.sessionId));
          yield* Deferred.succeed(revoked, undefined);
          yield* Deferred.await(rpcChecked);
          assert.isUndefined(targetConnection.pollUnsafe());
          yield* TestClock.adjust(ClientConnectionRegistry.SESSION_REVALIDATION_INTERVAL);
          yield* Fiber.join(targetConnection);
          yield* Deferred.succeed(checkPeer, undefined);
          yield* Deferred.await(peerChecked);
          assert.isUndefined(peerConnection.pollUnsafe());
          assert.isTrue(yield* host.sessions.revoke(peer.sessionId));
          yield* Fiber.join(peerConnection);
        }).pipe(Effect.provide(AuthorityHttpServerLive)),
    );

    it.effect("records client.connected only once, and only after WebSocket admission", () =>
      Effect.gen(function* () {
        const host = yield* buildAuthorityHost;
        const recorded: Array<string> = [];
        const analytics = AnalyticsService.AnalyticsService.of({
          record: (event) => Effect.sync(() => void recorded.push(event)),
          flush: Effect.void,
          recordOwners: (_owners, observedBy) =>
            Effect.sync(() => void recorded.push(`owners:${observedBy}`)),
        });
        const serve = (session: SessionStore.VerifiedSession) =>
          serveAdmittedWebSocketConnection(
            {
              connections: host.connections,
              sessions: host.sessions,
              session,
              clientOrigin: { surface: "web" },
              analytics,
              clientAnalyticsProps: { surface: "web" },
              clientOwners: [],
            },
            Effect.succeed(HttpServerResponse.empty()),
          );

        const refusedIssued = yield* host.sessions.issue({});
        const refused = yield* host.sessions.verify(refusedIssued.token);
        yield* host.sessions.revoke(refused.sessionId);
        const refusal = yield* serve(refused).pipe(Effect.flip);
        assert.equal(refusal._tag, "EnvironmentAuthInvalidError");
        assert.deepEqual(recorded, []);

        const admittedIssued = yield* host.sessions.issue({});
        const admitted = yield* host.sessions.verify(admittedIssued.token);
        yield* serve(admitted);
        assert.deepEqual(recorded, ["client.connected", "owners:client"]);
      }).pipe(Effect.provide(AuthorityHttpServerLive)),
    );

    it.effect(
      "consumes a signed WebSocket ticket exactly once through the replacement transport",
      () =>
        Effect.gen(function* () {
          const host = yield* buildAuthorityHost;
          const issued = yield* host.sessions.issue({});
          const session = yield* host.sessions.verify(issued.token);
          const ticket = yield* host.auth.issueWebSocketTicket(session);
          const url = `${host.wsUrl}?wsTicket=${encodeURIComponent(ticket.ticket)}`;
          const page = yield* Effect.scoped(
            withClient(url, "", (client) => client[WS_METHODS.serverGetSettings]({})),
          );
          assert.deepEqual(page, DEFAULT_SERVER_SETTINGS);
          const reused = yield* HttpClient.get(`/ws?wsTicket=${encodeURIComponent(ticket.ticket)}`);
          assert.equal(reused.status, 401);
        }).pipe(Effect.provide(AuthorityHttpServerLive)),
    );
  },
);
