import { describe, expect, it } from "@effect/vitest";

import { isComposerScreenshotCaptureDisabled, shouldSubmitComposerOnEnter } from "./ChatComposer";

describe("shouldSubmitComposerOnEnter", () => {
  it("submits plain drafts on Enter", () => {
    expect(
      shouldSubmitComposerOnEnter({ key: "Enter", shiftKey: false, richDraftMode: false }),
    ).toBe(true);
  });

  it("keeps Enter available for a new line in rich draft mode", () => {
    expect(
      shouldSubmitComposerOnEnter({ key: "Enter", shiftKey: false, richDraftMode: true }),
    ).toBe(false);
  });

  it("keeps Shift Enter available for a new line in plain mode", () => {
    expect(
      shouldSubmitComposerOnEnter({ key: "Enter", shiftKey: true, richDraftMode: false }),
    ).toBe(false);
  });

  it("does not submit for composer navigation keys", () => {
    expect(shouldSubmitComposerOnEnter({ key: "Tab", shiftKey: false, richDraftMode: false })).toBe(
      false,
    );
  });
});

describe("isComposerScreenshotCaptureDisabled", () => {
  const readyState = {
    captureInFlight: false,
    isSendBusy: false,
    isConnecting: false,
    environmentUnavailable: false,
    hasPendingApproval: false,
    hasPendingUserInput: false,
  };

  it("allows capture only while the composer is ready", () => {
    expect(isComposerScreenshotCaptureDisabled(readyState)).toBe(false);
  });

  it.each([
    "captureInFlight",
    "isSendBusy",
    "isConnecting",
    "environmentUnavailable",
    "hasPendingApproval",
    "hasPendingUserInput",
  ] as const)("disables capture for %s", (guard) => {
    expect(isComposerScreenshotCaptureDisabled({ ...readyState, [guard]: true })).toBe(true);
  });
});
