import { ASSISTANT_CITATION_MAX_TEXT_LENGTH } from "@t3tools/contracts";
import { canvasSurfaceCardOf } from "@t3tools/shared/canvasSurfaceCard";

/**
 * The board's two right-click menus. Where Excalidraw would open its canvas menu, T3's menu shows
 * instead, and its "Canvas options…" hands the same right-click back to Excalidraw. An element shows Excalidraw's own menu with one item,
 * Cite, put at its top. Excalidraw 0.18 has no API for menu items, so Cite is the one place T3
 * writes into Excalidraw's menu DOM; a browser test pins it to that version.
 */

interface SceneElement {
  readonly id: string;
  readonly type: string;
  readonly isDeleted?: boolean;
  readonly containerId?: string | null;
  readonly text?: string;
  readonly customData?: Record<string, unknown>;
}

/** Where a right-click on Excalidraw's canvas landed, kept until Excalidraw picks its menu. */
export interface CanvasRightClick {
  readonly canvas: Element;
  readonly clientX: number;
  readonly clientY: number;
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

const menuHas = (
  contextMenu: { readonly items: ReadonlyArray<unknown> } | null | undefined,
  name: string,
) =>
  contextMenu?.items.some(
    (item) => typeof item === "object" && item !== null && Reflect.get(item, "name") === name,
  ) ?? false;

/**
 * Whether Excalidraw's open menu is its canvas menu, which it opens when its own hit test finds no
 * element under the click. Told apart by canvas-only actions, in edit and view mode.
 */
export function isCanvasContextMenu(
  contextMenu: { readonly items: ReadonlyArray<unknown> } | null | undefined,
) {
  return menuHas(contextMenu, "selectAll") || menuHas(contextMenu, "viewMode");
}

/** Whether Excalidraw's open menu is its element menu, told apart by an element-only action. */
export function isElementContextMenu(
  contextMenu: { readonly items: ReadonlyArray<unknown> } | null | undefined,
) {
  return menuHas(contextMenu, "deleteSelectedElements");
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
