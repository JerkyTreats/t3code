// The bridge forwards opaque JSON-RPC values without interpreting their schemas.
// @effect-diagnostics preferSchemaOverJson:off
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import type * as AcpSchema from "effect-acp/compat";

import type { McpProviderServerAttachment } from "@t3tools/provider-core/server/mcpSession";

import { responsePayloads } from "@t3tools/shared/mcpResponsePayloads";

const MAX_CONNECTIONS = 16;
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;

interface JsonRpcEnvelope {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly error?: unknown;
  readonly result?: unknown;
}

interface Connection {
  readonly serverId: string;
  readonly endpoint: string;
  readonly authorization: string;
  closed: boolean;
  readonly mutex: Semaphore.Semaphore;
  sessionId: string | null;
  protocolVersion: string | null;
  nextRequestId: number;
}

export class AcpMcpOverAcpError extends Error {
  readonly _tag = "AcpMcpOverAcpError";
  override readonly name = "AcpMcpOverAcpError";
}

const bridgeError = (cause: unknown): AcpMcpOverAcpError =>
  cause instanceof AcpMcpOverAcpError
    ? cause
    : new AcpMcpOverAcpError(cause instanceof Error ? cause.message : String(cause), { cause });

const asEnvelope = (value: unknown): JsonRpcEnvelope | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRpcEnvelope)
    : null;

function protocolVersionOf(payload: unknown): string | null {
  const result = asEnvelope(payload)?.result;
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
  const protocolVersion = (result as { readonly protocolVersion?: unknown }).protocolVersion;
  return typeof protocolVersion === "string" && protocolVersion.length > 0 ? protocolVersion : null;
}

function errorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return "The MCP server returned an error.";
  }
  const message = (error as { readonly message?: unknown }).message;
  return typeof message === "string" && message.length > 0
    ? message
    : "The MCP server returned an error.";
}

