import { useAtomValue } from "@effect/atom-react";
import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { OrchestrationThreadActivity, ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import { useMemo } from "react";

import { useArchivedThreadSnapshots } from "~/lib/archivedThreadsState";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { environmentThreadDetails } from "~/state/threads";
import type { ProjectOverviewSnapshot } from "./projectManagementOverview";
import type {
  ProjectManagementRouteTarget,
  ProjectManagementThread,
} from "./projectManagementTypes";

const EMPTY_ACTIVITIES_BY_THREAD_KEY = new Map<
  string,
  ReadonlyArray<OrchestrationThreadActivity>
>();

function useThreadActivitiesByKey(
  refs: ReadonlyArray<ScopedThreadRef>,
): ReadonlyMap<string, ReadonlyArray<OrchestrationThreadActivity>> {
  const refsKey = useMemo(() => refs.map(scopedThreadKey).join("\n"), [refs]);
  const atom = useMemo(() => {
    if (refs.length === 0) {
      return Atom.make(EMPTY_ACTIVITIES_BY_THREAD_KEY).pipe(
        Atom.withLabel("project-management-thread-activities:empty"),
      );
    }

    return Atom.make((get) => {
      const next = new Map<string, ReadonlyArray<OrchestrationThreadActivity>>();
      for (const ref of refs) {
        next.set(scopedThreadKey(ref), get(environmentThreadDetails.activitiesAtom(ref)));
      }
      return next;
    }).pipe(Atom.withLabel(`project-management-thread-activities:${refsKey}`));
  }, [refs, refsKey]);

  return useAtomValue(atom);
}

export function useProjectManagementThreads(
  target: Pick<ProjectManagementRouteTarget, "environmentId" | "projectId"> | null,
): ReadonlyArray<ProjectManagementThread> {
  const projectRefs = useMemo(
    () => (target ? [scopeProjectRef(target.environmentId, target.projectId)] : []),
    [target?.environmentId, target?.projectId],
  );
  const activeShells = useThreadShellsForProjectRefs(projectRefs);
  const archivedEnvironmentIds = useMemo(
    () => (target ? [target.environmentId] : []),
    [target?.environmentId],
  );
  const { snapshots: archivedSnapshots } = useArchivedThreadSnapshots(archivedEnvironmentIds);
  const archivedShells = useMemo(
    () =>
      target
        ? archivedSnapshots.flatMap(({ environmentId, snapshot }) =>
            environmentId === target.environmentId
              ? snapshot.threads.filter((thread) => thread.projectId === target.projectId)
              : [],
          )
        : [],
    [archivedSnapshots, target],
  );
  const shells = useMemo(
    () =>
      target
        ? [
            ...activeShells,
            ...archivedShells.map((thread) => ({ ...thread, environmentId: target.environmentId })),
          ]
        : [],
    [activeShells, archivedShells, target],
  );
  const refs = useMemo(
    () => shells.map((thread) => scopeThreadRef(thread.environmentId, thread.id)),
    [shells],
  );
  const activitiesByKey = useThreadActivitiesByKey(refs);

  return useMemo(
    () =>
      shells.map((thread) => ({
        id: thread.id,
        environmentId: thread.environmentId,
        projectId: thread.projectId,
        title: thread.title,
        archivedAt: thread.archivedAt,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        latestTurn: thread.latestTurn,
        branch: thread.branch,
        worktreePath: thread.worktreePath,
        activities:
          activitiesByKey.get(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))) ??
          [],
      })),
    [activitiesByKey, shells],
  );
}

export function latestActiveProjectThread(
  threads: ReadonlyArray<ProjectManagementThread>,
  snapshot: ProjectOverviewSnapshot,
): ProjectManagementThread | null {
  const latest = snapshot.linkedThreads.find((thread) => thread.archivedAt === null);
  if (!latest) return null;
  return (
    threads.find(
      (thread) => thread.id === latest.id && thread.environmentId === latest.environmentId,
    ) ?? null
  );
}
