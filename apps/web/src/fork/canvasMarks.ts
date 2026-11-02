import type { ThreadCanvasElement } from "@t3tools/contracts";

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

const TEXT_BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr";
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

/** The selected notes in reading order, which is the order they are sent to the agent. */
export function selectedNotes<Element extends CanvasMark>(
  elements: ReadonlyArray<Element>,
  selectedIds: Readonly<Record<string, unknown>>,
) {
  return elements
    .filter(
      (element) =>
        selectedIds[element.id] === true &&
        isUserMark(element) &&
        element.type === "text" &&
        element.text?.trim(),
    )
    .toSorted((left, right) => left.y - right.y);
}

/** Matches the server's stamp: a shape changes when it or its label does. */
function stampsOf(elements: ReadonlyArray<CanvasMark>) {
  const stamps = new Map<string, number>();
  for (const element of elements) {
    if (element.isDeleted) continue;
    const owner = element.containerId ?? element.id;
    stamps.set(owner, (stamps.get(owner) ?? 0) + element.version);
  }
  return stamps;
}

/** Marks with no words, which an agent can only see in a picture, and that it has not seen yet. */
export function unseenSketchMarks<Element extends CanvasMark>(
  elements: ReadonlyArray<Element>,
  seen: Readonly<Record<string, number>>,
) {
  const stamps = stampsOf(elements);
  const labelled = new Set(elements.flatMap((element) => element.containerId ?? []));
  return elements.filter(
    (element) =>
      isUserMark(element) &&
      element.type !== "text" &&
      !labelled.has(element.id) &&
      seen[element.id] !== stamps.get(element.id),
  );
}

/** Every mark of the reader's the agent has not seen, words or not, so a send can carry them. */
export function unseenMarks<Element extends CanvasMark>(
  elements: ReadonlyArray<Element>,
  seen: Readonly<Record<string, number>>,
) {
  const stamps = stampsOf(elements);
  return elements.filter(
    (element) => isUserMark(element) && seen[element.id] !== stamps.get(element.id),
  );
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

/**
 * The turn text under a mark. Turns are DOM above the canvas, so neither a scene export nor the
 * element's coordinates can tell an agent what the reader circled.
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
