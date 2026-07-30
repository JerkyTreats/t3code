import { describe, expect, it } from "vite-plus/test";

import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "./lib/terminalContext";
import { mergeStashedPrompt, promptTextForStash } from "./promptStashText";

describe("prompt stash text", () => {
  it("removes only live terminal placeholders and preserves surrounding whitespace", () => {
    expect(promptTextForStash(`  before${INLINE_TERMINAL_CONTEXT_PLACEHOLDER}after  \n`)).toBe(
      "  beforeafter  \n",
    );
    expect(promptTextForStash("   ")).toBe("   ");
  });

  it("merges without trimming either active or stashed text", () => {
    expect(mergeStashedPrompt("active  \n", "  stashed\n")).toBe("active  \n\n\n  stashed\n");
    expect(mergeStashedPrompt("", "  stashed  ")).toBe("  stashed  ");
    expect(mergeStashedPrompt("active  ", "")).toBe("active  ");
  });
});
