import { type ServerConfig, WS_METHODS } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import type * as Scope from "effect/Scope";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as Socket from "effect/unstable/socket/Socket";

import { makeWsRpcProtocolClient, type WsRpcProtocolClient } from "./protocol.ts";
import {
  sanitizeDiagnosticText,
  sanitizeDiagnosticUrl,
  type RpcSessionDiagnosticEvent,
  type RpcSessionDiagnosticEventInput,
  type RpcSessionProbeDiagnosticEvent,
} from "../connection/diagnostics.ts";
import type {
  ConnectionAttemptError,
  ConnectionTransientError,
  PreparedConnection,
} from "../connection/model.ts";
import {
  ConnectionBlockedError,
  ConnectionTransientError as ConnectionTransientErrorClass,
} from "../connection/model.ts";

const SOCKET_OPEN_TIMEOUT = "15 seconds";
const MAX_RPC_SESSION_DIAGNOSTIC_EVENTS = 16;

let nextRpcSessionId = 0;

export interface RpcSession {
  readonly client: WsRpcProtocolClient;
  readonly initialConfig: Effect.Effect<ServerConfig, ConnectionAttemptError>;
  readonly ready: Effect.Effect<void, ConnectionAttemptError>;
  readonly probe: Effect.Effect<void, ConnectionAttemptError>;
  readonly recordProbeTimeout?: (durationMs: number) => Effect.Effect<void>;
  readonly closed: Effect.Effect<never, ConnectionTransientError>;
  readonly diagnosticEvents?: SubscriptionRef.SubscriptionRef<
    ReadonlyArray<RpcSessionDiagnosticEvent>
  >;
  readonly probeDiagnosticEvents?: SubscriptionRef.SubscriptionRef<
    ReadonlyArray<RpcSessionProbeDiagnosticEvent>
  >;
}

export class RpcSessionFactory extends Context.Service<
  RpcSessionFactory,
  {
    readonly connect: (
      connection: PreparedConnection,
    ) => Effect.Effect<RpcSession, ConnectionAttemptError, Scope.Scope>;
  }
>()("@t3tools/client-runtime/rpc/session/RpcSessionFactory") {}

type InitialConfigError = Effect.Error<
  ReturnType<WsRpcProtocolClient[typeof WS_METHODS.serverGetConfig]>
>;

function mapInitialConfigError(error: InitialConfigError): ConnectionAttemptError {
  switch (error._tag) {
    case "EnvironmentAuthorizationError":
      return new ConnectionBlockedError({
        reason: "permission",
        detail: error.message,
      });
    case "KeybindingsConfigParseError":
    case "ServerSettingsError":
      return new ConnectionTransientErrorClass({
        reason: "remote-unavailable",
        detail: error.message,
      });
    case "RpcClientError":
      return new ConnectionTransientErrorClass({
        reason: "transport",
        detail: error.message,
      });
  }
}

