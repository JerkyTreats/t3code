import dagre from "@dagrejs/dagre";
import type { ThreadCanvasElement, ThreadCanvasScene, ThreadCanvasShape } from "@t3tools/contracts";
import {
  arrowEnds,
  buildDrawingElements,
  drawingElementId,
  labelOverflows,
  type PlacedShape,
  shapeSize,
} from "@t3tools/shared/threadCanvasDrawing";

const GAP_PX = 32;
const NODE_GAP_PX = 60;
const RANK_GAP_PX = 110;
const TITLE_GAP_PX = 48;
// The widest drawing that still sits beside a turn on an ordinary screen.
const MAX_WIDTH_BESIDE_TURN_PX = 900;

export interface DrawInput {
  readonly drawingId: string;
  readonly shapes: ReadonlyArray<ThreadCanvasShape>;
  readonly near?: string | undefined;
  readonly layout?: "right" | "down" | undefined;
  readonly resetMoves?: boolean | undefined;
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

/** A free spot for a new drawing: beside what asked for it, or under it when too wide. */
function placeDrawing(obstacles: ReadonlyArray<Box>, anchor: Box | null, near: boolean, size: Box) {
  const free = (spot: Box) => !obstacles.some((box) => overlaps(spot, box));
  const slide = (spot: Box) => {
    let { y } = spot;
    for (;;) {
      const blocker = obstacles.find((box) => overlaps({ ...spot, y }, box));
      if (blocker === undefined) return { ...spot, y };
      y = blocker.y + blocker.height + GAP_PX;
    }
  };
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
  const laidOut = draw.layout === undefined ? null : layoutShapes(shapes, draw.layout);
  const localPieces = shapes.map((shape) => {
    const position = laidOut?.get(shape.id) ?? { x: shape.x ?? 0, y: shape.y ?? 0 };
    return { shape, ...shapeSize(shape), localX: position.x, localY: position.y };
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
  const latestTurn = turns.at(-1);
  const nearElement = live.find((element) => element.id === draw.near);
  const anchor = nearElement ?? latestTurn;
  const spot =
    origin === null
      ? placeDrawing(
          others
            .filter((element) => element.type !== "arrow" && element !== nearElement)
            .map(boxOf),
          anchor === undefined ? null : boxOf(anchor),
          nearElement !== undefined,
          local,
        )
      : null;
  const offset = origin ?? { x: (spot?.x ?? 0) - local.x, y: (spot?.y ?? 0) - local.y };
  const placed: ReadonlyArray<PlacedShape> = localPieces.map((piece) => {
    const pin = pins.get(piece.shape.id);
    return {
      ...piece,
      x: pin?.x ?? piece.localX + offset.x,
      y: pin?.y ?? piece.localY + offset.y,
    };
  });
  const versions = new Map(
    scene.elements.map((element) => [element.id, numberOf(element.version)]),
  );
  const previousTurn = existing.map((element) => drawingOf(element)?.turn ?? null).find(Boolean);
  const turnId = recordOf(latestTurn?.customData).t3Turn;
  const built = buildDrawingElements({
    drawingId,
    turn: previousTurn ?? (typeof turnId === "string" ? turnId : null),
    placed,
    versionOf: (id) => versions.get(id) ?? 0,
    randomInt,
    now,
  });
  const builtIds = new Set(built.map((element) => element.id));
  const withoutOld = scene.elements.flatMap((element) => {
    if (builtIds.has(element.id)) return [];
    if (!existing.includes(element)) return [element];
    return [
      {
        ...element,
        isDeleted: true,
        version: numberOf(element.version) + 1,
        versionNonce: randomInt(),
        updated: now,
      },
    ];
  });
  return {
    elements: [...withoutOld, ...built],
    report: reportDrawing({ draw, placed, others, pinned: new Set(pins.keys()) }),
  };
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
