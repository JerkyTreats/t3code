import { expect, it } from "@effect/vitest";
import { NodeHttpServer } from "@effect/platform-node";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  BoardAuthorId,
  CommandId,
  EnvironmentId,
  PreviewTabId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { McpProtocol, McpSchema, McpServer } from "effect/unstable/ai";
import { HttpBody, HttpClient, HttpRouter, HttpServerResponse } from "effect/unstable/http";

import * as McpHttpServer from "./McpHttpServer.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";
import * as PreviewAutomationBroker from "./PreviewAutomationBroker.ts";
import * as Board from "../orchestration/Services/Board.ts";
import * as BoardQuery from "../orchestration/Services/BoardQuery.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationLayerLive } from "../orchestration/runtimeLayer.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { ServerConfig } from "../config.ts";
import * as RepositoryIdentityResolver from "../project/RepositoryIdentityResolver.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";

const environmentId = EnvironmentId.make("environment-mcp-test");
const threadId = ThreadId.make("thread-mcp-test");
const tabId = PreviewTabId.make("tab-mcp-test");
const alternateTabId = PreviewTabId.make("tab-mcp-alternate");
const invocation = {
  environmentId,
  threadId,
  providerSessionId: "provider-session-mcp-test",
  boardAuthorId: BoardAuthorId.make("board-author-mcp-test"),
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["preview"] as const),
  issuedAt: 1,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});
const TestLayer = McpHttpServer.PreviewToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provideMerge(PreviewAutomationBroker.layer.pipe(Layer.provide(NodeServices.layer))),
);

