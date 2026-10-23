import { describe, expect, it } from "vite-plus/test";
import { shouldFloatComposerRuntimeControl } from "./chatComposerPresentation";

describe("composer control placement owner", () => {
  it("keeps compact fallback and eligibility independent of the composer host", () => {
    const input = {
      isMobileViewport: false,
      isResting: false,
      isApprovalState: false,
      hasPendingInput: false,
      noProviderAvailable: false,
      controlsCompact: false,
    };
    expect(shouldFloatComposerRuntimeControl(input)).toBe(true);
    for (const key of Object.keys(input) as (keyof typeof input)[]) {
      expect(shouldFloatComposerRuntimeControl({ ...input, [key]: true })).toBe(false);
    }
  });
});
