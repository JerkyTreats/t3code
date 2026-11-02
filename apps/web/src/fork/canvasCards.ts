import type { CanvasMark } from "./canvasMarks";

/** A T3 reading block the agent placed on the canvas, rendered by the app over its box. */
export interface CanvasCard {
  readonly id: string;
  readonly version: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly card:
    | { readonly kind: "markdown"; readonly text: string }
    | { readonly kind: "html"; readonly attachmentId: string; readonly title: string };
}

function cardOf(data: Record<string, unknown> | undefined): CanvasCard["card"] | null {
  const card = data?.t3Card;
  if (typeof card !== "object" || card === null) return null;
  const { kind, text, attachmentId, title } = card as Record<string, unknown>;
  if (kind === "markdown") return { kind, text: typeof text === "string" ? text : "" };
  if (kind === "html" && typeof attachmentId === "string" && attachmentId !== "") {
    return { kind, attachmentId, title: typeof title === "string" ? title : "HTML" };
  }
  return null;
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

const CANVAS_REVEAL_EVENT = "t3:canvas-reveal";

/**
 * Pans the open canvas to the card a citation quotes. A card is keyed by its canvas element id,
 * which no message in the thread history has, so a citation of one is found on the board.
 * Returns false when no board shows that card, so the caller can fall back.
 */
export function revealCanvasCard(source: Element | null, elementId: string) {
  if (source?.closest(".canvas-card") == null) return false;
  window.dispatchEvent(new CustomEvent(CANVAS_REVEAL_EVENT, { detail: elementId }));
  return true;
}

/** Calls `reveal` with each element id a citation asks the board to show. */
export function onCanvasReveal(reveal: (elementId: string) => void) {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === "string") reveal(event.detail);
  };
  window.addEventListener(CANVAS_REVEAL_EVENT, listener);
  return () => window.removeEventListener(CANVAS_REVEAL_EVENT, listener);
}
