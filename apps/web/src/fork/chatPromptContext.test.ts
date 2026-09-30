import { describe, expect, it } from "vite-plus/test";
import { formatReferencedChatPrompt, normalizeReferencedChatPrompt } from "./chatPromptContext";

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

describe("referenced prompt effort formatting", () => {
  it.each(["  lead", "tail  ", "\n\nlead\n\n\n", " \n\t\n ", "", "a\r\nb\n\n"])(
    "preserves exact bytes with no injected effort: %j",
    (prompt) => expect(formatReferencedChatPrompt(prompt, null, true)).toBe(prompt),
  );

  it("keeps the upstream effort prefix ahead of the complete authored prompt", () => {
    expect(formatReferencedChatPrompt("  reason carefully\n\t ", "ultrathink", true)).toBe(
      "Ultrathink:\n  reason carefully\n\t ",
    );
  });

  it.each(["  /deploy.prod  ", "  /plugin:skill\n", " Ultrathink: already enabled "])(
    "keeps upstream effort exclusion and exact authored bytes: %j",
    (prompt) => expect(formatReferencedChatPrompt(prompt, "ultrathink", true)).toBe(prompt),
  );

  it("retains ordinary and review-only upstream formatting", () => {
    expect(formatReferencedChatPrompt("  ordinary\n", null, false)).toBe("ordinary");
    expect(formatReferencedChatPrompt("  review only\n", "ultrathink", false)).toBe(
      "Ultrathink:\nreview only",
    );
  });
});