it.effect(
  "rechecks a live credential's mode and authorship through HTTP and durable Board hosts",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const engine = yield* OrchestrationEngineService;
        const board = yield* Board.Board;
        const query = yield* BoardQuery.BoardQuery;
        const registry = yield* McpSessionRegistry.__testing.make().pipe(
          Effect.provideService(
            ServerEnvironment.ServerEnvironment,
            ServerEnvironment.ServerEnvironment.of({
              getEnvironmentId: Effect.succeed(environmentId),
              getDescriptor: Effect.die("unused"),
            }),
          ),
        );
        const createdAt = "2026-09-05T00:00:00.000Z";
        const projectId = ProjectId.make("http-board-project");
        const modelSelection = {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5-codex",
        };
        yield* engine.dispatch({
          type: "project.create",
          commandId: CommandId.make("http-board-project"),
          projectId,
          title: "Board HTTP",
          workspaceRoot: "/workspace/http-board",
          defaultModelSelection: modelSelection,
          createdAt,
        });
        yield* engine.dispatch({
          type: "thread.create",
          commandId: CommandId.make("http-board-thread"),
          threadId,
          projectId,
          title: "Board HTTP",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt,
        });

        const issued = yield* registry.issue({
          threadId,
          providerInstanceId: modelSelection.instanceId,
          capabilities: new Set(["board", "board-write"]),
        });
        const authorization = issued.config.authorizationHeader;
        const trusted = yield* registry.resolve(authorization.slice("Bearer ".length));
        expect(trusted).toBeDefined();
        const routes = McpHttpServer.layer.pipe(
          Layer.provide(Layer.succeed(McpSessionRegistry.McpSessionRegistry, registry)),
          Layer.provide(Layer.succeed(Board.Board, board)),
          Layer.provide(Layer.succeed(BoardQuery.BoardQuery, query)),
          Layer.provide(PreviewAutomationBroker.layer),
        );
        yield* HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true }).pipe(
          Layer.build,
        );
        const httpClient = yield* HttpClient.HttpClient;
        const initialized = yield* httpClient.post("/mcp", {
          headers: { accept: "application/json, text/event-stream", authorization },
          body: HttpBody.jsonUnsafe({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {},
              clientInfo: { name: "board-mode-proof", version: "1" },
            },
          }),
        });
        expect(initialized.status).toBe(200);
        const sessionId = initialized.headers["mcp-session-id"]!;
        let requestId = 2;
        const call = (name: string, input: object) =>
          Effect.gen(function* () {
            const response = yield* httpClient.post("/mcp", {
              headers: {
                accept: "application/json, text/event-stream",
                authorization,
                "mcp-session-id": sessionId,
                "mcp-protocol-version": "2025-06-18",
              },
              body: HttpBody.jsonUnsafe({
                jsonrpc: "2.0",
                id: requestId++,
                method: "tools/call",
                params: { name, arguments: input },
              }),
            });
            expect(response.status).toBe(200);
            return (yield* response.json) as { result: { isError?: boolean } };
          });
        const published = yield* call("board_post", {
          body: "Original claim",
          authorId: "forged-author",
          source: { threadId: "forged-thread" },
        });
        expect(published.result.isError ?? false).toBe(false);
        const original = (yield* query.getPage({})).posts[0]!;
        expect(original.author.id).toBe(trusted?.boardAuthorId);
        expect(original.source).toEqual({ projectId, threadId });

        yield* registry.setBoardWriteEnabled(threadId, false);
        expect((yield* call("board_read", {})).result.isError ?? false).toBe(false);
        expect(
          (yield* call("board_history", { postId: original.id })).result.isError ?? false,
        ).toBe(false);
        for (const [name, input] of [
          ["board_post", { body: "Denied publication" }],
          [
            "board_edit",
            { postId: original.id, expectedRevision: 1, body: "Denied correction", targets: [] },
          ],
        ] as const) {
          expect((yield* call(name, input)).result.isError).toBe(true);
        }
        expect((yield* query.getPage({})).posts).toEqual([original]);

        yield* registry.setBoardWriteEnabled(threadId, true);
        expect(
          (yield* call("board_edit", {
            postId: original.id,
            expectedRevision: 1,
            body: "Verified correction",
            targets: [],
          })).result.isError ?? false,
        ).toBe(false);
        const current = (yield* query.getPage({})).posts[0]!;
        expect(current.body).toBe("Verified correction");
        expect(current.sequence).toBe(original.sequence);
        expect(current.revision).toBe(2);
        expect(current.author).toEqual(original.author);
        expect(
          (yield* call("board_edit", {
            postId: original.id,
            expectedRevision: 1,
            body: "Stale correction",
            targets: [],
          })).result.isError,
        ).toBe(true);
        const revisions = yield* query.getHistory({ postId: original.id });
        expect(
          Option.isSome(revisions)
            ? revisions.value.revisions.map((revision) => revision.body)
            : [],
        ).toEqual(["Verified correction", "Original claim"]);
      }),
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          OrchestrationLayerLive.pipe(
            Layer.provide(RepositoryIdentityResolver.layer),
            Layer.provideMerge(SqlitePersistenceMemory),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), { prefix: "t3-board-http-proof-" }),
            ),
            Layer.provideMerge(NodeServices.layer),
          ),
          NodeHttpServer.layerTest,
        ),
      ),
    ),
);

it("normalizes empty successful notification responses to accepted", () => {
  const notificationResponse = McpHttpServer.normalizeMcpHttpResponse(
    HttpServerResponse.text("", { status: 200, contentType: "application/json" }),
  );
  expect(notificationResponse.status).toBe(202);

  const resultResponse = McpHttpServer.normalizeMcpHttpResponse(
    HttpServerResponse.jsonUnsafe({ jsonrpc: "2.0", id: 1, result: {} }),
  );
  expect(resultResponse.status).toBe(200);
});

