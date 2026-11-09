import { ASSISTANT_CITATION_MAX_TEXT_LENGTH } from "@t3tools/contracts";
import { canvasSurfaceCardOf } from "@t3tools/shared/canvasSurfaceCard";

/**
 * The board's two right-click menus. Empty canvas shows T3's menu, whose "Canvas options…" hands
 * the same right-click back to Excalidraw. An element shows Excalidraw's own menu with one item,
 * Cite, put at its top. Excalidraw 0.18 has no API for menu items, so Cite is the one place T3
 * writes into Excalidraw's menu DOM; a browser test pins it to that version.
 */

interface SceneElement {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isDeleted?: boolean;
  readonly backgroundColor?: string;
  readonly containerId?: string | null;
  readonly text?: string;
  readonly customData?: Record<string, unknown>;
}

// How near an unfilled shape's outline a right-click still lands on the shape, in view pixels.
const OUTLINE_REACH_PX = 10;
const OUTLINED_TYPES = new Set(["rectangle", "ellipse", "diamond", "frame", "magicframe"]);

const inBox = (
  box: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
  reach = 0,
) => {
  const left = Math.min(box.x, box.x + box.width) - reach;
  const right = Math.max(box.x, box.x + box.width) + reach;
  const top = Math.min(box.y, box.y + box.height) - reach;
  const bottom = Math.max(box.y, box.y + box.height) + reach;
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
};

/**
 * Whether a right-click at a scene point lands on an element or the selection, where Excalidraw's
 * element menu belongs. An unfilled shape counts only near its outline, as Excalidraw hits it.
 */
export function canvasPointHitsElement(
  elements: ReadonlyArray<SceneElement>,
  selectedIds: Readonly<Record<string, boolean>>,
  point: { readonly x: number; readonly y: number },
  zoom: number,
) {
  const live = elements.filter((element) => !element.isDeleted);
  const selected = live.filter((element) => selectedIds[element.id]);
  if (selected.length > 0) {
    const left = Math.min(
      ...selected.map((element) => Math.min(element.x, element.x + element.width)),
    );
    const top = Math.min(
      ...selected.map((element) => Math.min(element.y, element.y + element.height)),
    );
    const right = Math.max(
      ...selected.map((element) => Math.max(element.x, element.x + element.width)),
    );
    const bottom = Math.max(
      ...selected.map((element) => Math.max(element.y, element.y + element.height)),
    );
    if (inBox({ x: left, y: top, width: right - left, height: bottom - top }, point)) return true;
  }
  const reach = OUTLINE_REACH_PX / zoom;
  return live.some((element) => {
    if (!inBox(element, point, reach)) return false;
    // A card or turn covers its box with T3's view, so only its rim reaches the canvas.
    if (element.customData?.t3Card !== undefined || element.customData?.t3Turn !== undefined) {
      return true;
    }
    const unfilled =
      OUTLINED_TYPES.has(element.type) &&
      (element.backgroundColor === undefined || element.backgroundColor === "transparent");
    if (!unfilled) return true;
    const inner = {
      x: Math.min(element.x, element.x + element.width) + reach,
      y: Math.min(element.y, element.y + element.height) + reach,
      width: Math.abs(element.width) - 2 * reach,
      height: Math.abs(element.height) - 2 * reach,
    };
    const labelled = live.some((text) => text.containerId === element.id && inBox(text, point));
    return labelled || inner.width <= 0 || inner.height <= 0 || !inBox(inner, point);
  });
}

/**
 * Opens Excalidraw's own canvas menu at a right-click's position. Excalidraw reads only the
 * position and pointer type of the event, so a synthetic one opens it where the click was.
 */
export function openExcalidrawCanvasMenu(
  canvas: Element,
  at: { readonly clientX: number; readonly clientY: number },
) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: at.clientX,
    clientY: at.clientY,
  });
  handedToExcalidraw.add(event);
  canvas.dispatchEvent(event);
}

const handedToExcalidraw = new WeakSet<Event>();

/** Whether a right-click is one T3 handed back to Excalidraw, which T3's menu lets through. */
export function isHandedToExcalidraw(event: Event) {
  return handedToExcalidraw.has(event);
}

/** Whether Excalidraw's open menu is its element menu, told apart by an element-only action. */
export function isElementContextMenu(
  contextMenu: { readonly items: ReadonlyArray<unknown> } | null | undefined,
) {
  return (
    contextMenu?.items.some(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        Reflect.get(item, "name") === "deleteSelectedElements",
    ) ?? false
  );
}

const CITE_ITEM_ID = "t3-cite";

/**
 * Puts Cite at the top of Excalidraw's rendered element menu, styled as its own items. Called after
 * every Excalidraw commit while the element menu is open; the item goes with the menu when it
 * closes. Returns whether the menu now holds the item.
 */
export function insertCiteMenuItem(root: ParentNode, onCite: () => void) {
  const menu = root.querySelector<HTMLElement>("ul.context-menu");
  if (menu === null) return false;
  if (menu.querySelector(`[data-testid="${CITE_ITEM_ID}"]`) !== null) return true;
  const item = document.createElement("li");
  item.dataset.testid = CITE_ITEM_ID;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "context-menu-item";
  const label = document.createElement("div");
  label.className = "context-menu-item__label";
  label.textContent = "Cite";
  const shortcut = document.createElement("kbd");
  shortcut.className = "context-menu-item__shortcut";
  button.append(label, shortcut);
  item.append(button);
  item.addEventListener("click", onCite);
  const separator = document.createElement("hr");
  separator.className = "context-menu-item-separator";
  menu.prepend(item, separator);
  return true;
}

/**
 * What a citation of an element quotes: a card's text, or a surface card's or HTML card's title,
 * a shape's label, a note's text, and the shape's kind when it has no words.
 */
export function canvasCitationText(element: SceneElement, elements: ReadonlyArray<SceneElement>) {
  const card = element.customData?.t3Card;
  const surface = canvasSurfaceCardOf(card);
  const cardRecord =
    typeof card === "object" && card !== null ? (card as Record<string, unknown>) : {};
  const label = elements.find((text) => text.containerId === element.id && !text.isDeleted)?.text;
  const quote =
    surface?.title ??
    (typeof cardRecord.text === "string" ? cardRecord.text : undefined) ??
    (typeof cardRecord.title === "string" ? cardRecord.title : undefined) ??
    label ??
    element.text;
  const words = quote?.trim() ? quote.trim() : `Canvas ${element.type}`;
  return words.slice(0, ASSISTANT_CITATION_MAX_TEXT_LENGTH);
}
