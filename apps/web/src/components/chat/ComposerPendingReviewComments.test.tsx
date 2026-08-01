import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ReviewCommentContext } from "~/reviewCommentContext";

import { ComposerPendingReviewComments } from "./ComposerPendingReviewComments";

const comment: ReviewCommentContext = {
  id: "review-comment-1",
  sectionId: "file:README.md",
  sectionTitle: "File comment",
  filePath: "README.md",
  startIndex: 3,
  endIndex: 3,
  rangeLabel: "L4",
  text: "Clarify this statement.",
  diff: "Current statement",
  fenceLanguage: "md",
};

describe("ComposerPendingReviewComments", () => {
  it("makes the pending and submission state explicit", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingReviewComments
        comments={[comment]}
        active
        onRemove={vi.fn()}
        onCancelReview={vi.fn()}
        onSubmitReview={vi.fn()}
        submitDisabled={false}
      />,
    );

    expect(markup).toContain("Review in progress");
    expect(markup).toContain("1 comment not submitted");
    expect(markup).toContain("Cancel review");
    expect(markup).toContain("Submit review (1)");
  });
});
