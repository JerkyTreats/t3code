import dagre from "@dagrejs/dagre";
import type { ThreadCanvasElement, ThreadCanvasScene, ThreadCanvasShape } from "@t3tools/contracts";
import {
  anchorBelow,
  arrowEnds,
  buildDrawingElements,
  drawingElementId,
  holdsTurnAnchor,
  isCardShape,
  labelOverflows,
  type PlacedShape,
  shapeSize,
  TURN_ANCHOR_KEY,
  type TurnAnchor,
  turnAnchorOf,
} from "@t3tools/shared/threadCanvasDrawing";

const GAP_PX = 32;
const NODE_GAP_PX = 60;
const RANK_GAP_PX = 110;
const TITLE_GAP_PX = 48;
// The widest drawing that still sits beside a turn on an ordinary screen.
const MAX_WIDTH_BESIDE_TURN_PX = 900;
// The widest row of cards below a turn: three wide cards side by side.
const MAX_ROW_WIDTH_PX = 3400;
// How far a drawing sits inside a box the user drew for it, from its edges and its title.
const HOLDER_PADDING_PX = 24;
const HOLDER_TYPES = new Set(["rectangle", "ellipse", "diamond", "frame"]);

export interface DrawInput {
  readonly drawingId: string;
  readonly shapes: ReadonlyArray<ThreadCanvasShape>;
  readonly near?: string | undefined;
  readonly layout?: "right" | "down" | undefined;
  readonly resetMoves?: boolean | undefined;
  /** Puts the whole drawing below the latest turn, wherever it was. Cards alone fill rows. */
  readonly place?: "belowLatestTurn" | undefined;
  /** Shape ids to bring below the latest turn, leaving the rest of the drawing where it is. */
  readonly moveBelowLatestTurn?: ReadonlyArray<string> | undefined;
  /** Id of a box the user drew to hold this drawing: it lands inside, and the box grows to fit. */
  readonly inside?: string | undefined;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Named extends Box {
  readonly id: string;
  readonly name: string;
}

const numberOf = (value: unknown) => (typeof value === "number" ? value : 0);
const recordOf = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
const boxOf = (element: ThreadCanvasElement): Box => ({
  x: numberOf(element.x),
  y: numberOf(element.y),
  width: numberOf(element.width),
  height: numberOf(element.height),
});
const drawingOf = (element: ThreadCanvasElement) => {
  const data = recordOf(recordOf(element.customData).t3Drawing);
  return typeof data.id === "string"
    ? {
        id: data.id,
        turn: typeof data.turn === "string" ? data.turn : null,
        localX: numberOf(data.localX),
        localY: numberOf(data.localY),
      }
    : null;
};
const hasLines = (shape: ThreadCanvasShape) => shape.type === "arrow" || shape.type === "line";

function overlaps(left: Box, right: Box) {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

function boundsOf(boxes: ReadonlyArray<Box>): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  return {
    x: left,
    y: top,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - left,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - top,
  };
}

/** Where a drawing sits: the offset most of its shapes share, so one dragged box cannot move it. */
function originOf(existing: ReadonlyArray<ThreadCanvasElement>) {
  const votes = new Map<string, { x: number; y: number; count: number }>();
  for (const element of existing) {
    const data = drawingOf(element);
    if (data === null || typeof element.containerId === "string") continue;
    if (element.type === "arrow" || element.type === "line") continue;
    const x = numberOf(element.x) - data.localX;
    const y = numberOf(element.y) - data.localY;
    const key = `${x}:${y}`;
    votes.set(key, { x, y, count: (votes.get(key)?.count ?? 0) + 1 });
  }
  return [...votes.values()].toSorted((left, right) => right.count - left.count)[0] ?? null;
}

/** Boxes the reader dragged away from the agent's layout. They stay there until asked to move. */
function pinsOf(
  drawingId: string,
  existing: ReadonlyArray<ThreadCanvasElement>,
  origin: { readonly x: number; readonly y: number } | null,
) {
  const pins = new Map<string, { readonly x: number; readonly y: number }>();
  if (origin === null) return pins;
  for (const element of existing) {
    const data = drawingOf(element);
    if (data === null || typeof element.containerId === "string") continue;
    if (element.type === "arrow" || element.type === "line") continue;
    const box = boxOf(element);
    if (box.x - origin.x === data.localX && box.y - origin.y === data.localY) continue;
    const prefix = `${drawingId}/`;
    const id = String(element.id);
    pins.set(id.startsWith(prefix) ? id.slice(prefix.length) : id, { x: box.x, y: box.y });
  }
  return pins;
}

/** Layered graph layout. Unconnected text, like a title, stacks above the graph. */
function layoutShapes(shapes: ReadonlyArray<ThreadCanvasShape>, direction: "right" | "down") {
  const positions = new Map<string, { readonly x: number; readonly y: number }>();
  const lines = shapes.filter(hasLines);
  const joined = new Set(lines.flatMap((line) => [line.start, line.end]));
  const isNode = (shape: ThreadCanvasShape) =>
    !hasLines(shape) && (shape.type !== "text" || joined.has(shape.id));
  const nodes = shapes.filter(isNode);
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: direction === "right" ? "LR" : "TB",
    nodesep: NODE_GAP_PX,
    ranksep: RANK_GAP_PX,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, shapeSize(node));
  const ids = new Set(nodes.map((node) => node.id));
  for (const line of lines) {
    if (line.start !== undefined && line.end !== undefined) {
      if (ids.has(line.start) && ids.has(line.end)) graph.setEdge(line.start, line.end);
    }
  }
  dagre.layout(graph);
  for (const node of nodes) {
    const placed = graph.node(node.id);
    const size = shapeSize(node);
    positions.set(node.id, { x: placed.x - size.width / 2, y: placed.y - size.height / 2 });
  }
  let top = -TITLE_GAP_PX;
  for (const shape of shapes.toReversed()) {
    if (hasLines(shape) || isNode(shape)) continue;
    positions.set(shape.id, { x: 0, y: top });
    top -= TITLE_GAP_PX;
  }
  return positions;
}

