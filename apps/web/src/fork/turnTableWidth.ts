import { TURN_INSET_PX, TURN_MAX_WIDTH_PX } from "./turnBoard";

const naturalWidths = new WeakMap<
  HTMLTableElement,
  { readonly text: number; readonly width: number }
>();

/** A table's width with single-line cells, measured once per version of its text. */
function naturalWidth(container: HTMLElement, table: HTMLTableElement) {
  const text = table.textContent?.length ?? 0;
  const known = naturalWidths.get(table);
  if (known?.text === text) return known.width;
  // Expanded cells wrap to fit any width, so the collapsed layout says what the table wants.
  const expanded = container.dataset.expanded;
  container.dataset.expanded = "false";
  const width = table.offsetWidth;
  if (expanded === undefined) delete container.dataset.expanded;
  else container.dataset.expanded = expanded;
  naturalWidths.set(table, { text, width });
  return width;
}

/**
 * The width a turn card asks for so its widest markdown table fits without scrolling sideways,
 * or null when every table already fits. Capped at the widest turn the board lays out.
 */
export function tableWidthOf(card: HTMLElement): number | null {
  let wanted: number | null = null;
  for (const container of card.querySelectorAll<HTMLElement>(".chat-markdown-table-container")) {
    const table = container.querySelector("table");
    if (table === null || container.clientWidth === 0) continue;
    const extra = naturalWidth(container, table) - container.clientWidth;
    if (extra > 1) wanted = Math.max(wanted ?? 0, card.clientWidth + extra);
  }
  return wanted === null
    ? null
    : Math.min(Math.ceil(wanted), TURN_MAX_WIDTH_PX - 2 * TURN_INSET_PX);
}
