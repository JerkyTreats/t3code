import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ComposerRichDraftToolbar } from "./ComposerRichDraftToolbar";

describe("ComposerRichDraftToolbar", () => {
  it("renders every protected formatting action", () => {
    const markup = renderToStaticMarkup(
      <ComposerRichDraftToolbar disabled={false} onApplyFormat={vi.fn()} />,
    );

    expect(markup).toContain('data-chat-composer-rich-draft-toolbar="true"');
    expect(markup).toContain('aria-label="Apply bold formatting"');
    expect(markup).toContain('aria-label="Apply italic formatting"');
    expect(markup).toContain('aria-label="Apply list formatting"');
    expect(markup).toContain('aria-label="Insert link formatting"');
    expect(markup).toContain('aria-label="Apply code formatting"');
  });

  it("disables formatting while the composer cannot accept edits", () => {
    const markup = renderToStaticMarkup(
      <ComposerRichDraftToolbar disabled onApplyFormat={vi.fn()} />,
    );

    expect(markup.match(/disabled=""/g)).toHaveLength(5);
  });
});
