import { describe, expect, it } from "vite-plus/test";

import { cardSelectionOf, citeMarkSkeleton, citeMessage } from "./cardSelection";

function fixture() {
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;top:20px;left:10px;width:0;height:0";
  layer.innerHTML = `
    <div class="canvas-card" style="position:absolute;top:0;left:0;width:400px">
      <p id="row" style="margin:0;height:40px;line-height:40px">PENG-274: NetBox token</p>
    </div>
    <p id="outside">Not a card</p>`;
  document.body.append(layer);
  const select = (node: Node) => {
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.addRange(range);
    return selection;
  };
  return { layer, select };
}

describe("cardSelectionOf", () => {
  it("reads the highlighted words of a card and where they sit on the canvas", () => {
    const { layer, select } = fixture();
    const selection = select(layer.querySelector("#row")!);
    const found = cardSelectionOf(selection, layer, 2);
    expect(found?.text).toBe("PENG-274: NetBox token");
    // The glyph box sits inside the 40px line, halved by the zoom of 2.
    expect(found?.x).toBeCloseTo(0, 0);
    expect(found?.y).toBeGreaterThanOrEqual(0);
    expect(found?.y).toBeLessThan(20);
    expect(found?.height).toBeGreaterThan(0);
    expect(found?.height).toBeLessThanOrEqual(20);
    expect(found?.width).toBeGreaterThan(10);
    expect(citeMessage(found!)).toBe('Cite the source of "PENG-274: NetBox token".');
    expect(citeMarkSkeleton(found!)).toMatchObject({
      type: "rectangle",
      x: -3,
      y: found!.y - 3,
      customData: { t3Covers: "PENG-274: NetBox token" },
    });
    window.getSelection()?.removeAllRanges();
    layer.remove();
  });

  it("ignores a selection outside the cards, and a collapsed one", () => {
    const { layer, select } = fixture();
    expect(cardSelectionOf(select(layer.querySelector("#outside")!), layer, 1)).toBeNull();
    const selection = window.getSelection()!;
    selection.collapse(layer.querySelector("#row")!, 0);
    expect(cardSelectionOf(selection, layer, 1)).toBeNull();
    selection.removeAllRanges();
    layer.remove();
  });
});
