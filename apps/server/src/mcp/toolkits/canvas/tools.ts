import {
  OrchestratorMcpFailure,
  THREAD_CANVAS_MAX_DRAWING_ELEMENTS,
  ThreadCanvasShape,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadCanvasStore from "../../../canvas/ThreadCanvasStore.ts";
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
  ],
})
  .annotate(Tool.Title, "Draw on canvas")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

export const CanvasToolkit = Toolkit.make(CanvasReadTool, CanvasUpdateTool);
