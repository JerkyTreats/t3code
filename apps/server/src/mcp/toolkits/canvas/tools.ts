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
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.Finite,
  height: Schema.Finite,
};

const CanvasReadTool = Tool.make("canvas_read", {
  description:
    "Read this thread's Excalidraw canvas, the whiteboard behind its turns. With no arguments it returns an overview: the spine (the column the turns stack in, from left to right, with nextTurnY where the next turn lands), each turn, each of your drawings as one box with its title and the turn it follows, and the user's marks, unseen then newest first within a size limit, with turn (its index in turns) and on or beside (the id of your piece under or next to it); the note says when some were left out and how to list them. Pass drawingIds, ids or region for your shapes in full, card text included. Coordinates are current only as of this call: read again after the user may have moved things. Call it before answering about the canvas or the user's marks.",
  parameters: Schema.Struct({
    drawingIds: Schema.optional(Schema.Array(Schema.String)).annotate({
      description: "List every shape of these drawings, card text in full.",
    }),
    ids: Schema.optional(Schema.Array(Schema.String)).annotate({
      description: "List these elements, card text in full.",
    }),
    region: Schema.optional(Schema.Struct(CanvasBox)).annotate({
      description: "List every element overlapping this box, in canvas coordinates.",
    }),
  }),
  success: Schema.Struct({
    spine: Schema.NullOr(
      Schema.Struct({ left: Schema.Finite, right: Schema.Finite, nextTurnY: Schema.Finite }),
    ),
    turns: Schema.Array(Schema.Struct({ ...CanvasBox, title: Schema.String })),
    drawings: Schema.Array(
      Schema.Struct({
        ...CanvasBox,
        drawingId: Schema.String,
        origin: Schema.Struct({ x: Schema.Finite, y: Schema.Finite }),
        shapes: Schema.Int,
        cards: Schema.Int,
        title: Schema.optional(Schema.String),
        followsTurn: Schema.optional(Schema.String),
      }),
    ),
    elements: Schema.Array(
      Schema.Struct({
        ...CanvasBox,
        id: Schema.String,
        type: Schema.String,
        drawnBy: Schema.Literals(["user", "agent"]),
        drawingId: Schema.optional(Schema.String),
        card: Schema.optional(Schema.Literals(["markdown", "html", "surface"])),
        attachmentId: Schema.optional(Schema.String),
        surface: Schema.optional(
          Schema.Struct({
            kind: Schema.Literals([
              "file",
              "files",
              "preview",
              "terminal",
              "diff",
              "pull-request",
              "pull-requests",
              "side-chat",
              "device",
            ]),
            title: Schema.String,
            relativePath: Schema.optional(Schema.String),
            revealLine: Schema.optional(Schema.Int),
            tabId: Schema.optional(Schema.String),
            url: Schema.optional(Schema.String),
            resourceId: Schema.optional(Schema.String),
            terminalIds: Schema.optional(Schema.Array(Schema.String)),
            threadId: Schema.optional(Schema.String),
            device: Schema.optional(Schema.String),
            platform: Schema.optional(Schema.Literals(["ios", "android"])),
            projectId: Schema.optional(Schema.String),
            repository: Schema.optional(Schema.String),
            number: Schema.optional(Schema.Int),
            host: Schema.optional(Schema.String),
          }),
        ).annotate({
          description:
            "A right panel tab the user placed on the canvas, live as in the panel: a workspace file, the files browser, a browser preview, a terminal group, the diff, a pull request, the linked pull requests, a side chat (threadId), or a device.",
        }),
        text: Schema.optional(Schema.String),
        covers: Schema.optional(Schema.String),
        start: Schema.optional(Schema.String),
        end: Schema.optional(Schema.String),
        turn: Schema.optional(Schema.Int),
        on: Schema.optional(Schema.String),
        beside: Schema.optional(Schema.String),
      }),
    ),
    note: Schema.String,
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
const CanvasUpdateTool = Tool.make("canvas_update", {
  description:
    "Draw on this thread's Excalidraw canvas, the whiteboard behind its turns. Use it for diagrams, system designs, flows, and whiteboard notes the user may move, edit, or mark up. Shapes are live: the user can drag and change them. For a graph, set layout and leave out x, y and sizes: T3 places the boxes and sizes them to their labels. Use x and y only for freeform work. A drawingId names one drawing. To change one, call again with the same drawingId and patch: true, sending only the shapes that change and only their changed fields; list ids in remove to take shapes out. Without patch, the shapes sent are the whole drawing, and an empty list removes it. Shape x and y are relative to the drawing's origin, which canvas_read lists per drawing. Boxes the user dragged stay where they put them unless resetMoves is true, which is for when they ask you to re-lay it out. T3 places a new drawing beside the current turn. Label a box or arrow with text; connect shapes with arrow start and end. Omit colors unless they carry meaning. The result reports where it landed, crossings, arrows through boxes, clipped labels, and overlaps: fix what it reports rather than guessing.",
  parameters: Schema.Struct({
    drawingId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)).annotate({
      description: "A short stable name, such as system-design.",
    }),
    shapes: Schema.optional(
      Schema.Array(ThreadCanvasShape).check(Schema.isMaxLength(THREAD_CANVAS_MAX_DRAWING_ELEMENTS)),
    ),
    diagram: Schema.optional(Schema.String.check(Schema.isMaxLength(40_000))).annotate({
      description:
        'The whole drawing as a Mermaid flowchart, instead of shapes; T3 lays it out and colours it. A subgraph is a titled band, and bands stacked down read as levels (why, how, what); direction sets each band\'s flow. Nodes joined by edges form a graph. class x lead marks the one answer (first, larger), aside marks side notes; any other class is a kind, given one colour and a legend. A "`markdown`" label makes a card; its line breaks are kept, lists and tables render, and a state in capitals that starts a line or table cell (DONE, BLOCKED, AT RISK, WAITING, NEW, CHANGED) shows as a coloured chip: green done, red blocked or failed, amber at risk, violet waiting, blue new or changed. Keep node labels to a name and one qualifier, edge labels to a few words.',
    }),
    patch: Schema.optional(Schema.Boolean).annotate({
      description:
        "Change only the shapes sent, keeping the rest. A shape's x or y sent in a patch moves it even where the user dragged it. Leaving out shapes implies a patch.",
    }),
    remove: Schema.optional(Schema.Array(Schema.String)).annotate({
      description: "In a patch, shape ids to take out, with the arrows that join them.",
    }),
    layout: Schema.optional(
      Schema.Literals(["right", "down"]).annotate({
        description: "Lay the shapes out as a graph flowing this way.",
      }),
    ),
    near: Schema.optional(Schema.String).annotate({
      description:
        "Id of a canvas element to land a new drawing beside, such as the note that asked for it.",
    }),
    inside: Schema.optional(Schema.String).annotate({
      description:
        "Id of a box the user drew for you to fill, such as one titled 'fill this out'. The drawing lands inside it under its title, cards in rows across its width, and the box grows to fit and moves with it.",
    }),
    resetMoves: Schema.optional(Schema.Boolean).annotate({
      description: "Replace the positions of boxes the user dragged.",
    }),
    place: Schema.optional(Schema.Literals(["besideLatestTurn", "belowLatestTurn"])).annotate({
      description:
        "besideLatestTurn puts the drawing level with the latest turn, left or right of the column the turns stack in, and keeps it level as turns grow. belowLatestTurn puts it in that column under the turn, so the next turns land after it; use it only when asked. A drawing of only cards fills rows left to right in the order listed, so leave out their x and y.",
    }),
    moveToLatestTurn: Schema.optional(Schema.Array(Schema.String)).annotate({
      description:
        "Shape ids to bring beside the latest turn, in rows in this order, leaving the rest of the drawing where it is. Use it to show the user what changed.",
    }),
    moveBelowLatestTurn: Schema.optional(Schema.Array(Schema.String)).annotate({
      description: "As moveToLatestTurn, but under the turn in its column. Use it only when asked.",
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
  // Image tools report failure as an error result: a returned failure has no screenshot to send.
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
