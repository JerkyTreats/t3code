import { assert, describe, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { type CanvasLineage, resolveCanvasThread, sharedDrawingId } from "./sharedCanvas.ts";

const root = ThreadId.make("thread-root");
const child = ThreadId.make("thread:delegated-task:child");
const grandchild = ThreadId.make("thread:delegated-task:grandchild");
const fork = ThreadId.make("thread-fork");

const lineages: Record<string, CanvasLineage> = {
  [root]: { parentThreadId: null, relationshipToParent: null },
  [child]: { parentThreadId: root, relationshipToParent: "subagent" },
  [grandchild]: { parentThreadId: child, relationshipToParent: "subagent" },
  [fork]: { parentThreadId: root, relationshipToParent: "fork" },
};
const lineageOf = (threadId: ThreadId) => Effect.succeed(lineages[threadId] ?? null);

describe("resolveCanvasThread", () => {
  it.effect("keeps a root thread on its own canvas", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* resolveCanvasThread(root, lineageOf), root);
    }),
  );

  it.effect("sends a delegated task, however deep, to the canvas of the delegating thread", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* resolveCanvasThread(child, lineageOf), root);
      assert.strictEqual(yield* resolveCanvasThread(grandchild, lineageOf), root);
    }),
  );

  it.effect("keeps a fork on its own canvas", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* resolveCanvasThread(fork, lineageOf), fork);
    }),
  );

  it.effect("keeps an unknown thread on its own canvas", () =>
    Effect.gen(function* () {
      const unknown = ThreadId.make("thread-unknown");
      assert.strictEqual(yield* resolveCanvasThread(unknown, lineageOf), unknown);
    }),
  );

  it.effect("stops a delegation cycle instead of looping", () =>
    Effect.gen(function* () {
      const cycle = (threadId: ThreadId) =>
        Effect.succeed<CanvasLineage>({
          parentThreadId: threadId === root ? child : root,
          relationshipToParent: "subagent",
        });
      const resolved = yield* resolveCanvasThread(root, cycle);
      assert.include([root, child], resolved);
    }),
  );
});

describe("sharedDrawingId", () => {
  it("leaves the canvas owner's drawing ids alone", () => {
    assert.strictEqual(sharedDrawingId("design", root, root), "design");
  });

  it("marks a child's drawing with its thread, the same way every time", () => {
    const first = sharedDrawingId("design", child, root);
    assert.match(first, /^design~[0-9a-f]{8}$/);
    assert.strictEqual(sharedDrawingId("design", child, root), first);
    assert.notStrictEqual(sharedDrawingId("design", grandchild, root), first);
  });
});
