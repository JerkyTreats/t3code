import type { ThreadCanvasElement } from "@t3tools/contracts";
import { type CanvasMarksSeen, unseenCanvasMarkIds } from "@t3tools/shared/threadCanvasMarks";

import type { TurnCard } from "./turnBoard";

/** The parts of an Excalidraw element that say whose it is and where it sits. */
export interface CanvasMark {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isDeleted: boolean;
  readonly containerId?: string | null;
  readonly text?: string;
  readonly points?: ReadonlyArray<readonly [number, number]>;
  readonly customData?: Record<string, unknown>;
}

const TEXT_BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr, th, td";
const MAX_COVERED_TEXT_CHARS = 400;
const ARROW_TIP_REACH_PX = 12;

/** The turn an agent's drawing belongs to, which the camera keeps in view with it. */
export function drawingTurnOf(element: { readonly customData?: Record<string, unknown> }) {
  const data = element.customData?.t3Drawing;
  const turn = typeof data === "object" && data !== null ? Reflect.get(data, "turn") : null;
  return typeof turn === "string" ? turn : null;
}

/** Whether the reader made this, rather than T3 or an agent. Labels belong to their shape. */
export function isUserMark(element: CanvasMark) {
  const data = element.customData;
  return (
    !element.isDeleted &&
    !element.containerId &&
    data?.t3Turn === undefined &&
    data?.t3Piece === undefined &&
    data?.t3Drawing === undefined
  );
}

/**
 * Elements as the save accepts them. The save rejects a whole scene over one `undefined` or `NaN`,
 * and Excalidraw elements can carry either, so what goes over the wire is what JSON keeps.
 */
export function toSavableElements(elements: ReadonlyArray<unknown>) {
  return JSON.parse(JSON.stringify(elements)) as ReadonlyArray<ThreadCanvasElement>;
}

/** Marks with no words, which an agent can only see in a picture, and that it has not seen yet. */
export function unseenSketchMarks<Element extends CanvasMark>(
  elements: ReadonlyArray<Element>,
  known: CanvasMarksSeen,
) {
  const unseen = unseenCanvasMarkIds(elements, known);
  const labelled = new Set(elements.flatMap((element) => element.containerId ?? []));
  return elements.filter(
    (element) =>
      isUserMark(element) &&
      element.type !== "text" &&
      !labelled.has(element.id) &&
      unseen.has(element.id),
  );
}

/** Every mark of the reader's the agent has not seen, words or not, so a send can carry them. */
export function unseenMarks<Element extends CanvasMark>(
  elements: ReadonlyArray<Element>,
  known: CanvasMarksSeen,
) {
  const unseen = unseenCanvasMarkIds(elements, known);
  return elements.filter((element) => isUserMark(element) && unseen.has(element.id));
}

/** The part of a mark that points at something: an arrow's tip, anything else's whole box. */
function reachOf(mark: CanvasMark) {
  const tip = mark.type === "arrow" || mark.type === "line" ? mark.points?.at(-1) : undefined;
  return tip === undefined
    ? mark
    : {
        x: mark.x + tip[0] - ARROW_TIP_REACH_PX,
        y: mark.y + tip[1] - ARROW_TIP_REACH_PX,
        width: 2 * ARROW_TIP_REACH_PX,
        height: 2 * ARROW_TIP_REACH_PX,
      };
}

/** The agent's markdown cards as rendered, which hit-test like turn cards. An html card's page is a frame and keeps its words. */
export function renderedCardsIn(layer: HTMLElement) {
  return [...layer.querySelectorAll<HTMLElement>(".canvas-card")].map((element) => ({ element }));
}

/**
 * The turn or card text under a mark. Turns and cards are DOM above the canvas, so neither a
 * scene export nor the element's coordinates can tell an agent what the reader circled.
 */
export function coveredText(
  mark: CanvasMark,
  cards: ReadonlyArray<Pick<TurnCard, "element">>,
  layer: HTMLElement,
  zoom: number,
) {
  const origin = layer.getBoundingClientRect();
  const reach = reachOf(mark);
  const left = origin.left + reach.x * zoom;
  const top = origin.top + reach.y * zoom;
  const right = left + reach.width * zoom;
  const bottom = top + reach.height * zoom;
  const touches = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top;
  };
  const blocks = cards
    .filter((card) => touches(card.element))
    .flatMap((card) => [...card.element.querySelectorAll(TEXT_BLOCKS)])
    .filter(touches);
  // The innermost block is the one the mark is on, and it keeps a list item from repeating.
  const text = blocks
    .filter((block) => !blocks.some((other) => other !== block && block.contains(other)))
    .map((block) => block.textContent?.trim() ?? "")
    .filter((words) => words !== "")
    .join(" / ");
  return text === "" ? null : text.slice(0, MAX_COVERED_TEXT_CHARS);
}
