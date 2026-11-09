import { type CanvasSurfaceCard, canvasSurfaceCardOf } from "@t3tools/shared/canvasSurfaceCard";

import type { CanvasMark } from "./canvasMarks";

/** A T3 card over its canvas box: the agent's writing, or a panel tab the user placed. */
export interface CanvasCard {
  readonly id: string;
  readonly version: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly card:
    | { readonly kind: "markdown"; readonly text: string }
    | { readonly kind: "html"; readonly attachmentId: string; readonly title: string }
    | CanvasSurfaceCard;
}

function cardOf(data: Record<string, unknown> | undefined): CanvasCard["card"] | null {
  const card = data?.t3Card;
  if (typeof card !== "object" || card === null) return null;
  const { kind, text, attachmentId, title } = card as Record<string, unknown>;
  if (kind === "markdown") return { kind, text: typeof text === "string" ? text : "" };
  if (kind === "html" && typeof attachmentId === "string" && attachmentId !== "") {
    return { kind, attachmentId, title: typeof title === "string" ? title : "HTML" };
  }
  return canvasSurfaceCardOf(card);
}

/** The live cards in the scene, in scene order. */
export function canvasCardsOf(elements: ReadonlyArray<CanvasMark>): ReadonlyArray<CanvasCard> {
  return elements.flatMap((element) => {
    const card = element.isDeleted ? null : cardOf(element.customData);
    return card === null
      ? []
      : [
          {
            id: element.id,
            version: element.version,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            card,
          },
        ];
  });
}

/** Whether a scene change left every card where and what it was, so React can skip it. */
export function sameCanvasCards(left: ReadonlyArray<CanvasCard>, right: ReadonlyArray<CanvasCard>) {
  return (
    left.length === right.length &&
    left.every((card, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        card.id === other.id &&
        card.version === other.version &&
        card.x === other.x &&
        card.y === other.y &&
        card.width === other.width &&
        card.height === other.height
      );
    })
  );
}

type RevealElement = (elementId: string) => boolean;
const revealers = new Set<RevealElement>();

/**
 * Pans the open canvas to the element a citation quotes: a card, a shape or a note. An element is
 * keyed by its canvas element id, which no message in the thread history has, so a citation of
 * one is found on a mounted board. Returns false when no board shows that element, so the caller
 * can fall back to the thread's history.
 */
export function revealCanvasElement(elementId: string) {
  for (const reveal of revealers) if (reveal(elementId)) return true;
  return false;
}

/** Registers a mounted board, whose `reveal` shows an element it holds and reports whether it did. */
export function onCanvasReveal(reveal: RevealElement) {
  revealers.add(reveal);
  return () => {
    revealers.delete(reveal);
  };
}

function scrollsInside(event: WheelEvent, layer: HTMLElement) {
  let node = event.target instanceof Element ? event.target : null;
  while (node !== null && node !== layer) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight &&
      (event.deltaY < 0
        ? node.scrollTop > 0
        : node.scrollTop + node.clientHeight < node.scrollHeight - 1)
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Whether a wheel over the card layer pans the board. Content that scrolls keeps the wheel, and
 * so does content that took it already, such as a terminal scrolling its own buffer.
 */
export function wheelPansBoard(event: WheelEvent, layer: HTMLElement) {
  return !event.defaultPrevented && !scrollsInside(event, layer);
}

/** The height each rendered markdown card needs to show all of its text, by element id. */
export function fittedCardHeights(layer: HTMLElement | null, inset: number) {
  const heights = new Map<string, number>();
  for (const card of layer?.querySelectorAll<HTMLElement>(
    '.canvas-card[data-canvas-card="markdown"]',
  ) ?? []) {
    const content = card.firstElementChild;
    const id = card.dataset.canvasCardId;
    if (!(content instanceof HTMLElement) || id === undefined) continue;
    const style = getComputedStyle(card);
    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    heights.set(id, Math.ceil(content.offsetHeight + padding) + 2 * inset);
  }
  return heights;
}
