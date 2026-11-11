import "~/index.css";

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
    const wheel = (target: Element, take = false, zoom = false) => {
      const event = new WheelEvent("wheel", {
        deltaY: 20,
        ctrlKey: zoom,
        bubbles: true,
        cancelable: true,
      });
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
    // Ctrl+wheel, and a trackpad pinch, zoom the board over any card instead of the app.
    expect(wheel(tall, false, true)).toBe(true);
    expect(wheel(plain, true, true)).toBe(true);
    // The file tree and source view scroll inside a shadow root, behind their host.
    const host = document.createElement("div");
    const shadowScroller = document.createElement("div");
    shadowScroller.style.cssText = "overflow-y: auto; height: 40px";
    const shadowTall = document.createElement("div");
    shadowTall.style.height = "400px";
    shadowScroller.append(shadowTall);
    host.attachShadow({ mode: "open" }).append(shadowScroller);
    layer.append(host);
    expect(wheel(shadowTall)).toBe(false);
    layer.remove();
  });
});

describe("the board's card layer", () => {
  it("never scrolls to bring a card's content into view, so cards and the composer stay put", () => {
    const root = document.createElement("div");
    root.className = "board-chrome";
    root.innerHTML = `
      <div data-chat-canvas style="position: relative; width: 400px; height: 300px">
        <div class="board-chat-card">
          <div class="turn-layer">
            <div class="canvas-card" data-canvas-card="surface"
              style="transform: translate(900px, 900px); width: 200px; height: 100px">
              <div style="width: 600px; height: 20px"><span data-crumb style="margin-left: 500px">a</span></div>
            </div>
          </div>
          <div data-chat-composer-overlay style="position: absolute; bottom: 0">draft</div>
        </div>
      </div>`;
    document.body.append(root);
    try {
      const composer = root.querySelector("[data-chat-composer-overlay]")!;
      const composerTop = composer.getBoundingClientRect().top;
      // A file card's breadcrumbs reveal their crumb when it goes live as the board pans onto it.
      root.querySelector("[data-crumb]")!.scrollIntoView({ block: "nearest", inline: "end" });
      expect(composer.getBoundingClientRect().top).toBe(composerTop);
      for (const box of root.querySelectorAll(".board-chat-card, .canvas-card")) {
        expect([box.scrollLeft, box.scrollTop]).toEqual([0, 0]);
      }
    } finally {
      root.remove();
    }
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
