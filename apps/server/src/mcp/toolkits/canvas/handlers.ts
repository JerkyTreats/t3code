import { OrchestratorMcpFailure, type ThreadCanvasError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { describeCanvas } from "../../../canvas/threadCanvasScene.ts";
import { canvasThreadOf, sharedDrawingId } from "../../../canvas/sharedCanvas.ts";
import * as ThreadCanvasStore from "../../../canvas/ThreadCanvasStore.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { CanvasToolkit } from "./tools.ts";

const toFailure = (error: ThreadCanvasError) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message });

export const layer = McpToolAccess.toLayer(CanvasToolkit, {
  canvas_read: McpToolAccess.readsAsCaller(() =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "canvas_read");
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const canvasThreadId = yield* canvasThreadOf(thread.threadId);
      const scene = yield* canvas.read(canvasThreadId).pipe(Effect.mapError(toFailure));
      // A delegated task reads its parent's canvas but leaves the user's marks unseen, so the
      // parent still hears about them on its next turn.
      if (canvasThreadId === thread.threadId) {
        const delivery = yield* canvas
          .deliverToAgent({ threadId: thread.threadId, message: "", picture: false })
          .pipe(Effect.mapError(toFailure));
        yield* delivery.acknowledge.pipe(Effect.mapError(toFailure));
      }
      return describeCanvas(scene);
    }),
  ),
  canvas_update: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "canvas_update");
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const canvasThreadId = yield* canvasThreadOf(thread.threadId);
      return yield* canvas
        .draw({
          ...input,
          threadId: canvasThreadId,
          drawingId: sharedDrawingId(input.drawingId, thread.threadId, canvasThreadId),
        })
        .pipe(Effect.mapError(toFailure));
    }),
  ),
});
