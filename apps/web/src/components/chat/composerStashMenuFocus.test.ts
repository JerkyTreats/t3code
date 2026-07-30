import { describe, expect, it, vi } from "vite-plus/test";

import { closeComposerStashMenu } from "./composerStashMenuFocus";

describe("composer stash menu focus", () => {
  it("restores composer focus whenever an open menu closes", () => {
    const markClosed = vi.fn();
    const restoreFocus = vi.fn();

    expect(closeComposerStashMenu({ isOpen: true, markClosed, restoreFocus })).toBe(true);
    expect(markClosed).toHaveBeenCalledOnce();
    expect(restoreFocus).toHaveBeenCalledOnce();
  });

  it("does nothing when the menu is already closed", () => {
    const markClosed = vi.fn();
    const restoreFocus = vi.fn();

    expect(closeComposerStashMenu({ isOpen: false, markClosed, restoreFocus })).toBe(false);
    expect(markClosed).not.toHaveBeenCalled();
    expect(restoreFocus).not.toHaveBeenCalled();
  });
});
