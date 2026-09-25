import { describe, expect, it } from "vite-plus/test";
import { normalizeReferencedChatPrompt } from "./chatPromptContext";

describe("referenced prompt context composition", () => {
  for (const prompt of ["  lead", "tail  ", "\n\nlead\n\n\n", " \n\t\n ", "", "a\r\nb\n\n"]) {
    it(`preserves authored bytes with retained context: ${JSON.stringify(prompt)}`, () => {
      expect(normalizeReferencedChatPrompt(prompt, true)).toBe(prompt);
    });
  }

  it("preserves upstream ordinary and review-only trimming", () => {
    expect(normalizeReferencedChatPrompt("  ordinary\n\n", false)).toBe("ordinary");
    expect(normalizeReferencedChatPrompt("  review only\n\n", false)).toBe("review only");
  });
});
