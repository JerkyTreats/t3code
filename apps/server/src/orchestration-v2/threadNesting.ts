import type { OrchestrationV2AppThread, ProjectId, ThreadId } from "@t3tools/contracts";

/**
 * Drops sidebar nesting from an app thread copied into a new thread. Forks, subagent
 * children and other derived threads start at top level; only `thread.create` nests.
 */
export function withoutThreadNesting(thread: OrchestrationV2AppThread): OrchestrationV2AppThread {
  const { nestedUnderThreadId: _nesting, ...unnested } = thread;
  return unnested;
}

/**
 * Why `thread.create` may not nest under `parent`, or `null` when it may. The target
 * must be an ordinary, live, top-level thread in the same project; nesting is one
 * level deep and never involves subagents. Pass `null` when the parent was not found.
 */
export function nestingParentRejection(input: {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly parentThreadId: ThreadId;
  readonly parent: OrchestrationV2AppThread | null;
}): string | null {
  const { parent } = input;
  if (input.parentThreadId === input.threadId) return "a thread cannot nest under itself";
  if (parent === null || parent.deletedAt !== null) return "the parent thread does not exist";
  if (parent.projectId !== input.projectId) return "the parent thread belongs to another project";
  if (parent.archivedAt !== null) return "the parent thread is archived";
  if (parent.lineage.relationshipToParent === "subagent") return "the parent thread is a subagent";
  if (parent.nestedUnderThreadId != null) return "the parent thread is itself nested";
  return null;
}
