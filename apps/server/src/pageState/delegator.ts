import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

/** How a thread relates to its parent, as much of the shell as delegation needs. */
export interface ThreadLineage {
  readonly parentThreadId: ThreadId | null;
  readonly relationshipToParent: "fork" | "subagent" | null;
}

// Delegation nests, but a chain this deep is a runaway, not a drill-down.
const MAX_DELEGATION_DEPTH = 8;

/**
 * The thread a delegated task works for, however deep: its canvas and page state are that
 * thread's. Any other thread, including a fork, is its own.
 */
export const delegatorOf = Effect.fn("delegator.delegatorOf")(function* <E>(
  threadId: ThreadId,
  lineageOf: (threadId: ThreadId) => Effect.Effect<ThreadLineage | null, E>,
) {
  let current = threadId;
  for (let depth = 0; depth < MAX_DELEGATION_DEPTH; depth += 1) {
    const lineage = yield* lineageOf(current);
    if (lineage?.relationshipToParent !== "subagent" || lineage.parentThreadId === null) break;
    current = lineage.parentThreadId;
  }
  return current;
});
