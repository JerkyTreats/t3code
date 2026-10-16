import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { indexThreadsByNestingKey } from "@t3tools/client-runtime/state/thread-nesting";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadShellFixture } from "../../test-fixtures";
import { commandPaletteThreadTitle } from "../keyboard/commandPaletteItems";
import { threadJumpTarget } from "../keyboard/threadKeyboardShortcuts";
import {
  buildThreadListV2Items,
  buildThreadListV2ListItems,
  getThreadListV2OrderedSection,
  nestedThreadListChildKeys,
  threadListV2ListItemsAreEqual,
  withNestedThreadExpansion,
  type ThreadListV2ListItem,
} from "./threadListV2";

const environmentId = EnvironmentId.make("environment-1");
const projectId = ProjectId.make("project-1");
const NOW = "2026-06-02T00:00:00.000Z";

function makeThread(
  input: Partial<EnvironmentThreadShell> & Pick<EnvironmentThreadShell, "id" | "title">,
): EnvironmentThreadShell {
  return makeThreadShellFixture({ environmentId, projectId, ...input });
}

const parent = makeThread({
  id: ThreadId.make("parent"),
  title: "Manager",
  createdAt: "2026-06-01T00:00:00.000Z",
});
const child = makeThread({
  id: ThreadId.make("child"),
  title: "Worker",
  createdAt: "2026-06-01T01:00:00.000Z",
  nestedUnderThreadId: parent.id,
});
const other = makeThread({
  id: ThreadId.make("other"),
  title: "Other",
  createdAt: "2026-06-01T02:00:00.000Z",
});

function build(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  options: Partial<Parameters<typeof buildThreadListV2Items>[0]> = {},
) {
  return buildThreadListV2Items({
    threads,
    environmentId: null,
    searchQuery: "",
    now: NOW,
    ...options,
  });
}

function listItems(layout: ReturnType<typeof build>) {
  return buildThreadListV2ListItems({
    items: layout.items,
    pendingTasks: [],
    settledCount: layout.settledCount,
    settledShelfHeaderIndex: layout.settledShelfHeaderIndex,
    settledShelfExpanded: false,
  });
}

function rows(items: ReadonlyArray<ThreadListV2ListItem>): string[][] {
  return items.map((item) =>
    item.type === "v2-thread" || item.type === "v2-nested-thread"
      ? [item.type, item.item.thread.id]
      : [item.type],
  );
}

