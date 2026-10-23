import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { threadKey } from "../entities.ts";
import { presentThreadShell, type EnvironmentThreadShell } from "../models.ts";
import { v2Now, v2ThreadShell } from "../orchestrationV2TestFixtures.ts";
import {
  canExpandNestedParent,
  canMoveNestedThreadToTopLevel,
  canPinThread,
  flattenNestedThreads,
  groupNestedThreads,
  indexThreadsByNestingKey,
  isNestedThreadParentExpanded,
  nestedThreadAttention,
  nestedThreadBadge,
  nestedParentKeepsRoute,
  nestedParentLiftsToActive,
  nestedThreadPaletteLabel,
  pruneNestedThreadExpansion,
  resolveNestedRowClick,
  resolveNestedThreadParent,
} from "./threadNesting.ts";

const environmentId = EnvironmentId.make("environment-nest");
const otherEnvironmentId = EnvironmentId.make("environment-other");

function shell(
  id: string,
  overrides: Partial<OrchestrationV2ThreadShell> = {},
  environment: EnvironmentId = environmentId,
): EnvironmentThreadShell {
  const threadId = ThreadId.make(id);
  return presentThreadShell(environment, {
    ...v2ThreadShell,
    id: threadId,
    lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
    ...overrides,
  });
}

const at = (minutes: number) => DateTime.add(v2Now, { minutes });
const keyOf = (thread: EnvironmentThreadShell) =>
  threadKey({ environmentId: thread.environmentId, threadId: thread.id });
const under = (parent: string) => ({ nestedUnderThreadId: ThreadId.make(parent) });

