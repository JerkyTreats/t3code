import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  EnvironmentId,
  type OrchestrationThread,
  ThreadId,
  type ScopedThreadRef,
} from "@t3tools/contracts";

export interface ThreadSelectionRouteParams {
  readonly environmentId?: string | string[];
  readonly threadId?: string | string[];
}

function firstRouteParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function resolveThreadRouteRef(
  params: ThreadSelectionRouteParams | undefined,
): ScopedThreadRef | null {
  const environmentId = firstRouteParam(params?.environmentId);
  const threadId = firstRouteParam(params?.threadId);
  if (!environmentId || !threadId) {
    return null;
  }

  return {
    environmentId: EnvironmentId.make(environmentId),
    threadId: ThreadId.make(threadId),
  };
}

export function retainThreadRouteRef(
  routeRef: ScopedThreadRef | null,
  previousRef: ScopedThreadRef | null,
): ScopedThreadRef | null {
  return routeRef ?? previousRef;
}

function latestUserMessageAt(thread: OrchestrationThread): OrchestrationThread["updatedAt"] | null {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (message?.role === "user") {
      return message.createdAt;
    }
  }

  return null;
}

export function threadDetailToShell(
  environmentId: EnvironmentId,
  thread: OrchestrationThread,
): EnvironmentThreadShell {
  return {
    environmentId,
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    latestTurn: thread.latestTurn,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    archivedAt: thread.archivedAt,
    settledOverride: thread.settledOverride,
    settledAt: thread.settledAt,
    session: thread.session,
    latestUserMessageAt: latestUserMessageAt(thread),
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    activePlanProgress: null,
    latestRuntimeActivityAt: null,
    statusSummaryUpdatedAt: null,
  };
}
