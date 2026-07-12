import { describe, expect, it } from "vite-plus/test";

import {
  formatPendingPrimaryActionLabel,
  isComposerSendDisabled,
  isRemoteComposerActionDisabled,
} from "./ComposerPrimaryActions";

describe("formatPendingPrimaryActionLabel", () => {
  it("returns 'Submitting...' while responding", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: false,
        isResponding: true,
        questionIndex: 0,
      }),
    ).toBe("Submitting...");
  });

  it("returns 'Submitting...' while responding regardless of other flags", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: true,
        isResponding: true,
        questionIndex: 3,
      }),
    ).toBe("Submitting...");
  });

  it("returns 'Submit' in compact mode on the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Submit");
  });

  it("returns 'Next' in compact mode when not the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: false,
        isResponding: false,
        questionIndex: 1,
      }),
    ).toBe("Next");
  });

  it("returns 'Next question' when not the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: false,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Next question");
  });

  it("returns singular 'Submit answer' on the last question when it is the only question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Submit answer");
  });

  it("returns plural 'Submit answers' on the last question when there are multiple questions", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 1,
      }),
    ).toBe("Submit answers");
  });

  it("returns plural 'Submit answers' for higher question indices", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 5,
      }),
    ).toBe("Submit answers");
  });
});

describe("isComposerSendDisabled", () => {
  it("allows a normal message to be durably queued while disconnected", () => {
    expect(
      isComposerSendDisabled({
        isSendBusy: false,
        isConnecting: true,
        isEnvironmentUnavailable: true,
        canQueueOffline: true,
        hasSendableContent: true,
      }),
    ).toBe(false);
  });

  it("keeps connection-gated actions disabled", () => {
    expect(
      isComposerSendDisabled({
        isSendBusy: false,
        isConnecting: true,
        isEnvironmentUnavailable: true,
        canQueueOffline: false,
        hasSendableContent: true,
      }),
    ).toBe(true);
  });
});

describe("isRemoteComposerActionDisabled", () => {
  it("gates approval, answer, and interrupt commands during reconnect", () => {
    expect(
      isRemoteComposerActionDisabled({
        isConnecting: true,
        isEnvironmentUnavailable: false,
      }),
    ).toBe(true);
    expect(
      isRemoteComposerActionDisabled({
        isConnecting: false,
        isEnvironmentUnavailable: false,
      }),
    ).toBe(false);
  });
});
