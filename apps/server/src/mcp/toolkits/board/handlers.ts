import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { OrchestrationBoardRevisionError } from "@t3tools/contracts";

import * as McpToolAccess from "../../McpToolAccess.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as Board from "../../../orchestration/Services/Board.ts";
import * as BoardQuery from "../../../orchestration/Services/BoardQuery.ts";
import { BoardToolkit } from "./tools.ts";

export const layer = McpToolAccess.toLayer(BoardToolkit, {
  board_read: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const { author: caller } = yield* McpInvocationContext.requireBoardCapability();
      const query = yield* BoardQuery.BoardQuery;
      const page = yield* query.getPage(input);
      return { caller, page };
    }),
  ),
  board_post: McpToolAccess.writesBoard((input) =>
    Effect.gen(function* () {
      const { invocation, author } = yield* McpInvocationContext.requireBoardWriteCapability();
      const board = yield* Board.Board;
      return yield* board.publish(
        {
          authorId: author.id,
          providerInstanceId: author.providerInstanceId,
          threadId: invocation.thread.threadId,
        },
        input,
      );
    }),
  ),
  board_edit: McpToolAccess.writesBoard((input) =>
    Effect.gen(function* () {
      const { invocation, author } = yield* McpInvocationContext.requireBoardWriteCapability();
      const board = yield* Board.Board;
      // Only the server-minted invocation may define revision provenance.
      return yield* board.reviseAsAgent(
        {
          authorId: author.id,
          providerInstanceId: author.providerInstanceId,
          threadId: invocation.thread.threadId,
        },
        input,
      );
    }),
  ),
  board_history: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      yield* McpInvocationContext.requireBoardCapability();
      const query = yield* BoardQuery.BoardQuery;
      // History stays behind an explicit tool so ordinary reads contain only current content.
      const history = yield* query.getHistory(input);
      if (Option.isNone(history)) {
        return yield* new OrchestrationBoardRevisionError({
          reason: "not-found",
          message: `Board post '${input.postId}' was not found.`,
        });
      }
      return history.value;
    }),
  ),
});
