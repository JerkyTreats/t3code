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

  it.effect("finds the board a chat is placed on, and delivers that chat's marks from it", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const board = ThreadId.make("thread-canvas-board");
      const chat = ThreadId.make("thread-canvas-chat");
      const card = {
        id: "chat-card",
        version: 1,
        type: "rectangle",
        x: 0,
        y: 0,
        width: 400,
        height: 500,
        customData: { t3Card: { kind: "surface", surface: { kind: "side-chat", threadId: chat } } },
      };
      const note = { id: "note", version: 1, type: "text", text: "Here", x: 450, y: 0 };
      yield* canvas.saveFromClient({ threadId: board, elements: [card, note] });
      assert.deepStrictEqual(yield* canvas.chatCardOf(chat), {
        canvasThreadId: board,
        card: "chat-card",
      });
      const delivery = yield* canvas.deliverToAgent({
        threadId: chat,
        message: "",
        picture: false,
      });
      assert.include(delivery.note, '"Here"');
      yield* delivery.acknowledge;
      const again = yield* canvas.deliverToAgent({ threadId: chat, message: "", picture: false });
      assert.strictEqual(again.note, "");

      yield* canvas.saveFromClient({
        threadId: board,
        elements: [{ ...card, version: 2, isDeleted: true }],
      });
      assert.isNull(yield* canvas.chatCardOf(chat));
    }),
  );

  it.effect("finds a chat placed on a board whose thread id is too long for a filename", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const board = ThreadId.make(`thread:${"x".repeat(400)}`);
      const chat = ThreadId.make("thread-canvas-long-chat");
      yield* canvas.saveFromClient({
        threadId: board,
        elements: [
          {
            id: "chat-card",
            version: 1,
            customData: {
              t3Card: { kind: "surface", surface: { kind: "side-chat", threadId: chat } },
            },
          },
        ],
      });
      assert.deepStrictEqual(yield* canvas.chatCardOf(chat), {
        canvasThreadId: board,
        card: "chat-card",
      });
    }),
  );

  it.effect("attaches one saved sketch per area only for marks a note cannot describe", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const sketched = ThreadId.make("thread-canvas-sketch");
      const png = Buffer.from("png-bytes").toString("base64");
      yield* canvas.saveFromClient({
        threadId: sketched,
        elements: [
          { id: "stroke", version: 1, type: "freedraw" },
          { id: "ring", version: 1, type: "ellipse", y: 2000 },
        ],
        sketches: [
          { png, marks: ["stroke"] },
          { png, marks: ["ring"] },
        ],
      });

      const delivery = yield* canvas.deliverToAgent({
        threadId: sketched,
        message: "Hello",
        picture: true,
      });
      assert.deepStrictEqual(
        delivery.attachments.map((attachment) => attachment.name),
        ["canvas-sketch-1.png", "canvas-sketch-2.png"],
      );
      assert.include(
        delivery.note,
        "- canvas-sketch-1.png: [stroke]\n- canvas-sketch-2.png: [ring]",
      );

      const textOnly = yield* canvas.deliverToAgent({
        threadId: sketched,
        message: "Hello",
        picture: false,
      });
      assert.deepStrictEqual(textOnly.attachments, []);
    }),
  );

  it.effect("finds a placed chat after a restart, with saved sketches beside the boards", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const board = ThreadId.make("thread-canvas-restart-z-board");
      const chat = ThreadId.make("thread-canvas-restart-chat");
      const png = Buffer.from("png-bytes").toString("base64");
      // Sketches saved before and after a board named to sort last, so one lists ahead of it.
      const saveSketches = (from: number) =>
        Effect.forEach(
          [0, 1, 2, 3, 4, 5, 6, 7].map((index) => from + index),
          (index) =>
            canvas.saveFromClient({
              threadId: ThreadId.make(`thread-canvas-restart-sketch-${index}`),
              elements: [],
              sketches: [{ png, marks: ["stroke"] }],
            }),
          { discard: true },
        );
      yield* saveSketches(0);
      yield* canvas.saveFromClient({
        threadId: board,
        elements: [
          {
            id: "restart-card",
            version: 1,
            customData: {
              t3Card: { kind: "surface", surface: { kind: "side-chat", threadId: chat } },
            },
          },
        ],
      });
      yield* saveSketches(8);

      const restarted = yield* ThreadCanvasStore.ThreadCanvasStore.pipe(
        Effect.provide(Layer.fresh(ThreadCanvasStore.layer)),
      );
      assert.deepStrictEqual(yield* restarted.chatCardOf(chat), {
        canvasThreadId: board,
        card: "restart-card",
      });
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
  it.effect("brings the html cards bound to a page state key beside the latest turn", () =>
    Effect.gen(function* () {
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const board = ThreadId.make("thread-canvas-reveal");
      const turn = (id: string, y: number) => ({
        id: `turn-box:${id}`,
        type: "rectangle",
        version: 1,
        x: -430,
        y,
        width: 860,
        height: 300,
        customData: { t3Turn: id, t3TurnTitle: `Turn ${id}` },
      });
      yield* canvas.saveFromClient({ threadId: board, elements: [turn("1", 0)] });
      const page = {
        type: "html" as const,
        attachmentId: "page-attachment",
        width: 400,
        height: 300,
      };
      yield* canvas.draw({
        threadId: board,
        drawingId: "status",
        shapes: [
          { id: "board", ...page, stateKeys: ["workflow"] },
          { id: "other", ...page, stateKeys: ["notes"] },
        ],
        author: board,
      });
      // Another chat on this board keeps its own "workflow".
      yield* canvas.draw({
        threadId: board,
        drawingId: "chat-status",
        shapes: [{ id: "board", ...page, stateKeys: ["workflow"] }],
        author: "thread-canvas-reveal-other-chat",
      });
      yield* canvas.saveFromClient({ threadId: board, elements: [turn("2", 3000)] });

      const reveal = (key: string) =>
        canvas.revealPages({ threadId: board, key, owner: board, ownerOf: Effect.succeed });
      assert.deepStrictEqual(yield* reveal("workflow"), ["status/board"]);
      const { elements } = yield* canvas.read(board);
      const yOf = (id: string) => elements.find((element) => element.id === id)?.y;
      assert.strictEqual(yOf("status/board"), 3000);
      assert.isBelow(Number(yOf("status/other")), 3000);
      assert.isBelow(Number(yOf("chat-status/board")), 3000);
      assert.deepStrictEqual(yield* reveal("unbound"), []);
    }),
  );
});
