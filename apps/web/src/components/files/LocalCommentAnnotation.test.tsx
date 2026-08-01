import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { LocalCommentAnnotation } from "./LocalCommentAnnotation";

function renderDraft(reviewActive: boolean): string {
  return renderToStaticMarkup(
    <LocalCommentAnnotation
      kind="draft"
      reviewActive={reviewActive}
      rangeLabel="L4 to L6"
      text=""
      onCancel={vi.fn()}
      onAddToReview={vi.fn()}
      onSubmitComment={vi.fn().mockResolvedValue(true)}
      onDelete={vi.fn()}
    />,
  );
}

describe("LocalCommentAnnotation", () => {
  it("offers an explicit review start and a separate single-comment send action", () => {
    const markup = renderDraft(false);

    expect(markup).toContain("Start review");
    expect(markup).toContain('aria-label="Send comment now"');
    expect(markup).not.toContain("Add to review");
  });

  it("changes the primary action when a review is active", () => {
    const markup = renderDraft(true);

    expect(markup).toContain("Add to review");
    expect(markup).not.toContain("Start review");
    expect(markup).not.toContain('aria-label="Send comment now"');
  });
});