/** Slides a box down past whatever it would cover. */
function slideDown(obstacles: ReadonlyArray<Box>, spot: Box) {
  let { y } = spot;
  for (;;) {
    const blocker = obstacles.find((box) => overlaps({ ...spot, y }, box));
    if (blocker === undefined) return { ...spot, y };
    y = blocker.y + blocker.height + GAP_PX;
  }
}

/**
 * Cards in rows, left to right in the order given, each row as tall as its tallest card, so no
 * two overlap whatever sizes the agent picked.
 */
function shelve(
  pieces: ReadonlyArray<{ readonly id: string; readonly width: number; readonly height: number }>,
  maxRowWidth = MAX_ROW_WIDTH_PX,
) {
  const positions = new Map<string, { readonly x: number; readonly y: number }>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const piece of pieces) {
    if (x > 0 && x + piece.width > maxRowWidth) {
      x = 0;
      y += rowHeight + GAP_PX;
      rowHeight = 0;
    }
    positions.set(piece.id, { x, y });
    x += piece.width + GAP_PX;
    rowHeight = Math.max(rowHeight, piece.height);
  }
  return positions;
}

/** A free spot for a new drawing: beside what asked for it, or under it when too wide. */
function placeDrawing(obstacles: ReadonlyArray<Box>, anchor: Box | null, near: boolean, size: Box) {
  const free = (spot: Box) => !obstacles.some((box) => overlaps(spot, box));
  const slide = (spot: Box) => slideDown(obstacles, spot);
  if (anchor === null) return slide({ ...size, x: -size.width / 2, y: 0 });
  const right = { ...size, x: anchor.x + anchor.width + GAP_PX, y: anchor.y };
  if (near) {
    const left = { ...size, x: anchor.x - size.width - GAP_PX, y: anchor.y };
    const under = { ...size, x: anchor.x, y: anchor.y + anchor.height + GAP_PX };
    return [right, left].find(free) ?? slide(under);
  }
  return size.width <= MAX_WIDTH_BESIDE_TURN_PX
    ? slide(right)
    : slide({ ...size, x: -size.width / 2, y: anchor.y + anchor.height + GAP_PX });
}

