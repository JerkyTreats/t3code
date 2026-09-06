import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  BOARD_PAGE_MAX_POSTS,
  BOARD_POST_MAX_BODY_BYTES,
  BOARD_POST_MAX_TARGETS,
  BoardGetPageInput,
  BoardGetHistoryInput,
  BoardHistoryPage,
  BoardPage,
  BoardPost,
  BoardPostSource,
  BoardPublishInput,
  BoardReviseInput,
  BoardStreamItem,
  BoardSubscribeInput,
} from "./coordinationBoard.ts";
import {
  ClientOrchestrationCommand,
  ORCHESTRATION_WS_METHODS,
  OrchestrationBoardRevisionError,
  OrchestrationEvent,
  OrchestrationRpcSchemas,
} from "./orchestration.ts";
import {
  WsOrchestrationGetBoardPageRpc,
  WsOrchestrationGetBoardPostHistoryRpc,
  WsOrchestrationReviseBoardPostRpc,
  WsOrchestrationSubscribeBoardRpc,
  WsRpcGroup,
} from "./rpc.ts";

const decodePublishInput = Schema.decodeUnknownSync(BoardPublishInput);
const decodePost = Schema.decodeUnknownSync(BoardPost);
const decodePostSource = Schema.decodeUnknownSync(BoardPostSource);
const decodePage = Schema.decodeUnknownSync(BoardPage);
const decodePageInput = Schema.decodeUnknownSync(BoardGetPageInput);
const decodeSubscribeInput = Schema.decodeUnknownSync(BoardSubscribeInput);
const decodeClientCommand = Schema.decodeUnknownSync(ClientOrchestrationCommand);
const decodeStreamItem = Schema.decodeUnknownSync(BoardStreamItem);
const decodeReviseInput = Schema.decodeUnknownSync(BoardReviseInput);
const decodeHistoryPage = Schema.decodeUnknownSync(BoardHistoryPage);
const decodeEvent = Schema.decodeUnknownSync(OrchestrationEvent);
const decodeRevisionError = Schema.decodeUnknownSync(OrchestrationBoardRevisionError);
const decodeHistoryRpcError = Schema.decodeUnknownSync(
  WsOrchestrationGetBoardPostHistoryRpc.errorSchema,
);
const decodeRevisionRpcError = Schema.decodeUnknownSync(
  WsOrchestrationReviseBoardPostRpc.errorSchema,
);

const post = {
  id: "post-1",
  author: { kind: "agent", id: "agent-1", providerInstanceId: "codex" },
  source: { projectId: "project-1", threadId: "thread-1" },
  body: "Dependency found",
  targets: ["agent-2"],
  sequence: 42,
  createdAt: "2026-08-28T12:00:00.000Z",
  revision: 1,
  updatedSequence: 42,
  updatedAt: "2026-08-28T12:00:00.000Z",
  lastEditor: { kind: "agent" },
  lastEditorSource: { projectId: "project-1", threadId: "thread-1" },
} as const;

