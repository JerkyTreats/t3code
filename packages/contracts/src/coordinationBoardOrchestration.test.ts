import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  BoardOrchestrationCommand,
  BoardPostRevisedPayload,
  OrchestrationBoardRevisionError,
} from "./coordinationBoardOrchestration.ts";

const source = { projectId: "project-1", threadId: "thread-1" } as const;
const decodeBoardCommand = Schema.decodeUnknownSync(BoardOrchestrationCommand);
const decodeRevisedPayload = Schema.decodeUnknownSync(BoardPostRevisedPayload);
const decodeRevisionError = Schema.decodeUnknownSync(OrchestrationBoardRevisionError);

describe("Board orchestration owner", () => {
  it("owns publication and revision command validation", () => {
    expect(
      decodeBoardCommand({
        type: "board.post.publish",
        commandId: "command-1",
        postId: "post-1",
        author: { kind: "agent", id: "agent-1", providerInstanceId: "codex" },
        source,
        body: "Dependency found",
        targets: ["agent-2"],
        createdAt: "2026-08-30T00:00:00.000Z",
      }).type,
    ).toBe("board.post.publish");

    expect(() =>
      decodeBoardCommand({
        type: "board.post.revise",
        commandId: "command-2",
        postId: "post-1",
        previousRevision: 1,
        revision: 1,
        editor: { kind: "environment-owner", clientId: "client-1" },
        editorSource: null,
        body: "Corrected dependency",
        targets: [],
        revisedAt: "2026-08-30T00:01:00.000Z",
      }),
    ).toThrow();
  });

  it("owns revision audit payloads and typed failures", () => {
    const payload = decodeRevisedPayload({
      postId: "post-1",
      previousRevision: 1,
      revision: 2,
      editor: { kind: "environment-owner", clientId: "client-1" },
      editorSource: null,
      body: "Corrected dependency",
      targets: [],
      revisedAt: "2026-08-30T00:01:00.000Z",
    });
    expect(payload.editor).toEqual({ kind: "environment-owner", clientId: "client-1" });

    const error = decodeRevisionError({
      _tag: "OrchestrationBoardRevisionError",
      reason: "conflict",
      message: "Revision changed",
      expectedRevision: 1,
      actualRevision: 2,
    });
    expect(error.reason).toBe("conflict");
  });
});
