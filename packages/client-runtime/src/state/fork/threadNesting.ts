import type { EnvironmentId, ProjectId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";

import { arrayElementsEqual, threadKey } from "../entities.ts";
import type { EnvironmentThreadShell, PendingSubagentRequest } from "../models.ts";
import {
  sortThreadsByConversation,
  type ThreadConversationActivity,
} from "./threadConversationOrder.ts";

/**
 * Fork owner for nested threads (F31). A thread created with
 * `nestedUnderThreadId` lists under that ordinary parent, one level deep.
 * Clients group, badge, expand and traverse through these helpers so web and
 * mobile agree. Keys are `threadKey` values from `state/entities`.
 */

/** The fields nesting reads. Raw shells omit `environmentId`; presented shells carry it. */
export interface NestableThread {
  readonly id: ThreadId;
  readonly environmentId?: EnvironmentId | undefined;
  readonly projectId: ProjectId;
  /** Null while the thread is active. */
  readonly archivedAt: unknown;
  readonly lineage: { readonly relationshipToParent: "fork" | "subagent" | null };
  readonly nestedUnderThreadId?: ThreadId | null | undefined;
}

/** A thread that can list children: active, ordinary and not nested itself. */
export function canHostNestedThreads(thread: NestableThread): boolean {
  return (
    thread.archivedAt == null &&
    thread.lineage.relationshipToParent !== "subagent" &&
    thread.nestedUnderThreadId == null
  );
}

/**
 * Whether `child` renders under `parent`. Anything else, such as an archived,
 * nested or subagent parent or one in another project or environment, leaves
 * the child at top level as an orphan.
 */
export function isNestedUnder(child: NestableThread, parent: NestableThread): boolean {
  return (
    child.nestedUnderThreadId != null &&
    child.nestedUnderThreadId === parent.id &&
    child.id !== parent.id &&
    child.lineage.relationshipToParent !== "subagent" &&
    child.projectId === parent.projectId &&
    child.environmentId === parent.environmentId &&
    canHostNestedThreads(parent)
  );
}

type ScopedNestableThread = NestableThread & { readonly environmentId: EnvironmentId };

/** The parent `thread` renders under, looked up among threads keyed by `threadKey`. */
export function resolveNestedThreadParent<T extends ScopedNestableThread>(
  thread: ScopedNestableThread,
  threadsByKey: ReadonlyMap<string, T>,
): T | null {
  if (thread.nestedUnderThreadId == null) return null;
  const parent = threadsByKey.get(
    threadKey({ environmentId: thread.environmentId, threadId: thread.nestedUnderThreadId }),
  );
  return parent !== undefined && isNestedUnder(thread, parent) ? parent : null;
}

/** Threads by `threadKey`, the index `resolveNestedThreadParent` reads. */
export function indexThreadsByNestingKey<
  T extends { readonly environmentId: EnvironmentId; readonly id: ThreadId },
>(threads: ReadonlyArray<T>): ReadonlyMap<string, T> {
  return new Map(
    threads.map(
      (thread) =>
        [threadKey({ environmentId: thread.environmentId, threadId: thread.id }), thread] as const,
    ),
  );
}

export interface NestedThreadGroups<T> {
  /** Threads that render as rows of their own, in input order. */
  readonly topLevel: ReadonlyArray<T>;
  /** Children per parent key, most recent conversation first. Parents without children are absent. */
  readonly childrenByParentKey: ReadonlyMap<string, ReadonlyArray<T>>;
}

const EMPTY_CHILDREN: ReadonlyMap<string, ReadonlyArray<never>> = new Map<string, never[]>();

/**
 * Splits the visible threads into rows and children. Only parents inside
 * `visible` adopt children, so a child whose parent sits in another sidebar
 * view stays top level. Group the whole visible set before sectioning: children
 * do not take part in sections.
 *
 * Pass the previous result to keep unchanged arrays, and the whole result,
 * when an unrelated thread updates.
 */
export function groupNestedThreads<T extends ScopedNestableThread & ThreadConversationActivity>(
  visible: ReadonlyArray<T>,
  previous?: NestedThreadGroups<T>,
): NestedThreadGroups<T> {
  const byKey = new Map<string, T>();
  for (const thread of visible) {
    byKey.set(threadKey({ environmentId: thread.environmentId, threadId: thread.id }), thread);
  }
  const topLevel: T[] = [];
  const grouped = new Map<string, T[]>();
  for (const thread of visible) {
    const parent = resolveNestedThreadParent(thread, byKey);
    if (parent === null) {
      topLevel.push(thread);
      continue;
    }
    const parentKey = threadKey({ environmentId: parent.environmentId, threadId: parent.id });
    const siblings = grouped.get(parentKey);
    if (siblings === undefined) grouped.set(parentKey, [thread]);
    else siblings.push(thread);
  }
  const childrenByParentKey = new Map<string, ReadonlyArray<T>>();
  for (const [parentKey, children] of grouped) {
    const sorted = sortThreadsByConversation(children);
    const before = previous?.childrenByParentKey.get(parentKey);
    childrenByParentKey.set(
      parentKey,
      before !== undefined && arrayElementsEqual(before, sorted) ? before : sorted,
    );
  }
  if (previous === undefined) {
    return {
      topLevel,
      childrenByParentKey: childrenByParentKey.size === 0 ? EMPTY_CHILDREN : childrenByParentKey,
    };
  }
  const sameTopLevel = arrayElementsEqual(previous.topLevel, topLevel);
  const sameChildren =
    previous.childrenByParentKey.size === childrenByParentKey.size &&
    [...childrenByParentKey].every(
      ([parentKey, children]) => previous.childrenByParentKey.get(parentKey) === children,
    );
  if (sameTopLevel && sameChildren) return previous;
  return {
    topLevel: sameTopLevel ? previous.topLevel : topLevel,
    childrenByParentKey: sameChildren
      ? previous.childrenByParentKey
      : childrenByParentKey.size === 0
        ? EMPTY_CHILDREN
        : childrenByParentKey,
  };
}

/** Child icons shown after the parent's own provider icon. */
export const NESTED_THREAD_BADGE_LIMIT = 2;

export interface NestedThreadBadge<P> {
  /**
   * One provider instance per shown child, most recent conversation first.
   * Clients draw the parent's own provider ahead of these.
   */
  readonly providerInstanceIds: ReadonlyArray<P>;
  /** Children not shown, rendered as `+n` when above zero. */
  readonly overflow: number;
}

const badges = new WeakMap<ReadonlyArray<object>, NestedThreadBadge<unknown>>();

/** The parent row's badge. The same children array returns the same badge. */
export function nestedThreadBadge<
  P extends string,
  T extends ThreadConversationActivity & {
    readonly id: string;
    readonly environmentId?: string;
    readonly providerInstanceId: P;
  },
>(children: ReadonlyArray<T>): NestedThreadBadge<P> {
  const cached = badges.get(children) as NestedThreadBadge<P> | undefined;
  if (cached !== undefined) return cached;
  const shown = sortThreadsByConversation(children)
    .slice(0, NESTED_THREAD_BADGE_LIMIT)
    .map((child) => child.providerInstanceId);
  const badge = { providerInstanceIds: shown, overflow: children.length - shown.length };
  badges.set(children, badge);
  return badge;
}

/**
 * Whether a parent row shows its children. An explicit choice wins; without
 * one the parent opens while one of its children is the active thread. The
 * chevron stores `!expanded`. Clear the stored value to return to automatic.
 */
export function isNestedThreadParentExpanded(input: {
  readonly explicit: boolean | undefined;
  readonly children: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly id: ThreadId;
  }>;
  readonly activeThreadKey: string | null;
}): boolean {
  if (input.explicit !== undefined) return input.explicit;
  const { activeThreadKey } = input;
  return (
    activeThreadKey !== null &&
    input.children.some(
      (child) =>
        threadKey({ environmentId: child.environmentId, threadId: child.id }) === activeThreadKey,
    )
  );
}