export const make = Effect.gen(function* () {
  const webSocketConstructor = yield* Socket.WebSocketConstructor;

  const connect = Effect.fnUntraced(function* (connection: PreparedConnection) {
    yield* Effect.annotateCurrentSpan({
      "connection.environment.id": connection.environmentId,
    });

    nextRpcSessionId += 1;
    const sessionId = nextRpcSessionId;
    let nextDiagnosticEventId = 0;
    let intentionalClose = false;
    let lastCloseCode: number | null = null;
    let lastCloseReason: string | null = null;
    let connectedAtMs: number | null = null;
    const initialObservedAtMs = yield* Clock.currentTimeMillis;
    const diagnosticEvents = yield* SubscriptionRef.make<ReadonlyArray<RpcSessionDiagnosticEvent>>([
      {
        id: `${sessionId}:1`,
        type: "attempt",
        observedAtMs: initialObservedAtMs,
        socketUrl: sanitizeDiagnosticUrl(connection.socketUrl),
      },
    ]);
    nextDiagnosticEventId = 1;
    const probeDiagnosticEvents = yield* SubscriptionRef.make<
      ReadonlyArray<RpcSessionProbeDiagnosticEvent>
    >([]);
    let nextProbeDiagnosticEventId = 0;
    const appendDiagnosticEvent = Effect.fnUntraced(function* (
      event: RpcSessionDiagnosticEventInput,
    ) {
      nextDiagnosticEventId += 1;
      yield* SubscriptionRef.update(diagnosticEvents, (current) =>
        [{ ...event, id: `${sessionId}:${nextDiagnosticEventId}` }, ...current].slice(
          0,
          MAX_RPC_SESSION_DIAGNOSTIC_EVENTS,
        ),
      );
    });
    const appendProbeDiagnosticEvent = Effect.fnUntraced(function* (
      event: Omit<RpcSessionProbeDiagnosticEvent, "id">,
    ) {
      nextProbeDiagnosticEventId += 1;
      yield* SubscriptionRef.update(probeDiagnosticEvents, (current) =>
        [{ ...event, id: `${sessionId}:probe:${nextProbeDiagnosticEventId}` }, ...current].slice(
          0,
          MAX_RPC_SESSION_DIAGNOSTIC_EVENTS,
        ),
      );
    });

    const observedWebSocketConstructor: Socket.WebSocketConstructor["Service"] = (
      url,
      protocols,
    ) => {
      const socket = webSocketConstructor(url, protocols);
      socket.addEventListener(
        "close",
        (event) => {
          lastCloseCode = typeof event.code === "number" ? event.code : null;
          lastCloseReason = sanitizeDiagnosticText(event.reason);
        },
        { once: true },
      );
      return socket;
    };

    const connected = yield* Deferred.make<void>();
    const disconnected = yield* Deferred.make<never, ConnectionTransientError>();
    const hooks = RpcClient.ConnectionHooks.of({
      onConnect: Clock.currentTimeMillis.pipe(
        Effect.tap((observedAtMs) =>
          Effect.sync(() => {
            connectedAtMs = observedAtMs;
          }),
        ),
        Effect.flatMap((observedAtMs) =>
          appendDiagnosticEvent({
            type: "connected",
            observedAtMs,
            attemptDurationMs: Math.max(0, observedAtMs - initialObservedAtMs),
          }),
        ),
        Effect.andThen(Deferred.succeed(connected, undefined)),
        Effect.asVoid,
      ),
      onDisconnect: Deferred.isDone(connected).pipe(
        Effect.flatMap((wasConnected) =>
          Clock.currentTimeMillis.pipe(
            Effect.flatMap((observedAtMs) =>
              appendDiagnosticEvent({
                type: "disconnected",
                observedAtMs,
                closeCode: lastCloseCode,
                closeReason: lastCloseReason,
                intentional: intentionalClose,
                wasConnected,
                attemptDurationMs: Math.max(
                  0,
                  (connectedAtMs ?? observedAtMs) - initialObservedAtMs,
                ),
                connectionDurationMs:
                  connectedAtMs === null ? null : Math.max(0, observedAtMs - connectedAtMs),
              }),
            ),
            Effect.andThen(
              Deferred.fail(
                disconnected,
                new ConnectionTransientErrorClass({
                  reason: "transport",
                  detail: wasConnected
                    ? `${connection.label} disconnected.`
                    : `${connection.label} could not establish a WebSocket connection.`,
                }),
              ),
            ),
          ),
        ),
        Effect.asVoid,
      ),
    });
    const socketLayer = Socket.layerWebSocket(connection.socketUrl, {
      openTimeout: SOCKET_OPEN_TIMEOUT,
    }).pipe(
      Layer.provide(Layer.succeed(Socket.WebSocketConstructor, observedWebSocketConstructor)),
    );
    const protocolLayer = Layer.effect(
      RpcClient.Protocol,
      RpcClient.makeProtocolSocket({
        retryTransientErrors: false,
        retryPolicy: Schedule.recurs(0),
      }),
    ).pipe(
      Layer.provide(
        Layer.mergeAll(
          socketLayer,
          RpcSerialization.layerJson,
          Layer.succeed(RpcClient.ConnectionHooks, hooks),
        ),
      ),
    );
    const protocolContext = yield* Layer.build(protocolLayer).pipe(
      Effect.withSpan("environment.websocket.connect"),
    );
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        intentionalClose = true;
      }),
    );
    const client = yield* makeWsRpcProtocolClient.pipe(Effect.provide(protocolContext));
    const initialConfig = yield* Effect.cached(
      client[WS_METHODS.serverGetConfig]({}).pipe(
        Effect.mapError(mapInitialConfigError),
        Effect.withSpan("environment.initialSync"),
      ),
    );
    const probe = Effect.gen(function* () {
      const startedAtMs = yield* Clock.currentTimeMillis;
      return yield* client[WS_METHODS.serverGetConfig]({}).pipe(
        Effect.mapError(mapInitialConfigError),
        Effect.asVoid,
        Effect.tap(() =>
          Clock.currentTimeMillis.pipe(
            Effect.flatMap((observedAtMs) =>
              appendProbeDiagnosticEvent({
                observedAtMs,
                durationMs: Math.max(0, observedAtMs - startedAtMs),
                error: null,
              }),
            ),
          ),
        ),
        Effect.tapError((error) =>
          Clock.currentTimeMillis.pipe(
            Effect.flatMap((observedAtMs) =>
              appendProbeDiagnosticEvent({
                observedAtMs,
                durationMs: Math.max(0, observedAtMs - startedAtMs),
                error: sanitizeDiagnosticText(error.message),
              }),
            ),
          ),
        ),
      );
    }).pipe(Effect.withSpan("clientRuntime.connection.rpcSession.probe"));
    const recordProbeTimeout = (durationMs: number) =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((observedAtMs) =>
          appendProbeDiagnosticEvent({
            observedAtMs,
            durationMs: Math.max(0, durationMs),
            error: "Connection health check timed out.",
          }),
        ),
      );

    return {
      client,
      initialConfig,
      ready: Deferred.await(connected).pipe(
        Effect.andThen(initialConfig),
        Effect.asVoid,
        Effect.raceFirst(Deferred.await(disconnected)),
      ),
      probe,
      recordProbeTimeout,
      closed: Deferred.await(disconnected),
      diagnosticEvents,
      probeDiagnosticEvents,
    } satisfies RpcSession;
  });

  return RpcSessionFactory.of({ connect });
});

export const layer = Layer.effect(RpcSessionFactory, make);
