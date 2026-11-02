import { ThreadCanvasSaveInput } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  coveredText,
  isUserMark,
  selectedNotes,
  toSavableElements,
  unseenSketchMarks,
  type CanvasMark,
} from "./canvasMarks";

const mark = (overrides: Partial<CanvasMark>): CanvasMark => ({
  id: "mark",
  type: "freedraw",
  version: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  isDeleted: false,
  ...overrides,
});

function fixture() {
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;top:0;left:0;width:0;height:0";
  const card = document.createElement("div");
  card.style.cssText = "position:absolute;top:0;left:0;width:400px";
  card.innerHTML = `
    <p style="margin:0;height:40px">First paragraph</p>
    <ul style="margin:0;padding:0"><li style="height:40px"><p style="margin:0">Nested item</p></li></ul>
    <p style="margin:0;height:40px">Last paragraph</p>`;
  layer.append(card);
  document.body.append(layer);
  return { layer, cards: [{ element: card }] };
}

describe("coveredText", () => {
  it("quotes only the blocks under the mark, innermost first", () => {
    const { layer, cards } = fixture();
    const circle = mark({ x: 10, y: 45, height: 70 });
    expect(coveredText(circle, cards, layer, 1)).toBe("Nested item / Last paragraph");
    layer.remove();
  });

  it("follows an arrow to its tip, not across its whole box", () => {
    const { layer, cards } = fixture();
    const arrow = mark({ type: "arrow", x: 600, y: 10, points: [[-500, 90]] });
    expect(coveredText(arrow, cards, layer, 1)).toBe("Last paragraph");
    layer.remove();
  });

  it("finds nothing for a mark beside the cards", () => {
    const { layer, cards } = fixture();
    expect(coveredText(mark({ x: 700 }), cards, layer, 1)).toBeNull();
    layer.remove();
  });
});

describe("toSavableElements", () => {
  it("passes the save's schema with values Excalidraw leaves on elements", () => {
    const encode = Schema.encodeUnknownExit(Schema.toCodecJson(ThreadCanvasSaveInput));
    const unsafe = [
      { id: "a", customData: undefined },
      { id: "b", customData: { x: Number.NaN } },
    ];
    const save = (elements: ReadonlyArray<unknown>) =>
      encode({ threadId: "thread", elements, appliedUpdateIds: [] })._tag;

    expect(save(unsafe)).toBe("Failure");
    expect(save(toSavableElements(unsafe))).toBe("Success");
  });
});

describe("marks", () => {
  it("counts only what the reader made", () => {
    expect(isUserMark(mark({}))).toBe(true);
    expect(isUserMark(mark({ customData: { t3Turn: "a" } }))).toBe(false);
    expect(isUserMark(mark({ customData: { t3Drawing: { id: "a" } } }))).toBe(false);
    expect(isUserMark(mark({ containerId: "box" }))).toBe(false);
    expect(isUserMark(mark({ isDeleted: true }))).toBe(false);
  });

  it("selects notes top to bottom, skipping empty text and shapes", () => {
    const low = mark({ id: "low", type: "text", text: "low", y: 50 });
    const high = mark({ id: "high", type: "text", text: "high", y: 10 });
    const empty = mark({ id: "empty", type: "text", text: "  " });
    const shape = mark({ id: "shape" });
    const selected = { low: true, high: true, empty: true, shape: true };
    const notes = selectedNotes([low, high, empty, shape], selected);
    expect(notes.map((note) => note.id)).toEqual(["high", "low"]);
  });

  it("wants a picture only for wordless marks the agent has not seen", () => {
    const stroke = mark({ id: "stroke", version: 3 });
    const seenStroke = mark({ id: "seen", version: 2 });
    const box = mark({ id: "box", type: "rectangle" });
    const label = mark({ id: "label", type: "text", text: "api", containerId: "box" });
    const note = mark({ id: "note", type: "text", text: "hi" });
    const marks = unseenSketchMarks([stroke, seenStroke, box, label, note], { seen: 2 });
    expect(marks.map((element) => element.id)).toEqual(["stroke"]);
  });
});
