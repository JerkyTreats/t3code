// @effect-diagnostics nodeBuiltinImport:off
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeCrypto from "node:crypto";

import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";

/** How a thread relates to its parent, as much of the shell as the canvas needs. */
export interface CanvasLineage {
  readonly parentThreadId: ThreadId | null;
  readonly relationshipToParent: "fork" | "subagent" | null;
}

// Delegation nests, but a chain this deep is a runaway, not a drill-down.
const MAX_DELEGATION_DEPTH = 8;
const DRAWING_OWNER_HASH_CHARS = 8;

/**
 * The thread whose canvas this thread's agent draws on. A delegated task shares the canvas of the
 * thread that delegated it, however deep the delegation goes. A fork keeps its own: it is a
 * separate conversation, not work handed back. Only the agent's tools follow this; a child
 * thread's own board keeps its private scene, so its turn boxes never land on the parent's.
 */
export const resolveCanvasThread = Effect.fn("sharedCanvas.resolveCanvasThread")(function* <E>(
  threadId: ThreadId,
  lineageOf: (threadId: ThreadId) => Effect.Effect<CanvasLineage | null, E>,
) {
  let current = threadId;
  for (let depth = 0; depth < MAX_DELEGATION_DEPTH; depth += 1) {
    const lineage = yield* lineageOf(current);
    if (lineage?.relationshipToParent !== "subagent" || lineage.parentThreadId === null) break;
    current = lineage.parentThreadId;
  }
  return current;
});

/** The canvas thread for a caller, falling back to the caller's own canvas if lineage is unreadable. */
export const canvasThreadOf = Effect.fn("sharedCanvas.canvasThreadOf")(function* (
  threadId: ThreadId,
) {
  const threads = yield* ThreadManagementService.ThreadManagementService;
  return yield* resolveCanvasThread(threadId, (id) =>
    threads.getThreadShell(id).pipe(
      Effect.map((shell) => (shell === null ? null : shell.lineage)),
      Effect.orElseSucceed(() => null),
    ),
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
