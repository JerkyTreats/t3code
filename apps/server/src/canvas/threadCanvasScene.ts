import type { ThreadCanvasElement, ThreadCanvasScene } from "@t3tools/contracts";
import { type CanvasSurfaceCard, canvasSurfaceCardOf } from "@t3tools/shared/canvasSurfaceCard";
import { isStaleDrawingCopy, turnAnchorOf, turnSpineOf } from "@t3tools/shared/threadCanvasDrawing";

import { originOf } from "./threadCanvasPlan.ts";

const versionOf = (element: ThreadCanvasElement) =>
  typeof element.version === "number" ? element.version : 0;
const idOf = (element: ThreadCanvasElement) =>
  typeof element.id === "string" ? element.id : undefined;

/**
 * Merges by element id, keeping the higher version, so no writer can erase a newer edit. A copy
 * of an agent element from before the agent's latest write loses whatever its version, and the
 * agent's element is re-versioned above it, so the client that sent it takes the newer one.
 */
export function mergeCanvasElements(
  current: ReadonlyArray<ThreadCanvasElement>,
  incoming: ReadonlyArray<ThreadCanvasElement>,
) {
  const merged = new Map<string, ThreadCanvasElement>();
  for (const element of current) {
    const id = idOf(element);
    if (id !== undefined) merged.set(id, element);
  }
  let changed = false;
  for (const element of incoming) {
    const id = idOf(element);
    if (id === undefined) continue;
    const existing = merged.get(id);
    if (existing !== undefined && isStaleDrawingCopy(element, existing)) {
      if (versionOf(existing) > versionOf(element)) continue;
      merged.set(id, { ...existing, version: versionOf(element) + 1 });
      changed = true;
      continue;
    }
    if (existing !== undefined && versionOf(existing) >= versionOf(element)) continue;
    merged.set(id, element);
    changed = true;
  }
  return { elements: [...merged.values()], changed };
}

interface CanvasBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const CARD_TEXT_PREVIEW_CHARS = 400;
const TITLE_CHARS = 40;
// The words under a mark, in an overview: enough to tell which line it sits on.
const COVERS_CHARS = 160;

const clippedTo = (text: string, chars: number) =>
  text.length > chars ? `${text.slice(0, chars)}…` : text;

const numberOf = (value: unknown) => (typeof value === "number" ? Math.round(value) : 0);
const boxOf = (element: ThreadCanvasElement): CanvasBox => ({
  x: numberOf(element.x),
  y: numberOf(element.y),
  width: numberOf(element.width),
  height: numberOf(element.height),
});
const recordOf = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

function distanceBetween(left: CanvasBox, right: CanvasBox) {
  const dx = Math.max(left.x - (right.x + right.width), right.x - (left.x + left.width), 0);
  const dy = Math.max(left.y - (right.y + right.height), right.y - (left.y + left.height), 0);
  return Math.hypot(dx, dy);
}

/** Each chat card on the board, by the thread it shows. */
export function chatCardsIn(elements: ReadonlyArray<ThreadCanvasElement>) {
  const cards = new Map<string, ThreadCanvasElement>();
  for (const element of elements) {
    if (element.isDeleted === true || typeof element.id !== "string") continue;
    const card = recordOf(recordOf(element.customData).t3Card);
    const surface = recordOf(card.surface);
    if (
      card.kind === "surface" &&
      surface.kind === "side-chat" &&
      typeof surface.threadId === "string"
    )
      cards.set(surface.threadId, element);
  }
  return cards;
}

/**
 * Which chat a user mark is addressed to: the chat whose card it sits nearest, or null for the
 * board's own thread when a turn is as near. A chat card itself belongs to the board's thread.
 */
function markOwnersOf(elements: ReadonlyArray<ThreadCanvasElement>) {
  const chats = [...chatCardsIn(elements)].map(([threadId, card]) => ({
    threadId,
    card,
    box: boxOf(card),
  }));
  const owners = new Map<string, string | null>();
  if (chats.length === 0) return owners;
  const turns = elements
    .filter(
      (element) =>
        element.isDeleted !== true && typeof recordOf(element.customData).t3Turn === "string",
    )
    .map(boxOf);
  const cardIds = new Set(chats.map((chat) => chat.card.id));
  for (const element of elements) {
    const id = idOf(element);
    if (id === undefined || cardIds.has(id)) continue;
    const box = reachOf(element, boxOf(element));
    const nearestTurn = Math.min(Infinity, ...turns.map((turn) => distanceBetween(box, turn)));
    let owner: string | null = null;
    let nearest = nearestTurn;
    for (const chat of chats) {
      const distance = distanceBetween(box, chat.box);
      if (distance < nearest) {
        nearest = distance;
        owner = chat.threadId;
      }
    }
    owners.set(id, owner);
  }
  return owners;
}

