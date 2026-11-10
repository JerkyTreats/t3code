/**
 * What makes the user's marks on a thread canvas news to an agent. A mark is stamped by what it
 * says, how it is drawn and the turn it is anchored to with its offset from that turn, never by
 * where layout puts it or how often it was written: the board moves marks with the turns as they
 * re-measure, and that is not the user changing anything.
 */

import { contentAnchorOf, holdsTurnAnchor, turnAnchorOf } from "./threadCanvasDrawing.ts";

type Fields = Readonly<Record<string, unknown>>;

const fieldsOf = (value: unknown): Fields =>
  typeof value === "object" && value !== null ? (value as Fields) : {};

const rounded = (value: unknown, places = 0) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

// Stamps recorded before anchors named what a mark sat on by overlap. The turn that opens a loaded
// window of history grows as more loads, so it named nothing.
const THREAD_START_TURN = "thread-start";
const ARROW_TIP_REACH = 12;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const boxOf = (fields: Fields): Box => ({
  x: rounded(fields.x) ?? 0,
  y: rounded(fields.y) ?? 0,
  width: rounded(fields.width) ?? 0,
  height: rounded(fields.height) ?? 0,
});

const overlaps = (left: Box, right: Box) =>
  left.x < right.x + right.width &&
  right.x < left.x + left.width &&
  left.y < right.y + right.height &&
  right.y < left.y + left.height;

const area = (box: Box) => box.width * box.height;

const isLine = (fields: Fields) => fields.type === "arrow" || fields.type === "line";

/** The part of a mark that points at something: an arrow's tip, anything else's whole box. */
function reachOf(fields: Fields): Box {
  const box = boxOf(fields);
  const tip = isLine(fields) && Array.isArray(fields.points) ? fields.points.at(-1) : undefined;
  if (!Array.isArray(tip)) return box;
  return {
    x: box.x + (rounded(tip[0]) ?? 0) - ARROW_TIP_REACH,
    y: box.y + (rounded(tip[1]) ?? 0) - ARROW_TIP_REACH,
    width: 2 * ARROW_TIP_REACH,
    height: 2 * ARROW_TIP_REACH,
  };
}

/** The smallest of these boxes the reach overlaps, by its name. */
function smallestUnder(reach: Box, boxes: ReadonlyArray<{ readonly name: string; box: Box }>) {
  let found: { readonly name: string; box: Box } | null = null;
  for (const candidate of boxes) {
    if (!overlaps(reach, candidate.box)) continue;
    if (found === null || area(candidate.box) < area(found.box)) found = candidate;
  }
  return found?.name ?? null;
}

const bindingOf = (value: unknown) => {
  const id = fieldsOf(value).elementId;
  return typeof id === "string" ? id : null;
};

// 53-bit string hash (cyrb53): the stamp only has to tell two contents apart, not keep them.
function hashOf(text: string) {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507);
  first ^= Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507);
  second ^= Math.imul(first ^ (first >>> 13), 3266489909);
  return `${(second >>> 0).toString(36)}.${(first >>> 0).toString(36)}`;
}

/**
 * What a mark is, as the user would describe it. Position, version and the board's own
 * bookkeeping (what text lies under it, a held drawing's size) are left out; so are a bound
 * arrow's bends and a text's measured size, which the board redoes on its own.
 */
function contentOf(fields: Fields, labels: ReadonlyArray<string>): Array<unknown> {
  const customData = fieldsOf(fields.customData);
  const text = fields.type === "text";
  const start = bindingOf(fields.startBinding);
  const end = bindingOf(fields.endBinding);
  const bound = start !== null || end !== null;
  return [
    fields.type ?? null,
    fields.strokeColor ?? null,
    fields.backgroundColor ?? null,
    fields.fillStyle ?? null,
    rounded(fields.strokeWidth, 2),
    fields.strokeStyle ?? null,
    rounded(fields.roughness, 2),
    rounded(fields.opacity),
    fieldsOf(fields.roundness).type ?? null,
    rounded(fields.angle, 3),
    fields.link ?? null,
    fields.fontSize ?? null,
    fields.fontFamily ?? null,
    fields.textAlign ?? null,
    fields.startArrowhead ?? null,
    fields.endArrowhead ?? null,
    fields.fileId ?? null,
    fields.crop ?? null,
    text ? (fields.originalText ?? fields.text ?? null) : null,
    text || customData.t3Holds !== undefined
      ? null
      : [rounded(fields.width), rounded(fields.height)],
    isLine(fields) && bound
      ? null
      : Array.isArray(fields.points)
        ? fields.points.map((point) =>
            Array.isArray(point) ? [rounded(point[0]), rounded(point[1])] : null,
          )
        : null,
    isLine(fields) ? [start, end] : null,
    customData.t3Card ?? null,
    labels,
  ];
}

const numberOf = (value: unknown) => (typeof value === "number" ? value : 0);

const isLive = (fields: Fields) => fields.isDeleted !== true && typeof fields.id === "string";

/** Whether an element is a mark of the user's own: not a turn, an agent's piece or a label. */
function isMark(fields: Fields) {
  const customData = fieldsOf(fields.customData);
  return (
    isLive(fields) &&
    typeof fields.containerId !== "string" &&
    customData.t3Turn === undefined &&
    customData.t3Drawing === undefined
  );
}