it.effect("returns bounded structural preview snapshot failures", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const broker = yield* PreviewAutomationBroker.PreviewAutomationBroker;
      const events = yield* broker.connect({
        clientId: "mcp-failure-client",
        environmentId,
      });
      yield* Stream.runForEach(events, (event) =>
        event.type === "connected"
          ? Effect.void
          : broker.respond({
              clientId: "mcp-failure-client",
              connectionId: event.connectionId,
              requestId: event.request.requestId,
              ok: false,
              error: {
                _tag: "PreviewAutomationExecutionError",
                message: "sensitive renderer failure",
                detail: { consoleOutput: "sensitive browser output" },
              },
            }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const snapshot = yield* server
        .callTool({ name: "preview_snapshot", arguments: {} })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.provideService(McpSchema.McpServerClient, client),
        );

      expect(snapshot.isError).toBe(true);
      expect(snapshot.content).toEqual([{ type: "text", text: "Preview snapshot failed." }]);
      expect(snapshot.structuredContent).toEqual({
        error: {
          _tag: "PreviewAutomationExecutionError",
          operation: "snapshot",
          failureCount: 1,
        },
      });
    }),
  ).pipe(Effect.provide(TestLayer)),
);

it.effect("terminates HTTP MCP sessions with DELETE", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const serverLayer = McpServer.layerHttp({
        name: "MCP termination test",
        version: "1.0.0",
        path: "/mcp",
        protocols: [McpProtocol.v2025_06_18],
      });
      yield* HttpRouter.serve(serverLayer, {
        disableListenLog: true,
        disableLogger: true,
      }).pipe(Layer.build);
      const httpClient = yield* HttpClient.HttpClient;

      const initializeResponse = yield* httpClient.post("/mcp", {
        headers: { accept: "application/json, text/event-stream" },
        body: HttpBody.text(
          `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"mcp-test","version":"1.0.0"}}}`,
          "application/json",
        ),
      });
      const sessionId = initializeResponse.headers["mcp-session-id"];
      expect(initializeResponse.status).toBe(200);
      expect(sessionId).not.toBeNull();

      const missingSessionResponse = yield* httpClient.del("/mcp");
      expect(missingSessionResponse.status).toBe(400);

      const unknownSessionResponse = yield* httpClient.del("/mcp", {
        headers: { "mcp-session-id": "unknown-session" },
      });
      expect(unknownSessionResponse.status).toBe(404);

      const terminateResponse = yield* httpClient.del("/mcp", {
        headers: { "mcp-session-id": sessionId! },
      });
      expect(terminateResponse.status).toBe(204);

      const reusedSessionResponse = yield* httpClient.post("/mcp", {
        headers: {
          accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId!,
        },
        body: HttpBody.text(
          `{"jsonrpc":"2.0","id":2,"method":"ping","params":{}}`,
          "application/json",
        ),
      });
      expect(reusedSessionResponse.status).toBe(404);
    }),
  ).pipe(Effect.provide(NodeHttpServer.layerTest)),
);

