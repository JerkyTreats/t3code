import { type ProjectId, type ThreadId } from "@t3tools/contracts";

interface PendingProjectScriptRun {
  readonly projectId: ProjectId;
  readonly scriptId: string;
}

const pendingRunsByThreadId = new Map<ThreadId, PendingProjectScriptRun>();

export function schedulePendingProjectScriptRun(input: {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly scriptId: string;
}): void {
  pendingRunsByThreadId.set(input.threadId, {
    projectId: input.projectId,
    scriptId: input.scriptId,
  });
}

export function consumePendingProjectScriptRun(threadId: ThreadId): PendingProjectScriptRun | null {
  const pending = pendingRunsByThreadId.get(threadId) ?? null;
  pendingRunsByThreadId.delete(threadId);
  return pending;
}

export function resetPendingProjectScriptRunsForTests(): void {
  pendingRunsByThreadId.clear();
}
