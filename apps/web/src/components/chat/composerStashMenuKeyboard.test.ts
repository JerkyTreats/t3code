import { describe, expect, it } from "vite-plus/test";

import { resolveComposerStashMenuKeyAction } from "./composerStashMenuKeyboard";

describe("composer stash menu keyboard ownership", () => {
  it("handles navigation only for menu commands", () => {
    expect(
      resolveComposerStashMenuKeyAction({
        key: "ArrowDown",
        targetIsButton: false,
        hasEntries: true,
      }),
    ).toEqual({ kind: "move", offset: 1 });
    expect(
      resolveComposerStashMenuKeyAction({
        key: "a",
        targetIsButton: false,
        hasEntries: true,
      }),
    ).toBeNull();
  });

  it("leaves Enter on the focused delete button to that button", () => {
    expect(
      resolveComposerStashMenuKeyAction({
        key: "Enter",
        targetIsButton: true,
        hasEntries: true,
      }),
    ).toBeNull();
    expect(
      resolveComposerStashMenuKeyAction({
        key: "Enter",
        targetIsButton: false,
        hasEntries: true,
      }),
    ).toEqual({ kind: "restore" });
  });
});