it.effect("requires bearer authentication for the MCP server that registers Board tools", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const registry = McpSessionRegistry.McpSessionRegistry.of({
        issue: () => Effect.die("unused"),
        resolve: (token) =>
          Effect.succeed(
            token === "trusted-board-token"
              ? {
                  ...invocation,
                  capabilities: new Set<McpInvocationContext.McpCapability>(["board", "preview"]),
                }
              : undefined,
          ),
        touch: () => Effect.void,
        setBoardWriteEnabled: () => Effect.void,
        revokeProviderSession: () => Effect.void,
        revokeThread: () => Effect.void,
        revokeAll: Effect.void,
      });
      const board = Board.Board.of({
        publish: () => Effect.die("unused"),
        reviseAsAgent: () => Effect.die("unused"),
        reviseAsOwner: () => Effect.die("unused"),
      });
      const boardQuery = BoardQuery.BoardQuery.of({
        getPage: () => Effect.succeed({ posts: [], beforeCursor: null, headSequence: 0 }),
        getHeadSequence: Effect.succeed(0),
        getPostBySequence: () => Effect.succeed(Option.none()),
        getPostById: () => Effect.succeed(Option.none()),
        getHistory: () => Effect.succeed(Option.none()),
        listAfterSequenceThroughHead: () => Effect.succeed([]),
        readAfterSequenceSnapshot: () =>
          Effect.succeed({ posts: [], headSequence: 0, replayable: true }),
      });
      const routes = McpHttpServer.layer.pipe(
        Layer.provide(Layer.succeed(McpSessionRegistry.McpSessionRegistry, registry)),
        Layer.provide(Layer.succeed(Board.Board, board)),
        Layer.provide(Layer.succeed(BoardQuery.BoardQuery, boardQuery)),
        Layer.provide(PreviewAutomationBroker.layer.pipe(Layer.provide(NodeServices.layer))),
      );
      yield* HttpRouter.serve(routes, {
        disableListenLog: true,
        disableLogger: true,
      }).pipe(Layer.build);
      const httpClient = yield* HttpClient.HttpClient;
      const initializeBody = HttpBody.text(
        `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"board-auth-test","version":"1.0.0"}}}`,
        "application/json",
      );

      const unauthorizedResponse = yield* httpClient.post("/mcp", {
        headers: { accept: "application/json, text/event-stream" },
        body: initializeBody,
      });
      expect(unauthorizedResponse.status).toBe(401);

      const initializeResponse = yield* httpClient.post("/mcp", {
        headers: {
          accept: "application/json, text/event-stream",
          authorization: "Bearer trusted-board-token",
        },
        body: initializeBody,
      });
      expect(initializeResponse.status).toBe(200);
      expect(initializeResponse.headers["mcp-session-id"]).toBeDefined();
    }),
  ).pipe(Effect.provide(NodeHttpServer.layerTest)),
);

