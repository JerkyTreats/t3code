import {
  contentAnchorOf,
  holdsTurnAnchor,
  type TurnAnchor,
  turnEdgeY,
} from "@t3tools/shared/threadCanvasDrawing";

// T3's turn content sits inside its box, so the stroke and handles stay grabbable.
export const TURN_INSET_PX = 12;
export const TURN_GAP_PX = 32;
export const TURN_COLUMN_WIDTH_PX = 860;
export const TURN_MAX_WIDTH_PX = 1600;

export interface TurnCard {
  readonly id: string;
  readonly element: HTMLElement;
  /** The width the turn's agent asked for, in CSS pixels. */
  readonly requestedWidth: number | null;
  /** The turn's opening words, which name it to an agent reading the canvas. */
  readonly title: string;
}

/** Links the cards rendered by the timeline to the Excalidraw board that positions them. */
export interface TurnBoard {
  readonly layer: () => HTMLElement | null;
  readonly cards: () => ReadonlyArray<TurnCard>;
  readonly publish: (layer: HTMLElement | null, cards: ReadonlyArray<TurnCard>) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly panToLatest: () => void;
  readonly setPanToLatest: (pan: () => void) => void;
  readonly reportFollowing: (following: boolean) => void;
  readonly setFollowListener: (listener: ((following: boolean) => void) | null) => void;
  /** How many of the reader's marks the agent has not seen, so the composer can send them alone. */
  readonly reportPendingNotes: (count: number) => void;
  readonly setPendingNotesListener: (listener: ((count: number) => void) | null) => void;
}

function sameCards(left: ReadonlyArray<TurnCard>, right: ReadonlyArray<TurnCard>) {
  return (
    left.length === right.length &&
    left.every(
      (card, index) =>
        card.id === right[index]?.id &&
        card.element === right[index]?.element &&
        card.requestedWidth === right[index]?.requestedWidth &&
        card.title === right[index]?.title,
    )
  );
}

