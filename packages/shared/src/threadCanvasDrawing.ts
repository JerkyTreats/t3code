import type { ThreadCanvasElement, ThreadCanvasShape } from "@t3tools/contracts";

const DEFAULT_BOX_WIDTH_PX = 200;
const DEFAULT_BOX_HEIGHT_PX = 80;
// A card holds a reading block, so it starts at a readable column.
const DEFAULT_CARD_WIDTH_PX = 480;
const DEFAULT_CARD_HEIGHT_PX = 320;
const DEFAULT_FONT_SIZE_PX = 20;
const LABEL_FONT_SIZE_PX = 16;
const LINE_HEIGHT = 1.25;
// The plain sans runs about this wide per character. Clients refine it when the scene loads.
const CHARACTER_WIDTH_EM = 0.6;
const LABEL_PADDING_PX = 16;
const BINDING_GAP_PX = 4;
// Excalidraw's "Normal" font: agent drawings read like the app, not like a sketch.
const NORMAL_FONT = 2;
const STROKE = "#1e1e1e";
const CARD_STROKE = "#868e96";

export const THREAD_CANVAS_SIZED_TEXT_PADDING_PX = LABEL_PADDING_PX;

/** A shape with its final place on the canvas, and its place within the agent's drawing. */
export interface PlacedShape {
  readonly shape: ThreadCanvasShape;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly localX: number;
  readonly localY: number;
}

export interface BuildDrawingInput {
  readonly drawingId: string;
  readonly turn: string | null;
  readonly placed: ReadonlyArray<PlacedShape>;
  /** The version an id last had, deleted or not, so a reused id outranks its tombstone. */
  readonly versionOf: (id: string) => number;
  readonly randomInt: () => number;
  readonly now: number;
}

/** Ids are scoped to the drawing, so two drawings can both have a box called `api`. */
export const drawingElementId = (drawingId: string, shapeId: string) => `${drawingId}/${shapeId}`;
const labelId = (elementId: string) => `${elementId}/label`;

const hasLines = (shape: ThreadCanvasShape) => shape.type === "arrow" || shape.type === "line";
/** A T3 reading block on the canvas, rendered by the client rather than drawn by Excalidraw. */
export const isCardShape = (shape: ThreadCanvasShape) =>
  shape.type === "markdown" || shape.type === "html";

export function estimateTextSize(text: string, fontSize: number) {
  const lines = text.split("\n");
  return {
    width: Math.ceil(Math.max(...lines.map((line) => line.length)) * fontSize * CHARACTER_WIDTH_EM),
    height: Math.ceil(lines.length * fontSize * LINE_HEIGHT),
  };
}

/** Breaks text to fit a width by words, which is what Excalidraw does to a bound label. */
export function wrapText(text: string, fontSize: number, width: number) {
  const perLine = Math.max(1, Math.floor(width / (fontSize * CHARACTER_WIDTH_EM)));
  return text
    .split("\n")
    .flatMap((line) => {
      const wrapped: string[] = [];
      let current = "";
      for (const word of line.split(" ")) {
        const next = current === "" ? word : `${current} ${word}`;
        if (next.length > perLine && current !== "") {
          wrapped.push(current);
          current = word;
        } else current = next;
      }
      return [...wrapped, current];
    })
    .join("\n");
}

/** The size a shape takes when the agent leaves it out: big enough for its label. */
export function shapeSize(shape: ThreadCanvasShape) {
  const fontSize = shape.fontSize ?? DEFAULT_FONT_SIZE_PX;
  if (isCardShape(shape)) {
    return {
      width: shape.width ?? DEFAULT_CARD_WIDTH_PX,
      height: shape.height ?? DEFAULT_CARD_HEIGHT_PX,
    };
  }
  if (shape.type === "text") return estimateTextSize(shape.text ?? "", fontSize);
  if (hasLines(shape)) return { width: shape.width ?? 0, height: shape.height ?? 0 };
  const label = shape.text === undefined ? null : estimateTextSize(shape.text, fontSize);
  return {
    width:
      shape.width ?? Math.max(DEFAULT_BOX_WIDTH_PX, (label?.width ?? 0) + 2 * LABEL_PADDING_PX),
    height:
      shape.height ?? Math.max(DEFAULT_BOX_HEIGHT_PX, (label?.height ?? 0) + 2 * LABEL_PADDING_PX),
  };
}

/** Whether a box's label cannot fit it, wrapped, at the size the agent asked for. */
export function labelOverflows(placed: PlacedShape) {
  const { shape } = placed;
  if (shape.text === undefined || shape.type === "text" || hasLines(shape) || isCardShape(shape)) {
    return false;
  }
  const fontSize = shape.fontSize ?? DEFAULT_FONT_SIZE_PX;
  const wrapped = wrapText(shape.text, fontSize, placed.width - LABEL_PADDING_PX);
  const size = estimateTextSize(wrapped, fontSize);
  return size.height > placed.height || size.width > placed.width;
}