/**
 * How a client draws a top-level row. Cards and slim (snoozed or settled)
 * rows expand; the compact list and the rail show the badge only.
 */
export type NestedThreadRowPresentation = "card" | "slim" | "compact";

/** Whether a parent row in this presentation offers the chevron and lists its children. */
export function canExpandNestedParent(presentation: NestedThreadRowPresentation): boolean {
  return presentation !== "compact";
}

/**
 * Whether a collapsed shelf keeps `thread`'s row for the open thread: the
 * row is the open thread, or the parent of an open child. The open child then
 * lists under it, so it never vanishes behind the shelf.
 */
export function nestedParentKeepsRoute(input: {
  readonly thread: { readonly environmentId: EnvironmentId; readonly id: ThreadId };
  readonly children:
    | ReadonlyArray<{ readonly environmentId: EnvironmentId; readonly id: ThreadId }>
    | undefined;
  readonly route: ScopedThreadRef | null;
}): boolean {
  const { route } = input;
  if (route === null) return false;
  const isRoute = (thread: { readonly environmentId: EnvironmentId; readonly id: ThreadId }) =>
    thread.environmentId === route.environmentId && thread.id === route.threadId;
  return isRoute(input.thread) || (input.children?.some(isRoute) ?? false);
}

/** What a child waits on the user for, rolled up for its parent; an approval outranks a question. */
export function nestedThreadAttention(
  children: ReadonlyArray<
    Pick<
      EnvironmentThreadShell,
      "hasPendingApprovals" | "hasPendingUserInput" | "pendingSubagentRequest"
    >
  >,
): PendingSubagentRequest | null {
  let request: PendingSubagentRequest | null = null;
  for (const child of children) {
    if (child.hasPendingApprovals || child.pendingSubagentRequest === "approval") {
      return "approval";
    }
    if (child.hasPendingUserInput || child.pendingSubagentRequest === "user_input") {
      request = "user_input";
    }
  }
  return request;
}