export function createTurnBoard(): TurnBoard {
  let layer: HTMLElement | null = null;
  let cards: ReadonlyArray<TurnCard> = [];
  let pan = () => {};
  let followListener: ((following: boolean) => void) | null = null;
  let pendingNotesListener: ((count: number) => void) | null = null;
  const listeners = new Set<() => void>();
  return {
    layer: () => layer,
    cards: () => cards,
    publish: (nextLayer, nextCards) => {
      if (nextLayer === layer && sameCards(nextCards, cards)) return;
      layer = nextLayer;
      cards = nextCards;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    panToLatest: () => pan(),
    setPanToLatest: (next) => {
      pan = next;
    },
    reportFollowing: (following) => followListener?.(following),
    setFollowListener: (listener) => {
      followListener = listener;
    },
    reportPendingNotes: (count) => pendingNotesListener?.(count),
    setPendingNotesListener: (listener) => {
      pendingNotesListener = listener;
    },
  };
}

/** Anything on the board. Turn boxes carry `turnId`; the reader's marks do not. */
export interface BoardBox {
  readonly key: string;
  readonly turnId: string | null;
  readonly requestedWidth: number | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The agent drawing a box belongs to; a box the user drew around it grows to hold it. */
  readonly group?: string | null;
  /** The turn the box sits beside or below, and how far from that turn's edge; it follows the edge. */
  readonly anchor?: TurnAnchor | null;
  /** A piece a chat drew from its card, which follows the card instead of a turn. */
  readonly onCard?: boolean;
  /** A card's height fits its content, so cards below it in the same region make room. */
  readonly card?: boolean;
  /** The card's content fitted taller in this pass, so the cards below it make room. */
  readonly grew?: boolean;
  /** The agent drawing this box of the user's holds: it grows to keep that drawing inside. */
  readonly holds?: string | null;
  /** The shape or arrow a label is bound to; the label moves with it, not on its own. */
  readonly container?: string | null;
}

// Matches the server's padding inside a box the user drew for a drawing.
const HOLDER_PADDING_PX = 24;

export interface MeasuredTurn {
  readonly id: string;
  /** Rendered height of the card, without the box's inset. */
  readonly height: number;
  readonly requestedWidth: number | null;
}

type MutableBox = { -readonly [Key in keyof BoardBox]: BoardBox[Key] };

function inColumn(box: BoardBox) {
  return Math.abs(box.x + box.width / 2) < 1;
}

function widthFor(requestedWidth: number | null) {
  return Math.max(TURN_COLUMN_WIDTH_PX, (requestedWidth ?? 0) + 2 * TURN_INSET_PX);
}

/** A new turn lands under whatever sits in the column, so it never covers a mark. */
function landingY(boxes: ReadonlyArray<BoardBox>) {
  const edge = TURN_COLUMN_WIDTH_PX / 2;
  const bottoms = boxes
    .filter((box) => box.x < edge && box.x + box.width > -edge)
    .map((box) => box.y + box.height);
  return bottoms.length === 0 ? 0 : Math.max(...bottoms) + TURN_GAP_PX;
}

/**
 * Places every turn. Turns the reader moved stay put. A turn still in the column inserts space
 * when it changes height, so the turns below it move with it. Earlier turns loaded from history
 * land above the turns they precede. Everything else follows the turn edge it is anchored to,
 * whoever drew it, however late it arrives; layout never re-anchors it.
 */
export function layoutTurns(
  boxes: ReadonlyArray<BoardBox>,
  turns: ReadonlyArray<MeasuredTurn>,
): ReadonlyArray<BoardBox> {
  // Checked before anything moves: content off its anchor was moved there, and content with none
  // is new, so either takes the turn it sits beside now. A label follows its shape, and the board
  // refits its text to the real font, which moves it a little.
  const turnsNow = boxes.flatMap((box) =>
    box.turnId === null ? [] : [{ id: box.turnId, y: box.y }],
  );
  const placed: MutableBox[] = boxes.map((box) =>
    box.turnId !== null
      ? { ...box }
      : box.container != null || box.onCard === true
        ? { ...box, anchor: null }
        : box.anchor != null && holdsTurnAnchor(box, box.anchor)
          ? { ...box }
          : { ...box, anchor: contentAnchorOf(box, turnsNow) },
  );
  const before = new Map(placed.map((box) => [box.key, { x: box.x, y: box.y }]));
  // A new turn lands below the regions as they stand, not where a stale copy left them.
  followAnchors(placed);
  const boxFor = (id: string) => placed.find((box) => box.turnId === id);
  for (const [index, turn] of turns.entries()) {
    const height = turn.height + 2 * TURN_INSET_PX;
    const box = boxFor(turn.id);
    if (box === undefined) {
      const width = widthFor(turn.requestedWidth);
      const next = turns
        .slice(index + 1)
        .map((later) => boxFor(later.id))
        .find((later) => later !== undefined);
      placed.push({
        key: turn.id,
        turnId: turn.id,
        requestedWidth: turn.requestedWidth,
        x: -width / 2,
        y: next === undefined ? landingY(placed) : next.y - height - TURN_GAP_PX,
        width,
        height,
      });
      continue;
    }
    // A turn's render arrives after the turn lands, and only then asks for its width.
    if (turn.requestedWidth !== null && turn.requestedWidth !== box.requestedWidth) {
      const centered = inColumn(box);
      box.requestedWidth = turn.requestedWidth;
      box.width = widthFor(turn.requestedWidth);
      if (centered) box.x = -box.width / 2;
    }
    const delta = height - box.height;
    if (Math.abs(delta) < 1) continue;
    const previousBottom = box.y + box.height;
    box.height = height;
    if (!inColumn(box)) continue;
    for (const other of placed) {
      if (other !== box && other.turnId !== null && other.y >= previousBottom - 1) other.y += delta;
    }
  }
  followAnchors(placed);
  growHolders(placed);
  seatLabels(placed, before);
  return placed;
}

/**
 * Moves each label as far as its shape moved in this pass, and puts one found outside its shape
 * back in the middle of it, as Excalidraw draws a bound label.
 */
function seatLabels(
  placed: MutableBox[],
  before: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
) {
  const byKey = new Map(placed.map((box) => [box.key, box]));
  for (const label of placed) {
    const shape = label.container == null ? undefined : byKey.get(label.container);
    const was = shape === undefined ? undefined : before.get(shape.key);
    if (shape === undefined || was === undefined) continue;
    const labelWas = before.get(label.key);
    if (labelWas !== undefined && label.x === labelWas.x && label.y === labelWas.y) {
      label.x += shape.x - was.x;
      label.y += shape.y - was.y;
    }
    const centreX = label.x + label.width / 2;
    const centreY = label.y + label.height / 2;
    const inside =
      centreX >= shape.x - label.width / 2 &&
      centreX <= shape.x + shape.width + label.width / 2 &&
      centreY >= shape.y - label.height / 2 &&
      centreY <= shape.y + shape.height + label.height / 2;
    if (inside) continue;
    label.x = shape.x + (shape.width - label.width) / 2;
    label.y = shape.y + (shape.height - label.height) / 2;
  }
}

/** A box the user drew around a drawing grows when a card in it grows, as the server sized it. */
function growHolders(placed: MutableBox[]) {
  for (const holder of placed) {
    if (holder.holds == null) continue;
    const held = placed.filter(
      (box) => box !== holder && box.group === holder.holds && box.holds == null,
    );
    if (held.length === 0) continue;
    const right = Math.max(...held.map((box) => box.x + box.width)) + HOLDER_PADDING_PX;
    const bottom = Math.max(...held.map((box) => box.y + box.height)) + HOLDER_PADDING_PX;
    holder.width = Math.max(holder.width, right - holder.x);
    holder.height = Math.max(holder.height, bottom - holder.y);
  }
}

/**
 * Puts each anchored box its anchor's distance from its turn's top or bottom edge, wherever that
 * edge now lies, then moves a region's cards down past any card above them that grew or was pushed
 * this pass.
 */
function followAnchors(placed: MutableBox[]) {
  const turnBoxes = new Map(
    placed.flatMap((box) => (box.turnId === null ? [] : [[box.turnId, box] as const])),
  );
  const regions = new Map<string, MutableBox[]>();
  for (const box of placed) {
    const anchor = box.anchor;
    const turn = anchor == null ? undefined : turnBoxes.get(anchor.turn);
    if (anchor == null || turn === undefined) continue;
    const at = turnEdgeY(turn, anchor.edge);
    box.y = at + anchor.dy;
    box.anchor = { ...anchor, at };
    if (box.card !== true) continue;
    // One region for every anchored card: a card left beside an earlier turn can grow down into
    // the space beside a later turn, where moveToLatestTurn put other cards.
    regions.set("", [...(regions.get("") ?? []), box]);
  }
  for (const cards of regions.values()) {
    const settled: MutableBox[] = [];
    // A card pushed down makes room below it in turn, as if it grew.
    const pushed = new Set<MutableBox>();
    for (const card of cards.toSorted((left, right) => left.y - right.y)) {
      for (const above of settled) {
        const beside = card.x >= above.x + above.width || above.x >= card.x + card.width;
        const moving = above.grew === true || pushed.has(above);
        if (!beside && moving && card.y < above.y + above.height + TURN_GAP_PX) {
          card.y = above.y + above.height + TURN_GAP_PX;
          pushed.add(card);
        }
      }
      if (card.anchor != null) card.anchor = { ...card.anchor, dy: card.y - card.anchor.at };
      settled.push(card);
    }
  }
}
