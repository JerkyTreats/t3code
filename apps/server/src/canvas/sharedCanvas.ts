// @effect-diagnostics nodeBuiltinImport:off
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeCrypto from "node:crypto";

/** How a thread relates to its parent, as much of the shell as the canvas needs. */
export interface CanvasLineage {
  readonly parentThreadId: ThreadId | null;
  readonly relationshipToParent: "fork" | "subagent" | null;
}

// Delegation nests, but a chain this deep is a runaway, not a drill-down.
const MAX_DELEGATION_DEPTH = 8;
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
  lineageOf: (threadId: ThreadId) => Effect.Effect<CanvasLineage | null, E>,
  chatCardOf: (
    chatThreadId: ThreadId,
  ) => Effect.Effect<{ readonly canvasThreadId: ThreadId; readonly card: string } | null, F>,
) {
  let current = threadId;
  for (let depth = 0; depth < MAX_DELEGATION_DEPTH; depth += 1) {
    const lineage = yield* lineageOf(current);
    if (lineage?.relationshipToParent !== "subagent" || lineage.parentThreadId === null) break;
    current = lineage.parentThreadId;
  }
  const placed = yield* chatCardOf(current);
  return placed === null || placed.canvasThreadId === current
    ? ({ threadId: current, card: null } satisfies CanvasTarget)
    : ({ threadId: placed.canvasThreadId, card: placed.card } satisfies CanvasTarget);
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