/** Each of the user's marks by id, stamped with what it is, its labels and its turn anchor. */
export function canvasMarkStamps(elements: ReadonlyArray<object>): ReadonlyMap<string, string> {
  return markStamps(elements, false);
}

function markStamps(elements: ReadonlyArray<object>, byOverlap: boolean) {
  const labels = new Map<string, Array<string>>();
  const anchorTurns: Array<{ readonly id: string; readonly y: number }> = [];
  const turns: Array<{ readonly name: string; box: Box }> = [];
  const pieces: Array<{ readonly name: string; box: Box }> = [];
  for (const element of elements) {
    const fields = fieldsOf(element);
    if (!isLive(fields)) continue;
    const customData = fieldsOf(fields.customData);
    if (typeof fields.containerId === "string") {
      const words = fields.originalText ?? fields.text;
      if (typeof words === "string") {
        labels.set(fields.containerId, [...(labels.get(fields.containerId) ?? []), words]);
      }
    } else if (typeof customData.t3Turn === "string") {
      anchorTurns.push({ id: customData.t3Turn, y: numberOf(fields.y) });
      if (customData.t3Turn !== THREAD_START_TURN) {
        turns.push({ name: customData.t3Turn, box: boxOf(fields) });
      }
    } else if (customData.t3Drawing !== undefined && !isLine(fields)) {
      pieces.push({ name: String(fields.id), box: boxOf(fields) });
    }
  }
  const stamps = new Map<string, string>();
  for (const element of elements) {
    const fields = fieldsOf(element);
    if (!isMark(fields)) continue;
    const id = String(fields.id);
    const content = contentOf(fields, [...(labels.get(id) ?? [])].sort());
    if (byOverlap) {
      const reach = reachOf(fields);
      content.push(smallestUnder(reach, turns), smallestUnder(reach, pieces));
    } else {
      // The anchor the board saved while the mark still sits on it, else the one it will save.
      const at = { x: numberOf(fields.x), y: numberOf(fields.y) };
      const kept = turnAnchorOf(fields);
      const anchor =
        kept !== null && holdsTurnAnchor(at, kept) ? kept : contentAnchorOf(at, anchorTurns);
      content.push(
        anchor === null ? null : [anchor.turn, anchor.edge, rounded(anchor.dy), rounded(anchor.x)],
      );
    }
    stamps.set(id, hashOf(JSON.stringify(content)));
  }
  return stamps;
}

/**
 * What the agent knows of the user's marks. `seenMarks` holds content stamps; `seen` holds the
 * version sums boards recorded before them, which only `canvasMarksSeenOnLoad` reads.
 */
export interface CanvasMarksSeen {
  readonly seen?: Readonly<Record<string, number>> | undefined;
  readonly seenMarks?: Readonly<Record<string, string>> | undefined;
}

/** Each mark's old stamp: its version plus its labels'. */
export function canvasMarkVersionStamps(elements: ReadonlyArray<object>) {
  const stamps = new Map<string, number>();
  for (const element of elements) {
    const fields = fieldsOf(element);
    if (!isLive(fields)) continue;
    const owner = String(typeof fields.containerId === "string" ? fields.containerId : fields.id);
    stamps.set(owner, (stamps.get(owner) ?? 0) + (rounded(fields.version) ?? 0));
  }
  return stamps;
}

/**
 * The record restated in today's stamps, worked out on the scene as saved, which is how the agent
 * saw it: an entry made before anchors (a version sum, or a stamp named by what the mark
 * overlapped) that still matches takes the mark's anchor stamp. One that no longer matches stays,
 * so the mark reads as changed.
 */
export function canvasMarksSeenOnLoad(
  scene: CanvasMarksSeen & { readonly elements: ReadonlyArray<object> },
): CanvasMarksSeen {
  if (scene.seen === undefined && scene.seenMarks === undefined) return {};
  const stamps = canvasMarkStamps(scene.elements);
  let byOverlap: ReadonlyMap<string, string> | null = null;
  const seenMarks: Record<string, string> = {};
  for (const [id, recorded] of Object.entries(scene.seenMarks ?? {})) {
    const now = stamps.get(id);
    const old =
      now === undefined || now === recorded
        ? undefined
        : (byOverlap ??= markStamps(scene.elements, true)).get(id);
    seenMarks[id] = now !== undefined && recorded === old ? now : recorded;
  }
  const versions = canvasMarkVersionStamps(scene.elements);
  const seen: Record<string, number> = {};
  for (const [id, version] of Object.entries(scene.seen ?? {})) {
    const now = stamps.get(id);
    if (now !== undefined && seenMarks[id] === undefined && version === versions.get(id)) {
      seenMarks[id] = now;
    } else seen[id] = version;
  }
  return Object.keys(seen).length === 0 ? { seenMarks } : { seen, seenMarks };
}

/** The marks the agent has not seen as they are now. */
export function unseenCanvasMarkIds(
  elements: ReadonlyArray<object>,
  known: CanvasMarksSeen,
  stamps: ReadonlyMap<string, string> = canvasMarkStamps(elements),
) {
  const current = known.seenMarks ?? {};
  const unseen = new Set<string>();
  for (const [id, stamp] of stamps) if (current[id] !== stamp) unseen.add(id);
  return unseen;
}
