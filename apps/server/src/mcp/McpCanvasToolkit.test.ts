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

// A synthetic busy board: more marks than one canvas_read result can hold.
const busyThreadId = ThreadId.make("thread-canvas-busy");
const busyScene = {
  revision: 1,
  elements: Array.from({ length: 300 }, (_, index) => ({
    id: `mark-${index}`,
    type: "text",
    version: 1,
    updated: index,
    x: -900,
    y: index * 120,
    width: 300,
    height: 40,
    text: `synthetic note ${index} ${"n".repeat(60)}`,
  })),
};

const drawn: Array<Parameters<ThreadCanvasStore.ThreadCanvasStore["Service"]["draw"]>[0]> = [];
const layerCanvasMock = Layer.mock(ThreadCanvasStore.ThreadCanvasStore)({
  chatCardOf: () => Effect.succeed(null),
  draw: (input) => {
    drawn.push(input);
    return Effect.succeed({
      drawingId: input.drawingId,
      placed: null,
      crossings: 0,
      arrowsThroughBoxes: [],
      clippedLabels: [],
      overlaps: [],
      keptUserMoves: [],
    });
  },
  deliverToAgent: () => Effect.succeed(ThreadCanvasStore.EMPTY_CANVAS_DELIVERY),
  read: (id) =>
    Effect.succeed(
      id === busyThreadId
        ? busyScene
        : {
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
          },
    ),
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
  Layer.provideMerge(McpHttpServer.layerInProcessMcpServer),
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

      const missing = yield* server
        .callTool({ name: "canvas_preview", arguments: { drawingId: "nope" } })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
      expect(missing.isError).toBe(true);
      expect(JSON.stringify(missing.content)).toContain("Nothing on the canvas matches");
    }),
  ).pipe(Effect.provide(layerTest)),
);

it.effect("compiles a diagram into laid-out shapes, and says why it cannot read one", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      // The test kit's live thread runs on codex; acting tools check the caller owns its run.
      const caller = {
        ...invocation,
        thread: { ...invocation.thread, providerInstanceId: ProviderInstanceId.make("codex") },
      };
      const call = (diagram: string) =>
        server
          .callTool({ name: "canvas_update", arguments: { drawingId: "plan", diagram } })
          .pipe(
            Effect.provideService(McpInvocationContext.McpInvocationContext, caller),
            Effect.provideService(McpSchema.McpServerClient, client),
          );
      const done = yield* call("flowchart TB\n  a[Alpha] -->|calls| b[Beta]\n  class a lead");
      expect(done.isError).toBe(false);
      expect(drawn.at(-1)).toMatchObject({ drawingId: "plan", arranged: true, patch: false });
      expect(drawn.at(-1)?.shapes.map((shape) => shape.id)).toEqual(["a", "b", "e1"]);

      const broken = yield* call("flowchart TB\n  subgraph S\n  a");
      expect(broken.isError).toBe(true);
      expect(JSON.stringify(broken.content)).toContain("Could not read the diagram");
    }),
  ).pipe(Effect.provide(layerTest)),
);

it.effect("keeps each copy of a busy board's canvas_read result within one tool result", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const read = yield* server.callTool({ name: "canvas_read", arguments: {} }).pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, {
          ...invocation,
          thread: { ...invocation.thread, threadId: busyThreadId },
        }),
        Effect.provideService(McpSchema.McpServerClient, client),
      );
      expect(read.isError).toBe(false);
      // The result carries it twice; Claude Code and Codex each take one copy, so each must fit.
      const structured = JSON.stringify(read.structuredContent);
      expect(structured.length).toBeLessThanOrEqual(40_000);
      expect(read.content).toEqual([{ type: "text", text: structured }]);
      expect(structured).toContain("older marks are left out");
    }),
  ).pipe(Effect.provide(layerTest)),
);
