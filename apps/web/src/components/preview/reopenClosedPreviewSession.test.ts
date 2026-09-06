import type { PreviewOpenInput, PreviewSessionSnapshot, ScopedThreadRef } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  commitClosedPreviewTab,
  applyPreviewServerEvent,
  reconcilePreviewServerSessions,
  removePreviewThread,
  readThreadPreviewState,
  reserveClosedPreviewTab,
  resetPreviewStateForTests,
} from "~/previewStateStore";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";

import { guardPreviewHostMutation } from "./previewHostActions";
import { reopenClosedPreviewSession } from "./reopenClosedPreviewSession";

const threadRef = {
  environmentId: "local" as ScopedThreadRef["environmentId"],
  threadId: "thread-1" as ScopedThreadRef["threadId"],
};

const snapshot = (
  tabId: string,
  navStatus: PreviewSessionSnapshot["navStatus"],
): PreviewSessionSnapshot => ({
  threadId: threadRef.threadId,
  tabId,
  navStatus,
  canGoBack: false,
  canGoForward: false,
  updatedAt: "2026-08-16T12:00:00.000Z",
});

const rememberClosedPreviewTab = (
  closedSnapshot: PreviewSessionSnapshot,
  zoomFactor = 1,
  colorScheme: "system" | "light" | "dark" = "system",
) => {
  const reservation = reserveClosedPreviewTab(threadRef, closedSnapshot, {
    hasWebContents: true,
    canGoBack: false,
    canGoForward: false,
    loading: false,
    audible: false,
    audioMuted: false,
    zoomFactor,
    pictureInPicture: false,
    colorScheme,
    controller: "none",
    favicon: null,
  });
  commitClosedPreviewTab(threadRef, reservation.reservationId);
};

const resizeSuccess = (reopened: PreviewSessionSnapshot) =>
  vi.fn(async ({ input }: { input: { viewport: PreviewSessionSnapshot["viewport"] } }) =>
    AsyncResult.success({ ...reopened, viewport: input.viewport }),
  );

beforeEach(() => {
  resetPreviewStateForTests();
  useRightPanelStore.setState({ byThreadKey: {} });
});

