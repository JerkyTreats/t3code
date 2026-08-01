import { describe, expect, it } from "vite-plus/test";

import {
  formatDocumentReviewRange,
  markDocumentReviewBlocks,
  readDocumentReviewRange,
} from "./documentReview";

describe("document review blocks", () => {
  it("marks only top-level rendered Markdown blocks with source line ranges", () => {
    const paragraph = {
      type: "element",
      tagName: "p",
      properties: {},
      position: { start: { line: 2 }, end: { line: 4 } },
    };
    const nestedParagraph = {
      type: "element",
      tagName: "p",
      properties: {},
      position: { start: { line: 6 }, end: { line: 6 } },
    };
    const blockquote = {
      type: "element",
      tagName: "blockquote",
      properties: {},
      position: { start: { line: 5 }, end: { line: 7 } },
      children: [nestedParagraph],
    };
    const tree = { type: "root", children: [paragraph, blockquote] };

    markDocumentReviewBlocks(tree);

    expect(readDocumentReviewRange(paragraph)).toEqual({ startLine: 2, endLine: 4 });
    expect(readDocumentReviewRange(blockquote)).toEqual({ startLine: 5, endLine: 7 });
    expect(readDocumentReviewRange(nestedParagraph)).toBeNull();
  });

  it("formats one-line and multi-line ranges", () => {
    expect(formatDocumentReviewRange({ startLine: 3, endLine: 3 })).toBe("L3");
    expect(formatDocumentReviewRange({ startLine: 3, endLine: 8 })).toBe("L3 to L8");
  });
});