const ARROW_TIP_REACH = 12;
const BESIDE_REACH = 120;

/** The part of a mark that points at something: an arrow's tip, anything else's whole box. */
function reachOf(element: ThreadCanvasElement, box: CanvasBox): CanvasBox {
  if (element.type !== "arrow" && element.type !== "line") return box;
  const tip = Array.isArray(element.points) ? element.points.at(-1) : undefined;
  if (!Array.isArray(tip)) return box;
  return {
    x: box.x + numberOf(tip[0]) - ARROW_TIP_REACH,
    y: box.y + numberOf(tip[1]) - ARROW_TIP_REACH,
    width: 2 * ARROW_TIP_REACH,
    height: 2 * ARROW_TIP_REACH,
  };
}

interface AgentPiece {
  readonly id: string;
  readonly box: CanvasBox;
  readonly card?: "markdown" | "html";
  readonly text?: string;
}

/**
 * The agent's element a user mark sits on, the smallest one its reach touches, or failing that
 * the nearest within arm's reach. Arrows and lines are never targets: a mark beside an edge
 * means the node, not the edge.
 */
interface PieceRef {
  readonly id: string;
  readonly card?: "markdown" | "html";
  readonly text?: string;
}
interface MarkPlacement {
  readonly on?: PieceRef & { readonly x: number; readonly y: number };
  readonly beside?: PieceRef;
}

function placeOnAgentPiece(reach: CanvasBox, pieces: ReadonlyArray<AgentPiece>): MarkPlacement {
  const area = (box: CanvasBox) => box.width * box.height;
  const on = pieces
    .filter((piece) => distanceBetween(reach, piece.box) === 0)
    .toSorted((left, right) => area(left.box) - area(right.box))[0];
  if (on !== undefined) {
    return {
      on: {
        id: on.id,
        ...(on.card === undefined ? {} : { card: on.card }),
        ...(on.text === undefined ? {} : { text: on.text }),
        x: Math.max(0, reach.x - on.box.x),
        y: Math.max(0, reach.y - on.box.y),
      },
    };
  }
  const beside = pieces
    .map((piece) => ({ piece, distance: distanceBetween(reach, piece.box) }))
    .filter(({ distance }) => distance <= BESIDE_REACH)
    .toSorted((left, right) => left.distance - right.distance)[0]?.piece;
  return beside === undefined
    ? {}
    : {
        beside: {
          id: beside.id,
          ...(beside.card === undefined ? {} : { card: beside.card }),
          ...(beside.text === undefined ? {} : { text: beside.text }),
        },
      };
}

/** What names a placed panel tab for an agent: its resource, without the card's view state. */
function surfaceForAgents({ surface, title }: CanvasSurfaceCard) {
  switch (surface.kind) {
    case "file":
      return {
        kind: surface.kind,
        title,
        relativePath: surface.relativePath,
        ...(surface.revealLine === undefined ? {} : { revealLine: surface.revealLine }),
      };
    case "terminal":
      return {
        kind: surface.kind,
        title,
        resourceId: surface.resourceId,
        terminalIds: surface.terminalIds ?? [surface.resourceId],
      };
    case "device":
      return {
        kind: surface.kind,
        title,
        ...(surface.target === undefined
          ? {}
          : { device: surface.target.name, platform: surface.target.platform }),
      };
    case "files":
      return { kind: surface.kind, title };
    default:
      return { ...surface, title };
  }
}

