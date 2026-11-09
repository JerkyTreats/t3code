// @effect-diagnostics nodeBuiltinImport:off
import type { ThreadCanvasElement, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeCrypto from "node:crypto";

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

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
 * A fork keeps its own unless its chat card sits on its parent's board: then it draws there, beside
 * that card. Only agent tools follow this; a child's own board keeps its private scene.
 */
export const resolveCanvas = Effect.fn("sharedCanvas.resolveCanvas")(function* <E, F>(
  threadId: ThreadId,
  lineageOf: (threadId: ThreadId) => Effect.Effect<CanvasLineage | null, E>,
  cardOn: (canvasThreadId: ThreadId, chatThreadId: ThreadId) => Effect.Effect<string | null, F>,
) {
  let current = threadId;
  for (let depth = 0; depth < MAX_DELEGATION_DEPTH; depth += 1) {
    const lineage = yield* lineageOf(current);
    if (lineage === null || lineage.parentThreadId === null) break;
    if (lineage.relationshipToParent === "subagent") {
      current = lineage.parentThreadId;
      continue;
    }
    if (lineage.relationshipToParent !== "fork") break;
    const card = yield* cardOn(lineage.parentThreadId, current);
    // Its card is on this board and nowhere further up, so the walk ends here.
    if (card !== null) return { threadId: lineage.parentThreadId, card } satisfies CanvasTarget;
    break;
  }
  return { threadId: current, card: null } satisfies CanvasTarget;
});

/** The live chat card that shows this thread on a board, if the user placed one. */
export function chatCardOf(
  elements: ReadonlyArray<ThreadCanvasElement>,
  chatThreadId: ThreadId,
): string | null {
  for (const element of elements) {
    if (element.isDeleted === true) continue;
    const card = recordOf(recordOf(element.customData).t3Card);
    const surface = recordOf(card.surface);
    if (
      card.kind === "surface" &&
      surface.kind === "side-chat" &&
      surface.threadId === chatThreadId &&
      typeof element.id === "string"
    ) {
      return element.id;
    }
  }
  return null;
}

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
