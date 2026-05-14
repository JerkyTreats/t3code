import { WsRpcGroup } from "@t3tools/contracts";
import { Data, Duration, Effect, Layer, Schedule } from "effect";
import { RpcClient, RpcSerialization } from "effect/unstable/rpc";
import * as Socket from "effect/unstable/socket/Socket";

import { resolveServerUrl } from "../lib/utils";
import {
  acknowledgeRpcRequest,
  clearAllTrackedRpcRequests,
  trackRpcRequestSent,
} from "./requestLatencyState";
import {
  getWsReconnectDelayMsForRetry,
  recordWsConnectionAttempt,
  recordWsConnectionClosed,
  recordWsConnectionErrored,
  recordWsConnectionOpened,
  WS_RECONNECT_MAX_RETRIES,
} from "./wsConnectionState";

export interface WsProtocolLifecycleHandlers {
  readonly isActive?: () => boolean;
  readonly onAttempt?: (socketUrl: string) => void;
  readonly onOpen?: () => void;
  readonly onError?: (message: string) => void;
  readonly onClose?: (details: { readonly code: number; readonly reason: string }) => void;
}
export const makeWsRpcProtocolClient = RpcClient.make(WsRpcGroup);

type RpcClientFactory = typeof makeWsRpcProtocolClient;
export type WsRpcProtocolClient =
  RpcClientFactory extends Effect.Effect<infer Client, any, any> ? Client : never;

class WsProtocolUrlError extends Data.TaggedError("WsProtocolUrlError")<{
  readonly detail: string;
  readonly cause: unknown;
}> {}

function formatSocketErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

function resolveWsRpcSocketUrl(rawUrl: string): string {
  const resolved = new URL(rawUrl);
  if (resolved.protocol !== "ws:" && resolved.protocol !== "wss:") {
    throw new Error(`Unsupported websocket transport URL protocol: ${resolved.protocol}`);
  }

  resolved.pathname = "/ws";
  return resolved.toString();
}

function defaultLifecycleHandlers(): Required<WsProtocolLifecycleHandlers> {
  return {
    isActive: () => true,
    onAttempt: recordWsConnectionAttempt,
    onOpen: recordWsConnectionOpened,
    onError: (message) => {
      clearAllTrackedRpcRequests();
      recordWsConnectionErrored(message);
    },
    onClose: (details) => {
      clearAllTrackedRpcRequests();
      recordWsConnectionClosed(details);
    },
  };
}

function composeLifecycleHandlers(
  handlers?: WsProtocolLifecycleHandlers,
): Required<WsProtocolLifecycleHandlers> {
  const defaults = defaultLifecycleHandlers();
  const isActive = handlers?.isActive ?? (() => true);

  return {
    isActive,
    onAttempt: (socketUrl) => {
      if (!isActive()) {
        return;
      }
      defaults.onAttempt(socketUrl);
      handlers?.onAttempt?.(socketUrl);
    },
    onOpen: () => {
      if (!isActive()) {
        return;
      }
      defaults.onOpen();
      handlers?.onOpen?.();
    },
    onError: (message) => {
      if (!isActive()) {
        return;
      }
      defaults.onError(message);
      handlers?.onError?.(message);
    },
    onClose: (details) => {
      if (!isActive()) {
        return;
      }
      defaults.onClose(details);
      handlers?.onClose?.(details);
    },
  };
}

export function createWsRpcProtocolLayer(url?: string, handlers?: WsProtocolLifecycleHandlers) {
  const lifecycle = composeLifecycleHandlers(handlers);
  const resolvedServerUrl = resolveServerUrl({
    url,
    protocol: window.location.protocol === "https:" ? "wss" : "ws",
    pathname: "/ws",
  });
  const resolvedUrl = Effect.try({
    try: () => resolveWsRpcSocketUrl(resolvedServerUrl),
    catch: (error) => {
      const detail = formatSocketErrorMessage(error);
      lifecycle.onError(detail);
      return new WsProtocolUrlError({ detail, cause: error });
    },
  }).pipe(Effect.orDie);
  const trackingWebSocketConstructorLayer = Layer.succeed(
    Socket.WebSocketConstructor,
    (socketUrl, protocols) => {
      lifecycle.onAttempt(socketUrl);
      const socket = new globalThis.WebSocket(socketUrl, protocols);

      socket.addEventListener(
        "open",
        () => {
          lifecycle.onOpen();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          lifecycle.onError("Unable to connect to the T3 server WebSocket.");
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        (event) => {
          lifecycle.onClose({
            code: event.code,
            reason: event.reason,
          });
        },
        { once: true },
      );

      return socket;
    },
  );
  const socketLayer = Socket.layerWebSocket(resolvedUrl).pipe(
    Layer.provide(trackingWebSocketConstructorLayer),
  );
  const retryPolicy = Schedule.addDelay(Schedule.recurs(WS_RECONNECT_MAX_RETRIES), (retryCount) =>
    Effect.succeed(Duration.millis(getWsReconnectDelayMsForRetry(retryCount) ?? 0)),
  );
  const protocolLayer = Layer.effect(
    RpcClient.Protocol,
    Effect.map(
      RpcClient.makeProtocolSocket({
        retryPolicy,
        retryTransientErrors: true,
      }),
      (protocol) => ({
        ...protocol,
        run: (clientId, writeResponse) =>
          protocol.run(clientId, (response) => {
            if (response._tag === "Chunk" || response._tag === "Exit") {
              acknowledgeRpcRequest(response.requestId);
            } else if (response._tag === "ClientProtocolError" || response._tag === "Defect") {
              clearAllTrackedRpcRequests();
            }
            return writeResponse(response);
          }),
        send: (clientId, request, transferables) => {
          if (request._tag === "Request") {
            trackRpcRequestSent(request.id, request.tag);
          }
          return protocol.send(clientId, request, transferables);
        },
      }),
    ),
  );

  return protocolLayer.pipe(Layer.provide(Layer.mergeAll(socketLayer, RpcSerialization.layerJson)));
}
