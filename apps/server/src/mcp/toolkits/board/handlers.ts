import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { OrchestrationBoardRevisionError } from "@t3tools/contracts";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as Board from "../../../orchestration/Services/Board.ts";
import * as BoardQuery from "../../../orchestration/Services/BoardQuery.ts";
import { BoardToolkit } from "./tools.ts";

const handlers = {
  board_read: (input) =>
    Effect.gen(function* () {
      const { author: caller } = yield* McpInvocationContext.requireBoardCapability();
      const query = yield* BoardQuery.BoardQuery;
      const page = yield* query.getPage(input);
      return { caller, page };
    }),
  board_post: (input) =>
    Effect.gen(function* () {
      const { invocation, author } = yield* McpInvocationContext.requireBoardWriteCapability();
      const board = yield* Board.Board;
      return yield* board.publish(
        {
          authorId: author.id,
          providerInstanceId: author.providerInstanceId,
          threadId: invocation.threadId,
        },
        input,
      );
    }),
  board_edit: (input) =>
    Effect.gen(function* () {
      const { invocation, author } = yield* McpInvocationContext.requireBoardWriteCapability();
      const board = yield* Board.Board;
      // Only the server-minted invocation may define revision provenance.
      return yield* board.reviseAsAgent(
        {
          authorId: author.id,
          providerInstanceId: author.providerInstanceId,
          threadId: invocation.threadId,
        },
        input,
      );
    }),
  board_history: (input) =>
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
} satisfies Parameters<typeof BoardToolkit.toLayer>[0];

export const BoardToolkitHandlersLive = BoardToolkit.toLayer(handlers);