describe("nested threads in the mobile list", () => {
  it("lists a collapsed parent with a badge and keeps its child out of the sections", () => {
    const items = listItems(build([parent, child, other]));
    expect(rows(items)).toEqual([
      ["v2-thread", "other"],
      ["v2-thread", "parent"],
    ]);
    const parentItem = items.find((item) => item.key === `v2-thread:${environmentId}:parent`);
    expect(parentItem?.type === "v2-thread" ? parentItem.nested : null).toEqual({
      count: 1,
      expanded: false,
      badge: { providerInstanceIds: [child.providerInstanceId], overflow: 0 },
    });
    const otherItem = items.find((item) => item.key === `v2-thread:${environmentId}:other`);
    expect(otherItem?.type === "v2-thread" ? otherItem.nested : undefined).toBeNull();
  });

  it("renders children after an expanded parent with their own item type and no moves", () => {
    const items = listItems(
      build([parent, child, other], {
        nestedExpansion: { [`${environmentId}:parent`]: true },
      }),
    );
    expect(rows(items)).toEqual([
      ["v2-thread", "other"],
      ["v2-thread", "parent"],
      ["v2-nested-thread", "child"],
    ]);
    const childItem = items.at(-1);
    expect(childItem).toMatchObject({
      type: "v2-nested-thread",
      key: `v2-nested-thread:${environmentId}:child`,
      parentKey: `${environmentId}:parent`,
      canMoveUp: false,
      canMoveDown: false,
    });
    // The hairline above a child follows the shared neighbour rule.
    expect(items[1]).toMatchObject({ showTrailingDivider: true });
  });

  it("opens a parent while its child is selected unless the user collapsed it", () => {
    const selectedThreadKey = `${environmentId}:child`;
    expect(rows(listItems(build([parent, child], { selectedThreadKey })))).toEqual([
      ["v2-thread", "parent"],
      ["v2-nested-thread", "child"],
    ]);
    expect(
      rows(
        listItems(
          build([parent, child], {
            selectedThreadKey,
            nestedExpansion: { [`${environmentId}:parent`]: false },
          }),
        ),
      ),
    ).toEqual([["v2-thread", "parent"]]);
  });

  it("keeps a selected child reachable when its parent sits on a collapsed shelf", () => {
    const settledParent = { ...parent, settledOverride: "settled" as const, settledAt: NOW };
    const layout = build([settledParent, child], {
      settledShelfExpanded: false,
      selectedThreadKey: `${environmentId}:child`,
    });
    expect(layout.items.map((item) => [item.thread.id, item.nesting?.role])).toEqual([
      ["parent", "parent"],
      ["child", "child"],
    ]);
    expect(layout.settledCount).toBe(1);
  });

  it("keeps a selected child under a collapsed snoozed parent and an open slim shelf", () => {
    const snoozedParent = { ...parent, snoozedAt: NOW, snoozedUntil: "2099-01-01T00:00:00.000Z" };
    const selection = { selectedThreadKey: `${environmentId}:child` };
    expect(
      build([snoozedParent, child, other], selection).items.map((item) => [
        item.thread.id,
        item.variant,
      ]),
    ).toEqual([
      ["other", "card"],
      ["parent", "slim"],
      ["child", "card"],
    ]);
    const settledParent = { ...parent, settledOverride: "settled" as const, settledAt: NOW };
    expect(
      build([settledParent, child], { ...selection, settledShelfExpanded: true }).items.map(
        (item) => item.thread.id,
      ),
    ).toEqual(["parent", "child"]);
  });

  it("gives a child its own lifecycle variant under its parent", () => {
    const settledChild = { ...child, settledOverride: "settled" as const, settledAt: NOW };
    const layout = build([parent, settledChild], {
      nestedExpansion: { [`${environmentId}:parent`]: true },
    });
    expect(layout.items.map((item) => [item.thread.id, item.variant])).toEqual([
      ["parent", "card"],
      ["child", "slim"],
    ]);
    expect(layout.settledCount).toBe(0);
  });

  it("lifts a settled parent into the active block while a child needs the user", () => {
    const settledParent = { ...parent, settledOverride: "settled" as const, settledAt: NOW };
    const waitingChild = { ...child, hasPendingUserInput: true };
    const layout = build([settledParent, waitingChild]);
    expect(layout.items.map((item) => [item.thread.id, item.variant])).toEqual([
      ["parent", "card"],
    ]);
    expect(layout.settledCount).toBe(0);
  });

  it("lists orphans at top level when the parent is archived, filtered out or elsewhere", () => {
    const archivedParent = { ...parent, archivedAt: NOW };
    expect(rows(listItems(build([archivedParent, child])))).toEqual([["v2-thread", "child"]]);
    expect(rows(listItems(build([parent, child], { searchQuery: "worker" })))).toEqual([
      ["v2-thread", "child"],
    ]);
    const foreignChild = { ...child, projectId: ProjectId.make("project-2") };
    expect(rows(listItems(build([parent, foreignChild])))).toEqual([
      ["v2-thread", "child"],
      ["v2-thread", "parent"],
    ]);
  });

  it("badges up to three children by recency with an overflow count", () => {
    const children = ["a", "b", "c", "d"].map((id, index) =>
      makeThread({
        id: ThreadId.make(id),
        title: id,
        createdAt: `2026-06-01T0${index + 1}:00:00.000Z`,
        providerInstanceId: ProviderInstanceId.make(`provider-${id}`),
        nestedUnderThreadId: parent.id,
      }),
    );
    const parentItem = listItems(build([parent, ...children]))[0];
    expect(parentItem?.type === "v2-thread" ? parentItem.nested?.badge : null).toEqual({
      providerInstanceIds: ["provider-d", "provider-c", "provider-b"],
      overflow: 1,
    });
  });

  it("re-renders a recycled parent only when its nested summary changes", () => {
    const collapsed = listItems(build([parent, child]))[0]!;
    expect(threadListV2ListItemsAreEqual(collapsed, listItems(build([parent, child]))[0]!)).toBe(
      true,
    );
    const expanded = listItems(
      build([parent, child], { nestedExpansion: { [`${environmentId}:parent`]: true } }),
    )[0]!;
    expect(threadListV2ListItemsAreEqual(collapsed, expanded)).toBe(false);
    const secondChild = makeThread({
      id: ThreadId.make("second"),
      title: "Second",
      nestedUnderThreadId: parent.id,
    });
    const grown = listItems(build([parent, child, secondChild]))[0]!;
    expect(threadListV2ListItemsAreEqual(collapsed, grown)).toBe(false);
  });

  it("jumps to visible children in list order", () => {
    const items = listItems(
      build([parent, child], { nestedExpansion: { [`${environmentId}:parent`]: true } }),
    );
    expect(threadJumpTarget(items, "thread.jump.2")?.id).toBe("child");
  });
});

describe("nested threads and arrangement", () => {
  it("excludes nested children from ordered sections but keeps orphans", () => {
    const orphan = makeThread({
      id: ThreadId.make("orphan"),
      title: "Orphan",
      nestedUnderThreadId: ThreadId.make("missing"),
    });
    expect([...nestedThreadListChildKeys([parent, child, orphan])]).toEqual([
      `${environmentId}:child`,
    ]);
    expect(
      getThreadListV2OrderedSection({
        threads: [parent, child, orphan],
        section: "active",
        now: NOW,
      }).map((thread) => thread.id),
    ).toEqual(expect.arrayContaining(["parent", "orphan"]));
    expect(
      getThreadListV2OrderedSection({
        threads: [parent, child, orphan],
        section: "active",
        now: NOW,
      }).some((thread) => thread.id === "child"),
    ).toBe(false);
    const nestedChildKeys = nestedThreadListChildKeys([parent, child, orphan]);
    expect(
      getThreadListV2OrderedSection({
        threads: [parent, child, orphan],
        section: "active",
        now: NOW,
        nestedChildKeys,
      }).some((thread) => thread.id === "child"),
    ).toBe(false);
  });
});

describe("withNestedThreadExpansion", () => {
  it("stores, clears and leaves unchanged maps alone", () => {
    const stored = withNestedThreadExpansion(undefined, "env:parent", false);
    expect(stored).toEqual({ "env:parent": false });
    expect(withNestedThreadExpansion(stored, "env:parent", false)).toBe(stored);
    expect(withNestedThreadExpansion(stored, "env:parent", undefined)).toEqual({});
    expect(withNestedThreadExpansion(stored, "env:other", undefined)).toBe(stored);
  });
});

describe("command palette titles", () => {
  it("labels a nested thread with its parent and leaves others alone", () => {
    const threadsByKey = indexThreadsByNestingKey([parent, child, other]);
    expect(commandPaletteThreadTitle(child, threadsByKey)).toBe("Manager › Worker");
    expect(commandPaletteThreadTitle(other, threadsByKey)).toBe("Other");
    expect(
      commandPaletteThreadTitle(child, indexThreadsByNestingKey([{ ...parent, archivedAt: NOW }])),
    ).toBe("Worker");
  });
});