/**
 * Whether a snoozed or settled parent moves to the active section: only while
 * a child waits on the user for an approval or input. Working children do not
 * lift it.
 */
export function nestedParentLiftsToActive(
  children: Parameters<typeof nestedThreadAttention>[0] | undefined,
): boolean {
  return children !== undefined && nestedThreadAttention(children) !== null;
}

/**
 * Rows in traversal order: each expanded parent is followed by its children.
 * Use it for keyboard order, jump hints and range selection.
 */
export function flattenNestedThreads<
  T extends { readonly environmentId: EnvironmentId; readonly id: ThreadId },
>(
  topLevel: ReadonlyArray<T>,
  childrenByParentKey: ReadonlyMap<string, ReadonlyArray<T>>,
  isExpanded: (parentKey: string) => boolean,
): T[] {
  const rows: T[] = [];
  for (const thread of topLevel) {
    rows.push(thread);
    const key = threadKey({ environmentId: thread.environmentId, threadId: thread.id });
    const children = childrenByParentKey.get(key);
    if (children !== undefined && isExpanded(key)) rows.push(...children);
  }
  return rows;
}

/** A press on the open parent toggles its children; any other row press opens the row. */
export function resolveNestedRowClick(input: {
  readonly isActive: boolean;
  readonly hasChildren: boolean;
}): "toggle" | "navigate" {
  return input.isActive && input.hasChildren ? "toggle" : "navigate";
}

/** Command palette label for a nested thread. */
export function nestedThreadPaletteLabel(parentTitle: string, childTitle: string): string {
  return `${parentTitle} › ${childTitle}`;
}

/** Whether "Move to top level" applies. Orphans qualify, since they still carry the field. */
export function canMoveNestedThreadToTopLevel(
  thread: Pick<NestableThread, "lineage" | "nestedUnderThreadId">,
): boolean {
  return thread.nestedUnderThreadId != null && thread.lineage.relationshipToParent !== "subagent";
}

/**
 * Whether "Pin" applies. A nested thread lists under its parent and holds no
 * section of its own, so it pins only after moving to top level.
 */
export function canPinThread(thread: Pick<NestableThread, "nestedUnderThreadId">): boolean {
  return thread.nestedUnderThreadId == null;
}

/**
 * Stored parent expansion limited to threads that still have nested threads
 * naming them, so the persisted map does not grow with deleted or moved
 * threads. `keyOf` is the store's key for a parent. Returns `stored` when
 * nothing is dropped.
 */
export function pruneNestedThreadExpansion<V>(
  stored: Readonly<Record<string, V>>,
  threads: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly nestedUnderThreadId?: ThreadId | null | undefined;
  }>,
  keyOf: (parent: ScopedThreadRef) => string,
): Readonly<Record<string, V>> {
  const keys = Object.keys(stored);
  if (keys.length === 0) return stored;
  const parents = new Set<string>();
  for (const thread of threads) {
    if (thread.nestedUnderThreadId == null) continue;
    parents.add(
      keyOf({ environmentId: thread.environmentId, threadId: thread.nestedUnderThreadId }),
    );
  }
  if (keys.every((key) => parents.has(key))) return stored;
  const pruned: Record<string, V> = {};
  for (const key of keys) if (parents.has(key)) pruned[key] = stored[key]!;
  return pruned;
}
