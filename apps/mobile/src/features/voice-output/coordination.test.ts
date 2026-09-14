import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  clearMobileVoiceReplies,
  clearMobileVoiceThread,
  finishLocalVoiceSubmission,
  markLocalVoiceSubmission,
  mobileVoiceReplies,
  registerQueuedVoiceSubmission,
  prepareQueuedVoiceSubmission,
} from "./coordination";

const submission = {
  environmentId: "synthetic-environment",
  threadId: "synthetic-thread",
  messageId: "synthetic-message",
  createdAt: "2026-09-07T00:00:00Z",
};

afterEach(() => {
  clearMobileVoiceReplies();
  vi.restoreAllMocks();
});

describe("local mobile voice eligibility", () => {
  it.each(["leave", "disable"] as const)(
    "does not rearm when %s interrupts playback shutdown",
    async (action) => {
      let finishShutdown!: () => void;
      const shutdown = new Promise<void>((resolve) => {
        finishShutdown = resolve;
      });
      const register = vi.spyOn(mobileVoiceReplies, "register");
      const preparing = prepareQueuedVoiceSubmission(
        { submission, responseStyle: "voice", destination: "current-thread" },
        () => shutdown,
      );
      if (action === "leave") clearMobileVoiceThread(submission.environmentId, submission.threadId);
      else clearMobileVoiceReplies();
      finishShutdown();
      await preparing;
      registerQueuedVoiceSubmission(submission);
      expect(register).not.toHaveBeenCalled();
    },
  );

  it("removes eligibility when shutdown fails without sending", async () => {
    const register = vi.spyOn(mobileVoiceReplies, "register");
    await expect(
      prepareQueuedVoiceSubmission(
        { submission, responseStyle: "voice", destination: "current-thread" },
        () => Promise.reject(new Error("Shutdown failed")),
      ),
    ).rejects.toThrow("Shutdown failed");
    registerQueuedVoiceSubmission(submission);
    expect(register).not.toHaveBeenCalled();
  });

  it("preserves voice style for an offline creation without auto-play after returning to another screen", async () => {
    const register = vi.spyOn(mobileVoiceReplies, "register");
    const responseStyle = await prepareQueuedVoiceSubmission(
      { submission, responseStyle: "voice", destination: "background-creation" },
      () => Promise.resolve(),
    );
    expect(responseStyle).toBe("voice");
    // The queued creation dispatches later and its future thread is opened.
    registerQueuedVoiceSubmission(submission);
    expect(register).not.toHaveBeenCalled();
  });
  it("does not arm historical persisted outbox entries after app hydration", () => {
    const register = vi.spyOn(mobileVoiceReplies, "register");
    registerQueuedVoiceSubmission(submission);
    expect(register).not.toHaveBeenCalled();
  });

  it("registers a local voice submit at dispatch and consumes eligibility after success", () => {
    const register = vi.spyOn(mobileVoiceReplies, "register");
    markLocalVoiceSubmission(submission);
    registerQueuedVoiceSubmission(submission);
    expect(register).toHaveBeenCalledExactlyOnceWith(submission);
    finishLocalVoiceSubmission(submission);
    registerQueuedVoiceSubmission(submission);
    expect(register).toHaveBeenCalledOnce();
  });

  it("cannot rearm a queued submission after leaving its thread", () => {
    const register = vi.spyOn(mobileVoiceReplies, "register");
    markLocalVoiceSubmission(submission);
    clearMobileVoiceThread(submission.environmentId, submission.threadId);
    registerQueuedVoiceSubmission(submission);
    expect(register).not.toHaveBeenCalled();
  });

  it("disabling voice removes pending eligibility across environments", () => {
    const register = vi.spyOn(mobileVoiceReplies, "register");
    markLocalVoiceSubmission(submission);
    clearMobileVoiceReplies();
    registerQueuedVoiceSubmission(submission);
    expect(register).not.toHaveBeenCalled();
  });
});
