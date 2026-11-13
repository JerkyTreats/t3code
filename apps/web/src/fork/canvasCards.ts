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

const sameContent = (left: CanvasCard["card"], right: CanvasCard["card"]) =>
  left.kind === "markdown" && right.kind === "markdown"
    ? left.text === right.text
    : JSON.stringify(left) === JSON.stringify(right);

/**
 * Whether a scene change left every card what it was, so React can skip it. Where a card sits is
 * placeCards' to keep, so a drag or resize re-renders nothing; only an html card renders its height.
 */
export function sameCanvasCards(left: ReadonlyArray<CanvasCard>, right: ReadonlyArray<CanvasCard>) {
  return (
    left.length === right.length &&
    left.every((card, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        card.id === other.id &&
        sameContent(card.card, other.card) &&
        (card.card.kind !== "html" || card.height === other.height)
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

const canScroll = (overflow: string) =>
  overflow === "auto" || overflow === "scroll" || overflow === "overlay";

/**
 * Whether anything the wheel passes through on its way to the layer can still scroll its way.
 * The path, not the parent chain, so a scroller inside a shadow root counts: the file tree and
 * the source view render into one, and the event reaches the layer retargeted to their host.
 */
function scrollsInside(event: WheelEvent, layer: HTMLElement) {
  const vertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
  for (const node of event.composedPath()) {
    if (node === layer) break;
    if (!(node instanceof Element)) continue;
    const style = getComputedStyle(node);
    const scrolls = vertical
      ? canScroll(style.overflowY) &&
        node.scrollHeight > node.clientHeight &&
        (event.deltaY < 0
          ? node.scrollTop > 0
          : node.scrollTop + node.clientHeight < node.scrollHeight - 1)
      : canScroll(style.overflowX) &&
        node.scrollWidth > node.clientWidth &&
        (event.deltaX < 0
          ? node.scrollLeft > 0
          : node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
    if (scrolls) return true;
  }
  return false;
}

/**
 * Whether a wheel over the card layer pans or zooms the board. Content that scrolls keeps the
 * wheel, and so does content that took it already, such as a terminal scrolling its own buffer.
 * Ctrl/Cmd+wheel and a trackpad pinch always zoom the board, or the browser zooms the whole app.
 */
export function wheelPansBoard(event: WheelEvent, layer: HTMLElement) {
  if (event.ctrlKey || event.metaKey) return true;
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
