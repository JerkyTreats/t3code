import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ComposerTopActions } from "./ComposerTopActions";

describe("ComposerTopActions", () => {
  it("renders runtime access and a guarded screenshot action in floating chrome", () => {
    const markup = renderToStaticMarkup(
      <ComposerTopActions
        canCaptureDesktopScreenshot
        isCapturingDesktopScreenshot
        isScreenshotDisabled
        runtimeMode="approval-required"
        onCaptureScreenshot={vi.fn()}
        onRuntimeModeChange={vi.fn()}
      />,
    );

    expect(markup).toContain('data-chat-composer-top-actions="true"');
    expect(markup).toContain('aria-label="Runtime mode: Supervised"');
    expect(markup).toContain('aria-label="Attach screenshot"');
    expect(markup).toContain("disabled");
    expect(markup).toContain("animate-pulse");
  });

  it("omits screenshot capture when the desktop bridge is unavailable", () => {
    const markup = renderToStaticMarkup(
      <ComposerTopActions
        canCaptureDesktopScreenshot={false}
        isCapturingDesktopScreenshot={false}
        isScreenshotDisabled={false}
        runtimeMode="full-access"
        onCaptureScreenshot={vi.fn()}
        onRuntimeModeChange={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Runtime mode: Full access"');
    expect(markup).not.toContain('aria-label="Attach screenshot"');
  });
});