function segmentsCross(
  a: readonly [{ x: number; y: number }, { x: number; y: number }],
  b: readonly [{ x: number; y: number }, { x: number; y: number }],
) {
  const side = (from: { x: number; y: number }, to: { x: number; y: number }, at: typeof from) =>
    (to.x - from.x) * (at.y - from.y) - (to.y - from.y) * (at.x - from.x);
  return (
    side(a[0], a[1], b[0]) * side(a[0], a[1], b[1]) < 0 &&
    side(b[0], b[1], a[0]) * side(b[0], b[1], a[1]) < 0
  );
}

function lineHitsBox(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  box: Box,
) {
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ] as const;
  return corners.some((corner, index) =>
    segmentsCross([from, to], [corner, corners[(index + 1) % 4]!]),
  );
}

function nameOf(element: ThreadCanvasElement) {
  const data = recordOf(element.customData);
  if (typeof data.t3Turn === "string") return `turn "${String(data.t3TurnTitle ?? "")}"`;
  return typeof element.text === "string"
    ? `"${element.text}"`
    : `the user's ${String(element.type)}`;
}

/**
 * Plans a whole drawing against the scene: lays it out if asked, keeps the reader's dragged boxes,
 * finds it a free spot, and reports what really came out, so the agent need not guess.
 */