describe("groupNestedThreads", () => {
  it("lists children under their parent, most recent conversation first", () => {
    const parent = shell("parent");
    const older = shell("older", { ...under("parent"), latestUserMessageAt: at(1) });
    const newer = shell("newer", { ...under("parent"), latestUserMessageAt: at(2) });
    const loose = shell("loose");
    const groups = groupNestedThreads([older, parent, newer, loose]);
    expect(groups.topLevel.map((thread) => thread.id)).toEqual(["parent", "loose"]);
    expect(groups.childrenByParentKey.get(keyOf(parent))?.map((thread) => thread.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(groups.childrenByParentKey.has(keyOf(loose))).toBe(false);
  });

  it("keeps orphans at top level", () => {
    const archived = shell("archived", { archivedAt: v2Now });
    const subagent = shell("subagent", {
      lineage: {
        rootThreadId: ThreadId.make("root"),
        parentThreadId: ThreadId.make("root"),
        relationshipToParent: "subagent",
      },
    });
    const nestedParent = shell("nested-parent", under("archived"));
    const otherProject = shell("other-project", { projectId: ProjectId.make("elsewhere") });
    const remote = shell("remote", {}, otherEnvironmentId);
    const orphans = [
      shell("missing-parent", under("gone")),
      shell("under-archived", under("archived")),
      shell("under-subagent", under("subagent")),
      shell("under-nested", under("nested-parent")),
      shell("under-other-project", under("other-project")),
      shell("under-remote", under("remote")),
      shell("under-self", under("under-self")),
    ];
    const groups = groupNestedThreads([
      archived,
      subagent,
      nestedParent,
      otherProject,
      remote,
      ...orphans,
    ]);
    expect(groups.childrenByParentKey.size).toBe(0);
    expect(groups.topLevel).toHaveLength(12);
  });

  it("keeps a child at top level when its parent is outside the visible set", () => {
    const child = shell("child", under("parent"));
    expect(groupNestedThreads([child]).topLevel).toEqual([child]);
  });

  it("never nests a subagent", () => {
    const parent = shell("parent");
    const subagent = shell("subagent", {
      ...under("parent"),
      lineage: {
        rootThreadId: ThreadId.make("parent"),
        parentThreadId: ThreadId.make("parent"),
        relationshipToParent: "subagent",
      },
    });
    expect(groupNestedThreads([parent, subagent]).topLevel).toEqual([parent, subagent]);
  });

  it("keeps unchanged arrays when an unrelated thread updates", () => {
    const parentA = shell("a");
    const childA = shell("a-child", under("a"));
    const parentB = shell("b");
    const childB = shell("b-child", under("b"));
    const first = groupNestedThreads([parentA, childA, parentB, childB]);
    expect(groupNestedThreads([parentA, childA, parentB, childB], first)).toBe(first);

    const renamed = shell("b-child", { ...under("b"), title: "Renamed" });
    const second = groupNestedThreads([parentA, childA, parentB, renamed], first);
    expect(second).not.toBe(first);
    expect(second.topLevel).toBe(first.topLevel);
    expect(second.childrenByParentKey.get(keyOf(parentA))).toBe(
      first.childrenByParentKey.get(keyOf(parentA)),
    );
    expect(second.childrenByParentKey.get(keyOf(parentB))).toEqual([renamed]);

    const loose = shell("loose");
    const third = groupNestedThreads([parentA, childA, parentB, renamed, loose], second);
    expect(third.topLevel).not.toBe(second.topLevel);
    expect(third.childrenByParentKey).toBe(second.childrenByParentKey);
  });
});

describe("resolveNestedThreadParent", () => {
  it("finds a valid parent by key", () => {
    const parent = shell("parent");
    const child = shell("child", under("parent"));
    const byKey = new Map([[keyOf(parent), parent]]);
    expect(resolveNestedThreadParent(child, byKey)).toBe(parent);
    expect(resolveNestedThreadParent(parent, byKey)).toBeNull();
    const archived = shell("parent", { archivedAt: v2Now });
    expect(resolveNestedThreadParent(child, new Map([[keyOf(archived), archived]]))).toBeNull();
  });

  it("reads the index built by indexThreadsByNestingKey", () => {
    const parent = shell("parent");
    const child = shell("child", under("parent"));
    const byKey = indexThreadsByNestingKey([parent, child]);
    expect(byKey.get(keyOf(child))).toBe(child);
    expect(resolveNestedThreadParent(child, byKey)).toBe(parent);
  });
});

describe("resolveNestedRowClick", () => {
  it("toggles only the open parent; other rows navigate", () => {
    expect(resolveNestedRowClick({ isActive: true, hasChildren: true })).toBe("toggle");
    expect(resolveNestedRowClick({ isActive: false, hasChildren: true })).toBe("navigate");
    expect(resolveNestedRowClick({ isActive: true, hasChildren: false })).toBe("navigate");
  });
});

describe("nestedThreadBadge", () => {
  const provider = (name: string) => ProviderInstanceId.make(name);

  it("shows up to two children, most recently active first, then overflow", () => {
    const children = ["a", "b", "c", "d", "e"].map((name, index) =>
      shell(name, {
        ...under("parent"),
        providerInstanceId: provider(`provider-${name}`),
        latestUserMessageAt: at(index),
      }),
    );
    const badge = nestedThreadBadge(children);
    expect(badge).toEqual({
      providerInstanceIds: ["provider-e", "provider-d"],
      overflow: 3,
    });
    expect(nestedThreadBadge(children)).toBe(badge);
  });

  it("shows one icon per child even when providers repeat", () => {
    const children = ["a", "b"].map((name) =>
      shell(name, { ...under("parent"), providerInstanceId: provider("codex") }),
    );
    expect(nestedThreadBadge(children)).toEqual({
      providerInstanceIds: ["codex", "codex"],
      overflow: 0,
    });
  });
});

describe("isNestedThreadParentExpanded", () => {
  const child = shell("child", under("parent"));
  const children = [child];

  it("auto-expands while a child is active", () => {
    expect(
      isNestedThreadParentExpanded({ explicit: undefined, children, activeThreadKey: null }),
    ).toBe(false);
    expect(
      isNestedThreadParentExpanded({
        explicit: undefined,
        children,
        activeThreadKey: keyOf(child),
      }),
    ).toBe(true);
  });

  it("honors an explicit choice", () => {
    expect(isNestedThreadParentExpanded({ explicit: true, children, activeThreadKey: null })).toBe(
      true,
    );
    expect(
      isNestedThreadParentExpanded({ explicit: false, children, activeThreadKey: keyOf(child) }),
    ).toBe(false);
  });
});

describe("nestedThreadAttention", () => {
  const request = (kind: "user_input" | "command") => ({
    pendingRuntimeRequest: { id: RuntimeRequestId.make(kind), kind, createdAt: v2Now },
  });

  it("rolls up approval over input", () => {
    const idle = shell("idle", under("parent"));
    const asking = shell("asking", { ...under("parent"), ...request("user_input") });
    const approving = shell("approving", { ...under("parent"), ...request("command") });
    expect(nestedThreadAttention([idle])).toBeNull();
    expect(nestedThreadAttention([idle, asking])).toBe("user_input");
    expect(nestedThreadAttention([asking, approving, idle])).toBe("approval");
    const subagentAsking = { ...idle, pendingSubagentRequest: "user_input" as const };
    expect(nestedThreadAttention([subagentAsking])).toBe("user_input");
  });
});

function runningRuntime(thread: EnvironmentThreadShell): EnvironmentThreadShell["runtime"] {
  return {
    status: "running",
    activeRunId: null,
    providerInstanceId: thread.providerInstanceId,
    providerName: null,
    lastError: null,
    updatedAt: thread.updatedAt,
  };
}

describe("flattenNestedThreads", () => {
  it("inserts expanded children after their parent", () => {
    const a = shell("a");
    const aChild = shell("a-child", under("a"));
    const b = shell("b");
    const bChild = shell("b-child", under("b"));
    const { topLevel, childrenByParentKey } = groupNestedThreads([a, aChild, b, bChild]);
    const order = flattenNestedThreads(topLevel, childrenByParentKey, (key) => key === keyOf(b));
    expect(order.map((thread) => thread.id)).toEqual(["a", "b", "b-child"]);
  });
});

describe("palette and move", () => {
  it("labels a nested thread with its parent", () => {
    expect(nestedThreadPaletteLabel("Manager", "Worker")).toBe("Manager › Worker");
  });

  it("offers Move to top level only for nested ordinary threads, orphans included", () => {
    expect(canMoveNestedThreadToTopLevel(shell("child", under("gone")))).toBe(true);
    expect(canMoveNestedThreadToTopLevel(shell("plain"))).toBe(false);
    expect(canMoveNestedThreadToTopLevel(shell("cleared", { nestedUnderThreadId: null }))).toBe(
      false,
    );
    expect(
      canMoveNestedThreadToTopLevel(
        shell("subagent", {
          ...under("parent"),
          lineage: {
            rootThreadId: ThreadId.make("parent"),
            parentThreadId: ThreadId.make("parent"),
            relationshipToParent: "subagent",
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("presentation", () => {
  const routeOf = (thread: EnvironmentThreadShell) => ({
    environmentId: thread.environmentId,
    threadId: thread.id,
  });

  it("keeps a collapsed shelf's row for the open thread or the parent of an open child", () => {
    const parent = shell("parent");
    const child = shell("child", under("parent"));
    const other = shell("other");
    const remoteTwin = shell("child", under("parent"), otherEnvironmentId);
    const children = [child];
    expect(nestedParentKeepsRoute({ thread: parent, children, route: routeOf(parent) })).toBe(true);
    expect(nestedParentKeepsRoute({ thread: parent, children, route: routeOf(child) })).toBe(true);
    expect(nestedParentKeepsRoute({ thread: parent, children, route: routeOf(other) })).toBe(false);
    expect(nestedParentKeepsRoute({ thread: parent, children, route: routeOf(remoteTwin) })).toBe(
      false,
    );
    expect(nestedParentKeepsRoute({ thread: parent, children, route: null })).toBe(false);
    expect(
      nestedParentKeepsRoute({ thread: other, children: undefined, route: routeOf(other) }),
    ).toBe(true);
  });

  it("expands cards and slim rows; the compact list and rail show the badge only", () => {
    expect(canExpandNestedParent("card")).toBe(true);
    expect(canExpandNestedParent("slim")).toBe(true);
    expect(canExpandNestedParent("compact")).toBe(false);
  });

  it("lifts a parent to active only while a child waits on the user", () => {
    const idle = shell("idle", under("parent"));
    const asking = {
      ...idle,
      hasPendingUserInput: true,
    } satisfies EnvironmentThreadShell;
    const approving = { ...idle, hasPendingApprovals: true } satisfies EnvironmentThreadShell;
    const working = { ...idle, runtime: runningRuntime(idle) } satisfies EnvironmentThreadShell;
    expect(nestedParentLiftsToActive(undefined)).toBe(false);
    expect(nestedParentLiftsToActive([idle])).toBe(false);
    expect(nestedParentLiftsToActive([idle, working])).toBe(false);
    expect(nestedParentLiftsToActive([idle, asking])).toBe(true);
    expect(nestedParentLiftsToActive([approving])).toBe(true);
  });

  it("does not pin nested threads", () => {
    expect(canPinThread(shell("plain"))).toBe(true);
    expect(canPinThread(shell("child", under("parent")))).toBe(false);
    expect(canPinThread(shell("cleared", { nestedUnderThreadId: null }))).toBe(true);
  });
});

describe("pruneNestedThreadExpansion", () => {
  const scoped = (ref: { environmentId: string; threadId: string }) =>
    `${ref.environmentId}:${ref.threadId}`;

  it("keeps only parents that still have nested threads", () => {
    const threads = [shell("parent"), shell("child", under("parent")), shell("plain")];
    const parentKey = `${environmentId}:parent`;
    const kept = { [parentKey]: false };
    expect(pruneNestedThreadExpansion(kept, threads, scoped)).toBe(kept);
    expect(
      pruneNestedThreadExpansion(
        { [parentKey]: true, [`${environmentId}:plain`]: false, [`${environmentId}:gone`]: true },
        threads,
        scoped,
      ),
    ).toEqual({ [parentKey]: true });
    const empty = {};
    expect(pruneNestedThreadExpansion(empty, threads, scoped)).toBe(empty);
  });
});
