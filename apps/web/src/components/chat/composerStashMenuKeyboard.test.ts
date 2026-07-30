import { describe, expect, it } from "vite-plus/test";

import { resolveComposerStashMenuKeyAction } from "./composerStashMenuKeyboard";

describe("composer stash menu keyboard ownership", () => {
  it("handles navigation only for menu commands", () => {
    expect(
      resolveComposerStashMenuKeyAction({
        key: "ArrowDown",
        hasEntries: true,
      }),
    ).toEqual({ kind: "move", offset: 1 });
    expect(
      resolveComposerStashMenuKeyAction({
        key: "a",
        hasEntries: true,
      }),
    ).toBeNull();
  });

  it("keeps restore and deletion under listbox keyboard ownership", () => {
    expect(
      resolveComposerStashMenuKeyAction({
        key: "Enter",
        hasEntries: true,
      }),
    ).toEqual({ kind: "restore" });
    expect(
      resolveComposerStashMenuKeyAction({
        key: "Delete",
        hasEntries: true,
      }),
    ).toEqual({ kind: "delete" });
  });
});
