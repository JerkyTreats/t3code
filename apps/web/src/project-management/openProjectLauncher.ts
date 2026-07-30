import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type {
  ScopedProjectRef,
  ScopedThreadRef,
  SidebarThreadSortOrder,
  ThreadId,
} from "@t3tools/contracts";

import { getLatestThreadForProject } from "../lib/threadSort";
import type { SidebarThreadSummary } from "../types";

type ProjectLauncherThread = Pick<
  SidebarThreadSummary,
  "archivedAt" | "createdAt" | "environmentId" | "id" | "projectId" | "title"
> & {
  readonly updatedAt: string;
  readonly latestUserMessageAt?: string | null;
};

export interface OpenConcreteProjectLauncherInput {
  readonly projectRef: ScopedProjectRef;
  readonly threads: ReadonlyArray<ProjectLauncherThread>;
  readonly sortOrder: SidebarThreadSortOrder;
  readonly showLauncher: (threadRef: ScopedThreadRef) => void;
  readonly navigateToThread: (threadRef: ScopedThreadRef) => Promise<void>;
  readonly createProjectThread: (
    projectRef: ScopedProjectRef,
    beforeNavigate: (threadId: ThreadId) => void,
  ) => Promise<void>;
}

export async function openConcreteProjectLauncher(
  input: OpenConcreteProjectLauncherInput,
): Promise<void> {
  const projectThreads = input.threads.filter(
    (thread) =>
      thread.environmentId === input.projectRef.environmentId &&
      thread.projectId === input.projectRef.projectId,
  );
  const latestThread = getLatestThreadForProject(
    projectThreads,
    input.projectRef.projectId,
    input.sortOrder,
  );
  if (latestThread) {
    const threadRef = scopeThreadRef(latestThread.environmentId, latestThread.id);
    input.showLauncher(threadRef);
    await input.navigateToThread(threadRef);
    return;
  }

  await input.createProjectThread(input.projectRef, (threadId) => {
    input.showLauncher(scopeThreadRef(input.projectRef.environmentId, threadId));
  });
}
