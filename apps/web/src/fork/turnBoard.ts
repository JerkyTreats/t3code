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
}

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
 * Places every turn. Boxes the reader moved stay put. A turn still in the column inserts space
 * when it changes height, so everything below it, marks included, moves with it. Earlier turns
 * loaded from history land above the turns they precede.
 */
export function layoutTurns(
  boxes: ReadonlyArray<BoardBox>,
  turns: ReadonlyArray<MeasuredTurn>,
): ReadonlyArray<BoardBox> {
  const placed: MutableBox[] = boxes.map((box) => ({ ...box }));
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
      if (other !== box && other.y >= previousBottom - 1) other.y += delta;
    }
  }
  return placed;
}