describe("global Board contracts", () => {
  it("keeps publication content bounded and excludes caller supplied authorship", () => {
    expect(decodePublishInput({ body: "Ready", targets: ["agent-2"] })).toEqual({
      body: "Ready",
      targets: ["agent-2"],
    });
    expect(() => decodePublishInput({ body: "" })).toThrow();
    expect(() =>
      decodePublishInput({
        body: "é".repeat(BOARD_POST_MAX_BODY_BYTES / 2 + 1),
      }),
    ).toThrow();
    expect(() =>
      decodePublishInput({
        body: "Ready",
        targets: Array.from({ length: BOARD_POST_MAX_TARGETS + 1 }, (_, index) => `agent-${index}`),
      }),
    ).toThrow();

    const decoded = decodePublishInput({
      body: "Ready",
      author: { kind: "agent", id: "forged", providerInstanceId: "codex" },
    });
    expect("author" in decoded).toBe(false);
  });

  it("defines one global post model and canonical bounded pages", () => {
    expect(decodePost(post)).toEqual(post);
    expect(
      decodePostSource({
        kind: "collective-expedition",
        expeditionId: "expedition-legacy",
        residentId: "resident-legacy",
      }),
    ).toEqual({
      kind: "collective-expedition",
      expeditionId: "expedition-legacy",
      residentId: "resident-legacy",
    });
    expect(decodePage({ posts: [post], beforeCursor: null, headSequence: 42 }).posts).toHaveLength(
      1,
    );
    expect(() =>
      decodePage({
        posts: Array.from({ length: BOARD_PAGE_MAX_POSTS + 1 }, () => post),
        beforeCursor: null,
        headSequence: 42,
      }),
    ).toThrow();
    expect(() =>
      decodePage({
        posts: [{ ...post, sequence: 43 }, post],
        beforeCursor: null,
        headSequence: 43,
      }),
    ).toThrow();
  });

  it("keeps private session and client identifiers out of public correction provenance", () => {
    expect(
      decodePost({
        ...post,
        lastEditor: { kind: "environment-owner", clientId: "private-client" },
      }).lastEditor,
    ).toEqual({ kind: "environment-owner" });
    expect(
      decodeHistoryPage({
        postId: post.id,
        currentRevision: 2,
        revisions: [
          {
            postId: post.id,
            revision: 2,
            body: "Corrected",
            targets: [],
            editor: {
              kind: "agent",
              id: "private-session",
              providerInstanceId: "private-instance",
            },
            editorSource: post.source,
            editedAt: post.updatedAt,
            eventSequence: 44,
          },
        ],
        beforeRevision: null,
      }).revisions[0]?.editor,
    ).toEqual({ kind: "agent" });
  });

  it("registers global page and live RPCs with no project, thread, target, or author input", () => {
    expect(decodePageInput({ limit: 25 })).toEqual({ limit: 25 });
    expect(decodeSubscribeInput({ afterSequence: 4 })).toEqual({
      afterSequence: 4,
    });
    expect(ORCHESTRATION_WS_METHODS.getBoardPage).toBe("orchestration.getBoardPage");
    expect(ORCHESTRATION_WS_METHODS.subscribeBoard).toBe("orchestration.subscribeBoard");
    expect(ORCHESTRATION_WS_METHODS.getBoardPostHistory).toBe("orchestration.getBoardPostHistory");
    expect(ORCHESTRATION_WS_METHODS.reviseBoardPost).toBe("orchestration.reviseBoardPost");
    expect(OrchestrationRpcSchemas.getBoardPage.input).toBe(BoardGetPageInput);
    expect(OrchestrationRpcSchemas.subscribeBoard.input).toBe(BoardSubscribeInput);
    expect(WsOrchestrationGetBoardPageRpc._tag).toBe(ORCHESTRATION_WS_METHODS.getBoardPage);
    expect(WsOrchestrationSubscribeBoardRpc._tag).toBe(ORCHESTRATION_WS_METHODS.subscribeBoard);
    expect(WsOrchestrationGetBoardPostHistoryRpc._tag).toBe(
      ORCHESTRATION_WS_METHODS.getBoardPostHistory,
    );
    expect(WsOrchestrationReviseBoardPostRpc._tag).toBe(ORCHESTRATION_WS_METHODS.reviseBoardPost);
    expect(WsRpcGroup.requests.has(ORCHESTRATION_WS_METHODS.getBoardPage)).toBe(true);
    expect(WsRpcGroup.requests.has(ORCHESTRATION_WS_METHODS.subscribeBoard)).toBe(true);
    expect(WsRpcGroup.requests.has(ORCHESTRATION_WS_METHODS.getBoardPostHistory)).toBe(true);
    expect(WsRpcGroup.requests.has(ORCHESTRATION_WS_METHODS.reviseBoardPost)).toBe(true);
  });

  it("bounds public correction input and excludes caller supplied provenance", () => {
    const input = decodeReviseInput({
      postId: "post-1",
      expectedRevision: 1,
      body: "Corrected dependency",
      targets: ["agent-3"],
      editor: { kind: "environment-owner", clientId: "forged" },
      updatedAt: "2026-08-28T13:00:00.000Z",
    });
    expect(input).toEqual({
      postId: "post-1",
      expectedRevision: 1,
      body: "Corrected dependency",
      targets: ["agent-3"],
    });
    expect(() => decodeReviseInput({ ...input, expectedRevision: 0 })).toThrow();
    expect(() => decodeReviseInput({ ...input, body: "" })).toThrow();
  });

  it("keeps prior bodies behind explicit descending bounded history", () => {
    const current = {
      postId: "post-1",
      revision: 2,
      body: "Corrected dependency",
      targets: ["agent-3"],
      editor: { kind: "environment-owner" },
      editorSource: null,
      editedAt: "2026-08-28T13:00:00.000Z",
      eventSequence: 45,
    } as const;
    const original = {
      postId: "post-1",
      revision: 1,
      body: "Dependency found",
      targets: ["agent-2"],
      editor: { kind: "agent" },
      editorSource: post.source,
      editedAt: post.createdAt,
      eventSequence: 42,
    } as const;
    expect(
      decodeHistoryPage({
        postId: "post-1",
        currentRevision: 2,
        revisions: [current, original],
        beforeRevision: null,
      }).revisions,
    ).toEqual([current, original]);
    expect(() =>
      decodeHistoryPage({
        postId: "post-1",
        currentRevision: 2,
        revisions: [original, current],
        beforeRevision: null,
      }),
    ).toThrow();
    expect(OrchestrationRpcSchemas.getBoardPostHistory.input).toBe(BoardGetHistoryInput);
    expect(OrchestrationRpcSchemas.reviseBoardPost.input).toBe(BoardReviseInput);
  });

  it("decodes revision events and structured conflicts", () => {
    const revised = decodeEvent({
      sequence: 45,
      eventId: "event-45",
      aggregateKind: "board",
      aggregateId: "environment-global-board",
      occurredAt: "2026-08-28T13:00:00.000Z",
      commandId: "command-45",
      causationEventId: null,
      correlationId: "command-45",
      metadata: {},
      type: "board.post-revised",
      payload: {
        postId: "post-1",
        previousRevision: 1,
        revision: 2,
        editor: { kind: "environment-owner", clientId: "owner-client" },
        editorSource: null,
        body: "Corrected dependency",
        targets: [],
        revisedAt: "2026-08-28T13:00:00.000Z",
      },
    });
    expect(revised.type).toBe("board.post-revised");
    expect(
      decodeRevisionError({
        _tag: "OrchestrationBoardRevisionError",
        reason: "conflict",
        message: "Changed",
        expectedRevision: 1,
        actualRevision: 2,
        currentPost: { ...post, revision: 2, updatedSequence: 45 },
      }).actualRevision,
    ).toBe(2);
  });

  it("retains typed read, correction, and authorization failures", () => {
    expect(
      decodeHistoryRpcError({
        _tag: "OrchestrationGetSnapshotError",
        message: "History unavailable",
      })._tag,
    ).toBe("OrchestrationGetSnapshotError");
    expect(
      decodeRevisionRpcError({
        _tag: "OrchestrationBoardRevisionError",
        reason: "conflict",
        message: "Revision changed",
        expectedRevision: 1,
        actualRevision: 2,
      })._tag,
    ).toBe("OrchestrationBoardRevisionError");
    expect(
      decodeRevisionRpcError({
        _tag: "EnvironmentAuthorizationError",
        message: "Write access required",
        requiredScope: "access:write",
      })._tag,
    ).toBe("EnvironmentAuthorizationError");
  });

  it("keeps trusted Board commands outside the client command union", () => {
    expect(() =>
      decodeClientCommand({
        type: "board.post.publish",
        commandId: "cmd-forged",
        postId: "post-forged",
        author: post.author,
        source: post.source,
        body: post.body,
        targets: [],
        createdAt: post.createdAt,
      }),
    ).toThrow();
    expect(() =>
      decodeClientCommand({
        type: "board.post.revise",
        commandId: "cmd-forged",
        postId: post.id,
        previousRevision: 1,
        revision: 2,
        editor: { kind: "environment-owner", clientId: "client-forged" },
        editorSource: null,
        body: "Forged correction",
        targets: [],
        revisedAt: post.updatedAt,
      }),
    ).toThrow();
  });

  it("carries the exact post model in live stream items", () => {
    expect(decodeStreamItem({ kind: "post", post })).toEqual({
      kind: "post",
      post,
    });
    expect(
      decodeStreamItem({
        kind: "revision",
        post: { ...post, revision: 2, updatedSequence: 45, body: "Corrected" },
      }).kind,
    ).toBe("revision");
  });
});
