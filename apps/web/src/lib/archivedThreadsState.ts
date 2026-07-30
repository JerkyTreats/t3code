import { useAtomValue } from "@effect/atom-react";
import {
  type ArchivedSnapshotEntry,
  createArchivedThreadSnapshotsAtomFamily,
  makeArchivedThreadsEnvironmentKey,
} from "@t3tools/client-runtime/state/threads";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import { orchestrationEnvironment } from "../state/orchestration";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readEnvironmentThreadRefs, readThreadShell } from "../state/entities";

function archivedSnapshotAtom(environmentId: EnvironmentId) {
  return orchestrationEnvironment.archivedShellSnapshot({
    environmentId,
    input: {},
  });
}

const archivedSnapshotsAtom = createArchivedThreadSnapshotsAtomFamily({
  getSnapshotAtom: archivedSnapshotAtom,
  labelPrefix: "web:archived-thread-snapshots",
});

export function refreshArchivedThreadsForEnvironment(environmentId: EnvironmentId): void {
  appAtomRegistry.refresh(archivedSnapshotAtom(environmentId));
}

type KnownProjectThread = Pick<EnvironmentThreadShell, "environmentId" | "id" | "projectId">;

export function collectLocallyKnownProjectThreadRefs(input: {
  projectRef: ScopedProjectRef;
  activeThreads: readonly KnownProjectThread[];
  archivedThreads: readonly KnownProjectThread[];
}): ScopedThreadRef[] {
  const threadRefsByKey = new Map<string, ScopedThreadRef>();
  for (const thread of [...input.activeThreads, ...input.archivedThreads]) {
    if (
      thread.environmentId !== input.projectRef.environmentId ||
      thread.projectId !== input.projectRef.projectId
    ) {
      continue;
    }
    const threadRef = scopeThreadRef(thread.environmentId, thread.id);
    threadRefsByKey.set(scopedThreadKey(threadRef), threadRef);
  }
  return [...threadRefsByKey.values()];
}

export function useArchivedThreadSnapshots(environmentIds: ReadonlyArray<EnvironmentId>): {
  readonly snapshots: ReadonlyArray<ArchivedSnapshotEntry>;
  readonly error: string | null;
  readonly isLoading: boolean;
  readonly refresh: () => void;
} {
  const environmentKey = useMemo(
    () => makeArchivedThreadsEnvironmentKey(environmentIds),
    [environmentIds],
  );
  const result = useAtomValue(archivedSnapshotsAtom(environmentKey));
  const refresh = useCallback(() => {
    for (const environmentId of environmentIds) {
      appAtomRegistry.refresh(archivedSnapshotAtom(environmentId));
    }
  }, [environmentIds]);

  return {
    ...result,
    refresh,
  };
}

export function useLocallyKnownProjectThreadMembershipReader(
  environmentIds: ReadonlyArray<EnvironmentId>,
): {
  readonly readProjectMembership: (projectRef: ScopedProjectRef) => {
    readonly threadRefs: ScopedThreadRef[];
    readonly isLoading: boolean;
    readonly error: string | null;
  };
  readonly refreshEnvironment: (environmentId: EnvironmentId) => void;
} {
  useArchivedThreadSnapshots(environmentIds);

  const readProjectMembership = useCallback((projectRef: ScopedProjectRef) => {
    const archivedState = appAtomRegistry.get(
      archivedSnapshotsAtom(makeArchivedThreadsEnvironmentKey([projectRef.environmentId])),
    );
    const environmentState = archivedState.environmentStateById.get(projectRef.environmentId);
    const activeThreads = readEnvironmentThreadRefs(projectRef.environmentId).flatMap(
      (threadRef) => {
        const thread = readThreadShell(threadRef);
        return thread === null ? [] : [thread];
      },
    );
    const archivedThreads =
      environmentState?.snapshot?.threads.map((thread) => ({
        ...thread,
        environmentId: projectRef.environmentId,
      })) ?? [];
    return {
      threadRefs: collectLocallyKnownProjectThreadRefs({
        projectRef,
        activeThreads,
        archivedThreads,
      }),
      isLoading: environmentState?.isLoading ?? true,
      error: environmentState?.error ?? null,
    };
  }, []);
  const refreshEnvironment = useCallback((environmentId: EnvironmentId) => {
    refreshArchivedThreadsForEnvironment(environmentId);
  }, []);

  return {
    readProjectMembership,
    refreshEnvironment,
  };
}