it.effect("separates Board and preview discovery by authenticated endpoint capability", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const registry = McpSessionRegistry.McpSessionRegistry.of({
        issue: () => Effect.die("unused"),
        resolve: (token) =>
          Effect.succeed(
            token === "board-only-token"
              ? {
                  ...invocation,
                  capabilities: new Set<McpInvocationContext.McpCapability>(["board"]),
                }
              : token === "board-preview-token"
                ? {
                    ...invocation,
                    capabilities: new Set<McpInvocationContext.McpCapability>(["board", "preview"]),
                  }
                : undefined,
          ),
        touch: () => Effect.void,
        setBoardWriteEnabled: () => Effect.void,
        revokeProviderSession: () => Effect.void,
        revokeThread: () => Effect.void,
        revokeAll: Effect.void,
      });
      const board = Board.Board.of({
        publish: () => Effect.die("unused"),
        reviseAsAgent: () => Effect.die("unused"),
        reviseAsOwner: () => Effect.die("unused"),
      });
      const boardQuery = BoardQuery.BoardQuery.of({
        getPage: () => Effect.succeed({ posts: [], beforeCursor: null, headSequence: 0 }),
        getHeadSequence: Effect.succeed(0),
        getPostBySequence: () => Effect.succeed(Option.none()),
        getPostById: () => Effect.succeed(Option.none()),
        getHistory: () => Effect.succeed(Option.none()),
        listAfterSequenceThroughHead: () => Effect.succeed([]),
        readAfterSequenceSnapshot: () =>
          Effect.succeed({ posts: [], headSequence: 0, replayable: true }),
      });
      const routes = McpHttpServer.layer.pipe(
        Layer.provide(Layer.succeed(McpSessionRegistry.McpSessionRegistry, registry)),
        Layer.provide(Layer.succeed(Board.Board, board)),
        Layer.provide(Layer.succeed(BoardQuery.BoardQuery, boardQuery)),
        Layer.provide(PreviewAutomationBroker.layer.pipe(Layer.provide(NodeServices.layer))),
      );
      yield* HttpRouter.serve(routes, {
        disableListenLog: true,
        disableLogger: true,
      }).pipe(Layer.build);
      const httpClient = yield* HttpClient.HttpClient;
      const initializeBody = HttpBody.text(
        `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"discovery-test","version":"1.0.0"}}}`,
        "application/json",
      );
      const listTools = (endpoint: string, token: string) =>
        Effect.gen(function* () {
          const initializeResponse = yield* httpClient.post(endpoint, {
            headers: {
              accept: "application/json, text/event-stream",
              authorization: `Bearer ${token}`,
            },
            body: initializeBody,
          });
          expect(initializeResponse.status).toBe(200);
          const sessionId = initializeResponse.headers["mcp-session-id"];
          expect(sessionId).toBeDefined();
          const listResponse = yield* httpClient.post(endpoint, {
            headers: {
              accept: "application/json, text/event-stream",
              authorization: `Bearer ${token}`,
              "mcp-session-id": sessionId!,
              "mcp-protocol-version": "2025-06-18",
            },
            body: HttpBody.text(
              `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`,
              "application/json",
            ),
          });
          expect(listResponse.status).toBe(200);
          const payload = (yield* listResponse.json) as {
            readonly result: { readonly tools: ReadonlyArray<{ readonly name: string }> };
          };
          return {
            names: payload.result.tools.map((tool) => tool.name).sort(),
            sessionId: sessionId!,
          };
        });

      const boardOnlySession = yield* listTools("/mcp", "board-only-token");
      const boardOnlyTools = boardOnlySession.names;
      expect(boardOnlyTools).toEqual(["board_edit", "board_history", "board_post", "board_read"]);
      expect(boardOnlyTools.some((name) => name.startsWith("preview_"))).toBe(false);

      const boardWithPreviewSession = yield* listTools("/mcp", "board-preview-token");
      expect(boardWithPreviewSession.names).toEqual([
        "board_edit",
        "board_history",
        "board_post",
        "board_read",
      ]);

      const rejectedPreviewCall = yield* httpClient.post("/mcp", {
        headers: {
          accept: "application/json, text/event-stream",
          authorization: "Bearer board-preview-token",
          "mcp-session-id": boardWithPreviewSession.sessionId,
          "mcp-protocol-version": "2025-06-18",
        },
        body: HttpBody.text(
          `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"preview_status","arguments":{}}}`,
          "application/json",
        ),
      });
      expect(rejectedPreviewCall.status).toBe(200);
      const rejectedPreviewCallPayload = (yield* rejectedPreviewCall.json) as {
        readonly error?: { readonly message?: string | undefined } | undefined;
      };
      expect(rejectedPreviewCallPayload.error?.message).toBe("Tool 'preview_status' not found");

      const previewTools = (yield* listTools("/mcp/preview", "board-preview-token")).names;
      expect(previewTools.length).toBeGreaterThan(0);
      expect(previewTools.every((name) => name.startsWith("preview_"))).toBe(true);

      const rejectedPreviewResponse = yield* httpClient.post("/mcp/preview", {
        headers: {
          accept: "application/json, text/event-stream",
          authorization: "Bearer board-only-token",
        },
        body: initializeBody,
      });
      expect(rejectedPreviewResponse.status).toBe(403);
    }),
  ).pipe(Effect.provide(NodeHttpServer.layerTest)),
);

