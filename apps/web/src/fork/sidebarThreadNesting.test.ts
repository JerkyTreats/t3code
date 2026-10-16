import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  flattenNestedThreads,
  groupNestedThreads,
  indexThreadsByNestingKey,
} from "@t3tools/client-runtime/state/thread-nesting";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { isSidebarNestedLinkClick } from "../components/Sidebar.logic";
import { buildThreadActionMenuItems } from "../components/threadActionMenu.logic";
import {
  collapsedShelfRows,
  nestedChildrenOf,
  nestedParentKey,
  nestedParentKeyOfRoute,
  nestedThreadPaletteTitle,
  notificationSubagentRequests,
  resolveNestedParentRows,
  resolveNestedParentSection,
} from "./sidebarThreadNesting";

const environmentId = EnvironmentId.make("environment-nest");
const projectId = ProjectId.make("project-nest");

interface Row {
  readonly id: ThreadId;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly archivedAt: string | null;
  readonly lineage: { readonly relationshipToParent: "fork" | "subagent" | null };
  readonly nestedUnderThreadId: ThreadId | null;
  readonly title: string;
  readonly createdAt: string;
  readonly latestUserMessageAt: string | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly pendingSubagentRequest: null;
  readonly runtime: null;
}

function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id: ThreadId.make(id),
    environmentId,
    projectId,
    archivedAt: null,
    lineage: { relationshipToParent: null },
    nestedUnderThreadId: null,
    title: id,
    createdAt: "2026-10-15T00:00:00.000Z",
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    runtime: null,
    ...overrides,
  };
}

const under = (parent: string, minute = 0) => ({
  nestedUnderThreadId: ThreadId.make(parent),
  latestUserMessageAt: `2026-10-15T00:0${minute}:00.000Z`,
});
const ref = (thread: Row) => scopeThreadRef(thread.environmentId, thread.id);
const scopedKey = (thread: Row) => scopedThreadKey(ref(thread));

