import { useAtomValue } from "@effect/atom-react";
import {
  type ArchivedSnapshotEntry,
  createArchivedThreadSnapshotsAtomFamily,
  makeArchivedThreadsEnvironmentKey,
} from "@t3tools/client-runtime/state/threads";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useMemo, useRef } from "react";

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

export function useLocallyKnownProjectThreadRefsReader(
  environmentIds: ReadonlyArray<EnvironmentId>,
): {
  readonly readProjectThreadRefs: (projectRef: ScopedProjectRef) => ScopedThreadRef[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshEnvironment: (environmentId: EnvironmentId) => void;
} {
  const { snapshots, isLoading, error } = useArchivedThreadSnapshots(environmentIds);
  const snapshotsRef = useRef(snapshots);
  snapshotsRef.current = snapshots;

  const readProjectThreadRefs = useCallback((projectRef: ScopedProjectRef) => {
    const activeThreads = readEnvironmentThreadRefs(projectRef.environmentId).flatMap(
      (threadRef) => {
        const thread = readThreadShell(threadRef);
        return thread === null ? [] : [thread];
      },
    );
    const archivedThreads = snapshotsRef.current.flatMap(({ environmentId, snapshot }) =>
      snapshot.threads.map((thread) => ({ ...thread, environmentId })),
    );
    return collectLocallyKnownProjectThreadRefs({
      projectRef,
      activeThreads,
      archivedThreads,
    });
  }, []);
  const refreshEnvironment = useCallback((environmentId: EnvironmentId) => {
    refreshArchivedThreadsForEnvironment(environmentId);
  }, []);

  return {
    readProjectThreadRefs,
    isLoading,
    error,
    refreshEnvironment,
  };
}
