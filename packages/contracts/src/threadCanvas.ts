import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";

const THREAD_CANVAS_MAX_ELEMENTS = 5_000;
export const THREAD_CANVAS_MAX_DRAWING_ELEMENTS = 500;
const THREAD_CANVAS_MAX_SKETCH_BASE64_CHARS = 8_000_000;

/** An Excalidraw element as the client stores it. The server only reads its id and version. */
export const ThreadCanvasElement = Schema.Record(Schema.String, Schema.Unknown);
export type ThreadCanvasElement = typeof ThreadCanvasElement.Type;

/** The live panel a card shape places, and the resource it shows. */
export const ThreadCanvasCardSpec = Schema.Struct({
  kind: Schema.Literals([
    "file",
    "files",
    "browser",
    "terminal",
    "diff",
    "pull-request",
    "pull-requests",
    "chat",
    "device",
  ]).annotate({
    description:
      "file: one file. files: the Files tree. browser: a browser tab. terminal: a terminal. diff: the thread's diff. pull-request: one pull request. pull-requests: the thread's linked pull requests. chat: another thread's conversation. device: a simulator or phone.",
  }),
  path: Schema.optional(
    Schema.String.annotate({
      description:
        "file: the file, relative to the project root or absolute for one outside it. files: the folder to open.",
    }),
  ),
  line: Schema.optional(Schema.Int.annotate({ description: "file only: a line to scroll to." })),
  tabId: Schema.optional(
    Schema.String.annotate({ description: "browser only: the tabId preview_open returned." }),
  ),
  terminalId: Schema.optional(
    Schema.String.annotate({ description: "terminal only: an open terminal's id." }),
  ),
  repository: Schema.optional(
    Schema.String.annotate({ description: "pull-request only: owner/name." }),
  ),
  number: Schema.optional(Schema.Int.annotate({ description: "pull-request only." })),
  host: Schema.optional(
    Schema.String.annotate({ description: "pull-request only: the forge host, if not GitHub." }),
  ),
  projectId: Schema.optional(
    Schema.String.annotate({
      description: "pull-request only: set from this thread's project; leave it out.",
    }),
  ),
  threadId: Schema.optional(
    Schema.String.annotate({ description: "chat only: the thread to show." }),
  ),
  device: Schema.optional(
    Schema.Struct({
      hostId: Schema.String,
      deviceId: Schema.String,
      platform: Schema.Literals(["ios", "android"]),
      name: Schema.optional(Schema.String),
    }).annotate({
      description: "device only: the device to show; leave it out to show the device picker.",
    }),
  ),
});
export type ThreadCanvasCardSpec = typeof ThreadCanvasCardSpec.Type;

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
    "card",
  ]).annotate({
    description:
      "markdown and html are T3's own reading blocks placed on the canvas, in the app's font. card places a live T3 panel, described in card: a file, the Files tree, a browser tab, a terminal, the diff, a pull request, the linked pull requests, a chat or a device, the same view the right panel shows. Use a card to show any of those; never copy a file's or page's contents into a markdown card. The rest are Excalidraw shapes.",
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
  card: Schema.optional(ThreadCanvasCardSpec),
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
