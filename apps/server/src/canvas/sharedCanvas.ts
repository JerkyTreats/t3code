// @effect-diagnostics nodeBuiltinImport:off
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeCrypto from "node:crypto";

import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import { delegatorOf, type ThreadLineage } from "../pageState/delegator.ts";
import * as ThreadCanvasStore from "./ThreadCanvasStore.ts";

const DRAWING_OWNER_HASH_CHARS = 8;

/** Where a thread's agent draws: the canvas thread, and its own card there when it has one. */
export interface CanvasTarget {
  readonly threadId: ThreadId;
  /** Id of the caller's chat card on that canvas; its drawings land beside it. */
  readonly card: string | null;
}

/**
 * The canvas this thread's agent draws on. A delegated task, however deep, shares its delegator's.
 * A chat the user placed as a card on another thread's board draws there, beside its card. Only
 * agent tools follow this; a thread's own board keeps its private scene.
 */
export const resolveCanvas = Effect.fn("sharedCanvas.resolveCanvas")(function* <E, F>(
  threadId: ThreadId,
  lineageOf: (threadId: ThreadId) => Effect.Effect<ThreadLineage | null, E>,
  chatCardOf: (
    chatThreadId: ThreadId,
  ) => Effect.Effect<{ readonly canvasThreadId: ThreadId; readonly card: string } | null, F>,
) {
  const current = yield* delegatorOf(threadId, lineageOf);
  const placed = yield* chatCardOf(current);
  return placed === null || placed.canvasThreadId === current
    ? ({ threadId: current, card: null } satisfies CanvasTarget)
    : ({ threadId: placed.canvasThreadId, card: placed.card } satisfies CanvasTarget);
});

/** The canvas for an agent's thread, falling back to its own canvas if lineage is unreadable. */
export const canvasOf = Effect.fn("sharedCanvas.canvasOf")(function* (threadId: ThreadId) {
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
  return yield* resolveCanvas(
    threadId,
    (id) =>
      threads.getThreadShell(id).pipe(
        Effect.map((shell) => (shell === null ? null : shell.lineage)),
        Effect.orElseSucceed(() => null),
      ),
    canvas.chatCardOf,
  );
});

/**
 * The drawing id as stored on a shared canvas. A child's drawing carries a short mark of its
 * thread, so two delegated tasks that both call their drawing "design" do not overwrite each
 * other, and a child re-sending the same id still updates its own drawing.
 */
export function sharedDrawingId(drawingId: string, threadId: ThreadId, canvasThreadId: ThreadId) {
  if (threadId === canvasThreadId) return drawingId;
  const owner = NodeCrypto.createHash("sha256")
    .update(threadId)
    .digest("hex")
    .slice(0, DRAWING_OWNER_HASH_CHARS);
  return `${drawingId}~${owner}`;
}
