import { OrchestratorMcpFailure, type PageStateError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { canvasOf } from "../../../canvas/sharedCanvas.ts";
import * as ThreadCanvasStore from "../../../canvas/ThreadCanvasStore.ts";
import * as PageStateStore from "../../../pageState/PageStateStore.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { PageStateToolkit } from "./tools.ts";

const toFailure = (error: PageStateError) =>
  new OrchestratorMcpFailure({
    code: error.reason === "storage" ? "orchestration_error" : "invalid_request",
    message: error.message,
  });

const handlers = {
  page_state: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "page_state");
      const pageState = yield* PageStateStore.PageStateStore;
      if (input.key === undefined) {
        const documents = yield* pageState.list(thread.threadId).pipe(Effect.mapError(toFailure));
        return {
          documents: documents.map(({ key, revision, updatedBy }) => ({
            key,
            revision,
            ...(updatedBy === undefined ? {} : { updatedBy }),
          })),
        };
      }
      if (input.set === undefined && input.merge === undefined) {
        return {
          document: yield* pageState
            .get(thread.threadId, input.key)
            .pipe(Effect.mapError(toFailure)),
        };
      }
      const { revision } = yield* pageState
        .write({
          threadId: thread.threadId,
          key: input.key,
          set: input.set,
          merge: input.merge,
          expectedRevision: input.expectedRevision,
          by: "agent",
        })
        .pipe(Effect.mapError(toFailure));
      if (input.reveal !== true) return { revision };
      // The cards to reveal sit on the board this agent draws on.
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const target = yield* canvasOf(thread.threadId);
      const revealed = yield* canvas
        .revealPages({
          threadId: target.threadId,
          key: input.key,
          anchor: target.card ?? undefined,
        })
        .pipe(
          Effect.mapError(
            (error) =>
              new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message }),
          ),
        );
      return { revision, revealed };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof PageStateToolkit.tools>;

export const layer = McpToolAccess.toLayer(PageStateToolkit, handlers);
