import {
  OrchestratorMcpFailure,
  THREAD_CANVAS_MAX_DRAWING_ELEMENTS,
  ThreadCanvasShape,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadCanvasStore from "../../../canvas/ThreadCanvasStore.ts";
import * as HtmlRender from "../../../htmlRender/HtmlRender.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const CanvasBox = {
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
};

export const CanvasReadTool = Tool.make("canvas_read", {
  description:
    "Read this thread's Excalidraw canvas, the whiteboard behind its turns: where each turn sits, plus what the user drew or wrote and what you drew. Each element names its nearest turn, and covers quotes the turn text a mark sits on. Freehand strokes give a position, not a shape. Call it before answering about the canvas or the user's marks.",
  success: Schema.Struct({
    turns: Schema.Array(Schema.Struct({ ...CanvasBox, title: Schema.String })),
    elements: Schema.Array(
      Schema.Struct({
        ...CanvasBox,
        id: Schema.String,
        type: Schema.String,
        drawnBy: Schema.Literals(["user", "agent"]),
        drawingId: Schema.optional(Schema.String),
        card: Schema.optional(Schema.Literals(["markdown", "html"])),
        text: Schema.optional(Schema.String),
        covers: Schema.optional(Schema.String),
        start: Schema.optional(Schema.String),
        end: Schema.optional(Schema.String),
        nearestTurn: Schema.optional(Schema.String),
      }),
    ),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ThreadCanvasStore.ThreadCanvasStore,
  ],
})
  .annotate(Tool.Title, "Read canvas")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

// This affects only the caller's thread, not its workspace, so read-only sandboxes and plan mode may use it.
export const CanvasUpdateTool = Tool.make("canvas_update", {
  description:
    "Draw on this thread's Excalidraw canvas, the whiteboard behind its turns. Use it for diagrams, system designs, flows, and whiteboard notes the user may move, edit, or mark up. Shapes are live: the user can drag and change them. For a graph, set layout and leave out x, y and sizes: T3 places the boxes and sizes them to their labels. Use x and y only for freeform work. A drawingId names one drawing; each call sends the whole drawing, so call again with the same drawingId to change it, and leave a shape out to remove it. An empty shapes list removes the drawing. Boxes the user dragged stay where they put them unless resetMoves is true, which is for when they ask you to re-lay it out. T3 places a new drawing beside the current turn. Label a box or arrow with text; connect shapes with arrow start and end. Omit colors unless they carry meaning. The result reports where it landed, crossings, arrows through boxes, clipped labels, and overlaps: fix what it reports rather than guessing.",
  parameters: Schema.Struct({
    drawingId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)).annotate({
      description: "A short stable name, such as system-design.",
    }),
    shapes: Schema.Array(ThreadCanvasShape).check(
      Schema.isMaxLength(THREAD_CANVAS_MAX_DRAWING_ELEMENTS),
    ),
    layout: Schema.optional(
      Schema.Literals(["right", "down"]).annotate({
        description: "Lay the shapes out as a graph flowing this way.",
      }),
    ),
    near: Schema.optional(Schema.String).annotate({
      description:
        "Id of a canvas element to land a new drawing beside, such as the note that asked for it.",
    }),
    resetMoves: Schema.optional(Schema.Boolean).annotate({
      description: "Replace the positions of boxes the user dragged.",
    }),
    place: Schema.optional(Schema.Literal("belowLatestTurn")).annotate({
      description:
        "Put the drawing below the latest turn and keep it there as the turn grows. A drawing of only cards fills rows left to right in the order listed, so leave out their x and y. Otherwise coordinates stay relative to the drawing.",
    }),
    moveBelowLatestTurn: Schema.optional(Schema.Array(Schema.String)).annotate({
      description:
        "Shape ids to bring below the latest turn, in rows in this order, leaving the rest of the drawing where it is. Use it to show the user what changed; those shapes then stay below that turn.",
    }),
  }),
  success: Schema.Struct({
    drawingId: Schema.String,
    placed: Schema.NullOr(Schema.Struct(CanvasBox)),
    crossings: Schema.Int,
    arrowsThroughBoxes: Schema.Array(Schema.String),
    clippedLabels: Schema.Array(Schema.String),
    overlaps: Schema.Array(Schema.String),
    keptUserMoves: Schema.Array(Schema.String),
    elementIds: Schema.Array(Schema.String),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ThreadCanvasStore.ThreadCanvasStore,
    HtmlRender.HtmlRender,
  ],
})
  .annotate(Tool.Title, "Draw on canvas")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

export const CanvasPreviewTool = Tool.make("canvas_preview", {
  description:
    "See this thread's canvas as a picture, as the user sees it: turns as titled boxes, your shapes, cards rendered, and the user's marks in yellow. By default it shows the latest turn and what lies just above and well below it; pass drawingId for one drawing, or region for a box in canvas coordinates. Call it after canvas_update when layout matters, and fix what it shows. clippedCards lists markdown cards whose text does not fit, with the height that would fit it. If it says the browser is still installing, call again in a minute.",
  parameters: Schema.Struct({
    drawingId: Schema.optional(Schema.String).annotate({
      description: "Show just this drawing and a margin around it.",
    }),
    region: Schema.optional(Schema.Struct(CanvasBox)).annotate({
      description:
        "Show this box of the canvas, in canvas coordinates as canvas_read reports them.",
    }),
  }),
  success: Schema.Struct({
    region: Schema.Struct(CanvasBox),
    scale: Schema.Number,
    clippedCards: Schema.Array(
      Schema.Struct({ id: Schema.String, height: Schema.Number, neededHeight: Schema.Number }),
    ),
    screenshot: Schema.Struct({
      mimeType: Schema.Literal("image/png"),
      data: Schema.String,
      width: Schema.Int,
      height: Schema.Int,
    }),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ThreadCanvasStore.ThreadCanvasStore,
    HtmlRender.HtmlRender,
  ],
})
  .annotate(Tool.Title, "Preview canvas")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const CanvasToolkit = Toolkit.make(CanvasReadTool, CanvasUpdateTool, CanvasPreviewTool);

export const CanvasEditToolkit = Toolkit.make(CanvasReadTool, CanvasUpdateTool);

/** Registered apart from the others: its screenshot goes out as image content. */
export const CanvasPreviewToolkit = Toolkit.make(CanvasPreviewTool);
