import type {
  PreviewCloseInput,
  PreviewSessionSnapshot,
  ScopedThreadRef,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  applyPreviewServerSnapshot,
  reconcilePreviewServerSessions,
  removePreviewThread,
  readThreadPreviewState,
  resetPreviewStateForTests,
} from "~/previewStateStore";

import { closePreviewSession } from "./closePreviewSession";

const threadRef = {
  environmentId: "local" as ScopedThreadRef["environmentId"],
  threadId: "thread-1" as ScopedThreadRef["threadId"],
};

const snapshot: PreviewSessionSnapshot = {
  threadId: threadRef.threadId,
  tabId: "tab-1",
  navStatus: {
    _tag: "Success",
    url: "http://localhost:3000/",
    title: "Local app",
  },
  canGoBack: false,
  canGoForward: false,
  updatedAt: "2026-06-18T19:00:00.000Z",
};

beforeEach(resetPreviewStateForTests);

describe("closePreviewSession", () => {
  it("suppresses stale server snapshots while the close is in flight", async () => {
    applyPreviewServerSnapshot(threadRef, snapshot);
    let finishClose: (() => void) | undefined;
    const closePreview = vi.fn(
      (_input: PreviewCloseInput) =>
        new Promise<ReturnType<typeof AsyncResult.success<void>>>((resolve) => {
          finishClose = () => resolve(AsyncResult.success(undefined));
        }),
    );

    const closing = closePreviewSession({
      closePreview: ({ input }) => closePreview(input),
      snapshot,
      tabId: snapshot.tabId,
      threadRef,
    });

    expect(readThreadPreviewState(threadRef).sessions).toEqual({});
    applyPreviewServerSnapshot(threadRef, snapshot);
    expect(readThreadPreviewState(threadRef).sessions).toEqual({});

    finishClose?.();
    await closing;
    expect(closePreview).toHaveBeenCalledWith({ threadId: "thread-1", tabId: "tab-1" });
  });

  it("restores the last snapshot when the server close fails", async () => {
    applyPreviewServerSnapshot(threadRef, snapshot);

    const result = await closePreviewSession({
      closePreview: async () => AsyncResult.failure(Cause.fail(new Error("close failed"))),
      snapshot,
      tabId: snapshot.tabId,
      threadRef,
    });

    expect(result._tag).toBe("Failure");
    expect(readThreadPreviewState(threadRef).snapshot).toEqual(snapshot);
    expect(readThreadPreviewState(threadRef).sessions).toEqual({ [snapshot.tabId]: snapshot });
  });
  it("records only successful closes and rolls back thrown failures", async () => {
    applyPreviewServerSnapshot(threadRef, snapshot);
    const failure = new Error("disconnected");
    await expect(
      closePreviewSession({
        threadRef,
        snapshot,
        tabId: snapshot.tabId,
        closePreview: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(readThreadPreviewState(threadRef).closedTabs).toEqual([]);
    expect(readThreadPreviewState(threadRef).snapshot).toEqual(snapshot);
    await closePreviewSession({
      threadRef,
      snapshot,
      tabId: snapshot.tabId,
      closePreview: async () => AsyncResult.success(undefined),
    });
    expect(readThreadPreviewState(threadRef).closedTabs).toMatchObject([
      { status: "closed", tabId: snapshot.tabId },
    ]);
  });

  it.each(["epoch", "thread"] as const)(
    "does not roll a failed close into a new %s lifetime",
    async (change) => {
      applyPreviewServerSnapshot(threadRef, snapshot);
      let finish!: (value: ReturnType<typeof AsyncResult.failure<void, Error>>) => void;
      const closing = closePreviewSession({
        threadRef,
        snapshot,
        tabId: snapshot.tabId,
        closePreview: () =>
          new Promise<ReturnType<typeof AsyncResult.failure<void, Error>>>((resolve) => {
            finish = resolve;
          }),
      });
      if (change === "thread") removePreviewThread(threadRef);
      else
        reconcilePreviewServerSessions(threadRef, {
          serverEpoch: "replacement",
          revision: 1,
          sessions: [],
        });
      finish(AsyncResult.failure(Cause.fail(new Error("late failure"))));
      await closing;
      expect(readThreadPreviewState(threadRef).sessions).toEqual({});
      expect(readThreadPreviewState(threadRef).closedTabs).toEqual([]);
    },
  );
});
