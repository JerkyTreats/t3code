import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";

import * as ThreadCanvasStore from "../canvas/ThreadCanvasStore.ts";
import * as ServerConfig from "../config.ts";
import * as HtmlRender from "../htmlRender/HtmlRender.ts";
import * as McpHttpServer from "./McpHttpServer.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";
import * as McpToolAccessTestkit from "./McpToolAccess.testkit.ts";

const threadId = ThreadId.make("thread-canvas-test");
const invocation = {
  environmentId: EnvironmentId.make("environment-canvas-test"),
  requestNamespace: "provider-session-canvas-test",
  thread: {
    threadId,
    providerSessionId: "provider-session-canvas-test",
    providerInstanceId: ProviderInstanceId.make("claudeAgent"),
  },
  client: undefined,
  capabilities: new Set<McpInvocationContext.McpCapability>(),
  issuedAt: 1,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "mcp-test", version: "1.0.0" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const layerCanvasMock = Layer.mock(ThreadCanvasStore.ThreadCanvasStore)({
  read: () =>
    Effect.succeed({
      revision: 1,
      elements: [
        {
          id: "turn-a",
          type: "rectangle",
          x: -430,
          y: 0,
          width: 860,
          height: 400,
          customData: { t3Turn: "a", t3TurnTitle: "Latest" },
        },
      ],
    }),
});
const layerHtmlRenderMock = Layer.mock(HtmlRender.HtmlRender)({
  readStored: () => Effect.succeed(null),
  appStylesheet: Effect.succeed(null),
  preview: () =>
    Effect.succeed({
      png: Buffer.from("png").toString("base64"),
      width: 1000,
      contentHeight: 800,
      capturedHeight: 800,
      consoleMessages: [],
    }),
});

const layerTest = McpHttpServer.layerCanvasToolkit.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provideMerge(McpToolAccessTestkit.liveThreadsLayer),
  Layer.provide(layerCanvasMock),
  Layer.provide(layerHtmlRenderMock),
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-mcp-canvas-toolkit-test-" })),
  Layer.provide(NodeServices.layer),
);

it.effect("returns the canvas preview as image content", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      expect(server.tools.map(({ tool }) => tool.name).toSorted()).toEqual([
        "canvas_preview",
        "canvas_read",
        "canvas_update",
      ]);

      const shot = yield* server
        .callTool({ name: "canvas_preview", arguments: {} })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
      expect(shot.isError).toBe(false);
      expect(shot.content.map((entry) => entry.type)).toEqual(["text", "image"]);
      expect(shot.structuredContent).toMatchObject({
        clippedCards: [],
        screenshot: { mimeType: "image/png", width: 1000, height: 800 },
      });
      expect(JSON.stringify(shot.structuredContent)).not.toContain('"data"');
    }),
  ).pipe(Effect.provide(layerTest)),
);
