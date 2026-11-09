import { describe, expect, it } from "vite-plus/test";

import {
  canvasCardsOf,
  fittedCardHeights,
  onCanvasReveal,
  revealCanvasElement,
  sameCanvasCards,
  wheelPansBoard,
} from "./canvasCards";
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

describe("revealCanvasElement", () => {
  it("asks each mounted board for the element a citation quotes, and declines when none has it", () => {
    const asked: string[] = [];
    const stop = onCanvasReveal((id) => {
      asked.push(id);
      return id === "map/asks";
    });
    expect(revealCanvasElement("map/asks")).toBe(true);
    expect(revealCanvasElement("msg-1")).toBe(false);
    stop();
    expect(revealCanvasElement("map/asks")).toBe(false);
    expect(asked).toEqual(["map/asks", "msg-1"]);
  });
});

describe("wheelPansBoard", () => {
  it("leaves the wheel to content that scrolls or already took it, and pans otherwise", () => {
    const layer = document.createElement("div");
    const scroller = document.createElement("div");
    scroller.style.cssText = "overflow-y: auto; height: 40px";
    const tall = document.createElement("div");
    tall.style.height = "400px";
    scroller.append(tall);
    const plain = document.createElement("div");
    layer.append(scroller, plain);
    document.body.append(layer);
    const wheel = (target: Element, take = false) => {
      const event = new WheelEvent("wheel", { deltaY: 20, bubbles: true, cancelable: true });
      let pans = false;
      layer.addEventListener("wheel", (seen) => (pans = wheelPansBoard(seen, layer)), {
        once: true,
      });
      if (take) target.addEventListener("wheel", (seen) => seen.preventDefault(), { once: true });
      target.dispatchEvent(event);
      return pans;
    };
    expect(wheel(plain)).toBe(true);
    expect(wheel(tall)).toBe(false);
    // A terminal scrolls its buffer without any overflow, and takes the wheel to say so.
    expect(wheel(plain, true)).toBe(false);
    layer.remove();
  });
});

describe("fittedCardHeights", () => {
  it("measures each markdown card's text, padding and inset, whatever height its box has", () => {
    const layer = document.createElement("div");
    layer.innerHTML = `
      <div class="canvas-card" data-canvas-card="markdown" data-canvas-card-id="short"
        style="height: 900px; padding: 12px 16px; overflow: auto"><div style="height: 100px"></div></div>
      <div class="canvas-card" data-canvas-card="markdown" data-canvas-card-id="long"
        style="height: 50px; padding: 12px 16px; overflow: auto"><div style="height: 400px"></div></div>
      <div class="canvas-card" data-canvas-card="html" data-canvas-card-id="page"><div></div></div>`;
    document.body.append(layer);
    try {
      expect(fittedCardHeights(layer, 12)).toEqual(
        new Map([
          ["short", 100 + 24 + 24],
          ["long", 400 + 24 + 24],
        ]),
      );
    } finally {
      layer.remove();
    }
  });
});
