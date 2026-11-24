import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { isOwnSideChat } from "./sideChatOwnership";

const environmentId = EnvironmentId.make("environment-board");
const board = scopeThreadRef(environmentId, ThreadId.make("thread-board"));
const other = ThreadId.make("thread-other");

const sideChatOf = (parentThreadId: ThreadId, forkedFromThreadId?: ThreadId) => ({
  lineage: {
    parentThreadId,
    relationshipToParent: "fork" as const,
    rootThreadId: parentThreadId,
    sideChat: true,
  },
  forkedFrom:
    forkedFromThreadId === undefined
      ? null
      : {
          type: "run" as const,
          threadId: forkedFromThreadId,
          runId: RunId.make("run-forked"),
        },
});

describe("isOwnSideChat", () => {
  it("owns the host thread's side chat, by its fork point first", () => {
    expect(isOwnSideChat(sideChatOf(board.threadId), board)).toBe(true);
    expect(isOwnSideChat(sideChatOf(other, board.threadId), board)).toBe(true);
  });

  it("leaves another thread's side chat placed on the board alone", () => {
    expect(isOwnSideChat(sideChatOf(other), board)).toBe(false);
    expect(isOwnSideChat(sideChatOf(board.threadId, other), board)).toBe(false);
  });

  it("treats a side chat whose shell has not loaded as the host's own", () => {
    expect(isOwnSideChat(null, board)).toBe(true);
  });
});