export interface AcpMcpOverAcpBridgeOptions {
  readonly servers: ReadonlyArray<
    Pick<McpProviderServerAttachment, "name" | "endpoint" | "authorizationHeader">
  >;
  readonly allocateConnectionId: Effect.Effect<string>;
  readonly fetchImplementation?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface AcpMcpOverAcpBridge {
  readonly connect: (
    request: AcpSchema.ConnectMcpRequest,
  ) => Effect.Effect<AcpSchema.ConnectMcpResponse, AcpMcpOverAcpError>;
  readonly message: (
    request: AcpSchema.MessageMcpRequest,
  ) => Effect.Effect<AcpSchema.MessageMcpResponse, AcpMcpOverAcpError>;
  readonly notification: (
    request: AcpSchema.MessageMcpNotification,
  ) => Effect.Effect<void, AcpMcpOverAcpError>;
  readonly disconnect: (
    request: AcpSchema.DisconnectMcpRequest,
  ) => Effect.Effect<AcpSchema.DisconnectMcpResponse, AcpMcpOverAcpError>;
  readonly replaceServers: (servers: AcpMcpOverAcpBridgeOptions["servers"]) => Effect.Effect<void>;
  readonly dispose: Effect.Effect<void>;
}

/** Bridges the unstable ACP transport to T3's authenticated streamable-HTTP MCP endpoint. */
export const makeAcpMcpOverAcpBridge = Effect.fn("AcpMcpOverAcpBridge.make")(
  (options: AcpMcpOverAcpBridgeOptions): Effect.Effect<AcpMcpOverAcpBridge> =>
    Effect.sync(() => {
      const fetchImplementation = options.fetchImplementation ?? fetch;
      const connections = new Map<string, Connection>();
      const serverMap = (attachments: AcpMcpOverAcpBridgeOptions["servers"]) =>
        new Map(
          attachments.map((server) => [
            server.name as string,
            { endpoint: server.endpoint, authorization: server.authorizationHeader },
          ]),
        );
      let servers = serverMap(options.servers);
      let disposed = false;

      const connectionFor = (connectionId: string): Effect.Effect<Connection, AcpMcpOverAcpError> =>
        Effect.suspend(() => {
          const connection = connections.get(connectionId);
          return connection === undefined
            ? Effect.fail(
                new AcpMcpOverAcpError(`Unknown MCP-over-ACP connection "${connectionId}".`),
              )
            : Effect.succeed(connection);
        });

      const send = (
        connection: Connection,
        message: unknown,
      ): Effect.Effect<ReadonlyArray<unknown>, AcpMcpOverAcpError> =>
        connection.mutex.withPermits(1)(
          Effect.gen(function* () {
            if (connection.closed)
              return yield* Effect.fail(
                new AcpMcpOverAcpError("MCP-over-ACP connection is closed."),
              );
            const body = JSON.stringify(message);
            if (Buffer.byteLength(body) > MAX_MESSAGE_BYTES) {
              return yield* Effect.fail(
                new AcpMcpOverAcpError("MCP-over-ACP message exceeds 8 MiB."),
              );
            }
            const response = yield* Effect.tryPromise({
              try: (signal) =>
                fetchImplementation(connection.endpoint, {
                  method: "POST",
                  signal,
                  headers: {
                    "content-type": "application/json",
                    accept: "application/json, text/event-stream",
                    authorization: connection.authorization,
                    ...(connection.sessionId === null
                      ? {}
                      : { "mcp-session-id": connection.sessionId }),
                    ...(connection.protocolVersion === null
                      ? {}
                      : { "mcp-protocol-version": connection.protocolVersion }),
                  },
                  body,
                }),
              catch: bridgeError,
            });
            connection.sessionId = response.headers.get("mcp-session-id") ?? connection.sessionId;
            if (!response.ok) {
              yield* Effect.promise(
                () => response.body?.cancel().catch(() => undefined) ?? Promise.resolve(),
              );
              return yield* Effect.fail(
                new AcpMcpOverAcpError(
                  `T3 Code MCP endpoint responded with HTTP ${response.status}.`,
                ),
              );
            }
            const payloads = [
              ...(yield* Stream.runCollect(responsePayloads(response, bridgeError))),
            ];
            for (const payload of payloads) {
              connection.protocolVersion = protocolVersionOf(payload) ?? connection.protocolVersion;
            }
            return payloads;
          }).pipe(Effect.mapError(bridgeError)),
        );

      const disconnect = (
        request: AcpSchema.DisconnectMcpRequest,
      ): Effect.Effect<AcpSchema.DisconnectMcpResponse, AcpMcpOverAcpError> =>
        Effect.gen(function* () {
          const connection = yield* connectionFor(request.connectionId);
          connections.delete(request.connectionId);
          connection.closed = true;
          return yield* connection.mutex.withPermits(1)(
            Effect.gen(function* () {
              const sessionId = connection.sessionId;
              if (sessionId !== null) {
                const response = yield* Effect.tryPromise({
                  try: (signal) =>
                    fetchImplementation(connection.endpoint, {
                      method: "DELETE",
                      signal,
                      headers: {
                        authorization: connection.authorization,
                        "mcp-session-id": sessionId,
                        ...(connection.protocolVersion === null
                          ? {}
                          : { "mcp-protocol-version": connection.protocolVersion }),
                      },
                    }),
                  catch: bridgeError,
                });
                if (!response.ok && response.status !== 404) {
                  return yield* Effect.fail(
                    new AcpMcpOverAcpError(
                      `T3 Code MCP endpoint rejected disconnect with HTTP ${response.status}.`,
                    ),
                  );
                }
                yield* Effect.promise(
                  () => response.body?.cancel().catch(() => undefined) ?? Promise.resolve(),
                );
              }
              return {};
            }),
          );
        });

      return {
        connect: (request) =>
          Effect.gen(function* () {
            const server = servers.get(request.serverId);
            if (disposed || server === undefined) {
              return yield* Effect.fail(
                new AcpMcpOverAcpError(`Unknown ACP MCP server "${request.serverId}".`),
              );
            }
            if (connections.size >= MAX_CONNECTIONS) {
              return yield* Effect.fail(
                new AcpMcpOverAcpError("Too many MCP-over-ACP connections."),
              );
            }
            const connectionId = yield* options.allocateConnectionId;
            const mutex = yield* Semaphore.make(1);
            const current = servers.get(request.serverId);
            // Allocation can yield while another session replaces the admitted map.
            if (
              disposed ||
              current?.endpoint !== server.endpoint ||
              current.authorization !== server.authorization
            ) {
              return yield* Effect.fail(
                new AcpMcpOverAcpError("MCP server admission changed while connecting."),
              );
            }
            connections.set(connectionId, {
              serverId: request.serverId,
              endpoint: server.endpoint,
              authorization: server.authorization,
              closed: false,
              mutex,
              sessionId: null,
              protocolVersion: null,
              nextRequestId: 0,
            });
            return { connectionId };
          }),
        message: (request) =>
          Effect.gen(function* () {
            const connection = yield* connectionFor(request.connectionId);
            const id = ++connection.nextRequestId;
            const payloads = yield* send(connection, {
              jsonrpc: "2.0",
              id,
              method: request.method,
              ...(request.params == null ? {} : { params: request.params }),
            });
            const response = payloads.find((payload) => asEnvelope(payload)?.id === id);
            const envelope = asEnvelope(response);
            if (envelope === null) {
              return yield* Effect.fail(
                new AcpMcpOverAcpError("MCP server did not return a matching response."),
              );
            }
            if (envelope.error !== undefined) {
              return yield* Effect.fail(new AcpMcpOverAcpError(errorMessage(envelope.error)));
            }
            return (envelope.result ?? null) as AcpSchema.MessageMcpResponse;
          }),
        notification: (request) =>
          Effect.gen(function* () {
            const connection = yield* connectionFor(request.connectionId);
            yield* send(connection, {
              jsonrpc: "2.0",
              method: request.method,
              ...(request.params == null ? {} : { params: request.params }),
            });
          }),
        disconnect,
        replaceServers: (attachments) =>
          Effect.gen(function* () {
            if (disposed) return;
            servers = serverMap(attachments);
            // A thread or credential switch invalidates old connections before the
            // agent sees the new activation's descriptors. Retained bindings stay live.
            const stale = [...connections].filter(([, connection]) => {
              const server = servers.get(connection.serverId);
              return (
                server?.endpoint !== connection.endpoint ||
                server.authorization !== connection.authorization
              );
            });
            yield* Effect.forEach(
              stale,
              ([connectionId]) => disconnect({ connectionId }).pipe(Effect.ignore),
              { discard: true },
            );
          }),
        dispose: Effect.suspend(() => {
          disposed = true;
          servers = new Map();
          return Effect.forEach(
            [...connections.keys()],
            (connectionId) => disconnect({ connectionId }).pipe(Effect.ignore),
            { discard: true },
          );
        }),
      };
    }),
);