/** The scene as an agent reads it: turns by their opening words, everything else beside them. */
export function describeCanvas(
  scene: ThreadCanvasScene,
  options: { readonly cardTextChars?: number } = {},
) {
  const cardTextChars = options.cardTextChars ?? CARD_TEXT_PREVIEW_CHARS;
  const live = scene.elements.filter((element) => element.isDeleted !== true);
  const turns = live.flatMap((element) => {
    const customData = recordOf(element.customData);
    return typeof customData.t3Turn === "string"
      ? [{ ...boxOf(element), title: clippedTo(String(customData.t3TurnTitle ?? ""), TITLE_CHARS) }]
      : [];
  });
  const labels = new Map<string, string>();
  for (const element of live) {
    if (typeof element.containerId === "string" && typeof element.text === "string") {
      labels.set(element.containerId, element.text);
    }
  }
  const pieces: AgentPiece[] = [];
  const elements = live.flatMap((element) => {
    const customData = recordOf(element.customData);
    const id = idOf(element);
    if (id === undefined || typeof customData.t3Turn === "string") return [];
    if (typeof element.containerId === "string") return [];
    const box = boxOf(element);
    const nearestTurn = turns.reduce<(typeof turns)[number] | null>(
      (nearest, turn) =>
        nearest === null || distanceBetween(box, turn) < distanceBetween(box, nearest)
          ? turn
          : nearest,
      null,
    );
    const card = recordOf(customData.t3Card);
    const surfaceCard = canvasSurfaceCardOf(card);
    const cardKind: "markdown" | "html" | "surface" | undefined =
      card.kind === "markdown"
        ? "markdown"
        : card.kind === "html"
          ? "html"
          : surfaceCard !== null
            ? "surface"
            : undefined;
    const text =
      labels.get(id) ??
      (typeof element.text === "string"
        ? element.text
        : typeof card.text === "string"
          ? card.text.slice(0, cardTextChars)
          : undefined);
    const start = recordOf(element.startBinding).elementId;
    const end = recordOf(element.endBinding).elementId;
    const drawing = recordOf(customData.t3Drawing).id;
    const covers = customData.t3Covers;
    if (typeof drawing === "string" && element.type !== "arrow" && element.type !== "line") {
      pieces.push({
        id,
        box,
        // Only the user places surface cards, so an agent piece is never one.
        ...(cardKind === undefined || cardKind === "surface" ? {} : { card: cardKind }),
        ...(text === undefined ? {} : { text }),
      });
    }
    return [
      {
        id,
        type: String(element.type),
        ...box,
        reach: reachOf(element, box),
        drawnBy: typeof drawing === "string" ? ("agent" as const) : ("user" as const),
        ...(typeof drawing === "string" ? { drawingId: drawing } : {}),
        ...(cardKind === undefined ? {} : { card: cardKind }),
        ...(cardKind === "html" && typeof card.attachmentId === "string"
          ? { attachmentId: card.attachmentId }
          : {}),
        ...(surfaceCard === null ? {} : { surface: surfaceForAgents(surfaceCard) }),
        ...(text === undefined ? {} : { text }),
        ...(typeof covers === "string" ? { covers } : {}),
        ...(typeof start === "string" ? { start } : {}),
        ...(typeof end === "string" ? { end } : {}),
        ...(nearestTurn === null
          ? {}
          : { nearestTurn: nearestTurn.title, turn: turns.indexOf(nearestTurn) }),
      },
    ];
  });
  // Agent pieces are known only once the whole scene is read, so user marks are placed last.
  return {
    turns,
    elements: elements.map(({ reach, ...element }) => ({
      ...element,
      ...(element.drawnBy === "user" ? placeOnAgentPiece(reach, pieces) : ({} as MarkPlacement)),
    })),
  };
}

const NOTE_MAX_CHANGES = 20;
const NOTE_MAX_TEXT_CHARS = 300;

const clipped = (text: string) =>
  text.length > NOTE_MAX_TEXT_CHARS ? `${text.slice(0, NOTE_MAX_TEXT_CHARS)}…` : text;
const quoted = (text: string) => JSON.stringify(clipped(text));

const CARD_LABEL_CHARS = 60;

/** An agent piece as a mark's note names it: a card by its opening words, a shape by its label. */
function pieceLabel(piece: { id: string; card?: "markdown" | "html"; text?: string }) {
  const kind = piece.card === undefined ? "" : `${piece.card} card `;
  const words =
    piece.text === undefined
      ? ""
      : `${JSON.stringify(piece.text.replace(/\s+/g, " ").trim().slice(0, CARD_LABEL_CHARS))} `;
  return `${kind}${words}[${piece.id}]`;
}

function describeMark(mark: ReturnType<typeof describeCanvas>["elements"][number]) {
  const parts = [
    `${mark.type}${mark.text === undefined ? "" : ` ${quoted(mark.text)}`} [${mark.id}]`,
    ...(mark.nearestTurn === undefined ? [] : [`near turn ${quoted(mark.nearestTurn)}`]),
    ...(mark.on === undefined
      ? []
      : [`on your ${pieceLabel(mark.on)} at ${mark.on.x},${mark.on.y} from its top left`]),
    ...(mark.beside === undefined ? [] : [`beside your ${pieceLabel(mark.beside)}`]),
    ...(mark.covers === undefined ? [] : [`over ${quoted(mark.covers)}`]),
  ];
  return `- ${parts.join(", ")}`;
}

/**
 * What the user did on the canvas since the agent last knew about it. `seen` is the state to save
 * once the agent has this note, and `sketched` says a mark exists that only a picture can show.
 */
