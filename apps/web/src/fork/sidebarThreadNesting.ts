import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadKey } from "@t3tools/client-runtime/state/entities";
import {
  canExpandNestedParent,
  isNestedThreadParentExpanded,
  nestedParentKeepsRoute,
  nestedParentLiftsToActive,
  nestedThreadPaletteLabel,
  resolveNestedThreadParent,
  type NestableThread,
  type NestedThreadGroups,
  type NestedThreadRowPresentation,
} from "@t3tools/client-runtime/state/thread-nesting";
import { pendingSubagentRequestsByThread } from "@t3tools/client-runtime/state/threads";
import type {
  EnvironmentId,
  OrchestrationV2ThreadShell,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";

import type { SidebarSection } from "../components/Sidebar.logic";

/**
 * Web adapter for nested threads (F31). The client-runtime owner keys groups
 * by `threadKey`; the sidebar keys rows, selection and persisted state by
 * `scopedThreadKey`. These helpers convert at that boundary.
 */

/** The parent row's chevron. Row clicks on it toggle instead of selecting or navigating. */
export const SIDEBAR_NESTED_TOGGLE_SELECTOR = "[data-sidebar-nested-toggle]";

interface ThreadIdentity {
  readonly environmentId: EnvironmentId;
  readonly id: ThreadId;
}

type AttentionChild = NonNullable<Parameters<typeof nestedParentLiftsToActive>[0]>[number];

/** The children listed under `thread`, or undefined when it has none. */
export function nestedChildrenOf<T>(
  groups: NestedThreadGroups<T>,
  thread: ThreadIdentity,
): ReadonlyArray<T> | undefined {
  return groups.childrenByParentKey.get(
    nestedParentKey(scopeThreadRef(thread.environmentId, thread.id)),
  );
}

/**
 * Section for a top-level row. A parent whose child waits on the user leaves
 * the snoozed and settled shelves for the inbox, as a thread with its own
 * pending request does.
 */
export function resolveNestedParentSection(
  section: SidebarSection,
  children: ReadonlyArray<AttentionChild> | undefined,
): SidebarSection {
  if (section !== "snoozed" && section !== "settled") return section;
  // A snoozed parent already wakes from the request bubbled onto it; the lift
  // matters for settled parents, which a bubbled request does not move.
  return nestedParentLiftsToActive(children) ? "active" : section;
}

// Collapsed shelves share one empty list so a route change alone does not
// give the sidebar list a new identity.
const NO_ROWS: ReadonlyArray<never> = [];

/**
 * Rows a collapsed shelf still shows: the open thread, or the parent of an
 * open child, which then lists the child under it.
 */
export function collapsedShelfRows<T extends ThreadIdentity>(
  threads: ReadonlyArray<T>,
  groups: NestedThreadGroups<ThreadIdentity>,
  route: ScopedThreadRef | null,
): ReadonlyArray<T> {
  if (route === null) return NO_ROWS;
  const kept = threads.filter((thread) =>
    nestedParentKeepsRoute({ thread, children: nestedChildrenOf(groups, thread), route }),
  );
  return kept.length === 0 ? NO_ROWS : kept;
}

export interface NestedParentRows {
  /** Rows with children, which show a chevron. */
  readonly withChildren: ReadonlySet<string>;
  /** The subset that shows its children. */
  readonly expanded: ReadonlySet<string>;
}

/**
 * Chevron and expansion state of the rendered top-level rows, as
 * `nestedParentKey` values for `flattenNestedThreads`. Rows come grouped by
 * presentation; `explicitByKey` is the persisted choice keyed by
 * `scopedThreadKey`.
 */
export function resolveNestedParentRows(input: {
  readonly rows: ReadonlyArray<{
    readonly presentation: NestedThreadRowPresentation;
    readonly threads: ReadonlyArray<ThreadIdentity>;
  }>;
  readonly groups: NestedThreadGroups<ThreadIdentity>;
  readonly explicitByKey: Readonly<Record<string, boolean>>;
  readonly activeThread: ScopedThreadRef | null;
}): NestedParentRows {
  const activeThreadKey = input.activeThread === null ? null : threadKey(input.activeThread);
  const withChildren = new Set<string>();
  const expanded = new Set<string>();
  for (const { presentation, threads } of input.rows) {
    if (!canExpandNestedParent(presentation)) continue;
    for (const parent of threads) {
      const children = nestedChildrenOf(input.groups, parent);
      if (children === undefined) continue;
      const key = nestedParentKey(scopeThreadRef(parent.environmentId, parent.id));
      withChildren.add(key);
      const explicit =
        input.explicitByKey[scopedThreadKey(scopeThreadRef(parent.environmentId, parent.id))];
      if (isNestedThreadParentExpanded({ explicit, children, activeThreadKey })) expanded.add(key);
    }
  }
  return { withChildren, expanded };
}

/** The key `childrenByParentKey` and `NestedParentRows` use for a parent. */
export function nestedParentKey(ref: ScopedThreadRef): string {
  return threadKey(ref);
}

/**
 * The parent, by `scopedThreadKey`, whose stored expansion clears when the
 * route moves to one of its children, so auto-expand shows the open child.
 */
export function nestedParentKeyOfRoute(
  groups: NestedThreadGroups<ThreadIdentity & Pick<NestableThread, "nestedUnderThreadId">>,
  route: ScopedThreadRef | null,
): string | null {
  if (route === null) return null;
  const routeKey = threadKey(route);
  for (const children of groups.childrenByParentKey.values()) {
    for (const child of children) {
      if (
        child.nestedUnderThreadId != null &&
        threadKey({ environmentId: child.environmentId, threadId: child.id }) === routeKey
      ) {
        return scopedThreadKey(scopeThreadRef(child.environmentId, child.nestedUnderThreadId));
      }
    }
  }
  return null;
}

/** Command palette title: `parent › child` for a nested thread, else its own title. */
export function nestedThreadPaletteTitle<
  T extends NestableThread & ThreadIdentity & { readonly title: string },
>(thread: T, threadsByKey: ReadonlyMap<string, T>): string {
  const parent = resolveNestedThreadParent(thread, threadsByKey);
  return parent === null ? thread.title : nestedThreadPaletteLabel(parent.title, thread.title);
}

/**
 * Requests the notifier reads per thread: those bubbled up from subagents
 * only. A nested child notifies for itself, so the copy of its request on its
 * parent must not notify a second time.
 */
export function notificationSubagentRequests(
  threads: ReadonlyArray<OrchestrationV2ThreadShell>,
): ReturnType<typeof pendingSubagentRequestsByThread> {
  if (!threads.some((thread) => thread.nestedUnderThreadId != null)) {
    return pendingSubagentRequestsByThread(threads);
  }
  return pendingSubagentRequestsByThread(
    threads.map((thread) =>
      thread.nestedUnderThreadId == null ? thread : { ...thread, nestedUnderThreadId: null },
    ),
  );
}
