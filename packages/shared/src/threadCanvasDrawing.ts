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
const drawingElementId = (drawingId: string, shapeId: string) => `${drawingId}/${shapeId}`;
const labelId = (elementId: string) => `${elementId}/label`;

const hasLines = (shape: ThreadCanvasShape) => shape.type === "arrow" || shape.type === "line";
/** A T3 reading block on the canvas, rendered by the client rather than drawn by Excalidraw. */
export const isCardShape = (shape: ThreadCanvasShape) =>
  shape.type === "markdown" || shape.type === "html";

function estimateTextSize(text: string, fontSize: number) {
  const lines = text.split("\n");
  return {
    width: Math.ceil(Math.max(...lines.map((line) => line.length)) * fontSize * CHARACTER_WIDTH_EM),
    height: Math.ceil(lines.length * fontSize * LINE_HEIGHT),
  };
}

/** Breaks text to fit a width by words, which is what Excalidraw does to a bound label. */
function wrapText(text: string, fontSize: number, width: number) {
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
 * A piece placed against a turn: it sits `dy` from that turn's top edge (beside the turn) or its
 * bottom edge (below it), however the turns above grow or shrink. `at` is that edge's y and `x`
 * the piece's x when it was put there, so one the user dragged away no longer matches its anchor
 * and stays where they left it.
 */
export interface TurnAnchor {
  readonly turn: string;
  readonly edge: "top" | "bottom";
  readonly at: number;
  readonly dy: number;
  readonly x: number;
}

export const TURN_ANCHOR_KEY = "t3Below";

export function turnAnchorOf(element: { readonly customData?: unknown }): TurnAnchor | null {
  const data = element.customData;
  const anchor =
    typeof data === "object" && data !== null ? Reflect.get(data, TURN_ANCHOR_KEY) : null;
  if (typeof anchor !== "object" || anchor === null) return null;
  const { turn, edge, at, bottom, dy, x } = anchor as Record<string, unknown>;
  // Anchors written before beside-placement name only the bottom edge, as `bottom`.
  const edgeY = typeof at === "number" ? at : bottom;
  return typeof turn === "string" &&
    typeof edgeY === "number" &&
    typeof dy === "number" &&
    typeof x === "number"
    ? { turn, edge: edge === "top" ? "top" : "bottom", at: edgeY, dy, x }
    : null;
}

/** Whether an element still sits where its anchor put it, rather than where the user dragged it. */
export function holdsTurnAnchor(
  element: { readonly x: number; readonly y: number },
  anchor: TurnAnchor,
) {
  return Math.abs(element.x - anchor.x) < 1 && Math.abs(element.y - (anchor.at + anchor.dy)) < 1;
}

/** The anchor that keeps an element where it is now against a turn edge that lies at `at`. */
export function anchorTo(
  element: { readonly x: number; readonly y: number },
  turn: string,
  edge: TurnAnchor["edge"],
  at: number,
): TurnAnchor {
  return { turn, edge, at, dy: element.y - at, x: element.x };
}

/** A turn's edge that an anchor follows. */
export function turnEdgeY(
  turn: { readonly y: number; readonly height: number },
  edge: TurnAnchor["edge"],
) {
  return edge === "top" ? turn.y : turn.y + turn.height;
}

/**
 * The lane a thread's turns stack in, and the corridor below its latest turn where its next turns
 * will land. Drawings keep out of the corridor so the turns read as one unbroken spine. A canvas
 * has one spine per conversation on it; today that is the thread's own.
 */
export interface TurnSpine {
  readonly left: number;
  readonly right: number;
  readonly latestTurn: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** The column every new turn lands in, centred on x = 0, at its default width. */
const SPINE_COLUMN_WIDTH_PX = 860;

export function turnSpineOf(
  turns: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }>,
): TurnSpine | null {
  const latestTurn = [...turns].sort((left, right) => left.y - right.y).at(-1);
  if (latestTurn === undefined) return null;
  return {
    left: Math.min(latestTurn.x, -SPINE_COLUMN_WIDTH_PX / 2),
    right: Math.max(latestTurn.x + latestTurn.width, SPINE_COLUMN_WIDTH_PX / 2),
    latestTurn,
  };
}

interface CanvasBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const BESIDE_GAP_PX = 32;
// How far the corridor below the latest turn reaches: past anything a canvas holds.
const CORRIDOR_DEPTH_PX = 1_000_000;

export function boxesOverlap(left: CanvasBox, right: CanvasBox) {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

/** Where the next turns land, below the latest turn. Only what is asked to go below it may sit there. */
export function turnCorridorOf(spine: TurnSpine | null): ReadonlyArray<CanvasBox> {
  return spine === null
    ? []
    : [
        {
          x: spine.left,
          y: spine.latestTurn.y + spine.latestTurn.height,
          width: spine.right - spine.left,
          height: CORRIDOR_DEPTH_PX,
        },
      ];
}

/** Slides a box down past whatever it would cover. */
export function slideDown<Spot extends CanvasBox>(obstacles: ReadonlyArray<CanvasBox>, spot: Spot) {
  let { y } = spot;
  for (;;) {
    const blocker = obstacles.find((box) => boxesOverlap({ ...spot, y }, box));
    if (blocker === undefined) return { ...spot, y };
    y = blocker.y + blocker.height + BESIDE_GAP_PX;
  }
}

/** Slides a box sideways, away from the spine, past whatever it would cover. */
export function slideOut<Spot extends CanvasBox>(
  obstacles: ReadonlyArray<CanvasBox>,
  spot: Spot,
  direction: 1 | -1,
) {
  let { x } = spot;
  for (;;) {
    const blocker = obstacles.find((box) => boxesOverlap({ ...spot, x }, box));
    if (blocker === undefined) return { ...spot, x };
    x =
      direction === 1
        ? blocker.x + blocker.width + BESIDE_GAP_PX
        : blocker.x - spot.width - BESIDE_GAP_PX;
  }
}

/**
 * A spot level with the latest turn, to the right or left of the spine, whichever lies nearer
 * once it slides clear of what is already there. Without turns, it goes where a first turn would.
 * Agents' besideLatestTurn drawings and cards the user places from the panel both land here.
 */
export function besideSpine(
  obstacles: ReadonlyArray<CanvasBox>,
  spine: TurnSpine | null,
  size: { readonly width: number; readonly height: number },
) {
  if (spine === null) return slideDown(obstacles, { ...size, x: -size.width / 2, y: 0 });
  const y = spine.latestTurn.y;
  const right = slideOut(obstacles, { ...size, x: spine.right + BESIDE_GAP_PX, y }, 1);
  const left = slideOut(obstacles, { ...size, x: spine.left - BESIDE_GAP_PX - size.width, y }, -1);
  return right.x - spine.right <= spine.left - (left.x + left.width) ? right : left;
}

/**
 * When the server last wrote an element: an agent's drawing (`t3Drawing`), a user's mark it
 * carried along with the card under it (`t3Follow`), or a user's box it grew to hold a drawing
 * (`t3Holds`). Null for anything it never wrote.
 */
function drawingWrittenAt(element: { readonly customData?: unknown }) {
  const data = element.customData;
  const stamps = ["t3Drawing", "t3Follow", "t3Holds"].map((key) => {
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

const sameSize = (
  left: { readonly width: number; readonly height: number },
  right: { readonly width: number; readonly height: number },
) => Math.abs(left.width - right.width) < 1 && Math.abs(left.height - right.height) < 1;

/**
 * The shapes a drawing's elements were built from, in scene order, as the agent would send them
 * again: positions within the drawing, sizes only where they differ from the size T3 would give,
 * colors only where they differ from the default. Patching a drawing starts from these.
 */
export function drawingShapesOf(
  elements: ReadonlyArray<ThreadCanvasElement>,
  drawingId: string,
): ReadonlyArray<ThreadCanvasShape> {
  const prefix = `${drawingId}/`;
  const live = elements.filter((element) => element.isDeleted !== true);
  const labels = new Map<string, ThreadCanvasElement>();
  for (const element of live) {
    if (typeof element.containerId === "string") labels.set(element.containerId, element);
  }
  const record = (value: unknown) =>
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const shapeIdOf = (id: unknown) =>
    typeof id === "string" && id.startsWith(prefix) ? id.slice(prefix.length) : undefined;
  const numberOf = (value: unknown) => (typeof value === "number" ? value : 0);
  return live.flatMap((element) => {
    const data = record(record(element.customData).t3Drawing);
    const id = shapeIdOf(element.id);
    if (data.id !== drawingId || id === undefined || typeof element.containerId === "string") {
      return [];
    }
    const card = record(record(element.customData).t3Card);
    const label = labels.get(String(element.id));
    const labelText =
      typeof label?.originalText === "string"
        ? label.originalText
        : typeof label?.text === "string"
          ? label.text
          : undefined;
    const type: ThreadCanvasShape["type"] =
      card.kind === "markdown"
        ? "markdown"
        : card.kind === "html"
          ? "html"
          : (String(element.type) as ThreadCanvasShape["type"]);
    const size = { width: numberOf(element.width), height: numberOf(element.height) };
    const position = { x: numberOf(data.localX), y: numberOf(data.localY) };
    const strokeDefault = card.kind === undefined ? STROKE : CARD_STROKE;
    const colors = {
      ...(typeof element.strokeColor === "string" && element.strokeColor !== strokeDefault
        ? { strokeColor: element.strokeColor }
        : {}),
      ...(type !== "text" &&
      typeof element.backgroundColor === "string" &&
      element.backgroundColor !== "transparent"
        ? { backgroundColor: element.backgroundColor }
        : {}),
    };
    if (type === "markdown" || type === "html") {
      return [
        {
          id,
          type,
          ...position,
          ...size,
          ...(type === "markdown"
            ? { text: typeof card.text === "string" ? card.text : "" }
            : {
                ...(typeof card.attachmentId === "string" && card.attachmentId !== ""
                  ? { attachmentId: card.attachmentId }
                  : {}),
                ...(typeof card.title === "string" ? { title: card.title } : {}),
              }),
          ...colors,
        },
      ];
    }
    if (type === "arrow" || type === "line") {
      const start = shapeIdOf(record(element.startBinding).elementId);
      const end = shapeIdOf(record(element.endBinding).elementId);
      const tip = Array.isArray(element.points) ? element.points.at(-1) : undefined;
      const fontSize = numberOf(label?.fontSize);
      return [
        {
          id,
          type,
          ...position,
          ...(start === undefined && end === undefined && Array.isArray(tip)
            ? { width: numberOf(tip[0]), height: numberOf(tip[1]) }
            : {}),
          ...(labelText === undefined ? {} : { text: labelText }),
          ...(fontSize !== 0 && fontSize !== LABEL_FONT_SIZE_PX ? { fontSize } : {}),
          ...(start === undefined ? {} : { start }),
          ...(end === undefined ? {} : { end }),
          ...colors,
        },
      ];
    }
    const text = type === "text" ? (element.originalText ?? element.text) : labelText;
    const fontSize = numberOf(type === "text" ? element.fontSize : label?.fontSize);
    const shape: ThreadCanvasShape = {
      id,
      type,
      ...position,
      ...(typeof text === "string" ? { text } : {}),
      ...(fontSize !== 0 && fontSize !== DEFAULT_FONT_SIZE_PX ? { fontSize } : {}),
      ...colors,
    };
    return [sameSize(shapeSize(shape), size) ? shape : { ...shape, ...size }];
  });
}
