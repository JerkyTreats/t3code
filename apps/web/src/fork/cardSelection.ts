const CARD_SELECTOR = ".canvas-card, .turn-card";
const MAX_CITED_TEXT_CHARS = 400;
const CITE_MARK_PAD_PX = 3;
const CITE_STROKE_COLOR = "#e03131";

/** Words the reader selected in a card, with the box they fill on the canvas. */
export interface CardSelection {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const inCard = (node: Node | null) =>
  node === null
    ? null
    : ((node instanceof Element ? node : node.parentElement)?.closest(CARD_SELECTOR) ?? null);

/**
 * The live DOM selection when it lies within one card above the canvas, in scene coordinates.
 * Cards are DOM, so this is the only reading of what was highlighted that survives a redraw.
 */
export function cardSelectionOf(
  selection: Selection | null,
  layer: HTMLElement,
  zoom: number,
): CardSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const card = inCard(range.startContainer);
  if (card === null || !layer.contains(card) || card !== inCard(range.endContainer)) return null;
  const text = range.toString().replace(/\s+/g, " ").trim();
  if (text === "") return null;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const origin = layer.getBoundingClientRect();
  return {
    text: text.slice(0, MAX_CITED_TEXT_CHARS),
    x: (rect.left - origin.left) / zoom,
    y: (rect.top - origin.top) / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
  };
}

/** The message a cite sends. The server matches the quoted words back to the mark. */
export function citeMessage(selection: CardSelection) {
  return `Cite the source of ${JSON.stringify(selection.text)}.`;
}

/** The skeleton of the mark a cite leaves on the canvas: a thin red box around the words. */
export function citeMarkSkeleton(selection: CardSelection) {
  return {
    type: "rectangle" as const,
    x: selection.x - CITE_MARK_PAD_PX,
    y: selection.y - CITE_MARK_PAD_PX,
    width: selection.width + 2 * CITE_MARK_PAD_PX,
    height: selection.height + 2 * CITE_MARK_PAD_PX,
    strokeColor: CITE_STROKE_COLOR,
    strokeWidth: 1,
    roughness: 0,
    roundness: { type: 3 as const },
    customData: { t3Covers: selection.text },
  };
}
