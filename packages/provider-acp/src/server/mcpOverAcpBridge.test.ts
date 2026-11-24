import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Deferred from "effect/Deferred";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import * as TestClock from "effect/testing/TestClock";

import { makeAcpMcpOverAcpBridge } from "./mcpOverAcpBridge.ts";

describe("AcpMcpOverAcpBridge", () => {
  it.effect("forwards authenticated MCP requests and closes the negotiated session", () =>
    Effect.gen(function* () {
      const initializeStarted = Promise.withResolvers<void>();
      const initializeResponse = Promise.withResolvers<void>();
      const listQueued = Promise.withResolvers<void>();
      const deleteStarted = Promise.withResolvers<void>();
      const deleteResponse = Promise.withResolvers<void>();
      const requests: Array<{
        readonly method: string;
        readonly headers: Headers;
        readonly body: unknown;
      }> = [];
      let deletes = 0;
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
          if (method === "DELETE") {
            if (++deletes > 1) return new Response(null, { status: 204 });
            deleteStarted.resolve();
            await deleteResponse.promise;
            return new Response(null, { status: 503 });
          }
          if (body === null || typeof body !== "object") return new Response(null, { status: 202 });
          const request = body as { readonly id?: unknown; readonly method?: unknown };
          if (request.method === "initialize") {
            initializeStarted.resolve();
            await initializeResponse.promise;
          }
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
      const initialize = yield* bridge
        .message({ connectionId: connected.connectionId, method: "initialize" })
        .pipe(Effect.forkChild);
      yield* Effect.promise(() => initializeStarted.promise);
      const list = yield* Effect.gen(function* () {
        listQueued.resolve();
        return yield* bridge.message({
          connectionId: connected.connectionId,
          method: "tools/list",
        });
      }).pipe(Effect.forkChild);
      yield* Effect.promise(() => listQueued.promise);
      initializeResponse.resolve();
      expect(yield* Fiber.join(initialize)).toMatchObject({ protocolVersion: "2025-06-18" });
      expect(yield* Fiber.join(list)).toEqual({ tools: [] });
      yield* bridge.notification({
        connectionId: connected.connectionId,
        method: "notifications/initialized",
      });
      // Calls during a close are refused; a rejected close restores the connection for a retry.
      const rejected = yield* bridge
        .disconnect({ connectionId: connected.connectionId })
        .pipe(Effect.flip, Effect.forkChild);
      yield* Effect.promise(() => deleteStarted.promise);
      const closing = yield* bridge
        .message({ connectionId: connected.connectionId, method: "tools/list" })
        .pipe(Effect.flip);
      expect(closing.message).toContain("Unknown MCP-over-ACP connection");
      deleteResponse.resolve();
      expect((yield* Fiber.join(rejected)).message).toContain("HTTP 503");
      yield* bridge.disconnect({ connectionId: connected.connectionId });
      expect(deletes).toBe(2);

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
      const preview = {
        name: "t3-code-preview" as const,
        endpoint: "http://synthetic/preview",
        authorizationHeader: "Bearer preview-read",
      };
      const prs = {
        name: "t3-code-pull-requests" as const,
        endpoint: "http://synthetic/pr",
        authorizationHeader: "Bearer pr",
      };
      const bridge = yield* makeAcpMcpOverAcpBridge({
        servers: [root, preview, prs],
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
      const connected = yield* Effect.forEach([root, preview, prs], (server) =>
        bridge.connect({ serverId: server.name }),
      );
      for (const connection of connected) {
        yield* bridge.message({ ...connection, method: "initialize" });
        yield* bridge.notification({ ...connection, method: "notifications/initialized" });
      }
      expect(requests.map((request) => request.url)).toEqual([
        root.endpoint,
        root.endpoint,
        preview.endpoint,
        preview.endpoint,
        prs.endpoint,
        prs.endpoint,
      ]);
      expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
        root.authorizationHeader,
        root.authorizationHeader,
        preview.authorizationHeader,
        preview.authorizationHeader,
        prs.authorizationHeader,
        prs.authorizationHeader,
      ]);
      expect(requests[3]?.headers.get("mcp-session-id")).toBe(`session:${preview.endpoint}`);
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
      yield* bridge.replaceServers([preview, rotated]);
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
        ["DELETE", preview.endpoint, `session:${preview.endpoint}`],
        ["DELETE", rotated.endpoint, `session:${rotated.endpoint}`],
      ]);
      yield* bridge.replaceServers([]);
      expect(yield* bridge.connect({ serverId: preview.name }).pipe(Effect.flip)).toMatchObject({
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
              name: "t3-code-preview",
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
          .connect({ serverId: "t3-code-preview" })
          .pipe(Effect.result, Effect.forkChild);
        yield* Deferred.await(started);
        if (change === "replace") {
          yield* bridge.replaceServers([
            {
              name: "t3-code-preview",
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
            yield* bridge.connect({ serverId: "t3-code-preview" }).pipe(Effect.flip),
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
    }),
  );

  it.effect("answers a call while a long call on the same connection is pending", () =>
    Effect.gen(function* () {
      const waitStarted = Promise.withResolvers<void>();
      const waitResponse = Promise.withResolvers<Response>();
      const reply = (id: unknown, result: unknown) =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
          headers: { "content-type": "application/json", "mcp-session-id": "session-42" },
        });
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
          const request = JSON.parse(String(init?.body)) as {
            readonly id?: unknown;
            readonly method?: unknown;
          };
          if (request.method === "initialize") {
            return Promise.resolve(reply(request.id, { protocolVersion: "2025-06-18" }));
          }
          if (request.method === "tools/call") {
            waitStarted.resolve();
            return waitResponse.promise;
          }
          return Promise.resolve(reply(request.id, { tools: [] }));
        },
      });
      const { connectionId } = yield* bridge.connect({ serverId: "t3-code" });
      yield* bridge.message({ connectionId, method: "initialize" });

      const wait = yield* bridge
        .message({ connectionId, method: "tools/call", params: { name: "t3_thread_wait" } })
        .pipe(Effect.forkChild);
      yield* Effect.promise(() => waitStarted.promise);
      expect(yield* bridge.message({ connectionId, method: "tools/list" })).toEqual({ tools: [] });

      waitResponse.resolve(reply(2, { content: [] }));
      expect(yield* Fiber.join(wait)).toEqual({ content: [] });
    }),
  );

  it.effect("closes all MCP sessions within one disconnect timeout during runtime cleanup", () =>
    Effect.gen(function* () {
      const deleteStarted = Promise.withResolvers<void>();
      const deleteResponse = Promise.withResolvers<Response>();
      const deleteSignals: AbortSignal[] = [];
      let nextConnectionId = 0;
      const bridge = yield* makeAcpMcpOverAcpBridge({
        servers: [
          {
            name: "t3-code",
            endpoint: "http://127.0.0.1:1/mcp",
            authorizationHeader: "Bearer bridge-test",
          },
        ],
        allocateConnectionId: Effect.sync(() => `connection-${++nextConnectionId}`),
        fetchImplementation: (_url, init) => {
          if (init?.method === "DELETE") {
            if (!init.signal) throw new Error("Missing cancellation signal");
            deleteSignals.push(init.signal);
            deleteStarted.resolve();
            return deleteResponse.promise;
          }
          const request = JSON.parse(String(init?.body)) as { readonly id: number };
          return Promise.resolve(
            new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: request.id,
                result: { protocolVersion: "2025-06-18" },
              }),
              {
                headers: {
                  "content-type": "application/json",
                  "mcp-session-id": `session-${nextConnectionId}`,
                },
              },
            ),
          );
        },
      });
      for (let index = 0; index < 16; index++) {
        const { connectionId } = yield* bridge.connect({ serverId: "t3-code" });
        yield* bridge.message({ connectionId, method: "initialize" });
      }
      const scope = yield* Scope.make();
      yield* Scope.addFinalizer(scope, bridge.dispose);
      const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild);
      yield* Effect.gen(function* () {
        yield* Effect.promise(() => deleteStarted.promise);
        yield* TestClock.adjust("5 seconds");
        expect(closing.pollUnsafe(), "All sessions must close within one timeout").toBeDefined();
        expect(deleteSignals).toHaveLength(16);
        expect(deleteSignals.every((signal) => signal.aborted)).toBe(true);
      }).pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            deleteResponse.resolve(new Response(null, { status: 204 }));
            yield* Fiber.join(closing);
          }),
        ),
      );
    }),
  );

  it.effect("a rotated binding whose DELETE never answers cannot hold other endpoints", () =>
    Effect.gen(function* () {
      const deletes: Array<string> = [];
      let nextConnectionId = 0;
      const servers = [
        { name: "t3-code", endpoint: "http://synthetic/root", authorizationHeader: "Bearer root" },
        {
          name: "t3-code-pull-requests",
          endpoint: "http://synthetic/pr",
          authorizationHeader: "Bearer pr",
        },
      ] as const;
      const bridge = yield* makeAcpMcpOverAcpBridge({
        servers,
        allocateConnectionId: Effect.sync(() => `connection-${++nextConnectionId}`),
        fetchImplementation: (url, init) => {
          if (init?.method === "DELETE") {
            deletes.push(url);
            // The rotated root endpoint never answers its first close.
            return url === "http://synthetic/root" && deletes.length === 1
              ? new Promise<Response>(() => undefined)
              : Promise.resolve(new Response(null, { status: 204 }));
          }
          const request = JSON.parse(String(init?.body)) as { readonly id: number };
          return Promise.resolve(
            new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: request.id,
                result: { protocolVersion: "2025-06-18" },
              }),
              {
                headers: { "content-type": "application/json", "mcp-session-id": `s-${url}` },
              },
            ),
          );
        },
      });
      const root = yield* bridge.connect({ serverId: "t3-code" });
      yield* bridge.message({ connectionId: root.connectionId, method: "initialize" });
      const pr = yield* bridge.connect({ serverId: "t3-code-pull-requests" });
      yield* bridge.message({ connectionId: pr.connectionId, method: "initialize" });

      const replacing = yield* bridge
        .replaceServers([{ ...servers[0], authorizationHeader: "Bearer rotated" }, servers[1]])
        .pipe(Effect.forkChild);
      yield* TestClock.adjust("5 seconds");
      yield* Fiber.join(replacing);
      // The untouched endpoint keeps its session; the timed-out close stays retryable.
      expect(
        yield* bridge.message({ connectionId: pr.connectionId, method: "tools/list" }),
      ).toMatchObject({ protocolVersion: "2025-06-18" });
      expect(
        (yield* bridge
          .message({ connectionId: root.connectionId, method: "tools/list" })
          .pipe(Effect.flip)).message,
      ).toContain("closed");
      yield* bridge.dispose;
      expect([...deletes].sort()).toEqual([
        "http://synthetic/pr",
        "http://synthetic/root",
        "http://synthetic/root",
      ]);
    }),
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