it.effect("registers annotated tools and preserves authenticated request context", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const broker = yield* PreviewAutomationBroker.PreviewAutomationBroker;
      const routedRequests: Array<{
        readonly operation: string;
        readonly tabId?: string | undefined;
      }> = [];
      const events = yield* broker.connect({
        clientId: "mcp-test-client",
        environmentId,
      });
      yield* Stream.runForEach(events, (event) => {
        if (event.type === "connected") return Effect.void;
        routedRequests.push(event.request);
        return broker.respond({
          clientId: "mcp-test-client",
          connectionId: event.connectionId,
          requestId: event.request.requestId,
          ok: true,
          result:
            event.request.operation === "snapshot"
              ? {
                  url: "http://example.test/",
                  title: "Example",
                  loading: false,
                  visibleText: "Example",
                  interactiveElements: [],
                  accessibilityTree: {},
                  consoleEntries: [],
                  networkEntries: [],
                  actionTimeline: [],
                  screenshot: {
                    mimeType: "image/png",
                    data: Buffer.from("png").toString("base64"),
                    width: 10,
                    height: 5,
                  },
                }
              : event.request.operation === "press"
                ? undefined
                : {
                    available: true,
                    visible: true,
                    tabId,
                    url: "http://example.test/",
                    title: "Example",
                    loading: false,
                  },
        });
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;

      const statusTool = server.tools.find(({ tool }) => tool.name === "preview_status");
      expect(statusTool?.tool.annotations?.readOnlyHint).toBe(true);
      expect(statusTool?.tool.annotations?.idempotentHint).toBe(true);
      expect(statusTool?.tool.annotations?.destructiveHint).toBe(false);

      const snapshotTool = server.tools.find(({ tool }) => tool.name === "preview_snapshot");
      expect(snapshotTool?.tool.annotations?.readOnlyHint).toBe(true);
      expect(snapshotTool?.tool.annotations?.idempotentHint).toBe(true);
      expect(snapshotTool?.tool.annotations?.openWorldHint).toBe(true);

      const clickTool = server.tools.find(({ tool }) => tool.name === "preview_click");
      expect(clickTool?.tool.annotations?.readOnlyHint).toBe(false);
      expect(clickTool?.tool.annotations?.destructiveHint).toBe(true);
      expect(clickTool?.tool.annotations?.openWorldHint).toBe(true);
      expect(clickTool?.tool.outputSchema).toEqual({
        type: "object",
        additionalProperties: false,
        description: "The preview action completed successfully.",
      });

      const navigateTool = server.tools.find(({ tool }) => tool.name === "preview_navigate");
      expect(navigateTool?.tool.annotations?.destructiveHint).toBe(false);
      expect(navigateTool?.tool.annotations?.openWorldHint).toBe(true);

      const status = yield* server
        .callTool({ name: "preview_status", arguments: {} })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
      expect(status.isError).toBe(false);
      expect(status.structuredContent).toMatchObject({
        available: true,
        tabId,
      });

      const malformed = yield* server
        .callTool({ name: "preview_click", arguments: { selector: "" } })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.provideService(McpSchema.McpServerClient, client),
          Effect.flip,
        );
      expect(malformed._tag).toBe("InvalidParams");

      const snapshot = yield* server
        .callTool({ name: "preview_snapshot", arguments: { tabId: alternateTabId } })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
      expect(snapshot.isError).toBe(false);
      expect(snapshot.content.some((content) => content.type === "image")).toBe(true);
      expect(snapshot.structuredContent).toMatchObject({
        screenshot: { mimeType: "image/png", width: 10, height: 5 },
      });
      expect(routedRequests.find(({ operation }) => operation === "snapshot")?.tabId).toBe(
        alternateTabId,
      );

      const actionRequests = [
        { name: "preview_click", arguments: { x: 10, y: 10 } },
        { name: "preview_type", arguments: { text: "Hello" } },
        { name: "preview_press", arguments: { key: "Enter" } },
        { name: "preview_scroll", arguments: { deltaY: 100 } },
        { name: "preview_wait_for", arguments: { text: "Example" } },
      ];
      for (const request of actionRequests) {
        const result = yield* server
          .callTool(request)
          .pipe(
            Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
            Effect.provideService(McpSchema.McpServerClient, client),
          );
        expect(result.isError).toBe(false);
        expect(result.structuredContent).toEqual({});
        expect(result.content).toEqual([{ type: "text", text: "{}" }]);
      }
    }),
  ).pipe(Effect.provide(TestLayer)),
);
