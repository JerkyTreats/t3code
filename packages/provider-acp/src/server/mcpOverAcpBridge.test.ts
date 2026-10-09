// The bridge intentionally treats MCP JSON-RPC messages as opaque JSON.
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Deferred from "effect/Deferred";

import { makeAcpMcpOverAcpBridge } from "./mcpOverAcpBridge.ts";

describe("AcpMcpOverAcpBridge", () => {
  it.effect("forwards authenticated MCP requests and closes the negotiated session", () =>
    Effect.gen(function* () {
      const requests: Array<{
        readonly method: string;
        readonly headers: Headers;
        readonly body: unknown;
      }> = [];
      const bridge = yield* makeAcpMcpOverAcpBridge({
        servers: [
          {
            name: "t3-code",
            endpoint: "http://127.0.0.1:1/mcp",
            authorizationHeader: "Bearer bridge-test",
          },
        ],
        allocateConnectionId: Effect.succeed("connection-1"),
        fetchImplementation: async (_url, init) => {
          const method = init?.method ?? "GET";
          const headers = new Headers(init?.headers);
          const body = init?.body === undefined ? null : JSON.parse(String(init.body));
          requests.push({ method, headers, body });
          if (method === "DELETE") return new Response(null, { status: 204 });
          if (body === null || typeof body !== "object") return new Response(null, { status: 202 });
          const request = body as { readonly id?: unknown; readonly method?: unknown };
          if (request.method === "notifications/initialized") {
            return new Response(null, { status: 202 });
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result:
                request.method === "initialize"
                  ? { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: {} }
                  : { tools: [] },
            }),
            {
              headers: { "content-type": "application/json", "mcp-session-id": "session-42" },
            },
          );
        },
      });

      const connected = yield* bridge.connect({ serverId: "t3-code" });
      expect(connected).toEqual({ connectionId: "connection-1" });
      expect(
        yield* bridge.message({ connectionId: connected.connectionId, method: "initialize" }),
      ).toMatchObject({ protocolVersion: "2025-06-18" });
      expect(
        yield* bridge.message({ connectionId: connected.connectionId, method: "tools/list" }),
      ).toEqual({ tools: [] });
      yield* bridge.notification({
        connectionId: connected.connectionId,
        method: "notifications/initialized",
      });
      yield* bridge.disconnect({ connectionId: connected.connectionId });

      expect(requests[0]?.headers.get("authorization")).toBe("Bearer bridge-test");
      expect(requests[1]?.headers.get("mcp-session-id")).toBe("session-42");
      expect(requests[1]?.headers.get("mcp-protocol-version")).toBe("2025-06-18");
      expect(requests.at(-1)?.method).toBe("DELETE");
      expect(requests.at(-1)?.headers.get("mcp-session-id")).toBe("session-42");
    }),
  );

  it.effect("multiplexes admitted servers and invalidates removed or rotated bindings", () =>
    Effect.gen(function* () {
      const ids = yield* Ref.make(0);
      const requests: Array<{ url: string; method: string; headers: Headers }> = [];
      const root = {
        name: "t3-code" as const,
        endpoint: "http://synthetic/root",
        authorizationHeader: "Bearer root",
      };
      const board = {
        name: "t3-code-board" as const,
        endpoint: "http://synthetic/board",
        authorizationHeader: "Bearer board-read",
      };
      const prs = {
        name: "t3-code-pull-requests" as const,
        endpoint: "http://synthetic/pr",
        authorizationHeader: "Bearer pr",
      };
      const bridge = yield* makeAcpMcpOverAcpBridge({
        servers: [root, board, prs],
        allocateConnectionId: Ref.updateAndGet(ids, (id) => id + 1).pipe(Effect.map(String)),
        fetchImplementation: async (url, init) => {
          const method = init?.method ?? "POST";
          requests.push({ url, method, headers: new Headers(init?.headers) });
          if (method === "DELETE") return new Response(null, { status: 204 });
          const request: { id?: number; method: string } = JSON.parse(String(init?.body));
          if (request.id === undefined) return new Response(null, { status: 202 });
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: { protocolVersion: "2025-06-18", endpoint: url },
            }),
            {
              headers: { "content-type": "application/json", "mcp-session-id": `session:${url}` },
            },
          );
        },
      });
      const connected = yield* Effect.forEach([root, board, prs], (server) =>
        bridge.connect({ serverId: server.name }),
      );
      for (const connection of connected) {
        yield* bridge.message({ ...connection, method: "initialize" });
        yield* bridge.notification({ ...connection, method: "notifications/initialized" });
      }
      expect(requests.map((request) => request.url)).toEqual([
        root.endpoint,
        root.endpoint,
        board.endpoint,
        board.endpoint,
        prs.endpoint,
        prs.endpoint,
      ]);
      expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
        root.authorizationHeader,
        root.authorizationHeader,
        board.authorizationHeader,
        board.authorizationHeader,
        prs.authorizationHeader,
        prs.authorizationHeader,
      ]);
      expect(requests[3]?.headers.get("mcp-session-id")).toBe(`session:${board.endpoint}`);
      expect(requests[5]?.headers.get("mcp-session-id")).toBe(`session:${prs.endpoint}`);
      expect(yield* bridge.connect({ serverId: "t3-code-device" }).pipe(Effect.flip)).toMatchObject(
        { _tag: "AcpMcpOverAcpError" },
      );
      expect(yield* Ref.get(ids)).toBe(3);

      const rotated = {
        ...prs,
        endpoint: "http://synthetic/child-pr",
        authorizationHeader: "Bearer child-pr",
      };
      yield* bridge.replaceServers([board, rotated]);
      expect(
        requests
          .slice(-2)
          .map((request) => [request.method, request.url, request.headers.get("authorization")]),
      ).toEqual([
        ["DELETE", root.endpoint, root.authorizationHeader],
        ["DELETE", prs.endpoint, prs.authorizationHeader],
      ]);
      for (const old of [connected[0]!, connected[2]!]) {
        expect(
          yield* bridge.message({ ...old, method: "tools/list" }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "AcpMcpOverAcpError" });
      }
      expect(yield* bridge.connect({ serverId: "t3-code" }).pipe(Effect.flip)).toMatchObject({
        _tag: "AcpMcpOverAcpError",
      });
      yield* bridge.message({ ...connected[1]!, method: "tools/list" });
      const child = yield* bridge.connect({ serverId: prs.name });
      yield* bridge.message({ ...child, method: "initialize" });
      expect(requests.at(-1)?.headers.get("authorization")).toBe("Bearer child-pr");
      yield* bridge.dispose;
      expect(
        requests
          .slice(-2)
          .map((request) => [request.method, request.url, request.headers.get("mcp-session-id")]),
      ).toEqual([
        ["DELETE", board.endpoint, `session:${board.endpoint}`],
        ["DELETE", rotated.endpoint, `session:${rotated.endpoint}`],
      ]);
      yield* bridge.replaceServers([]);
      expect(yield* bridge.connect({ serverId: board.name }).pipe(Effect.flip)).toMatchObject({
        _tag: "AcpMcpOverAcpError",
      });
    }),
  );

  it.effect.each(["replace", "dispose"] as const)(
    "rejects a stale connection allocation after %s",
    (change) =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const bridge = yield* makeAcpMcpOverAcpBridge({
          servers: [
            {
              name: "t3-code-board",
              endpoint: "http://synthetic/old",
              authorizationHeader: "Bearer old",
            },
          ],
          allocateConnectionId: Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as("racing-connection"),
          ),
          fetchImplementation: () => Promise.reject(new Error("No stale connection may fetch")),
        });
        const connecting = yield* bridge
          .connect({ serverId: "t3-code-board" })
          .pipe(Effect.result, Effect.forkChild);
        yield* Deferred.await(started);
        if (change === "replace") {
          yield* bridge.replaceServers([
            {
              name: "t3-code-board",
              endpoint: "http://synthetic/new",
              authorizationHeader: "Bearer new",
            },
          ]);
        } else {
          yield* bridge.dispose;
        }
        yield* Deferred.succeed(release, undefined);
        expect(yield* Fiber.join(connecting)).toMatchObject({ _tag: "Failure" });
        expect(
          yield* bridge
            .message({ connectionId: "racing-connection", method: "tools/list" })
            .pipe(Effect.flip),
        ).toMatchObject({ _tag: "AcpMcpOverAcpError" });
        if (change === "dispose") {
          expect(
            yield* bridge.connect({ serverId: "t3-code-board" }).pipe(Effect.flip),
          ).toMatchObject({ _tag: "AcpMcpOverAcpError" });
        }
      }).pipe(Effect.scoped),
  );

  it.effect("aborts an in-flight HTTP request when the ACP call is interrupted", () =>
    Effect.gen(function* () {
      const started = Promise.withResolvers<AbortSignal>();
      const bridge = yield* makeAcpMcpOverAcpBridge({
        servers: [
          {
            name: "t3-code",
            endpoint: "http://127.0.0.1:1/mcp",
            authorizationHeader: "Bearer bridge-test",
          },
        ],
        allocateConnectionId: Effect.succeed("connection-1"),
        fetchImplementation: (_url, init) => {
          if (!init?.signal) throw new Error("Missing cancellation signal");
          started.resolve(init.signal);
          return new Promise<Response>(() => {});
        },
      });
      const connected = yield* bridge.connect({ serverId: "t3-code" });
      const request = yield* bridge
        .message({ connectionId: connected.connectionId, method: "tools/list" })
        .pipe(Effect.forkChild);
      const signal = yield* Effect.promise(() => started.promise);
      yield* Fiber.interrupt(request);
      expect(signal.aborted).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.effect("rejects unknown servers, connections, and oversized messages", () =>
    Effect.gen(function* () {
      const bridge = yield* makeAcpMcpOverAcpBridge({
        servers: [
          {
            name: "t3-code",
            endpoint: "http://127.0.0.1:1/mcp",
            authorizationHeader: "Bearer bridge-test",
          },
        ],
        allocateConnectionId: Effect.succeed("connection-1"),
        fetchImplementation: () => Promise.resolve(new Response(null, { status: 202 })),
      });

      expect(yield* bridge.connect({ serverId: "other" }).pipe(Effect.flip)).toMatchObject({
        _tag: "AcpMcpOverAcpError",
      });
      expect(
        yield* bridge.message({ connectionId: "missing", method: "tools/list" }).pipe(Effect.flip),
      ).toMatchObject({ _tag: "AcpMcpOverAcpError" });

      const connected = yield* bridge.connect({ serverId: "t3-code" });
      const failure = yield* bridge
        .message({
          connectionId: connected.connectionId,
          method: "tools/call",
          params: { payload: "x".repeat(8 * 1024 * 1024) },
        })
        .pipe(Effect.flip);
      expect(failure.message).toContain("exceeds 8 MiB");
    }),
  );
});
