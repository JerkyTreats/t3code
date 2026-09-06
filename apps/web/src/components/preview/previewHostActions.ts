import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { DesktopPreviewBrowserActionEventSchema, type ScopedThreadRef } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useEffectEvent } from "react";

import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import { isPreviewFocused } from "~/lib/previewFocus";
import {
  previewStateLifetimeIsCurrent,
  readThreadPreviewState,
  setActivePreviewTab,
} from "~/previewStateStore";
import {
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
} from "~/rightPanelStore";
import { closePreviewSession } from "./closePreviewSession";
import { agentControlledBrowserCloseConfirmation } from "../ChatView.logic";
import {
  previewActionForDesktopBrowserEvent,
  subscribePreviewAction,
  type PreviewAction,
} from "./previewActionBus";

export function readFocusedPreviewHost(threadRef: ScopedThreadRef | null) {
  if (!threadRef || !isPreviewFocused()) return null;
  const panel = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef);
  const surface = selectActiveRightPanelSurface(
    useRightPanelStore.getState().byThreadKey,
    threadRef,
  );
  if (!panel.isOpen || surface?.kind !== "preview") return null;
  const state = readThreadPreviewState(threadRef);
  const tabId = surface.resourceId;
  if (tabId !== null && (!state.sessions[tabId] || state.activeTabId !== tabId)) return null;
  const runtimeTabId =
    tabId === null ? null : previewRuntimeTabId(threadRef, state.serverEpoch, tabId);
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return null;
  if (element.tagName.toLowerCase() === "webview") {
    if (runtimeTabId === null || element.dataset.previewTab !== runtimeTabId) return null;
  } else if (
    element.closest<HTMLElement>("[data-thread-key]")?.dataset.threadKey !==
    scopedThreadKey(threadRef)
  )
    return null;
  return { threadRef, surface, runtimeTabId };
}

const isDesktopPreviewBrowserActionEvent = Schema.is(DesktopPreviewBrowserActionEventSchema);

export function previewDesktopActionForCurrentHost(
  event: unknown,
  threadRef: ScopedThreadRef | null,
): PreviewAction | null {
  if (!isDesktopPreviewBrowserActionEvent(event)) return null;
  const host = readFocusedPreviewHost(threadRef);
  return host ? previewActionForDesktopBrowserEvent(event, host.runtimeTabId, true) : null;
}

/** Confirmation owns no close reservation; only an accepted, still-current request may mutate. */
export async function confirmPreviewHostClose(input: {
  threadRef: ScopedThreadRef;
  surfaces: readonly RightPanelSurface[];
  isCurrent: () => boolean;
  confirm: ((message: string) => Promise<boolean>) | undefined;
  close: () => Promise<boolean>;
}): Promise<boolean> {
  const sameLifetime = previewStateLifetimeIsCurrent(input.threadRef);
  const isCurrent = () => sameLifetime() && input.isCurrent();
  if (!isCurrent()) return false;
  const message = agentControlledBrowserCloseConfirmation(
    input.surfaces,
    readThreadPreviewState(input.threadRef).desktopByTabId,
  );
  if (message && (!input.confirm || !(await input.confirm(message).catch(() => false))))
    return false;
  if (!isCurrent()) return false;
  const live = selectThreadRightPanelState(
    useRightPanelStore.getState().byThreadKey,
    input.threadRef,
  );
  if (!input.surfaces.every((surface) => live.surfaces.some((entry) => entry.id === surface.id)))
    return false;
  return input.close();
}

/** Both indexes advance before awaiting the server, so another admitted close sees the next tab. */
export async function closeConfirmedPreviewHostSurface<E>(input: {
  threadRef: ScopedThreadRef;
  surface: Extract<RightPanelSurface, { kind: "preview" }>;
  closePreview: Parameters<typeof closePreviewSession<E>>[0]["closePreview"];
}): Promise<boolean> {
  const { threadRef, surface } = input;
  const panel = useRightPanelStore.getState();
  if (
    !selectThreadRightPanelState(panel.byThreadKey, threadRef).surfaces.some(
      (entry) => entry.id === surface.id,
    )
  )
    return false;
  const sameLifetime = previewStateLifetimeIsCurrent(threadRef);
  const closePanelSurface = () => {
    panel.closeSurface(threadRef, surface.id);
    // Panel order owns the visible successor; session recency can choose a different tab.
    const successor = selectActiveRightPanelSurface(
      useRightPanelStore.getState().byThreadKey,
      threadRef,
    );
    if (successor?.kind === "preview" && successor.resourceId !== null)
      setActivePreviewTab(threadRef, successor.resourceId);
  };
  const tabId = surface.resourceId;
  if (tabId === null) {
    closePanelSurface();
    return true;
  }
  const closing = closePreviewSession({
    threadRef,
    tabId,
    snapshot: readThreadPreviewState(threadRef).sessions[tabId] ?? null,
    closePreview: input.closePreview,
  });
  closePanelSurface();
  const restoreSurface = () => {
    if (sameLifetime() && readThreadPreviewState(threadRef).sessions[tabId])
      useRightPanelStore.getState().openBrowser(threadRef, tabId);
  };
  try {
    const result = await closing;
    if (result._tag === "Failure") {
      restoreSurface();
      return false;
    }
    return sameLifetime();
  } catch (error) {
    restoreSurface();
    throw error;
  }
}

export function guardPreviewHostMutation<Input, A, E>(
  mutation: (input: Input) => Promise<AtomCommandResult<A, E>>,
  canDispatch: () => boolean,
  isSameLifetime?: () => boolean,
) {
  return async (input: Input): Promise<AtomCommandResult<A, E>> => {
    if (!canDispatch()) return AsyncResult.failure(Cause.interrupt());
    const result = await mutation(input);
    // Route navigation affects admission, never the acknowledgement of dispatched work.
    // Legacy creation owners still need an explicit lifetime-only result fence.
    return !isSameLifetime || isSameLifetime() ? result : AsyncResult.failure(Cause.interrupt());
  };
}

/** The route admits actions; this second live check protects mounted or transitioning chat hosts. */
export function usePreviewHostActions(input: {
  threadRef: ScopedThreadRef | null;
  isCurrent: () => boolean;
  toggle: () => void;
  create: () => void;
  close: () => Promise<unknown>;
  reopen: () => Promise<unknown>;
  onError: (error: unknown) => void;
}) {
  const handle = useEffectEvent((action: PreviewAction) => {
    if (!input.isCurrent()) return;
    if (action === "toggle-panel") {
      input.toggle();
      return;
    }
    if (!readFocusedPreviewHost(input.threadRef)) return;
    switch (action) {
      case "new-tab":
        input.create();
        return;
      case "close-tab":
        void input.close().catch(input.onError);
        return;
      case "reopen-closed":
        void input.reopen().catch(input.onError);
        return;
    }
  });
  useEffect(() => subscribePreviewAction(handle), []);
}
