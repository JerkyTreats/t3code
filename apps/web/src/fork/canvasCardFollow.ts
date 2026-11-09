import { type CardAnchor, cardAnchorOf } from "@t3tools/shared/threadCanvasDrawing";

/**
 * Pieces a chat drew from its card on the board move with that card. The board runs this on every
 * scene edit (never on a pan) and applies the changes outside undo, so undoing a card's move puts
 * its pieces back too.
 */

interface FollowElement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly isDeleted?: boolean;
  readonly containerId?: string | null;
  readonly customData?: unknown;
}

type Spot = { readonly x: number; readonly y: number };

export type CardFollowChange =
  | { readonly kind: "move"; readonly x: number; readonly y: number }
  | { readonly kind: "anchor"; readonly anchor: CardAnchor };

// A rewritten offset adds back to the piece's position only up to float error.
const SAME_SPOT_PX = 0.01;

const sameSpot = (left: Spot, right: Spot) =>
  Math.abs(left.x - right.x) < SAME_SPOT_PX && Math.abs(left.y - right.y) < SAME_SPOT_PX;

/**
 * Which pieces move where. A piece off its card's position plus offset follows the card if the card
 * moved since `lastCards`, and otherwise keeps its spot under a rewritten offset; labels ride along.
 * Null when no piece follows a card; else also the card positions to pass as `lastCards` next.
 */
export function followCards(
  elements: ReadonlyArray<FollowElement>,
  lastCards: ReadonlyMap<string, Spot>,
): {
  readonly changes: ReadonlyMap<string, CardFollowChange>;
  readonly cards: Map<string, Spot>;
} | null {
  const anchored = elements.flatMap((element) => {
    const anchor = element.isDeleted ? null : cardAnchorOf(element);
    return anchor === null ? [] : [{ element, anchor }];
  });
  if (anchored.length === 0) return null;
  const wanted = new Set(anchored.map(({ anchor }) => anchor.card));
  const cards = new Map<string, Spot>();
  for (const element of elements) {
    if (!element.isDeleted && wanted.has(element.id)) {
      cards.set(element.id, { x: element.x, y: element.y });
    }
  }
  const changes = new Map<string, CardFollowChange>();
  const shifts = new Map<string, Spot>();
  for (const { element, anchor } of anchored) {
    const card = cards.get(anchor.card);
    // A piece whose card is gone stays where it is.
    if (card === undefined) continue;
    const spot = { x: card.x + anchor.dx, y: card.y + anchor.dy };
    if (sameSpot(spot, element)) continue;
    const last = lastCards.get(anchor.card);
    if (last !== undefined && !sameSpot(last, card)) {
      changes.set(element.id, { kind: "move", ...spot });
      shifts.set(element.id, { x: spot.x - element.x, y: spot.y - element.y });
    } else {
      changes.set(element.id, {
        kind: "anchor",
        anchor: { card: anchor.card, dx: element.x - card.x, dy: element.y - card.y },
      });
    }
  }
  for (const element of elements) {
    const shift =
      element.isDeleted || typeof element.containerId !== "string"
        ? undefined
        : shifts.get(element.containerId);
    if (shift === undefined || changes.has(element.id)) continue;
    changes.set(element.id, { kind: "move", x: element.x + shift.x, y: element.y + shift.y });
  }
  return { changes, cards };
}
