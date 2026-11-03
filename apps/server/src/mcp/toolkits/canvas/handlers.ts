import { OrchestratorMcpFailure, type ThreadCanvasError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  CANVAS_PREVIEW_MEASURE_PREFIX,
  canvasPreviewPage,
  previewRegion,
} from "../../../canvas/canvasPreviewPage.ts";
import { describeCanvas } from "../../../canvas/threadCanvasScene.ts";
import { canvasThreadOf, sharedDrawingId } from "../../../canvas/sharedCanvas.ts";
import * as ThreadCanvasStore from "../../../canvas/ThreadCanvasStore.ts";
import * as HtmlRender from "../../../htmlRender/HtmlRender.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { CanvasEditToolkit, CanvasPreviewToolkit, type CanvasToolkit } from "./tools.ts";

const toFailure = (error: ThreadCanvasError) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message });

const decodeClippedCards = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({ id: Schema.String, height: Schema.Number, neededHeight: Schema.Number }),
    ),
  ),
);

const previewFailure = (error: { readonly _tag: string; readonly message: string }) =>
  new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message });

const handlers = {
  canvas_preview: McpToolAccess.readsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "canvas_preview");
      const canvas = yield* ThreadCanvasStore.ThreadCanvasStore;
      const htmlRender = yield* HtmlRender.HtmlRender;
      const canvasThreadId = yield* canvasThreadOf(thread.threadId);
      const scene = yield* canvas.read(canvasThreadId).pipe(Effect.mapError(toFailure));
      const region = previewRegion(scene, {
        drawingId:
          input.drawingId === undefined
            ? undefined
            : sharedDrawingId(input.drawingId, thread.threadId, canvasThreadId),
        region: input.region,
      });
      if (region === null || region.width <= 0 || region.height <= 0) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "Nothing on the canvas matches that drawingId or region.",
        });
      }
      const pages = new Map<string, string | null>();
      for (const element of scene.elements) {
        const card = (element.customData as { t3Card?: { attachmentId?: unknown } } | undefined)
          ?.t3Card;
        if (element.isDeleted === true || typeof card?.attachmentId !== "string") continue;
        pages.set(card.attachmentId, yield* htmlRender.readStored(card.attachmentId));
      }
      const page = canvasPreviewPage({
        scene,
        region,
        appStylesheet: yield* htmlRender.appStylesheet,
        htmlOf: (attachmentId) => pages.get(attachmentId) ?? null,
      });
      const shot = yield* htmlRender
        .preview({ html: page.html, width: page.width, ownPage: true })
        .pipe(Effect.mapError(previewFailure));
      const report = shot.consoleMessages.find((message) =>
        message.text.startsWith(CANVAS_PREVIEW_MEASURE_PREFIX),
      );
      const clippedCards =
        report === undefined
          ? []
          : Option.getOrElse(
              decodeClippedCards(report.text.slice(CANVAS_PREVIEW_MEASURE_PREFIX.length)),
              () => [],
            );
      return {
        region,
        scale: page.scale,
        clippedCards,
        screenshot: {
          mimeType: "image/png" as const,
          data: shot.png,
          width: shot.width,
          height: shot.capturedHeight,
        },
      };
    }),
  ),
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
} satisfies McpToolAccess.Handlers<typeof CanvasToolkit.tools>;

export const layerEdit = McpToolAccess.toLayer(CanvasEditToolkit, {
  canvas_read: handlers.canvas_read,
  canvas_update: handlers.canvas_update,
});

export const layerPreview = McpToolAccess.toLayer(CanvasPreviewToolkit, {
  canvas_preview: handlers.canvas_preview,
});
