import { describe, expect, it } from "vite-plus/test";

import { TURN_INSET_PX, TURN_MAX_WIDTH_PX } from "./turnBoard";
import { tableWidthOf } from "./turnTableWidth";

// Stands in for the app's table rules: collapsed cells stay on one line, expanded ones wrap.
const STYLE = `
  .chat-markdown-table-container { overflow-x: auto; }
  .chat-markdown-table-container table { min-width: max-content; border-collapse: collapse; }
  .chat-markdown-table-container[data-expanded="false"] td { white-space: nowrap; }
  .chat-markdown-table-container[data-expanded="true"] table { min-width: 0; }
  td { padding: 0; }`;

function turnCard(cellWidths: ReadonlyArray<number>, expanded: boolean) {
  const card = document.createElement("div");
  card.style.width = "836px";
  card.style.padding = "0 10px";
  card.style.boxSizing = "border-box";
  const cells = cellWidths
    .map((width) => `<td><span style="display:inline-block;width:${width}px"></span></td>`)
    .join("");
  card.innerHTML = `<style>${STYLE}</style><div class="chat-markdown-table-container"
    data-expanded="${expanded}"><table><tbody><tr>${cells}</tr></tbody></table></div>`;
  document.body.append(card);
  return card;
}

describe("tableWidthOf", () => {
  it("asks for room for a table wider than the turn, and leaves its expanded state alone", () => {
    const card = turnCard([500, 500], true);
    try {
      expect(tableWidthOf(card)).toBe(836 + (1000 - 816));
      expect(
        card.querySelector<HTMLElement>(".chat-markdown-table-container")!.dataset.expanded,
      ).toBe("true");
    } finally {
      card.remove();
    }
  });

  it("asks for nothing when every table fits", () => {
    const card = turnCard([200, 200], false);
    try {
      expect(tableWidthOf(card)).toBeNull();
    } finally {
      card.remove();
    }
  });

  it("stops at the widest turn the board lays out", () => {
    const card = turnCard([1500, 1500], false);
    try {
      expect(tableWidthOf(card)).toBe(TURN_MAX_WIDTH_PX - 2 * TURN_INSET_PX);
    } finally {
      card.remove();
    }
  });
});
