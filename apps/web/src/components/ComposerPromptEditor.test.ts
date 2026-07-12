import { describe, expect, it } from "@effect/vitest";

import { normalizeComposerExpandedSelectionRange } from "./ComposerPromptEditor";

describe("normalizeComposerExpandedSelectionRange", () => {
  it("orders a reverse editor selection", () => {
    expect(normalizeComposerExpandedSelectionRange("alpha beta", 10, 6)).toEqual({
      start: 6,
      end: 10,
    });
  });

  it("clamps selection bounds to the expanded composer text", () => {
    expect(normalizeComposerExpandedSelectionRange("@file.ts $skill", -4, 99)).toEqual({
      start: 0,
      end: 15,
    });
  });

  it("preserves a collapsed selection", () => {
    expect(normalizeComposerExpandedSelectionRange("terminal context", 8, 8)).toEqual({
      start: 8,
      end: 8,
    });
  });
});