export function planDrawing(input: {
  readonly scene: ThreadCanvasScene;
  readonly draw: DrawInput;
  readonly randomInt: () => number;
  readonly now: number;
}) {
  const { scene, draw, randomInt, now } = input;
  const { drawingId, shapes } = draw;
  const live = scene.elements.filter((element) => element.isDeleted !== true);
  const existing = live.filter((element) => drawingOf(element)?.id === drawingId);
  const origin = originOf(existing);
  const pins =
    draw.resetMoves === true
      ? new Map<string, { readonly x: number; readonly y: number }>()
      : pinsOf(drawingId, existing, origin);
  const sized = shapes.map((shape) => ({ shape, ...shapeSize(shape) }));
  const holder = live.find(
    (element) =>
      element.id === draw.inside && isUserMark(element) && HOLDER_TYPES.has(String(element.type)),
  );
  const laidOut =
    draw.layout !== undefined
      ? layoutShapes(shapes, draw.layout)
      : (draw.place === "belowLatestTurn" || holder !== undefined) &&
          shapes.length > 0 &&
          shapes.every(isCardShape)
        ? shelve(
            sized.map(({ shape, width, height }) => ({ id: shape.id, width, height })),
            holder === undefined
              ? MAX_ROW_WIDTH_PX
              : Math.max(numberOf(holder.width) - 2 * HOLDER_PADDING_PX, 1),
          )
        : null;
  const localPieces = sized.map((piece) => {
    const position = laidOut?.get(piece.shape.id) ?? {
      x: piece.shape.x ?? 0,
      y: piece.shape.y ?? 0,
    };
    return { ...piece, localX: position.x, localY: position.y };
  });
  const solid = localPieces.filter((piece) => !hasLines(piece.shape));
  const local =
    solid.length === 0
      ? { x: 0, y: 0, width: 0, height: 0 }
      : boundsOf(
          solid.map((piece) => ({
            x: piece.localX,
            y: piece.localY,
            width: piece.width,
            height: piece.height,
          })),
        );
  const others = live.filter(
    (element) => drawingOf(element)?.id !== drawingId && typeof element.containerId !== "string",
  );
  const turns = others.filter((element) => typeof recordOf(element.customData).t3Turn === "string");
  // The newest turn lands at the bottom of the column, whatever its place in the scene.
  const latestTurn = turns.toSorted((left, right) => boxOf(left).y - boxOf(right).y).at(-1);
  const solidObstacles = others
    .filter((element) => element.type !== "arrow" && element.type !== "line")
    .map(boxOf);
  const belowLatest = (size: { readonly width: number; readonly height: number }) => {
    const top =
      latestTurn === undefined ? 0 : boxOf(latestTurn).y + boxOf(latestTurn).height + GAP_PX;
    return { x: -size.width / 2, y: top, width: size.width, height: size.height };
  };
  const nearElement = live.find((element) => element.id === draw.near);
  const anchor = nearElement ?? latestTurn;
  // A drawing whose every shape is new is a new drawing: it starts where the old one sat,
  // but clear of the user's marks rather than over them.
  const previousShapes = new Set(
    existing.map((element) => String(element.id).slice(drawingId.length + 1)),
  );
  const replacesAll =
    origin !== null && shapes.length > 0 && shapes.every((shape) => !previousShapes.has(shape.id));
  const spot =
    holder !== undefined
      ? { ...local, ...insideOf(holder, live) }
      : draw.place === "belowLatestTurn"
        ? slideDown(solidObstacles, belowLatest(local))
        : origin === null
          ? placeDrawing(
              others
                .filter((element) => element.type !== "arrow" && element !== nearElement)
                .map(boxOf),
              anchor === undefined ? null : boxOf(anchor),
              nearElement !== undefined,
              local,
            )
          : replacesAll
            ? slideDown(solidObstacles, { ...local, x: local.x + origin.x, y: local.y + origin.y })
            : null;
  const offset =
    spot === null ? (origin ?? { x: 0, y: 0 }) : { x: spot.x - local.x, y: spot.y - local.y };
  const laid: ReadonlyArray<PlacedShape> = localPieces.map((piece) => {
    const pin = pins.get(piece.shape.id);
    return {
      ...piece,
      x: pin?.x ?? piece.localX + offset.x,
      y: pin?.y ?? piece.localY + offset.y,
    };
  });
  const broughtBelow = new Set(
    (draw.moveBelowLatestTurn ?? []).filter((id) =>
      laid.some((piece) => piece.shape.id === id && !hasLines(piece.shape)),
    ),
  );
  const placed = bringBelow(laid, [...broughtBelow], solidObstacles, belowLatest);
  // What lands below the latest turn is anchored to it, so it stays below as the turn grows.
  const anchoredShapes = new Set(
    holder !== undefined
      ? []
      : draw.place === "belowLatestTurn"
        ? placed.filter((piece) => !pins.has(piece.shape.id)).map((piece) => piece.shape.id)
        : broughtBelow,
  );
  const versions = new Map(
    scene.elements.map((element) => [element.id, numberOf(element.version)]),
  );
  const previousTurn = existing.map((element) => drawingOf(element)?.turn ?? null).find(Boolean);
  const turnId = recordOf(latestTurn?.customData).t3Turn;
  const latestBottom =
    latestTurn === undefined ? null : boxOf(latestTurn).y + boxOf(latestTurn).height;
  const existingById = new Map(existing.map((element) => [String(element.id), element]));
  const anchors = new Map<string, TurnAnchor>();
  // Excalidraw moves a group as one, so the user's box carries what it holds when dragged.
  const holderGroup = `t3-holds:${drawingId}`;
  const built = buildDrawingElements({
    drawingId,
    turn: previousTurn ?? (typeof turnId === "string" ? turnId : null),
    placed,
    versionOf: (id) => versions.get(id) ?? 0,
    randomInt,
    now,
  }).map((element) => {
    const piece = String(
      typeof element.containerId === "string" ? element.containerId : element.id,
    ).slice(drawingId.length + 1);
    const before = existingById.get(String(element.id));
    const groupIds =
      holder !== undefined
        ? [holderGroup]
        : Array.isArray(before?.groupIds)
          ? before.groupIds
          : (element.groupIds ?? []);
    element = { ...element, groupIds };
    const kept = before === undefined ? null : turnAnchorOf(before);
    const anchor =
      anchoredShapes.has(piece) && typeof turnId === "string" && latestBottom !== null
        ? anchorBelow(boxOf(element), turnId, latestBottom)
        : kept !== null && holdsTurnAnchor(boxOf(element), kept)
          ? kept
          : null;
    if (anchor === null) return element;
    anchors.set(String(element.id), anchor);
    return {
      ...element,
      customData: { ...recordOf(element.customData), [TURN_ANCHOR_KEY]: anchor },
    };
  });
  const builtIds = new Set(built.map((element) => element.id));
  const carried = carryMarks({ existing, built, live, anchors, randomInt, now });
  const held =
    holder === undefined
      ? new Map<string, ThreadCanvasElement>()
      : holdDrawing({
          holder,
          live,
          drawingId,
          group: holderGroup,
          placed: placed.filter((piece) => !hasLines(piece.shape) && !pins.has(piece.shape.id)),
          randomInt,
          now,
        });
  const withoutOld = scene.elements.flatMap((element) => {
    if (builtIds.has(element.id)) return [];
    const holding = held.get(String(element.id));
    if (holding !== undefined) return [holding];
    const moved = carried.get(String(element.id));
    if (moved !== undefined) return [moved];
    if (!existing.includes(element)) return [element];
    const customData = recordOf(element.customData);
    return [
      {
        ...element,
        isDeleted: true,
        version: numberOf(element.version) + 1,
        versionNonce: randomInt(),
        updated: now,
        customData: {
          ...customData,
          t3Drawing: { ...recordOf(customData.t3Drawing), written: now },
        },
      },
    ];
  });
  const elements = [...withoutOld, ...built];
  return {
    elements,
    seen: seenAfter(scene, elements),
    report: reportDrawing({ draw, placed, others, pinned: new Set(pins.keys()) }),
  };
}