describe("reopenClosedPreviewSession", () => {
  it("reopens the most recently closed URL and focuses the replacement tab", async () => {
    rememberClosedPreviewTab(
      {
        ...snapshot("closed-tab", {
          _tag: "Success",
          url: "http://localhost:4173/docs",
          title: "Docs",
        }),
        viewport: { _tag: "freeform", width: 960, height: 540 },
        profileId: "profile-retained",
      },
      1.25,
      "dark",
    );
    const reopened = snapshot("reopened-tab", {
      _tag: "Loading",
      url: "http://localhost:4173/docs",
      title: "",
    });
    const openPreview = vi.fn(async (_input: PreviewOpenInput) => AsyncResult.success(reopened));
    const resizePreview = resizeSuccess(reopened);

    const result = await reopenClosedPreviewSession({
      threadRef,
      openPreview: ({ input }) => openPreview(input),
      resizePreview: resizePreview as never,
    });

    expect(result?._tag).toBe("Success");
    expect(openPreview).toHaveBeenCalledWith({
      threadId: "thread-1",
      url: "http://localhost:4173/docs",
      viewport: { _tag: "freeform", width: 960, height: 540 },
      profileId: "profile-retained",
    });
    expect(readThreadPreviewState(threadRef).closedTabs).toEqual([]);
    expect(resizePreview).toHaveBeenCalledWith({
      environmentId: "local",
      input: {
        threadId: "thread-1",
        tabId: "reopened-tab",
        viewport: { _tag: "freeform", width: 960, height: 540 },
      },
    });
    expect(readThreadPreviewState(threadRef).pendingRestorations["reopened-tab"]).toEqual({
      zoomFactor: 1.25,
      colorScheme: "dark",
    });
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef),
    ).toMatchObject({ isOpen: true, activeSurfaceId: "browser:reopened-tab" });
  });

  it("reopens the last idle tab as a blank browser session", async () => {
    const reopenedIdle = snapshot("reopened-idle", { _tag: "Idle" });
    rememberClosedPreviewTab(snapshot("closed-idle", { _tag: "Idle" }));
    const openPreview = vi.fn(async (_input: PreviewOpenInput) =>
      AsyncResult.success(reopenedIdle),
    );

    await reopenClosedPreviewSession({
      threadRef,
      openPreview: ({ input }) => openPreview(input),
      resizePreview: resizeSuccess(reopenedIdle) as never,
    });

    expect(openPreview).toHaveBeenCalledWith({
      threadId: "thread-1",
      viewport: { _tag: "fill" },
    });
  });

  it("restores the closed entry when reopening fails", async () => {
    const closed = snapshot("closed-tab", {
      _tag: "Success",
      url: "https://example.com/",
      title: "Example",
    });
    rememberClosedPreviewTab(closed);

    const result = await reopenClosedPreviewSession({
      threadRef,
      openPreview: async () => AsyncResult.failure(Cause.fail(new Error("open failed"))),
      resizePreview: resizeSuccess(closed) as never,
    });

    expect(result?._tag).toBe("Failure");
    expect(readThreadPreviewState(threadRef).closedTabs[0]).toMatchObject({
      tabId: "closed-tab",
      url: "https://example.com/",
      status: "closed",
    });
  });

  it("surfaces an opened tab without restoring history when resize fails", async () => {
    const closed = snapshot("closed-tab", {
      _tag: "Success",
      url: "https://example.com/",
      title: "Example",
    });
    rememberClosedPreviewTab(closed, 1.5, "light");
    const reopened = snapshot("reopened-tab", {
      _tag: "Loading",
      url: "https://example.com/",
      title: "",
    });

    const result = await reopenClosedPreviewSession({
      threadRef,
      openPreview: async () => AsyncResult.success(reopened),
      resizePreview: async () => AsyncResult.failure(Cause.fail(new Error("resize failed"))),
    });

    expect(result?._tag).toBe("Failure");
    expect(readThreadPreviewState(threadRef).closedTabs).toEqual([]);
    expect(readThreadPreviewState(threadRef).pendingRestorations).toEqual({
      "reopened-tab": { zoomFactor: 1.5, colorScheme: "light" },
    });
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef),
    ).toMatchObject({ isOpen: true, activeSurfaceId: "browser:reopened-tab" });
  });
  it("restores history when opening throws", async () => {
    rememberClosedPreviewTab(snapshot("closed", { _tag: "Idle" }));
    const failure = new Error("disconnected");
    await expect(
      reopenClosedPreviewSession({
        threadRef,
        openPreview: async () => {
          throw failure;
        },
        resizePreview: vi.fn(),
      }),
    ).rejects.toBe(failure);
    expect(readThreadPreviewState(threadRef).closedTabs).toMatchObject([
      { tabId: "closed", status: "closed" },
    ]);
  });

  it.each(["epoch", "thread"] as const)(
    "ignores a late reopen response after the %s changes",
    async (change) => {
      rememberClosedPreviewTab(snapshot("closed", { _tag: "Idle" }));
      let finish!: (value: ReturnType<typeof AsyncResult.success<PreviewSessionSnapshot>>) => void;
      const resizePreview = vi.fn();
      const reopening = reopenClosedPreviewSession({
        threadRef,
        openPreview: () =>
          new Promise<ReturnType<typeof AsyncResult.success<PreviewSessionSnapshot>>>((resolve) => {
            finish = resolve;
          }),
        resizePreview,
      });
      if (change === "thread") removePreviewThread(threadRef);
      else
        reconcilePreviewServerSessions(threadRef, {
          serverEpoch: "replacement",
          revision: 1,
          sessions: [],
        });
      finish(AsyncResult.success(snapshot("late", { _tag: "Idle" })));
      await reopening;
      expect(resizePreview).not.toHaveBeenCalled();
      expect(readThreadPreviewState(threadRef).sessions).toEqual({});
      expect(readThreadPreviewState(threadRef).closedTabs).toEqual([]);
      expect(
        selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef).surfaces,
      ).toEqual([]);
    },
  );
  it("consumes successful reopen after an opened event and route navigation, retaining original presentation", async () => {
    reconcilePreviewServerSessions(threadRef, { serverEpoch: "epoch", revision: 1, sessions: [] });
    const original = {
      ...snapshot("closed", { _tag: "Idle" }),
      profileId: "work-profile",
      viewport: { _tag: "freeform" as const, width: 720, height: 480 },
    };
    rememberClosedPreviewTab(original, 1.75, "dark");
    let currentRoute = true;
    let finish!: (value: ReturnType<typeof AsyncResult.success<PreviewSessionSnapshot>>) => void;
    const mutation = vi.fn(
      () =>
        new Promise<ReturnType<typeof AsyncResult.success<PreviewSessionSnapshot>>>((resolve) => {
          finish = resolve;
        }),
    );
    const replacement = { ...original, tabId: "replacement" };
    const resizePreview = resizeSuccess(replacement);
    const opening = reopenClosedPreviewSession({
      threadRef,
      openPreview: guardPreviewHostMutation(mutation, () => currentRoute),
      resizePreview: resizePreview as never,
      canFocus: () => currentRoute,
    });
    applyPreviewServerEvent(threadRef, {
      type: "opened",
      threadId: threadRef.threadId,
      tabId: replacement.tabId,
      createdAt: replacement.updatedAt,
      serverEpoch: "epoch",
      revision: 2,
      snapshot: replacement,
    });
    currentRoute = false;
    finish(AsyncResult.success(replacement));
    expect((await opening)?._tag).toBe("Success");
    const state = readThreadPreviewState(threadRef);
    expect(state.sessions.replacement).toMatchObject({
      profileId: "work-profile",
      viewport: original.viewport,
    });
    expect(state.closedTabs).toEqual([]);
    expect(state.pendingRestorations.replacement).toEqual({
      zoomFactor: 1.75,
      colorScheme: "dark",
    });
    expect(resizePreview).toHaveBeenCalledOnce();
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef).surfaces,
    ).toEqual([]);
    currentRoute = true;
    expect(
      await reopenClosedPreviewSession({
        threadRef,
        openPreview: mutation,
        resizePreview: resizePreview as never,
      }),
    ).toBeNull();
    expect(mutation).toHaveBeenCalledOnce();
  });
});
