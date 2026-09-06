import type { ScopedThreadRef } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";

import {
  previewActionForDesktopBrowserEvent,
  previewActionForFocusedCommand,
} from "./previewActionBus";

describe("previewActionForFocusedCommand", () => {
  it.each([
    ["preview.new", "new-tab"],
    ["preview.close", "close-tab"],
    ["preview.reopenClosed", "reopen-closed"],
    ["preview.refresh", "refresh"],
    ["preview.focusUrl", "focus-url"],
  ] as const)("routes %s only while preview is focused", (command, action) => {
    expect(previewActionForFocusedCommand(command, true)).toBe(action);
    expect(previewActionForFocusedCommand(command, false)).toBeNull();
  });

  it("ignores commands owned by other surfaces", () => {
    expect(previewActionForFocusedCommand("terminal.close", true)).toBeNull();
  });

  it("accepts desktop actions only for the still-active focused preview tab", () => {
    const threadRef = { environmentId: "local", threadId: "thread-1" } as ScopedThreadRef;
    const activeRuntimeTabId = previewRuntimeTabId(threadRef, "epoch-current", "tab-active");
    const event = { action: "preview.close" as const, tabId: activeRuntimeTabId };

    expect(activeRuntimeTabId).not.toBe("tab-active");
    expect(previewActionForDesktopBrowserEvent(event, activeRuntimeTabId, true)).toBe("close-tab");
    expect(
      previewActionForDesktopBrowserEvent(
        event,
        previewRuntimeTabId(threadRef, "epoch-current", "tab-other"),
        true,
      ),
    ).toBeNull();
    expect(previewActionForDesktopBrowserEvent(event, activeRuntimeTabId, false)).toBeNull();
  });

  it("rejects an action emitted for a stale server epoch", () => {
    const threadRef = { environmentId: "local", threadId: "thread-1" } as ScopedThreadRef;
    const event = {
      action: "preview.close" as const,
      tabId: previewRuntimeTabId(threadRef, "epoch-old", "tab-active"),
    };

    expect(
      previewActionForDesktopBrowserEvent(
        event,
        previewRuntimeTabId(threadRef, "epoch-current", "tab-active"),
        true,
      ),
    ).toBeNull();
  });
});
