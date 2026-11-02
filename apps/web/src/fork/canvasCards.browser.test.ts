import { describe, expect, it } from "vite-plus/test";

import { canvasCardsOf, onCanvasReveal, revealCanvasCard, sameCanvasCards } from "./canvasCards";
import type { CanvasMark } from "./canvasMarks";

const element = (overrides: Partial<CanvasMark>): CanvasMark => ({
  id: "e",
  type: "rectangle",
  version: 1,
  x: 0,
  y: 0,
  width: 480,
  height: 320,
  isDeleted: false,
  ...overrides,
});

describe("canvasCardsOf", () => {
  it("keeps live markdown and html cards and skips everything else", () => {
    const cards = canvasCardsOf([
      element({ id: "md", customData: { t3Card: { kind: "markdown", text: "# Hi" } } }),
      element({
        id: "page",
        customData: { t3Card: { kind: "html", attachmentId: "a-1-html", title: "Chart" } },
      }),
      element({ id: "gone", isDeleted: true, customData: { t3Card: { kind: "markdown" } } }),
      element({ id: "broken", customData: { t3Card: { kind: "html", attachmentId: "" } } }),
      element({ id: "box", customData: { t3Drawing: { id: "d" } } }),
    ]);
    expect(cards.map((card) => [card.id, card.card])).toEqual([
      ["md", { kind: "markdown", text: "# Hi" }],
      ["page", { kind: "html", attachmentId: "a-1-html", title: "Chart" }],
    ]);
  });
});

describe("sameCanvasCards", () => {
  it("treats a moved or edited card as a change and an identical scene as none", () => {
    const [card] = canvasCardsOf([
      element({ id: "md", customData: { t3Card: { kind: "markdown", text: "x" } } }),
    ]);
    expect(card).toBeDefined();
    if (card === undefined) return;
    expect(sameCanvasCards([card], [{ ...card }])).toBe(true);
    expect(sameCanvasCards([card], [{ ...card, x: 10 }])).toBe(false);
    expect(sameCanvasCards([card], [{ ...card, version: 2 }])).toBe(false);
    expect(sameCanvasCards([card], [])).toBe(false);
  });
});

describe("revealCanvasCard", () => {
  it("asks the board for a card a citation quotes, and declines anything else", () => {
    const asked: string[] = [];
    const stop = onCanvasReveal((id) => asked.push(id));
    const card = document.createElement("div");
    card.className = "canvas-card";
    const source = document.createElement("div");
    card.append(source);
    expect(revealCanvasCard(source, "map/asks")).toBe(true);
    expect(revealCanvasCard(document.createElement("div"), "msg-1")).toBe(false);
    expect(revealCanvasCard(null, "msg-2")).toBe(false);
    stop();
    expect(asked).toEqual(["map/asks"]);
  });
});