const center = (box: PlacedShape) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Where the line from a box's center toward a point leaves the box, plus the binding gap. */
function edgePoint(box: PlacedShape, toward: { readonly x: number; readonly y: number }) {
  const from = center(box);
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  if (dx === 0 && dy === 0) return from;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : (box.width / 2 + BINDING_GAP_PX) / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : (box.height / 2 + BINDING_GAP_PX) / Math.abs(dy),
  );
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

/** An arrow's two ends on the canvas, running between the boxes it joins. */
export function arrowEnds(placed: PlacedShape, boxes: ReadonlyMap<string, PlacedShape>) {
  const start = placed.shape.start === undefined ? undefined : boxes.get(placed.shape.start);
  const end = placed.shape.end === undefined ? undefined : boxes.get(placed.shape.end);
  const from = { x: placed.x, y: placed.y };
  const to = { x: placed.x + placed.width, y: placed.y + placed.height };
  const startTarget = end === undefined ? to : center(end);
  const endTarget = start === undefined ? from : center(start);
  return {
    from: start === undefined ? from : edgePoint(start, startTarget),
    to: end === undefined ? to : edgePoint(end, endTarget),
    start,
    end,
  };
}

/**
 * A piece placed below a turn: it sits `dy` under that turn's bottom edge, however the turn grows
 * or shrinks. `bottom` and `x` record where the piece was put, so one the user dragged away no
 * longer matches its anchor and stays where they left it.
 */
export interface TurnAnchor {
  readonly turn: string;
  readonly bottom: number;
  readonly dy: number;
  readonly x: number;
}

export const TURN_ANCHOR_KEY = "t3Below";

export function turnAnchorOf(element: { readonly customData?: unknown }): TurnAnchor | null {
  const data = element.customData;
  const anchor =
    typeof data === "object" && data !== null ? Reflect.get(data, TURN_ANCHOR_KEY) : null;
  if (typeof anchor !== "object" || anchor === null) return null;
  const { turn, bottom, dy, x } = anchor as Record<string, unknown>;
  return typeof turn === "string" &&
    typeof bottom === "number" &&
    typeof dy === "number" &&
    typeof x === "number"
    ? { turn, bottom, dy, x }
    : null;
}

/** Whether an element still sits where its anchor put it, rather than where the user dragged it. */
export function holdsTurnAnchor(
  element: { readonly x: number; readonly y: number },
  anchor: TurnAnchor,
) {
  return (
    Math.abs(element.x - anchor.x) < 1 && Math.abs(element.y - (anchor.bottom + anchor.dy)) < 1
  );
}

/** The anchor that puts an element where it is now, under a turn whose bottom edge is `bottom`. */
export function anchorBelow(
  element: { readonly x: number; readonly y: number },
  turn: string,
  bottom: number,
): TurnAnchor {
  return { turn, bottom, dy: element.y - bottom, x: element.x };
}

/**
 * When the server last wrote an element: an agent's drawing (`t3Drawing`), or a user's mark it
 * carried along with the card under it (`t3Follow`). Null for anything it never wrote.
 */
export function drawingWrittenAt(element: { readonly customData?: unknown }) {
  const data = element.customData;
  const stamps = ["t3Drawing", "t3Follow"].map((key) => {
    const record = typeof data === "object" && data !== null ? Reflect.get(data, key) : undefined;
    const written =
      typeof record === "object" && record !== null ? Reflect.get(record, "written") : undefined;
    return typeof written === "number" ? written : null;
  });
  const known = stamps.filter((stamp) => stamp !== null);
  return known.length === 0 ? null : Math.max(...known);
}

/**
 * Whether `incoming` is a copy of the agent's element from before its latest write. A client
 * moves agent drawings with the turns around them, and each move counts up the element's
 * version, so a copy shifted often enough would otherwise outrank what the agent wrote since.
 */
export function isStaleDrawingCopy(
  incoming: { readonly customData?: unknown },
  current: { readonly customData?: unknown },
) {
  const before = drawingWrittenAt(incoming);
  const after = drawingWrittenAt(current);
  return after !== null && (before === null || before < after);
}

