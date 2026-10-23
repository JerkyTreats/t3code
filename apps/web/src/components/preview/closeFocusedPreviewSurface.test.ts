import type { ScopedThreadRef } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";

import { closeFocusedPreviewSurface } from "./closeFocusedPreviewSurface";

const threadRef = {
  environmentId: "local" as ScopedThreadRef["environmentId"],
  threadId: "thread-1" as ScopedThreadRef["threadId"],
};

beforeEach(() => useRightPanelStore.setState({ byThreadKey: {} }));

describe("closeFocusedPreviewSurface", () => {
  it("advances through two sequential close completions exactly once each", async () => {
    const store = useRightPanelStore.getState();
    store.openBrowser(threadRef, "tab-one");
    store.openBrowser(threadRef, "tab-two");
    const cleanup = vi.fn();
    const syncActivePreview = vi.fn();
    const focusUrl = vi.fn();
    const dispatchClose = async () =>
      await closeFocusedPreviewSurface({
        threadRef,
        closeSurface: async (surface) => {
          cleanup(surface);
          useRightPanelStore.getState().closeSurface(threadRef, surface.id);
          return true;
        },
        syncActivePreview,
        focusUrl,
      });

    expect(await dispatchClose()).toMatchObject({ resourceId: "tab-two" });
    expect(await dispatchClose()).toMatchObject({ resourceId: "tab-one" });

    expect(cleanup.mock.calls.map(([surface]) => surface.resourceId)).toEqual([
      "tab-two",
      "tab-one",
    ]);
    expect(syncActivePreview).toHaveBeenCalledTimes(1);
    expect(focusUrl).toHaveBeenCalledTimes(1);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef),
    ).toMatchObject({
      isOpen: true,
      activeSurfaceId: "browser:new",
      surfaces: [{ id: "browser:new", kind: "preview", resourceId: null }],
    });
  });

  it("keeps reopen reachable when only non-preview surfaces remain", async () => {
    const store = useRightPanelStore.getState();
    store.openBrowser(threadRef, "tab-one");
    store.open(threadRef, "files");
    store.activateSurface(threadRef, "browser:tab-one");
    const cleanup = vi.fn();
    const syncActivePreview = vi.fn();
    const focusUrl = vi.fn();

    expect(
      await closeFocusedPreviewSurface({
        threadRef,
        closeSurface: async (surface) => {
          cleanup(surface);
          useRightPanelStore.getState().closeSurface(threadRef, surface.id);
          return true;
        },
        syncActivePreview,
        focusUrl,
      }),
    ).toMatchObject({ resourceId: "tab-one" });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(syncActivePreview).not.toHaveBeenCalled();
    expect(focusUrl).toHaveBeenCalledTimes(1);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef),
    ).toMatchObject({
      isOpen: true,
      activeSurfaceId: "browser:new",
      surfaces: [
        { id: "files", kind: "files" },
        { id: "browser:new", kind: "preview", resourceId: null },
      ],
    });
  });
  it("leaves a cancelled agent-controlled close and history untouched", async () => {
    useRightPanelStore.getState().openBrowser(threadRef, "agent-tab");
    const before = selectThreadRightPanelState(
      useRightPanelStore.getState().byThreadKey,
      threadRef,
    );
    const focusUrl = vi.fn();
    const syncActivePreview = vi.fn();
    expect(
      await closeFocusedPreviewSurface({
        threadRef,
        closeSurface: async () => false,
        focusUrl,
        syncActivePreview,
      }),
    ).toBeNull();
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef),
    ).toEqual(before);
    expect(focusUrl).not.toHaveBeenCalled();
    expect(syncActivePreview).not.toHaveBeenCalled();
  });
});
