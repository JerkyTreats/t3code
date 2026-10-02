import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";
import { buildMessageContext } from "../lib/composerContextRecords";
import {
  formatReferencedChatPrompt,
  hasRetainedChatPromptContext,
  normalizeReferencedChatPrompt,
  resolveReferencedPlanFollowUpSubmission,
} from "./chatPromptContext";

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

describe("V2 contextual send paths", () => {
  const context = buildMessageContext({
    terminalContexts: [
      {
        id: "selection",
        threadId: ThreadId.make("synthetic-thread"),
        terminalId: "terminal",
        terminalLabel: "Shell",
        lineStart: 1,
        lineEnd: 2,
        text: "synthetic output",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    previewAnnotations: [],
    reviewComments: [],
  });

  it("recognizes retained V2 records when queued edits restore their context", () => {
    const prompt = "  authored edit\r\n\t ";
    expect(hasRetainedChatPromptContext(context)).toBe(true);
    expect(normalizeReferencedChatPrompt(prompt, hasRetainedChatPromptContext(context))).toBe(
      prompt,
    );
    expect(hasRetainedChatPromptContext(undefined)).toBe(false);
    expect(hasRetainedChatPromptContext({ version: 1, records: [] })).toBe(false);
  });

  it("preserves contextual plan refinements through upstream intent and effort formatting", () => {
    const prompt = "\n  refine the plan\r\n\t ";
    const followUp = resolveReferencedPlanFollowUpSubmission({
      draftText: prompt,
      planMarkdown: "# Synthetic plan",
      hasRetainedContext: true,
    });
    expect(followUp).toEqual({ text: prompt, interactionMode: "plan" });
    expect(formatReferencedChatPrompt(followUp.text, "ultrathink", true)).toBe(
      `Ultrathink:\n${prompt}`,
    );
  });

  it("keeps upstream ordinary refinement trimming and empty plan approval", () => {
    expect(
      resolveReferencedPlanFollowUpSubmission({
        draftText: "  refine  ",
        planMarkdown: "# Synthetic plan",
        hasRetainedContext: false,
      }),
    ).toEqual({ text: "refine", interactionMode: "plan" });
    expect(
      resolveReferencedPlanFollowUpSubmission({
        draftText: " \n\t ",
        planMarkdown: "  # Synthetic plan ",
        hasRetainedContext: true,
      }),
    ).toEqual({
      text: " \n\t PLEASE IMPLEMENT THIS PLAN:\n# Synthetic plan",
      interactionMode: "default",
    });
  });
});