/** Each mark's stamp: its version plus its label's, as the user's changes are tracked. */
function markStamps(elements: ReadonlyArray<ThreadCanvasElement>) {
  const stamps = new Map<string, number>();
  for (const element of elements) {
    if (element.isDeleted === true) continue;
    const owner = String(
      typeof element.containerId === "string" ? element.containerId : element.id,
    );
    stamps.set(owner, (stamps.get(owner) ?? 0) + numberOf(element.version));
  }
  return stamps;
}

/**
 * The agent's own edits to the user's marks, like carrying one with a card or growing a box it
 * filled, are not news to the agent: a mark it had seen stays seen.
 */
function seenAfter(scene: ThreadCanvasScene, elements: ReadonlyArray<ThreadCanvasElement>) {
  const seen = scene.seen;
  if (seen === undefined) return undefined;
  const before = markStamps(scene.elements);
  const after = markStamps(elements);
  return Object.fromEntries(
    Object.entries(seen).map(([id, stamp]) =>
      stamp === before.get(id) && after.has(id) ? [id, after.get(id)!] : [id, stamp],
    ),
  );
}

/** Where a drawing starts inside a box the user drew for it: under the box's title, if any. */
function insideOf(holder: ThreadCanvasElement, live: ReadonlyArray<ThreadCanvasElement>) {
  const box = boxOf(holder);
  const title = live.find((element) => element.containerId === holder.id);
  const titleBottom = title === undefined ? 0 : boxOf(title).y + boxOf(title).height - box.y;
  return {
    x: box.x + HOLDER_PADDING_PX,
    y: box.y + Math.max(0, titleBottom) + HOLDER_PADDING_PX,
  };
}

/**
 * The user's box grown to hold the drawing, and it and its title grouped with the drawing so they
 * move together. Both are stamped, so a client's copy from before cannot shrink the box back.
 */
