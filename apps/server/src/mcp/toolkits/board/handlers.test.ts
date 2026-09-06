import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  BoardAuthorId,
  CommandId,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/unstable/ai";

import { ServerConfig } from "../../../config.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { SqlitePersistenceMemory } from "../../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../../project/RepositoryIdentityResolver.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { OrchestrationLayerLive } from "../../../orchestration/runtimeLayer.ts";

const BoardServicesTestLayer = OrchestrationLayerLive.pipe(
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-board-mcp-test-" })),
  Layer.provideMerge(NodeServices.layer),
);

const TestLayer = McpHttpServer.BoardToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provideMerge(BoardServicesTestLayer),
);

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "board-mcp-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const makeInvocation = (input: {
  readonly threadId: string;
  readonly providerSessionId: string;
  readonly providerInstanceId: string;
  readonly capabilities?: ReadonlySet<McpInvocationContext.McpCapability>;
}): McpInvocationContext.McpInvocationScope => ({
  environmentId: EnvironmentId.make("environment-board-mcp-test"),
  threadId: ThreadId.make(input.threadId),
  providerSessionId: input.providerSessionId,
  boardAuthorId: BoardAuthorId.make(`board-public-${input.providerSessionId}`),
  providerInstanceId: ProviderInstanceId.make(input.providerInstanceId),
  capabilities: input.capabilities ?? new Set(["board", "board-write"]),
  issuedAt: 1,
});

const callTool = (
  server: McpServer.McpServer["Service"],
  invocation: McpInvocationContext.McpInvocationScope,
  request: { readonly name: string; readonly arguments: Record<string, unknown> },
) =>
  server
    .callTool(request)
    .pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.provideService(McpSchema.McpServerClient, client),
    );

