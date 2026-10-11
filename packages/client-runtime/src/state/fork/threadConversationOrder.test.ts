import { describe, expect, it } from "vite-plus/test";
import {
  sortThreadsByConversation,
  threadConversationTimestamp,
} from "./threadConversationOrder.ts";

const createdAt = "2026-06-01T00:00:00.000Z";
const promptAt = "2026-06-01T01:00:00.000Z";
const responseAt = "2026-06-01T02:00:00.000Z";
const laterAt = "2026-06-01T03:00:00.000Z";

describe("conversation ordering", () => {
  it("orders a delivered response ahead of an older prompt, then a new prompt ahead of both", () => {
    const threads = [
      { id: "prompt", createdAt, latestUserAuthoredMessageAt: promptAt },
      {
        id: "response",
        createdAt,
        latestUserAuthoredMessageAt: promptAt,
        latestAssistantResponseAt: responseAt,
      },
      {
        id: "new-prompt",
        createdAt,
        latestUserAuthoredMessageAt: laterAt,
        latestAssistantResponseAt: responseAt,
      },
    ];
    expect(sortThreadsByConversation(threads).map((thread) => thread.id)).toEqual([
      "new-prompt",
      "response",
      "prompt",
    ]);
    expect(threads.map((thread) => thread.id)).toEqual(["prompt", "response", "new-prompt"]);
  });

  it("ignores run completion, tool updates, wake prompts and manual order keys", () => {
    const oldConversation = {
      id: "old",
      createdAt,
      latestUserAuthoredMessageAt: promptAt,
      latestUserMessageAt: laterAt,
      updatedAt: laterAt,
      unsettledAt: laterAt,
      latestRun: { requestedAt: laterAt, completedAt: laterAt },
      pinOrderKey: "a",
      activeOrderKey: "a",
      settledAt: laterAt,
      snoozedUntil: laterAt,
    };
    const recentConversation = { id: "recent", createdAt, latestAssistantResponseAt: responseAt };
    expect(
      sortThreadsByConversation([oldConversation, recentConversation]).map((thread) => thread.id),
    ).toEqual(["recent", "old"]);
    expect(threadConversationTimestamp(oldConversation)).toBe(promptAt);
  });

  it("distinguishes a known absent user prompt from an older server's missing stamp", () => {
    expect(
      threadConversationTimestamp({
        createdAt,
        latestUserAuthoredMessageAt: null,
        latestUserMessageAt: laterAt,
      }),
    ).toBe(createdAt);
    expect(threadConversationTimestamp({ createdAt, latestUserMessageAt: promptAt })).toBe(
      promptAt,
    );
  });

  it("uses creation for empty conversations and ignores malformed message timestamps", () => {
    expect(
      threadConversationTimestamp({
        createdAt,
        latestUserAuthoredMessageAt: "invalid",
        latestAssistantResponseAt: "invalid",
      }),
    ).toBe(createdAt);
  });

  it("breaks ties by thread and environment so independent clients converge", () => {
    const threads = [
      { id: "b", environmentId: "one", createdAt },
      { id: "a", environmentId: "two", createdAt },
      { id: "a", environmentId: "one", createdAt },
    ];
    expect(
      sortThreadsByConversation(threads).map((thread) => `${thread.id}:${thread.environmentId}`),
    ).toEqual(["a:one", "a:two", "b:one"]);
  });
});
