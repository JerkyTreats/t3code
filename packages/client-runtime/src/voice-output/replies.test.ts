import { describe, expect, it } from "@effect/vitest";
import { VoiceReplyTracker, type VoiceReplySnapshot } from "./replies.ts";

const submission = {
  environmentId: "env-a",
  threadId: "thread-a",
  messageId: "user-a",
  createdAt: "2026-09-07T01:00:00Z",
};
const snapshot: VoiceReplySnapshot = {
  ...submission,
  latestTurn: {
    turnId: "turn-a",
    state: "completed",
    requestedAt: submission.createdAt,
    assistantMessageId: "final-a",
  },
  messages: [
    {
      id: "user-a",
      role: "user",
      text: "Hello",
      turnId: null,
      streaming: false,
      createdAt: submission.createdAt,
    },
    {
      id: "comment-a",
      role: "assistant",
      text: "Working",
      turnId: "turn-a",
      streaming: false,
      createdAt: submission.createdAt,
    },
    {
      id: "final-a",
      role: "assistant",
      text: "  Here is the result.  ",
      turnId: "turn-a",
      streaming: false,
      createdAt: submission.createdAt,
    },
  ],
};

describe("VoiceReplyTracker", () => {
  it("does not speak historical or other-device snapshots", () => {
    expect(new VoiceReplyTracker().consume(snapshot)).toBeNull();
  });
  it("speaks the checkpoint-selected reply verbatim once, never commentary", () => {
    const tracker = new VoiceReplyTracker();
    tracker.register(submission);
    expect(tracker.consume(snapshot)).toEqual({
      messageId: "final-a",
      text: "  Here is the result.  ",
    });
    expect(tracker.consume(snapshot)).toBeNull();
  });
  it("waits for settled message projection", () => {
    const tracker = new VoiceReplyTracker();
    tracker.register(submission);
    expect(
      tracker.consume({ ...snapshot, latestTurn: { ...snapshot.latestTurn!, state: "running" } }),
    ).toBeNull();
    expect(tracker.consume({ ...snapshot, messages: snapshot.messages.slice(0, 2) })).toBeNull();
    expect(
      tracker.consume({
        ...snapshot,
        messages: snapshot.messages.map((m) => ({ ...m, streaming: true })),
      }),
    ).toBeNull();
    expect(tracker.consume(snapshot)?.messageId).toBe("final-a");
  });
  it("does not match an unrelated turn or another environment", () => {
    const tracker = new VoiceReplyTracker();
    tracker.register(submission);
    expect(tracker.consume({ ...snapshot, environmentId: "env-b" })).toBeNull();
    expect(
      tracker.consume({
        ...snapshot,
        latestTurn: { ...snapshot.latestTurn!, requestedAt: "different" },
      }),
    ).toBeNull();
    expect(tracker.consume(snapshot)).not.toBeNull();
  });
  it("clears interrupted, disabled and failed submissions", () => {
    const tracker = new VoiceReplyTracker();
    tracker.register(submission);
    expect(
      tracker.consume({
        ...snapshot,
        latestTurn: { ...snapshot.latestTurn!, state: "interrupted" },
      }),
    ).toBeNull();
    expect(tracker.consume(snapshot)).toBeNull();
    tracker.register(submission);
    tracker.clearThread(submission.environmentId, submission.threadId);
    expect(tracker.consume(snapshot)).toBeNull();
    tracker.register(submission);
    tracker.forget(submission);
    expect(tracker.consume(snapshot)).toBeNull();
  });
});