function holdDrawing(input: {
  readonly holder: ThreadCanvasElement;
  readonly live: ReadonlyArray<ThreadCanvasElement>;
  readonly drawingId: string;
  readonly group: string;
  readonly placed: ReadonlyArray<PlacedShape>;
  readonly randomInt: () => number;
  readonly now: number;
}) {
  const { holder, live, drawingId, group, placed, randomInt, now } = input;
  const box = boxOf(holder);
  const content = placed.length === 0 ? null : boundsOf(placed);
  const right =
    content === null
      ? box.x + box.width
      : Math.max(box.x + box.width, content.x + content.width + HOLDER_PADDING_PX);
  const bottom =
    content === null
      ? box.y + box.height
      : Math.max(box.y + box.height, content.y + content.height + HOLDER_PADDING_PX);
  const stamp = (element: ThreadCanvasElement, size: Partial<Box>): ThreadCanvasElement => {
    const groupIds = Array.isArray(element.groupIds) ? (element.groupIds as string[]) : [];
    return {
      ...element,
      ...size,
      groupIds: groupIds.includes(group) ? groupIds : [...groupIds, group],
      version: numberOf(element.version) + 1,
      versionNonce: randomInt(),
      updated: now,
      customData: {
        ...recordOf(element.customData),
        t3Holds: { drawing: drawingId, written: now },
      },
    };
  };
  const held = new Map<string, ThreadCanvasElement>([
    [String(holder.id), stamp(holder, { width: right - box.x, height: bottom - box.y })],
  ]);
  for (const title of live) {
    if (title.containerId === holder.id) held.set(String(title.id), stamp(title, {}));
  }
  return held;
}

const isUserMark = (element: ThreadCanvasElement) => {
  const data = recordOf(element.customData);
  return (
    data.t3Turn === undefined &&
    data.t3Drawing === undefined &&
    data.t3Piece === undefined &&
    typeof element.containerId !== "string"
  );
};

/**
 * The user's marks that sit on an agent piece the plan moves, moved by the same amount, with
 * their labels. A mark sits on a piece when its centre lies inside it. Each carried mark is
 * stamped, so a client's copy from before the move cannot pull it back.
 */
function carryMarks(input: {
  readonly existing: ReadonlyArray<ThreadCanvasElement>;
  readonly built: ReadonlyArray<ThreadCanvasElement>;
  readonly live: ReadonlyArray<ThreadCanvasElement>;
  readonly anchors: ReadonlyMap<string, TurnAnchor>;
  readonly randomInt: () => number;
  readonly now: number;
}) {
  const { existing, built, live, anchors, randomInt, now } = input;
  const after = new Map(built.map((element) => [String(element.id), boxOf(element)]));
  const moves = existing.flatMap((element) => {
    if (element.type === "arrow" || element.type === "line") return [];
    if (typeof element.containerId === "string") return [];
    const from = boxOf(element);
    const to = after.get(String(element.id));
    if (to === undefined || (to.x === from.x && to.y === from.y)) return [];
    return [
      {
        id: String(element.id),
        drawing: drawingOf(element)?.id ?? "",
        from,
        dx: to.x - from.x,
        dy: to.y - from.y,
      },
    ];
  });
  const carried = new Map<string, ThreadCanvasElement>();
  if (moves.length === 0) return carried;
  const area = (box: Box) => box.width * box.height;
  const shift = (element: ThreadCanvasElement, move: (typeof moves)[number]) => {
    const at = { x: numberOf(element.x) + move.dx, y: numberOf(element.y) + move.dy };
    // A mark on an anchored card is anchored the same way, so it stays on the card.
    const anchor = anchors.get(move.id);
    const { [TURN_ANCHOR_KEY]: _previous, ...customData } = recordOf(element.customData);
    return {
      ...element,
      ...at,
      version: numberOf(element.version) + 1,
      versionNonce: randomInt(),
      updated: now,
      customData: {
        ...customData,
        t3Follow: { id: move.id, drawing: move.drawing, written: now },
        ...(anchor === undefined
          ? {}
          : { [TURN_ANCHOR_KEY]: anchorBelow(at, anchor.turn, anchor.bottom) }),
      },
    };
  };
  for (const mark of live.filter(isUserMark)) {
    const box = boxOf(mark);
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const under = moves
      .filter(
        ({ from }) =>
          centre.x >= from.x &&
          centre.x <= from.x + from.width &&
          centre.y >= from.y &&
          centre.y <= from.y + from.height,
      )
      .toSorted((left, right) => area(left.from) - area(right.from))[0];
    if (under === undefined) continue;
    carried.set(String(mark.id), shift(mark, under));
    for (const label of live) {
      if (label.containerId === mark.id) carried.set(String(label.id), shift(label, under));
    }
  }
  return carried;
}

