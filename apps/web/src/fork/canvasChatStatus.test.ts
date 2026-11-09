import { describe, expect, it } from "vite-plus/test";

import { boardActivityOf, type ChatActivity, chatActivityOf } from "./canvasChatStatus";

const shell = (input: {
  readonly status?: "idle" | "running" | "queued" | "failed" | "completed";
  readonly approval?: boolean;
  readonly input?: boolean;
  readonly subagent?: "approval" | "user_input";
}) =>
  ({
    hasPendingApprovals: input.approval ?? false,
    hasPendingUserInput: input.input ?? false,
    pendingSubagentRequest: input.subagent ?? null,
    runtime: input.status === undefined ? null : { status: input.status },
  }) as Parameters<typeof chatActivityOf>[0];

describe("chatActivityOf", () => {
  it.each([
    [shell({}), { state: "idle" }],
    [shell({ status: "idle" }), { state: "idle" }],
    [shell({ status: "completed" }), { state: "idle" }],
    [shell({ status: "running" }), { state: "working" }],
    [shell({ status: "queued" }), { state: "working" }],
    [shell({ status: "failed" }), { state: "failed" }],
    // A question to the user outranks the run that asked it.
    [shell({ status: "running", approval: true }), { state: "waiting", for: "approval" }],
    [shell({ status: "running", input: true }), { state: "waiting", for: "answer" }],
    [shell({ status: "running", subagent: "approval" }), { state: "waiting", for: "approval" }],
    [shell({ status: "running", subagent: "user_input" }), { state: "waiting", for: "answer" }],
  ] satisfies ReadonlyArray<[Parameters<typeof chatActivityOf>[0], ChatActivity]>)(
    "%# derives the chat's state",
    (input, expected) => {
      expect(chatActivityOf(input)).toEqual(expected);
    },
  );
});

describe("boardActivityOf", () => {
  const chat = (id: string, activity: ChatActivity) => ({ id, activity });

  it("is null when no chat is working or waiting", () => {
    expect(boardActivityOf([chat("a", { state: "idle" }), chat("b", { state: "failed" })])).toBe(
      null,
    );
  });

  it("keeps the active chats in order and counts each state", () => {
    const summary = boardActivityOf([
      chat("a", { state: "working" }),
      chat("b", { state: "idle" }),
      chat("c", { state: "waiting", for: "answer" }),
      chat("d", { state: "working" }),
    ]);
    expect(summary?.active.map((entry) => entry.id)).toEqual(["a", "c", "d"]);
    expect(summary?.label).toBe("2 working · 1 waiting");
  });

  it("leaves out a state with no chats", () => {
    expect(boardActivityOf([chat("a", { state: "waiting", for: "approval" })])?.label).toBe(
      "1 waiting",
    );
  });
});