it.layer(TestLayer)("global Board MCP toolkit", (it) => {
  it.effect(
    "registers self-sufficient tools and publishes plus reads across trusted thread identities",
    () =>
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer;
        const engine = yield* OrchestrationEngineService;
        const modelSelection = {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5-codex",
        } as const;

        for (const suffix of ["one", "two"] as const) {
          yield* engine.dispatch({
            type: "project.create",
            commandId: CommandId.make(`project-command-${suffix}`),
            projectId: ProjectId.make(`project-${suffix}`),
            title: `Project ${suffix}`,
            workspaceRoot: `/workspace/project-${suffix}`,
            defaultModelSelection: modelSelection,
            createdAt: "2026-08-28T12:00:00.000Z",
          });
          yield* engine.dispatch({
            type: "thread.create",
            commandId: CommandId.make(`thread-command-${suffix}`),
            threadId: ThreadId.make(`thread-${suffix}`),
            projectId: ProjectId.make(`project-${suffix}`),
            title: `Thread ${suffix}`,
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt: "2026-08-28T12:00:00.000Z",
          });
        }

        const firstInvocation = makeInvocation({
          threadId: "thread-one",
          providerSessionId: "trusted-agent-one",
          providerInstanceId: "codex",
        });
        const secondInvocation = makeInvocation({
          threadId: "thread-two",
          providerSessionId: "trusted-agent-two",
          providerInstanceId: "claudeAgent",
        });

        const firstPost = yield* callTool(server, firstInvocation, {
          name: "board_post",
          arguments: { body: "First global discovery", targets: ["trusted-agent-two"] },
        });
        const secondPost = yield* callTool(server, secondInvocation, {
          name: "board_post",
          arguments: { body: "Second global handoff" },
        });
        assert.isFalse(firstPost.isError ?? false);
        assert.isFalse(secondPost.isError ?? false);
        const published = firstPost.structuredContent as {
          readonly id: string;
          readonly revision: number;
          readonly body: string;
          readonly targets: ReadonlyArray<string>;
        };
        assert.strictEqual(published.revision, 1);

        const deniedCrossIdentityEdit = yield* callTool(server, secondInvocation, {
          name: "board_edit",
          arguments: {
            postId: published.id,
            expectedRevision: 1,
            body: "Untrusted replacement",
            targets: [],
          },
        });
        assert.isTrue(deniedCrossIdentityEdit.isError ?? false);

        const deniedProviderEdit = yield* callTool(
          server,
          makeInvocation({
            threadId: "thread-one",
            providerSessionId: "wrong-provider-session",
            providerInstanceId: "claudeAgent",
          }),
          {
            name: "board_edit",
            arguments: {
              postId: published.id,
              expectedRevision: 1,
              body: "Wrong provider replacement",
              targets: [],
            },
          },
        );
        assert.isTrue(deniedProviderEdit.isError ?? false);

        const rotatedSession = makeInvocation({
          threadId: "thread-one",
          providerSessionId: "trusted-agent-one-rotated",
          providerInstanceId: "codex",
        });
        const corrected = yield* callTool(server, rotatedSession, {
          name: "board_edit",
          arguments: {
            postId: published.id,
            expectedRevision: 1,
            body: "Corrected global discovery",
            targets: ["trusted-agent-two", "collective"],
          },
        });
        assert.isFalse(corrected.isError ?? false);
        assert.deepInclude(corrected.structuredContent as Record<string, unknown>, {
          id: published.id,
          body: "Corrected global discovery",
          revision: 2,
        });

        const conflictingEdit = yield* callTool(server, rotatedSession, {
          name: "board_edit",
          arguments: {
            postId: published.id,
            expectedRevision: 1,
            body: "Stale replacement",
            targets: [],
          },
        });
        assert.isTrue(conflictingEdit.isError ?? false);
        const conflictContent = conflictingEdit.content[0];
        assert.strictEqual(conflictContent?.type, "text");
        assert.include(
          conflictContent?.type === "text" ? conflictContent.text : "",
          "changed after revision 1",
        );

        const firstRead = yield* callTool(server, firstInvocation, {
          name: "board_read",
          arguments: {},
        });
        const secondRead = yield* callTool(server, secondInvocation, {
          name: "board_read",
          arguments: {},
        });
        const history = yield* callTool(server, firstInvocation, {
          name: "board_history",
          arguments: { postId: published.id },
        });

        const firstResult = firstRead.structuredContent as {
          readonly caller: { readonly id: string };
          readonly page: {
            readonly posts: ReadonlyArray<{
              readonly author: { readonly id: string };
              readonly body: string;
              readonly targets: ReadonlyArray<string>;
              readonly source: { readonly threadId: string; readonly projectId: string };
            }>;
          };
        };
        const secondResult = secondRead.structuredContent as typeof firstResult;
        assert.strictEqual(firstResult.caller.id, "board-public-trusted-agent-one");
        assert.strictEqual(secondResult.caller.id, "board-public-trusted-agent-two");
        assert.deepStrictEqual(
          firstResult.page.posts.map(({ body }) => body),
          ["Corrected global discovery", "Second global handoff"],
        );
        assert.deepStrictEqual(secondResult.page.posts, firstResult.page.posts);
        assert.strictEqual(firstResult.page.posts[0]?.author.id, "board-public-trusted-agent-one");
        assert.deepStrictEqual(firstResult.page.posts[0]?.targets, [
          "trusted-agent-two",
          "collective",
        ]);
        assert.deepStrictEqual(firstResult.page.posts[0]?.source, {
          projectId: "project-one",
          threadId: "thread-one",
        });
        assert.strictEqual(firstResult.page.posts[1]?.author.id, "board-public-trusted-agent-two");
        assert.isFalse(history.isError ?? false);
        const historyResult = history.structuredContent as {
          readonly currentRevision: number;
          readonly revisions: ReadonlyArray<{
            readonly revision: number;
            readonly body: string;
            readonly editor: { readonly kind: "agent" | "environment-owner" };
          }>;
        };
        assert.strictEqual(historyResult.currentRevision, 2);
        assert.deepStrictEqual(
          historyResult.revisions.map(({ revision, body }) => ({ revision, body })),
          [
            { revision: 2, body: "Corrected global discovery" },
            { revision: 1, body: "First global discovery" },
          ],
        );
        assert.strictEqual(historyResult.revisions[0]?.editor.kind, "agent");

        for (const name of ["board_read", "board_post"] as const) {
          const description = server.tools.find(({ tool }) => tool.name === name)?.tool.description;
          assert.include(description ?? "", "globally across every project and thread");
          assert.include(description ?? "", "Every post");
          assert.include(description ?? "", "attention hints only");
          for (const use of [
            "plans",
            "discoveries",
            "dependencies",
            "decisions",
            "handoffs",
            "requests",
            "conflicts",
            "stop or reorder signals",
          ]) {
            assert.include(description ?? "", use);
          }
        }

        const postTool = server.tools.find(({ tool }) => tool.name === "board_post")?.tool;
        assert.notProperty(
          (postTool?.inputSchema.properties ?? {}) as Record<string, unknown>,
          "author",
        );
        assert.notProperty(
          (postTool?.inputSchema.properties ?? {}) as Record<string, unknown>,
          "authorId",
        );
        const editTool = server.tools.find(({ tool }) => tool.name === "board_edit")?.tool;
        assert.notProperty(
          (editTool?.inputSchema.properties ?? {}) as Record<string, unknown>,
          "editor",
        );
        assert.include(editTool?.description ?? "", "trusted source thread and provider instance");
        assert.include(
          server.tools.find(({ tool }) => tool.name === "board_history")?.tool.description ?? "",
          "only current corrected content",
        );
      }),
  );

  it.effect("rejects Board tools without Board admission", () =>
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const deniedInvocation = makeInvocation({
        threadId: "thread-denied",
        providerSessionId: "preview-only-agent",
        providerInstanceId: "cursor",
        capabilities: new Set(["preview"]),
      });
      const deniedCalls = [
        { name: "board_read", arguments: {} },
        { name: "board_post", arguments: { body: "Denied" } },
        {
          name: "board_edit",
          arguments: {
            postId: "denied-post",
            expectedRevision: 1,
            body: "Denied",
            targets: [],
          },
        },
        { name: "board_history", arguments: { postId: "denied-post" } },
      ];

      for (const request of deniedCalls) {
        const denied = yield* callTool(server, deniedInvocation, request);
        assert.isTrue(denied.isError ?? false);
        const firstContent = denied.content[0];
        assert.strictEqual(firstContent?.type, "text");
        assert.include(firstContent?.type === "text" ? firstContent.text : "", "Board capability");
      }
    }),
  );

  it.effect("keeps reads available but rejects mutations without Board write authority", () =>
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const planInvocation = makeInvocation({
        threadId: "thread-plan",
        providerSessionId: "plan-agent",
        providerInstanceId: "codex",
        capabilities: new Set(["board"]),
      });

      const readable = yield* callTool(server, planInvocation, {
        name: "board_read",
        arguments: {},
      });
      assert.isFalse(readable.isError ?? false);

      for (const request of [
        { name: "board_post", arguments: { body: "Denied in Plan Mode" } },
        {
          name: "board_edit",
          arguments: {
            postId: "plan-post",
            expectedRevision: 1,
            body: "Denied in Plan Mode",
            targets: [],
          },
        },
      ]) {
        const denied = yield* callTool(server, planInvocation, request);
        assert.isTrue(denied.isError ?? false);
        const firstContent = denied.content[0];
        assert.include(
          firstContent?.type === "text" ? firstContent.text : "",
          "current interaction mode",
        );
      }
    }),
  );
});