/**
 * Moves the named pieces into rows below the latest turn, clear of everything else, and leaves
 * the rest of the drawing where it was. A moved piece then sits off the drawing's layout, so
 * later calls keep it where it landed, as they keep a box the user dragged.
 */
function bringBelow(
  laid: ReadonlyArray<PlacedShape>,
  ids: ReadonlyArray<string>,
  obstacles: ReadonlyArray<Box>,
  belowLatest: (size: { readonly width: number; readonly height: number }) => Box,
): ReadonlyArray<PlacedShape> {
  const wanted = new Set(ids);
  const moving = laid.filter((piece) => wanted.has(piece.shape.id) && !hasLines(piece.shape));
  if (moving.length === 0) return laid;
  const rows = shelve(
    moving.map((piece) => ({ id: piece.shape.id, width: piece.width, height: piece.height })),
  );
  const block = boundsOf(moving.map((piece) => ({ ...piece, ...rows.get(piece.shape.id) })));
  const staying = laid.filter((piece) => !wanted.has(piece.shape.id) && !hasLines(piece.shape));
  const spot = slideDown([...obstacles, ...staying], belowLatest(block));
  return laid.map((piece) => {
    const position = rows.get(piece.shape.id);
    return position === undefined
      ? piece
      : { ...piece, x: spot.x + position.x, y: spot.y + position.y };
  });
}

function reportDrawing(input: {
  readonly draw: DrawInput;
  readonly placed: ReadonlyArray<PlacedShape>;
  readonly others: ReadonlyArray<ThreadCanvasElement>;
  readonly pinned: ReadonlySet<string>;
}) {
  const { draw, placed, others, pinned } = input;
  const solid = placed.filter((piece) => !hasLines(piece.shape));
  const boxes = new Map(solid.map((piece) => [piece.shape.id, piece]));
  const links = placed
    .filter((piece) => hasLines(piece.shape))
    .map((piece) => ({ piece, ...arrowEnds(piece, boxes) }));
  let crossings = 0;
  for (const [index, link] of links.entries()) {
    for (const other of links.slice(index + 1)) {
      const shared =
        (link.start !== undefined && (link.start === other.start || link.start === other.end)) ||
        (link.end !== undefined && (link.end === other.start || link.end === other.end));
      if (!shared && segmentsCross([link.from, link.to], [other.from, other.to])) crossings += 1;
    }
  }
  const obstacles: ReadonlyArray<Named> = others
    .filter((element) => element.type !== "arrow" && element.type !== "line")
    .map((element) => ({
      ...boxOf(element),
      id: String(element.id),
      name: nameOf(element),
    }));
  return {
    drawingId: draw.drawingId,
    placed:
      solid.length === 0
        ? null
        : boundsOf(solid.map(({ x, y, width, height }) => ({ x, y, width, height }))),
    crossings,
    arrowsThroughBoxes: links.flatMap(({ piece, from, to }) =>
      solid.some(
        (box) =>
          box.shape.type !== "text" &&
          box.shape.id !== piece.shape.start &&
          box.shape.id !== piece.shape.end &&
          lineHitsBox(from, to, box),
      )
        ? [piece.shape.id]
        : [],
    ),
    clippedLabels: placed.filter(labelOverflows).map((piece) => piece.shape.id),
    overlaps: [
      ...new Set(
        solid.flatMap((box) =>
          obstacles.flatMap((other) => (overlaps(box, other) ? [other.name] : [])),
        ),
      ),
    ],
    keptUserMoves: solid.flatMap((piece) => (pinned.has(piece.shape.id) ? [piece.shape.id] : [])),
    elementIds: placed.map((piece) => drawingElementId(draw.drawingId, piece.shape.id)),
  };
}