export function describeCanvasChanges(
  scene: ThreadCanvasScene,
  message: string,
  reader: string | null = null,
) {
  const previous = scene.seen ?? {};
  // Each chat on the board hears only the marks addressed to it; the board's thread is null.
  const owners = markOwnersOf(scene.elements);
  const addressed = (id: string) => (owners.get(id) ?? null) === reader;
  const stamps = new Map<string, number>();
  for (const element of scene.elements) {
    const owner = typeof element.containerId === "string" ? element.containerId : idOf(element);
    if (owner === undefined || element.isDeleted === true) continue;
    stamps.set(owner, (stamps.get(owner) ?? 0) + versionOf(element));
  }
  const marks = describeCanvas(scene)
    .elements.filter((element) => element.drawnBy === "user" && addressed(element.id))
    .toSorted((left, right) => left.y - right.y);
  const isFresh = (mark: (typeof marks)[number]) => previous[mark.id] !== stamps.get(mark.id);
  const asked = message.trim();
  const sentNotes = marks.filter((mark) => {
    const text = mark.text?.trim();
    return (
      text !== undefined &&
      text !== "" &&
      (text === asked || (isFresh(mark) && asked.includes(text)))
    );
  });
  const sentIds = new Set(sentNotes.map((mark) => mark.id));
  const fresh = marks.filter((mark) => isFresh(mark) && !sentIds.has(mark.id));
  const liveIds = new Set(marks.map((mark) => mark.id));
  const forget: Array<string> = [];
  const removed = scene.elements.flatMap((element) => {
    const id = idOf(element);
    return id !== undefined &&
      element.isDeleted === true &&
      addressed(id) &&
      previous[id] !== undefined &&
      !liveIds.has(id) &&
      forget.push(id) > 0
      ? [
          typeof element.text === "string"
            ? `- removed ${quoted(element.text)}`
            : `- removed [${id}]`,
        ]
      : [];
  });
  const lines = [...fresh.map(describeMark), ...removed];
  const shown = lines.slice(0, NOTE_MAX_CHANGES);
  if (lines.length > shown.length) {
    shown.push(`- and ${lines.length - shown.length} more; canvas_read lists them`);
  }
  const sections = [
    ...(shown.length === 0
      ? []
      : [
          `${reader === null ? "The user changed this thread's Excalidraw canvas" : "The user changed the canvas around your chat card"} since you last looked. A note addressed to you is a request from them.\n${shown.join("\n")}`,
        ]),
    ...sentNotes
      .slice(0, 1)
      .map(
        (mark) =>
          `This message was sent from the canvas note [${mark.id}]. Pass that id as \`near\` to canvas_update so your drawing lands beside it.`,
      ),
  ];
  return {
    note: sections.join("\n\n"),
    // The reader's marks only, merged into what the other chats on the board have seen.
    seen: Object.fromEntries(marks.map((mark) => [mark.id, stamps.get(mark.id) ?? 0])),
    forget,
    sketched: fresh.some((mark) => mark.text === undefined),
  };
}

/** Whole card text in a detailed read, up to this much per card. */
const DETAIL_CARD_TEXT_CHARS = 4000;
/** A detailed read stops listing elements past this much JSON, so it fits one tool result. */
const DETAIL_BUDGET_CHARS = 40_000;

export interface CanvasReadQuery {
  readonly drawingIds?: ReadonlyArray<string> | undefined;
  readonly ids?: ReadonlyArray<string> | undefined;
  readonly region?: CanvasBox | undefined;
}

const overlaps = (left: CanvasBox, right: CanvasBox) =>
  left.x < right.x + right.width &&
  right.x < left.x + left.width &&
  left.y < right.y + right.height &&
  right.y < left.y + left.height;