describe("sidebar nesting integration", () => {
  const parent = row("parent");
  const older = row("older", under("parent", 1));
  const newer = row("newer", under("parent", 2));
  const loose = row("loose");
  const groups = groupNestedThreads([parent, older, loose, newer]);

  it("groups over the visible set so only top-level rows are sectioned", () => {
    expect(groups.topLevel.map((thread) => thread.id)).toEqual(["parent", "loose"]);
    expect(nestedChildrenOf(groups, parent)?.map((thread) => thread.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(nestedChildrenOf(groups, loose)).toBeUndefined();
  });

  it("keeps a child whose parent is outside the visible set at top level", () => {
    const outside = groupNestedThreads([older, loose]);
    expect(outside.topLevel.map((thread) => thread.id)).toEqual(["older", "loose"]);
  });

  it("orders traversal with expanded children after their parent", () => {
    const collapsed = resolveNestedParentRows({
      rows: [{ presentation: "card", threads: groups.topLevel }],
      groups,
      explicitByKey: {},
      activeThread: null,
    });
    expect(collapsed.withChildren).toEqual(new Set([nestedParentKey(ref(parent))]));
    expect(
      flattenNestedThreads(groups.topLevel, groups.childrenByParentKey, (key) =>
        collapsed.expanded.has(key),
      ).map((thread) => thread.id),
    ).toEqual(["parent", "loose"]);

    const autoExpanded = resolveNestedParentRows({
      rows: [{ presentation: "card", threads: groups.topLevel }],
      groups,
      explicitByKey: {},
      activeThread: ref(older),
    });
    expect(
      flattenNestedThreads(groups.topLevel, groups.childrenByParentKey, (key) =>
        autoExpanded.expanded.has(key),
      ).map((thread) => thread.id),
    ).toEqual(["parent", "newer", "older", "loose"]);

    const explicitlyCollapsed = resolveNestedParentRows({
      rows: [{ presentation: "card", threads: groups.topLevel }],
      groups,
      explicitByKey: { [scopedKey(parent)]: false },
      activeThread: ref(older),
    });
    expect(explicitlyCollapsed.expanded.size).toBe(0);
  });

  it("gives compact rows no chevron and no children", () => {
    const rows = resolveNestedParentRows({
      rows: [{ presentation: "compact", threads: groups.topLevel }],
      groups,
      explicitByKey: { [scopedKey(parent)]: true },
      activeThread: null,
    });
    expect(rows.withChildren.size).toBe(0);
    expect(rows.expanded.size).toBe(0);
  });

  it("clears the stored expansion of the parent whose child is opened", () => {
    expect(nestedParentKeyOfRoute(groups, ref(newer))).toBe(scopedKey(parent));
    expect(nestedParentKeyOfRoute(groups, ref(parent))).toBeNull();
    expect(nestedParentKeyOfRoute(groups, null)).toBeNull();
  });
});

describe("shelves keep the open child", () => {
  const parent = row("parent");
  const child = row("child", under("parent"));
  const other = row("other");
  const groups = groupNestedThreads([parent, child, other]);
  const shelf = groups.topLevel;

  /** The rows the sidebar renders for one shelf, children included. */
  function renderedShelf(
    expanded: boolean,
    presentation: "card" | "slim",
    route: ReturnType<typeof ref> | null,
  ) {
    const rows = expanded ? shelf : collapsedShelfRows(shelf, groups, route);
    const parentRows = resolveNestedParentRows({
      rows: [{ presentation, threads: rows }],
      groups,
      explicitByKey: {},
      activeThread: route,
    });
    return flattenNestedThreads(rows, groups.childrenByParentKey, (key) =>
      parentRows.expanded.has(key),
    ).map((thread) => thread.id);
  }

  it("keeps the parent and the open child on a collapsed working shelf", () => {
    expect(renderedShelf(false, "card", ref(child))).toEqual(["parent", "child"]);
  });

  it("keeps the parent and the open child on a collapsed snoozed or settled shelf", () => {
    expect(renderedShelf(false, "slim", ref(child))).toEqual(["parent", "child"]);
  });

  it("lists the open child under its slim parent on an open shelf", () => {
    expect(renderedShelf(true, "slim", ref(child))).toEqual(["parent", "child", "other"]);
  });

  it("keeps only the open thread itself, or nothing, otherwise", () => {
    expect(renderedShelf(false, "slim", ref(other))).toEqual(["other"]);
    expect(collapsedShelfRows(shelf, groups, null)).toHaveLength(0);
    expect(collapsedShelfRows(shelf, groups, null)).toBe(collapsedShelfRows([], groups, null));
  });
});

describe("isSidebarNestedLinkClick", () => {
  it("leaves chevron clicks to the chevron", () => {
    const chevron = { closest: (selector: string) => (selector.includes("nested") ? {} : null) };
    const plain = { closest: () => null, parentElement: null };
    expect(isSidebarNestedLinkClick(chevron as unknown as EventTarget)).toBe(true);
    expect(isSidebarNestedLinkClick(plain as unknown as EventTarget)).toBe(false);
  });
});

describe("resolveNestedParentSection", () => {
  const waiting = [row("child", { ...under("parent"), hasPendingUserInput: true })];
  const idle = [row("child", under("parent"))];

  it("brings a parked parent back to the inbox when a child needs the user", () => {
    expect(resolveNestedParentSection("settled", waiting)).toBe("active");
    expect(resolveNestedParentSection("snoozed", waiting)).toBe("active");
    expect(resolveNestedParentSection("pinned", waiting)).toBe("pinned");
  });

  it("leaves a parent alone when no child needs the user", () => {
    expect(resolveNestedParentSection("settled", idle)).toBe("settled");
    expect(resolveNestedParentSection("settled", undefined)).toBe("settled");
  });
});

describe("drag exclusion", () => {
  it("sections and drags only top-level rows", () => {
    const parent = row("parent");
    const child = row("child", under("parent"));
    const groups = groupNestedThreads([parent, child]);
    // The sidebar builds its sortable list from topLevel alone.
    expect(groups.topLevel).toEqual([parent]);
    expect(groups.topLevel).not.toContain(child);
  });
});

describe("nestedThreadPaletteTitle", () => {
  it("labels a nested thread parent › child and leaves others alone", () => {
    const parent = row("parent", { title: "Release" });
    const child = row("child", { ...under("parent"), title: "Changelog" });
    const orphan = row("orphan", { ...under("missing"), title: "Orphan" });
    const byKey = indexThreadsByNestingKey([parent, child, orphan]);
    expect(nestedThreadPaletteTitle(child, byKey)).toBe("Release › Changelog");
    expect(nestedThreadPaletteTitle(parent, byKey)).toBe("Release");
    expect(nestedThreadPaletteTitle(orphan, byKey)).toBe("Orphan");
  });
});

describe("Move to top level availability", () => {
  const menuState = {
    canOperate: true,
    branch: null,
    projectFilter: null,
    isPinned: false,
    isSettled: false,
    autoSettleEnabled: true,
    isSnoozed: false,
    canSnoozeNow: true,
    isRegeneratingTitle: false,
    isRunning: false,
    supports: {
      settlement: false,
      autoSettleOptOut: false,
      snooze: false,
      pinning: false,
      titleRegeneration: false,
    },
    snoozePresets: [],
  };

  it("appears for nested threads and orphans, never for top-level threads", () => {
    const ids = (canMoveToTopLevel: boolean) =>
      buildThreadActionMenuItems({ ...menuState, canMoveToTopLevel }).map((item) => item.id);
    expect(ids(true)).toContain("move-to-top-level");
    expect(ids(false)).not.toContain("move-to-top-level");
  });
});

describe("notificationSubagentRequests", () => {
  // Only the fields the request walk reads; the rest of the shell is irrelevant here.
  function shell(
    id: string,
    overrides: {
      nestedUnderThreadId?: ThreadId | null;
      parentThreadId?: ThreadId | null;
      subagent?: boolean;
      waiting?: boolean;
    } = {},
  ): OrchestrationV2ThreadShell {
    const thread = {
      id: ThreadId.make(id),
      projectId,
      archivedAt: null,
      status: "running",
      nestedUnderThreadId: overrides.nestedUnderThreadId ?? null,
      lineage: {
        rootThreadId: ThreadId.make(id),
        parentThreadId: overrides.parentThreadId ?? null,
        relationshipToParent: overrides.subagent === true ? "subagent" : null,
      },
      pendingRuntimeRequest:
        overrides.waiting === true ? { id: "request", kind: "user_input" } : null,
    };
    return thread as unknown as OrchestrationV2ThreadShell;
  }

  it("does not bubble a nested child's request to its parent, so only the child notifies", () => {
    const threads = [
      shell("parent"),
      shell("child", { nestedUnderThreadId: ThreadId.make("parent"), waiting: true }),
    ];
    expect(notificationSubagentRequests(threads).has(ThreadId.make("parent"))).toBe(false);
  });

  it("still bubbles subagent requests to the visible thread", () => {
    const threads = [
      shell("parent"),
      shell("helper", { parentThreadId: ThreadId.make("parent"), subagent: true, waiting: true }),
    ];
    expect(notificationSubagentRequests(threads).get(ThreadId.make("parent"))).toBe("user_input");
  });
});
