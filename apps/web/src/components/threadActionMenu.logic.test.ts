import { describe, expect, it } from "vite-plus/test";

import { buildThreadActionMenuItems, type ThreadActionMenuState } from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
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
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "unsnooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "snooze",
            "rename",
            "regenerate-title",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("disables archive while the thread is running", () => {
    const archiveItem = buildThreadActionMenuItems({ ...baseState, isRunning: true }).find(
      (item) => item.id === "archive",
    );
    expect(archiveItem?.disabled).toBe(true);
  });

  it("offers Move to top level only for a nested thread, and gates it on permission", () => {
    expect(ids(baseState)).not.toContain("move-to-top-level");
    const nested = ids({ ...baseState, canMoveToTopLevel: true });
    expect(nested.indexOf("move-to-top-level")).toBe(nested.indexOf("rename") - 1);
    const denied = buildThreadActionMenuItems({
      ...baseState,
      canOperate: false,
      canMoveToTopLevel: true,
    });
    expect(denied.find((item) => item.id === "move-to-top-level")?.disabled).toBe(true);
  });

  it("does not offer Pin on a nested thread but keeps Unpin", () => {
    expect(ids({ ...baseState, canPin: false })).not.toContain("pin");
    expect(ids({ ...baseState, canPin: false, isPinned: true })).toContain("unpin");
    expect(ids(baseState)).toContain("pin");
  });
});

function ids(state: ThreadActionMenuState) {
  return buildThreadActionMenuItems(state).map((item) => item.id);
}
