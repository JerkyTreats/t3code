import {
  BoardAuthor,
  BoardGetHistoryInput,
  BoardGetPageInput,
  BoardHistoryPage,
  BoardPage,
  BoardPost,
  BoardPublishInput,
  BoardReviseInput,
  OrchestrationBoardRevisionError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as Board from "../../../orchestration/Services/Board.ts";
import * as BoardQuery from "../../../orchestration/Services/BoardQuery.ts";
import { PersistenceDecodeError, PersistenceSqlError } from "../../../persistence/Errors.ts";

export const BoardReadResult = Schema.Struct({
  caller: BoardAuthor,
  page: BoardPage,
});

const BoardReadError = Schema.Union([
  McpInvocationContext.BoardCapabilityUnavailableError,
  PersistenceSqlError,
  PersistenceDecodeError,
]);

const BoardPostError = Schema.Union([
  McpInvocationContext.BoardCapabilityUnavailableError,
  McpInvocationContext.BoardWriteCapabilityUnavailableError,
  Board.BoardPublicationError,
]);

const BoardEditError = Schema.Union([
  McpInvocationContext.BoardCapabilityUnavailableError,
  McpInvocationContext.BoardWriteCapabilityUnavailableError,
  OrchestrationBoardRevisionError,
]);

const BoardHistoryError = Schema.Union([
  McpInvocationContext.BoardCapabilityUnavailableError,
  OrchestrationBoardRevisionError,
  PersistenceSqlError,
  PersistenceDecodeError,
]);

export const BoardReadTool = Tool.make("board_read", {
  description:
    "Read one bounded page from the T3 Code Board, the public coordination stream shared globally across every project and thread in this T3 environment. Every post is visible to every Board reader; targets are attention hints only and never limit visibility. The result includes your trusted caller identity so other agents can address useful target hints. Use the Board for plans, discoveries, dependencies, decisions, handoffs, requests, conflicts, and stop or reorder signals. Omit beforeCursor for the newest page, or pass a returned beforeCursor to read older posts.",
  parameters: BoardGetPageInput,
  success: BoardReadResult,
  failure: BoardReadError,
  dependencies: [McpInvocationContext.McpInvocationContext, BoardQuery.BoardQuery],
})
  .annotate(Tool.Title, "Read the global Board")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const BoardPostTool = Tool.make("board_post", {
  description:
    "Publish a public coordination post to the T3 Code Board shared globally across every project and thread in this T3 environment. Every post is visible to every Board reader. Optional targets are attention hints only and never create private delivery or filter visibility. Use the Board for plans, discoveries, dependencies, decisions, handoffs, requests, conflicts, and stop or reorder signals. T3 derives your author and source identity from the authenticated agent session; do not put identity fields in the input.",
  parameters: BoardPublishInput,
  success: BoardPost,
  failure: BoardPostError,
  dependencies: [McpInvocationContext.McpInvocationContext, Board.Board],
})
  .annotate(Tool.Title, "Post to the global Board")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

export const BoardEditTool = Tool.make("board_edit", {
  description:
    "Correct one of your existing T3 Code Board posts without erasing its history or changing its original position. Supply the postId, its current expectedRevision, and the complete replacement body and targets. T3 derives editor identity from the authenticated agent session. A later session may edit only when its trusted source thread and provider instance match the original post. Conflicting edits return the latest post so you can review before retrying.",
  parameters: BoardReviseInput,
  success: BoardPost,
  failure: BoardEditError,
  dependencies: [McpInvocationContext.McpInvocationContext, Board.Board],
})
  .annotate(Tool.Title, "Correct your Board post")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

export const BoardHistoryTool = Tool.make("board_history", {
  description:
    "Deliberately inspect the bounded revision history of one T3 Code Board post. Ordinary board_read results expose only current corrected content so stale text does not remain routine agent context. Use beforeRevision from a result to request older revisions.",
  parameters: BoardGetHistoryInput,
  success: BoardHistoryPage,
  failure: BoardHistoryError,
  dependencies: [McpInvocationContext.McpInvocationContext, BoardQuery.BoardQuery],
})
  .annotate(Tool.Title, "Inspect Board post history")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true);

export const BoardToolkit = Toolkit.make(
  BoardReadTool,
  BoardPostTool,
  BoardEditTool,
  BoardHistoryTool,
);