/** One line naming a drawing: its first card's heading, or else its first label. */
function drawingTitle(elements: ReadonlyArray<{ readonly card?: string; readonly text?: string }>) {
  const text =
    elements.find((element) => element.card === "markdown" && element.text !== undefined)?.text ??
    elements.find((element) => element.text !== undefined)?.text;
  const line = text
    ?.split("\n")
    .map((entry) =>
      entry
        .replace(/^[#>\-\s]+/, "")
        .replace(/[*_`]/g, "")
        .trim(),
    )
    .find((entry) => entry !== "");
  return line === undefined ? undefined : clippedTo(line, TITLE_CHARS);
}

/**
 * The canvas as canvas_read returns it. With no query it is an overview that fits one tool
 * result however full the canvas gets: the turn spine, each agent drawing as one box, and every
 * user mark. A query lists the matching elements in full, up to a size budget.
 */
export function readCanvas(scene: ThreadCanvasScene, query: CanvasReadQuery = {}) {
  const detailed =
    query.drawingIds !== undefined || query.ids !== undefined || query.region !== undefined;
  const described = describeCanvas(scene, {
    cardTextChars: detailed ? DETAIL_CARD_TEXT_CHARS : CARD_TEXT_PREVIEW_CHARS,
  });
  const live = scene.elements.filter((element) => element.isDeleted !== true);
  const turnTitles = new Map<string, string>();
  const anchors = new Map<string, string>();
  for (const element of live) {
    const customData = recordOf(element.customData);
    if (typeof customData.t3Turn === "string") {
      turnTitles.set(customData.t3Turn, String(customData.t3TurnTitle ?? ""));
    }
    const anchor = turnAnchorOf(element);
    const id = idOf(element);
    if (anchor !== null && id !== undefined) anchors.set(id, anchor.turn);
  }
  const spine = turnSpineOf(described.turns);
  const groups = new Map<string, (typeof described.elements)[number][]>();
  for (const element of described.elements) {
    if (element.drawingId === undefined) continue;
    const group = groups.get(element.drawingId) ?? [];
    group.push(element);
    groups.set(element.drawingId, group);
  }
  const drawingElements = new Map<string, ThreadCanvasElement[]>();
  for (const element of live) {
    const drawing = recordOf(recordOf(element.customData).t3Drawing).id;
    if (typeof drawing !== "string") continue;
    drawingElements.set(drawing, [...(drawingElements.get(drawing) ?? []), element]);
  }
  const drawings = [...groups].map(([drawingId, elements]) => {
    const origin = originOf(drawingElements.get(drawingId) ?? []);
    const left = Math.min(...elements.map((element) => element.x));
    const top = Math.min(...elements.map((element) => element.y));
    const right = Math.max(...elements.map((element) => element.x + element.width));
    const bottom = Math.max(...elements.map((element) => element.y + element.height));
    const title = drawingTitle(elements);
    const anchoredTo = elements
      .map((element) => anchors.get(element.id))
      .find((turn) => turn !== undefined);
    const besideTurn = anchoredTo === undefined ? undefined : turnTitles.get(anchoredTo);
    return {
      drawingId,
      origin: { x: Math.round(origin?.x ?? 0), y: Math.round(origin?.y ?? 0) },
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      shapes: elements.length,
      cards: elements.filter((element) => element.card !== undefined).length,
      ...(title === undefined ? {} : { title }),
      ...(besideTurn === undefined ? {} : { followsTurn: clippedTo(besideTurn, TITLE_CHARS) }),
    };
  });
  const wanted = (element: (typeof described.elements)[number]) =>
    !detailed
      ? element.drawnBy === "user"
      : (element.drawingId !== undefined &&
          query.drawingIds?.some(
            (id) => element.drawingId === id || element.drawingId?.startsWith(`${id}~`) === true,
          ) === true) ||
        query.ids?.includes(element.id) === true ||
        (query.region !== undefined && overlaps(element, query.region));
  // Marks name the turn by its place in turns and the piece under them by id, not by their words.
  const compact = ({
    nearestTurn: _title,
    on,
    beside,
    covers,
    ...element
  }: (typeof described.elements)[number]) => ({
    ...element,
    ...(covers === undefined
      ? {}
      : { covers: detailed ? covers : clippedTo(covers, COVERS_CHARS) }),
    ...(on === undefined ? {} : { on: on.id }),
    ...(beside === undefined ? {} : { beside: beside.id }),
  });
  const elements: ReturnType<typeof compact>[] = [];
  let spent = 0;
  let omitted = 0;
  for (const element of described.elements.filter(wanted).map(compact)) {
    const size = JSON.stringify(element).length;
    if (detailed && spent + size > DETAIL_BUDGET_CHARS) {
      omitted += 1;
      continue;
    }
    spent += size;
    elements.push(element);
  }
  return {
    spine:
      spine === null
        ? null
        : {
            left: spine.left,
            right: spine.right,
            nextTurnY: spine.latestTurn.y + spine.latestTurn.height,
          },
    turns: described.turns,
    drawings,
    elements,
    note: detailed
      ? omitted === 0
        ? "Elements matching the query, card text in full."
        : `${omitted} more matching elements left out to fit; ask for fewer drawings or a smaller region.`
      : "Your drawings appear as one box each; elements lists only the user's marks. Pass drawingIds, ids or region for your shapes and full card text. Coordinates are current: read again rather than reuse ones from earlier.",
  };
}
