import type { PreviewSessionSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  CLOSED_PREVIEW_TAB_LIMIT,
  EMPTY_PREVIEW_TAB_HISTORY,
  reservePreviewTabClose,
  commitPreviewTabClose,
  rollbackPreviewTabClose,
  takePreviewTabToReopen,
  restorePreviewTabToHistory,
  setPreviewTabRestoration,
  clearPreviewTabRestoration,
  reconcilePreviewTabHistory,
  type PreviewTabHistory,
} from "./previewTabHistory";

const snapshot = (tabId: string): PreviewSessionSnapshot => ({
  threadId: "synthetic",
  tabId,
  navStatus: { _tag: "Idle" },
  canGoBack: false,
  canGoForward: false,
  updatedAt: "2026-09-05T00:00:00.000Z",
});
function remember(state: PreviewTabHistory, tabId: string) {
  const next = reservePreviewTabClose(state, snapshot(tabId), null);
  return commitPreviewTabClose(next.state, next.reservation.reservationId);
}

describe("preview tab history policy without a store", () => {
  it("captures only restorable navigation, profile and presentation", () => {
    const before = EMPTY_PREVIEW_TAB_HISTORY;
    const next = reservePreviewTabClose(
      before,
      {
        ...snapshot("work"),
        profileId: "work-profile",
        viewport: { _tag: "freeform", width: 720, height: 480 },
        navStatus: { _tag: "Success", url: "https://example.com/", title: "Example" },
      },
      { zoomFactor: 1.75, colorScheme: "dark" },
    );
    expect(next.reservation).toMatchObject({
      status: "pending",
      url: "https://example.com/",
      profileId: "work-profile",
      viewport: { _tag: "freeform", width: 720, height: 480 },
      zoomFactor: 1.75,
      colorScheme: "dark",
    });
    expect(before.closedTabs).toEqual([]);
    expect(reservePreviewTabClose(before, snapshot("blank"), null).reservation).toMatchObject({
      url: null,
      viewport: { _tag: "fill" },
      zoomFactor: 1,
      colorScheme: "system",
    });
  });

  it("retains ten successful closes while pending reservations settle or roll back", () => {
    let state = EMPTY_PREVIEW_TAB_HISTORY;
    for (let i = 0; i < 14; i += 1) state = remember(state, `closed-${i}`);
    expect(state.closedTabs).toHaveLength(CLOSED_PREVIEW_TAB_LIMIT);
    expect(state.closedTabs.at(-1)?.tabId).toBe("closed-4");
    const pending = reservePreviewTabClose(state, snapshot("pending"), null);
    expect(pending.state.closedTabs).toHaveLength(11);
    expect(
      rollbackPreviewTabClose(pending.state, pending.reservation.reservationId).closedTabs,
    ).toEqual(state.closedTabs);
    const committed = commitPreviewTabClose(pending.state, pending.reservation.reservationId);
    expect(committed.closedTabs).toHaveLength(10);
    expect(committed.closedTabs[0]?.tabId).toBe("pending");
  });

  it("holds the pending head and orders reopening by close initiation", () => {
    const first = reservePreviewTabClose(EMPTY_PREVIEW_TAB_HISTORY, snapshot("first"), null);
    const second = reservePreviewTabClose(first.state, snapshot("second"), null);
    const firstFinished = commitPreviewTabClose(second.state, first.reservation.reservationId);
    expect(takePreviewTabToReopen(firstFinished).entry).toBeNull();
    const secondFinished = commitPreviewTabClose(firstFinished, second.reservation.reservationId);
    const taken = takePreviewTabToReopen(secondFinished);
    expect(taken.entry?.tabId).toBe("second");
    expect(takePreviewTabToReopen(taken.state).entry?.tabId).toBe("first");
  });

  it("reintroduces a failed reopen by its original sequence without duplicating it", () => {
    const state = remember(remember(EMPTY_PREVIEW_TAB_HISTORY, "older"), "retry");
    const taken = takePreviewTabToReopen(state);
    const concurrent = remember(taken.state, "newer");
    const restored = restorePreviewTabToHistory(concurrent, taken.entry!);
    expect(restored.closedTabs.map((entry) => entry.tabId)).toEqual(["newer", "retry", "older"]);
    expect(restorePreviewTabToHistory(restored, taken.entry!).closedTabs).toEqual(
      restored.closedTabs,
    );
  });

  it("restoration does not displace ten more recently initiated successful closes", () => {
    const taken = takePreviewTabToReopen(remember(EMPTY_PREVIEW_TAB_HISTORY, "old"));
    let state = taken.state;
    for (let i = 0; i < 10; i += 1) state = remember(state, `new-${i}`);
    expect(restorePreviewTabToHistory(state, taken.entry!).closedTabs).toEqual(state.closedTabs);
  });

  it("drops obsolete presentation on tab removal and all history on a new lifetime", () => {
    let state = remember(EMPTY_PREVIEW_TAB_HISTORY, "closed");
    state = setPreviewTabRestoration(state, "live", { zoomFactor: 2, colorScheme: "light" });
    state = setPreviewTabRestoration(state, "gone", { zoomFactor: 1.25, colorScheme: "dark" });
    const reconciled = reconcilePreviewTabHistory(state, new Set(["live"]), true);
    expect(reconciled.closedTabs).toBe(state.closedTabs);
    expect(Object.keys(reconciled.pendingRestorations)).toEqual(["live"]);
    expect(clearPreviewTabRestoration(reconciled, "live").pendingRestorations).toEqual({});
    expect(reconcilePreviewTabHistory(state, new Set(["live"]), false)).toEqual(
      EMPTY_PREVIEW_TAB_HISTORY,
    );
  });
});