/** Excalidraw elements for a whole drawing: plain data, so a server can make them. */
export function buildDrawingElements(input: BuildDrawingInput): ReadonlyArray<ThreadCanvasElement> {
  const { drawingId, turn, placed, versionOf, randomInt, now } = input;
  const boxes = new Map(
    placed.filter(({ shape }) => !hasLines(shape)).map((piece) => [piece.shape.id, piece]),
  );
  const common = (
    id: string,
    box: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    },
    local: { readonly x: number; readonly y: number },
    shape: ThreadCanvasShape,
  ) => ({
    id,
    ...box,
    angle: 0,
    strokeColor: shape.strokeColor ?? STROKE,
    backgroundColor: shape.backgroundColor ?? "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    seed: randomInt(),
    version: versionOf(id) + 1,
    versionNonce: randomInt(),
    isDeleted: false,
    updated: now,
    link: null,
    locked: false,
    // `written` dates the agent's write, so a copy a client shifted since then cannot outrank it.
    customData: {
      t3Drawing: { id: drawingId, turn, localX: local.x, localY: local.y, written: now },
    },
  });
  const text = (
    id: string,
    shape: ThreadCanvasShape,
    box: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    },
    local: { readonly x: number; readonly y: number },
    words: string,
    fontSize: number,
    containerId: string | null,
  ) => ({
    ...common(id, box, local, { ...shape, backgroundColor: "transparent" }),
    type: "text",
    roundness: null,
    boundElements: [],
    text: words,
    originalText: shape.text ?? "",
    fontSize,
    fontFamily: NORMAL_FONT,
    textAlign: containerId === null ? "left" : "center",
    verticalAlign: containerId === null ? "top" : "middle",
    containerId,
    autoResize: true,
    lineHeight: LINE_HEIGHT,
  });
  const label = (
    id: string,
    piece: PlacedShape,
    middle: { readonly x: number; readonly y: number },
    fontSize: number,
    wrapWidth: number,
  ) => {
    const words = wrapText(piece.shape.text ?? "", fontSize, wrapWidth);
    const size = estimateTextSize(words, fontSize);
    const offset = { x: middle.x - size.width / 2, y: middle.y - size.height / 2 };
    return text(
      labelId(id),
      piece.shape,
      { ...offset, ...size },
      { x: offset.x - piece.x + piece.localX, y: offset.y - piece.y + piece.localY },
      words,
      fontSize,
      id,
    );
  };
  const attached = (shape: ThreadCanvasShape, id: string) =>
    placed
      .filter(
        ({ shape: other }) =>
          hasLines(other) && (other.start === shape.id || other.end === shape.id),
      )
      .map(({ shape: other }) => ({ id: drawingElementId(drawingId, other.id), type: "arrow" }))
      .concat(
        shape.text === undefined || isCardShape(shape) ? [] : [{ id: labelId(id), type: "text" }],
      );
  return placed.flatMap<ThreadCanvasElement>((piece) => {
    const { shape } = piece;
    const id = drawingElementId(drawingId, shape.id);
    const local = { x: piece.localX, y: piece.localY };
    if (shape.type === "text") {
      const fontSize = shape.fontSize ?? DEFAULT_FONT_SIZE_PX;
      return [text(id, shape, piece, local, shape.text ?? "", fontSize, null)];
    }
    if (shape.type === "arrow" || shape.type === "line") {
      const { from, to, start, end } = arrowEnds(piece, boxes);
      const binding = (target: PlacedShape | undefined) =>
        target === undefined
          ? null
          : {
              elementId: drawingElementId(drawingId, target.shape.id),
              focus: 0,
              gap: BINDING_GAP_PX,
            };
      const box = {
        x: from.x,
        y: from.y,
        width: Math.abs(to.x - from.x),
        height: Math.abs(to.y - from.y),
      };
      const line = {
        ...common(id, box, local, shape),
        type: shape.type,
        roundness: null,
        boundElements: shape.text === undefined ? null : [{ id: labelId(id), type: "text" }],
        points: [
          [0, 0],
          [to.x - from.x, to.y - from.y],
        ],
        lastCommittedPoint: null,
        startBinding: binding(start),
        endBinding: binding(end),
        startArrowhead: null,
        endArrowhead: shape.type === "arrow" ? "arrow" : null,
        ...(shape.type === "arrow" ? { elbowed: false } : {}),
      };
      if (shape.text === undefined) return [line];
      const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      return [line, label(id, piece, middle, LABEL_FONT_SIZE_PX, Number.MAX_SAFE_INTEGER)];
    }
    if (isCardShape(shape)) {
      const base = common(id, piece, local, {
        ...shape,
        strokeColor: shape.strokeColor ?? CARD_STROKE,
        backgroundColor: shape.backgroundColor ?? "transparent",
      });
      return [
        {
          ...base,
          type: "rectangle",
          roundness: { type: 3 },
          boundElements: attached(shape, id),
          customData: {
            ...base.customData,
            t3Card:
              shape.type === "markdown"
                ? { kind: "markdown", text: shape.text ?? "" }
                : {
                    kind: "html",
                    attachmentId: shape.attachmentId ?? "",
                    title: shape.title ?? "HTML",
                  },
          },
        },
      ];
    }
    const outline = {
      ...common(id, piece, local, shape),
      type: shape.type,
      roundness: null,
      boundElements: attached(shape, id),
    };
    if (shape.text === undefined) return [outline];
    return [
      outline,
      label(
        id,
        piece,
        center(piece),
        shape.fontSize ?? DEFAULT_FONT_SIZE_PX,
        piece.width - LABEL_PADDING_PX,
      ),
    ];
  });
}
