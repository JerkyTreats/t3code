import { OrchestratorMcpFailure, type ThreadCanvasError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { describeCanvas } from "../../../canvas/threadCanvasScene.ts";
import { canvasThreadOf, sharedDrawingId } from "../../../canvas/sharedCanvas.ts";
import * as ThreadCanvasStore from "../../../canvas/ThreadCanvasStore.ts";
import * as HtmlRender from "../../../htmlRender/HtmlRender.ts";
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
      const htmlRender = yield* HtmlRender.HtmlRender;
      const canvasThreadId = yield* canvasThreadOf(thread.threadId);
      // An html card's page becomes an attachment of the canvas thread, so every client of that
      // thread can load it. A card that names an existing attachment keeps it.
      const shapes = yield* Effect.forEach(input.shapes, (shape) => {
        if (shape.type !== "html" || shape.attachmentId !== undefined) return Effect.succeed(shape);
        if (shape.html === undefined) {
          return Effect.fail(
            new OrchestratorMcpFailure({
              code: "invalid_request",
              message: `html shape ${shape.id} needs html or attachmentId.`,
            }),
          );
        }
        const { html, ...rest } = shape;
        return htmlRender.store({ threadId: canvasThreadId, html }).pipe(
          Effect.map(({ attachmentId }) => ({ ...rest, attachmentId })),
          Effect.mapError(
            (error) =>
              new OrchestratorMcpFailure({
                code: "orchestration_error",
                message: `Could not store the page of html shape ${shape.id}: ${String(error)}`,
              }),
          ),
        );
      });
      return yield* canvas
        .draw({
          ...input,
          shapes,
          threadId: canvasThreadId,
          drawingId: sharedDrawingId(input.drawingId, thread.threadId, canvasThreadId),
        })
        .pipe(Effect.mapError(toFailure));
    }),
  ),
});
