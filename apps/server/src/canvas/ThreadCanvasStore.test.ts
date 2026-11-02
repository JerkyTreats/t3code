import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as ThreadCanvasStore from "./ThreadCanvasStore.ts";

const threadId = ThreadId.make("thread-canvas-test");

const layer = it.layer(
  ThreadCanvasStore.layer.pipe(
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-canvas-test-" })),
    Layer.provideMerge(NodeServices.layer),
  ),
);

layer("ThreadCanvasStore", (it) => {
  it.effect("builds a drawing with no client open, then follows it to the next one", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const report = yield* canvas.draw({
        threadId,
        drawingId: "design",
        shapes: [{ id: "box", type: "rectangle", x: 0, y: 0, text: "API" }],
      });
      assert.strictEqual(report.placed?.width, 200);
      assert.deepStrictEqual(report.elementIds, ["design/box"]);

      const [scene] = yield* canvas.follow(threadId).pipe(Stream.take(1), Stream.runCollect);
      assert.sameMembers(scene?.elements.map((element) => element.id) ?? [], [
        "design/box",
        "design/box/label",
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect("publishes nothing for a save with no news, which ends the client's echo", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const quiet = ThreadId.make("thread-canvas-quiet");
      yield* canvas.saveFromClient({
        threadId: quiet,
        elements: [{ id: "note", version: 2 }],
      });
      const before = yield* canvas.read(quiet);
      yield* canvas.saveFromClient({
        threadId: quiet,
        elements: [{ id: "note", version: 2 }],
      });
      assert.strictEqual((yield* canvas.read(quiet)).revision, before.revision);
    }),
  );

  it.effect("keeps delivering a change until the agent acknowledges it, then stays quiet", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const notes = ThreadId.make("thread-canvas-notes");
      yield* canvas.saveFromClient({
        threadId: notes,
        elements: [{ id: "note", version: 1, type: "text", text: "Do you see this?" }],
      });
      const input = { threadId: notes, message: "Hello", picture: true };

      yield* canvas.deliverToAgent(input);
      const again = yield* canvas.deliverToAgent(input);
      assert.include(again.note, "Do you see this?");
      assert.deepStrictEqual(again.attachments, []);

      yield* again.acknowledge;
      assert.strictEqual((yield* canvas.deliverToAgent(input)).note, "");
    }),
  );

  it.effect("attaches the saved sketch only for marks a note cannot describe", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const sketched = ThreadId.make("thread-canvas-sketch");
      yield* canvas.saveFromClient({
        threadId: sketched,
        elements: [{ id: "stroke", version: 1, type: "freedraw" }],
        sketch: Buffer.from("png-bytes").toString("base64"),
      });

      const delivery = yield* canvas.deliverToAgent({
        threadId: sketched,
        message: "Hello",
        picture: true,
      });
      assert.strictEqual(delivery.attachments[0]?.name, "canvas-sketch.png");
      assert.include(delivery.note, "canvas-sketch.png");

      const textOnly = yield* canvas.deliverToAgent({
        threadId: sketched,
        message: "Hello",
        picture: false,
      });
      assert.deepStrictEqual(textOnly.attachments, []);
    }),
  );

  it.effect("stores a thread whose id would not fit in a filename", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const nested = ThreadId.make(`thread:provider:${"nested%3Asubagent:".repeat(40)}`);
      yield* canvas.saveFromClient({
        threadId: nested,
        elements: [{ id: "box", version: 1 }],
      });
      assert.strictEqual((yield* canvas.read(nested)).elements.length, 1);
    }),
  );
});
