"use client";

import type { DesktopPreviewBrowserActionEvent, KeybindingCommand } from "@t3tools/contracts";

/**
 * Typed window-event bus for preview-panel actions. Lets the global
 * keybinding handler in `routes/_chat.tsx` reach `ChatView`'s URL-aware
 * arbitration without prop drilling or shared refs.
 */
export type PreviewAction =
  | "toggle-panel"
  | "new-tab"
  | "close-tab"
  | "reopen-closed"
  | "refresh"
  | "focus-url"
  | "zoom-in"
  | "zoom-out"
  | "reset-zoom";

const EVENT_NAME = "t3code:preview-action";

export function previewActionForFocusedCommand(
  command: KeybindingCommand | null,
  previewFocused: boolean,
): PreviewAction | null {
  if (!previewFocused) return null;
  switch (command) {
    case "preview.new":
      return "new-tab";
    case "preview.close":
      return "close-tab";
    case "preview.reopenClosed":
      return "reopen-closed";
    case "preview.refresh":
      return "refresh";
    case "preview.focusUrl":
      return "focus-url";
    case "preview.zoomIn":
      return "zoom-in";
    case "preview.zoomOut":
      return "zoom-out";
    case "preview.resetZoom":
      return "reset-zoom";
    default:
      return null;
  }
}

export function previewActionForDesktopBrowserEvent(
  event: DesktopPreviewBrowserActionEvent,
  activePreviewRuntimeTabId: string | null,
  previewFocused: boolean,
): PreviewAction | null {
  if (event.tabId !== activePreviewRuntimeTabId) return null;
  return previewActionForFocusedCommand(event.action, previewFocused);
}

export function dispatchPreviewAction(action: PreviewAction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PreviewAction>(EVENT_NAME, { detail: action }));
}

export function subscribePreviewAction(listener: (action: PreviewAction) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<PreviewAction>).detail;
    if (typeof detail === "string") listener(detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
