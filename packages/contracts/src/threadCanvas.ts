import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";

const THREAD_CANVAS_MAX_ELEMENTS = 5_000;
export const THREAD_CANVAS_MAX_DRAWING_ELEMENTS = 500;
const THREAD_CANVAS_MAX_SKETCH_BASE64_CHARS = 8_000_000;

/** An Excalidraw element as the client stores it. The server only reads its id and version. */
export const ThreadCanvasElement = Schema.Record(Schema.String, Schema.Unknown);
export type ThreadCanvasElement = typeof ThreadCanvasElement.Type;

export const ThreadCanvasShape = Schema.Struct({
  id: Schema.String.annotate({
    description: "Stable id within this drawing. Arrows name it in start and end.",
  }),
  type: Schema.Literals([
    "rectangle",
    "ellipse",
    "diamond",
    "arrow",
    "line",
    "text",
    "markdown",
    "html",
  ]).annotate({
    description:
      "markdown and html are T3's own reading blocks placed on the canvas, in the app's font; the rest are Excalidraw shapes.",
  }),
  x: Schema.optional(
    Schema.Finite.annotate({
      description: "Left edge, relative to the drawing's own origin. Leave out when using layout.",
    }),
  ),
  y: Schema.optional(
    Schema.Finite.annotate({
      description: "Top edge, relative to the drawing's own origin. Leave out when using layout.",
    }),
  ),
  width: Schema.optional(Schema.Finite),
  height: Schema.optional(Schema.Finite),
  text: Schema.optional(
    Schema.String.annotate({
      description:
        "The words of a text shape, a box or arrow label, or the Markdown of a markdown shape.",
    }),
  ),
  html: Schema.optional(
    Schema.String.check(Schema.isMaxLength(512_000)).annotate({
      description:
        "html only: a complete, self-contained HTML document, as html_render takes. Stored as an attachment on the canvas thread.",
    }),
  ),
  attachmentId: Schema.optional(
    Schema.String.annotate({
      description:
        "html only: the attachmentId of a page html_render already published, instead of html.",
    }),
  ),
  title: Schema.optional(Schema.String.annotate({ description: "html only: the page's title." })),
  fontSize: Schema.optional(Schema.Finite),
  strokeColor: Schema.optional(Schema.String),
  backgroundColor: Schema.optional(Schema.String),
  start: Schema.optional(
    Schema.String.annotate({ description: "Arrow only: id of the shape it starts from." }),
  ),
  end: Schema.optional(
    Schema.String.annotate({ description: "Arrow only: id of the shape it points to." }),
  ),
});
export type ThreadCanvasShape = typeof ThreadCanvasShape.Type;

export const ThreadCanvasScene = Schema.Struct({
  revision: Schema.Int,
  elements: Schema.Array(ThreadCanvasElement),
  /** The version of each user mark the agent already knows about. */
  seen: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
});
export type ThreadCanvasScene = typeof ThreadCanvasScene.Type;

export const ThreadCanvasSubscribeInput = Schema.Struct({ threadId: ThreadId });

export const ThreadCanvasSaveInput = Schema.Struct({
  threadId: ThreadId,
  elements: Schema.Array(ThreadCanvasElement).check(Schema.isMaxLength(THREAD_CANVAS_MAX_ELEMENTS)),
  /** A base64 PNG of the marks the agent has not seen, which only a client can render. */
  sketch: Schema.optional(
    Schema.String.check(Schema.isMaxLength(THREAD_CANVAS_MAX_SKETCH_BASE64_CHARS)),
  ),
});

export const ThreadCanvasBrowserTrailInput = Schema.Struct({
  threadId: ThreadId,
  tabId: Schema.String,
});

/** One saved screenshot of a browser card's tab, with the page it showed. */
export const ThreadCanvasBrowserTrailFrame = Schema.Struct({
  attachmentId: Schema.String,
  url: Schema.String,
  title: Schema.String,
  at: Schema.String,
});
export type ThreadCanvasBrowserTrailFrame = typeof ThreadCanvasBrowserTrailFrame.Type;

export const ThreadCanvasBrowserTrail = Schema.Struct({
  frames: Schema.Array(ThreadCanvasBrowserTrailFrame),
});
export type ThreadCanvasBrowserTrail = typeof ThreadCanvasBrowserTrail.Type;

export class ThreadCanvasError extends Schema.TaggedError<ThreadCanvasError>()(
  "ThreadCanvasError",
  { message: Schema.String },
) {}
