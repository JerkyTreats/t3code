import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { AsyncResult } from "effect/unstable/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import {
  applyPreviewDesktopState,
  applyPreviewServerSnapshot,
  readThreadPreviewState,
  reconcilePreviewServerSessions,
  resetPreviewStateForTests,
  setActivePreviewTab,
} from "~/previewStateStore";
import { selectActiveRightPanelSurface, useRightPanelStore } from "~/rightPanelStore";
import {
  confirmPreviewHostClose,
  closeConfirmedPreviewHostSurface,
  guardPreviewHostMutation,
  previewDesktopActionForCurrentHost,
  readFocusedPreviewHost,
} from "./previewHostActions";

const ref: ScopedThreadRef = {
  environmentId: EnvironmentId.make("host-env"),
  threadId: ThreadId.make("host-thread"),
};
class FocusElement {
  isConnected = true;
  tagName = "INPUT";
  dataset: Record<string, string> = { threadKey: scopedThreadKey(ref) };
  closest(selector: string) {
    return selector === "[data-thread-key]" || selector === "[data-preview-panel-mode]"
      ? this
      : null;
  }
}
let element: FocusElement;
beforeEach(() => {
  resetPreviewStateForTests();
  useRightPanelStore.setState({ byThreadKey: {} });
  element = new FocusElement();
  vi.stubGlobal("HTMLElement", FocusElement);
  vi.stubGlobal("document", { activeElement: element });
  reconcilePreviewServerSessions(ref, { serverEpoch: "epoch", revision: 1, sessions: [] });
  applyPreviewServerSnapshot(ref, {
    threadId: ref.threadId,
    tabId: "tab",
    navStatus: { _tag: "Idle" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-09-05T00:00:00.000Z",
  });
  useRightPanelStore.getState().openBrowser(ref, "tab");
});
afterEach(() => vi.unstubAllGlobals());

function controlWithAgent() {
  applyPreviewDesktopState(ref, "tab", {
    hasWebContents: true,
    canGoBack: false,
    canGoForward: false,
    loading: false,
    zoomFactor: 1,
    pictureInPicture: false,
    colorScheme: "system",
    audioMuted: false,
    audible: false,
    controller: "agent",
    favicon: null,
  });
}

describe("current preview host admission", () => {
  it("requires visible active panel and exact focused thread or runtime guest", () => {
    expect(readFocusedPreviewHost(ref)?.runtimeTabId).toBe(
      previewRuntimeTabId(ref, "epoch", "tab"),
    );
    element.dataset.threadKey = "other-thread";
    expect(readFocusedPreviewHost(ref)).toBeNull();
    element.tagName = "WEBVIEW";
    element.dataset.previewTab = previewRuntimeTabId(ref, "old-epoch", "tab");
    expect(readFocusedPreviewHost(ref)).toBeNull();
    element.dataset.previewTab = previewRuntimeTabId(ref, "epoch", "tab");
    expect(readFocusedPreviewHost(ref)).not.toBeNull();
    useRightPanelStore.getState().close(ref);
    expect(readFocusedPreviewHost(ref)).toBeNull();
  });

  it("validates desktop payloads and exact runtime identity", () => {
    const current = previewRuntimeTabId(ref, "epoch", "tab");
    expect(
      previewDesktopActionForCurrentHost({ action: "preview.close", tabId: current }, ref),
    ).toBe("close-tab");
    for (const tabId of [
      "tab",
      previewRuntimeTabId(ref, "old", "tab"),
      previewRuntimeTabId({ ...ref, environmentId: EnvironmentId.make("other") }, "epoch", "tab"),
    ]) {
      expect(
        previewDesktopActionForCurrentHost({ action: "preview.close", tabId }, ref),
      ).toBeNull();
    }
    expect(
      previewDesktopActionForCurrentHost({ action: "chat.new", tabId: current }, ref),
    ).toBeNull();
    expect(previewDesktopActionForCurrentHost(null, ref)).toBeNull();
  });
});

describe("host confirmation and delayed mutation", () => {
  it.each(["cancel", "missing", "rejected"])(
    "creates no close reservation when the dialog is %s",
    async (mode) => {
      controlWithAgent();
      const close = vi.fn(async () => true);
      const confirm =
        mode === "missing"
          ? undefined
          : vi.fn(async () => {
              if (mode === "rejected") throw new Error("dialog unavailable");
              return false;
            });
      const surface = selectActiveRightPanelSurface(
        useRightPanelStore.getState().byThreadKey,
        ref,
      )!;
      expect(
        await confirmPreviewHostClose({
          threadRef: ref,
          surfaces: [surface],
          isCurrent: () => true,
          confirm,
          close,
        }),
      ).toBe(false);
      expect(close).not.toHaveBeenCalled();
      expect(readThreadPreviewState(ref).closedTabs).toEqual([]);
    },
  );

  it.each(["route", "epoch", "surface"])(
    "rejects a confirmed dialog after its %s changes",
    async (change) => {
      controlWithAgent();
      let resolve!: (value: boolean) => void;
      let current = true;
      const close = vi.fn(async () => true);
      const surface = selectActiveRightPanelSurface(
        useRightPanelStore.getState().byThreadKey,
        ref,
      )!;
      const closing = confirmPreviewHostClose({
        threadRef: ref,
        surfaces: [surface],
        isCurrent: () => current,
        confirm: () =>
          new Promise((done) => {
            resolve = done;
          }),
        close,
      });
      if (change === "route") current = false;
      if (change === "epoch")
        reconcilePreviewServerSessions(ref, { serverEpoch: "new", revision: 1, sessions: [] });
      if (change === "surface") useRightPanelStore.getState().closeSurface(ref, surface.id);
      resolve(true);
      expect(await closing).toBe(false);
      expect(close).not.toHaveBeenCalled();
    },
  );

  it("preserves dispatched success after navigation but rejects new stale dispatch", async () => {
    let finish!: (value: ReturnType<typeof AsyncResult.success<string>>) => void;
    let current = true;
    const mutation = vi.fn(
      () =>
        new Promise<ReturnType<typeof AsyncResult.success<string>>>((resolve) => {
          finish = resolve;
        }),
    );
    const guarded = guardPreviewHostMutation(mutation, () => current);
    const pending = guarded(undefined);
    current = false;
    finish(AsyncResult.success("stale"));
    expect(await pending).toEqual(AsyncResult.success("stale"));
    expect((await guarded(undefined))._tag).toBe("Failure");
    expect(mutation).toHaveBeenCalledOnce();
  });
});

describe("synchronous panel successor selection", () => {
  function addSecond() {
    applyPreviewServerSnapshot(ref, {
      ...readThreadPreviewState(ref).sessions.tab!,
      tabId: "second",
      updatedAt: "2026-09-04T00:00:00.000Z",
    });
    useRightPanelStore.getState().openBrowser(ref, "second");
  }

  it("aligns an idle close with the panel-selected preview without a server close", async () => {
    addSecond();
    useRightPanelStore.getState().openBrowser(ref, null);
    setActivePreviewTab(ref, "tab");
    const surface = selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, ref)!;
    if (surface.kind !== "preview") throw new Error("Expected preview fixture");
    const closePreview = vi.fn(async () => AsyncResult.success(undefined));
    const closing = closeConfirmedPreviewHostSurface({ threadRef: ref, surface, closePreview });
    expect(readThreadPreviewState(ref).activeTabId).toBe("second");
    expect(readFocusedPreviewHost(ref)?.surface.resourceId).toBe("second");
    expect(await closing).toBe(true);
    expect(closePreview).not.toHaveBeenCalled();
    expect(readThreadPreviewState(ref).closedTabs).toEqual([]);
  });

  it("preserves a terminal successor and rejects further preview admission", async () => {
    useRightPanelStore.getState().openTerminal(ref, "terminal");
    addSecond();
    setActivePreviewTab(ref, "second");
    const surface = selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, ref)!;
    if (surface.kind !== "preview") throw new Error("Expected preview fixture");
    const closePreview = vi.fn(async () => AsyncResult.success(undefined));
    const closing = closeConfirmedPreviewHostSurface({ threadRef: ref, surface, closePreview });
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, ref),
    ).toMatchObject({
      kind: "terminal",
      resourceId: "terminal",
    });
    expect(readThreadPreviewState(ref).activeTabId).toBe("tab");
    expect(readFocusedPreviewHost(ref)).toBeNull();
    expect(await closing).toBe(true);
    expect(closePreview).toHaveBeenCalledOnce();
  });
});
