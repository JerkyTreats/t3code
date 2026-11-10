import { describe, expect, it } from "vite-plus/test";

import { canvasMarkStamps, unseenCanvasMarkIds } from "./threadCanvasMarks.ts";

const turn = (id: string, y: number, height = 200) => ({
  id: `turn-box:${id}`,
  version: 3,
  type: "rectangle",
  x: 0,
  y,
  width: 800,
  height,
  customData: { t3Turn: id },
});
const note = {
  id: "note",
  version: 2,
  type: "text",
  x: 900,
  y: 40,
  width: 120,
  height: 25,
  text: "Show me this",
  originalText: "Show me this",
  strokeColor: "#1e1e1e",
};
const box = { id: "box", version: 4, type: "rectangle", x: 100, y: 50, width: 300, height: 100 };
const label = { id: "label", version: 1, type: "text", text: "api", containerId: "box" };
const card = {
  id: "card",
  version: 5,
  type: "rectangle",
  x: 1200,
  y: 0,
  width: 600,
  height: 400,
};
const arrow = {
  id: "arrow",
  version: 6,
  type: "arrow",
  x: 950,
  y: 10,
  width: 250,
  height: 20,
  points: [
    [0, 0],
    [250, 20],
  ],
  endBinding: { elementId: "card" },
};
const stroke = {
  id: "stroke",
  version: 7,
  type: "freedraw",
  x: 120,
  y: 60,
  width: 40,
  height: 10,
  points: [
    [0, 0],
    [40, 10],
  ],
};
const piece = {
  id: "drawing/a",
  version: 1,
  type: "rectangle",
  x: 2000,
  y: 0,
  width: 300,
  height: 200,
  customData: { t3Drawing: { id: "drawing" } },
};
const board = [turn("1", 0), turn("2", 260), note, box, label, card, arrow, stroke, piece];
const stamp = (elements: ReadonlyArray<object>, id: string) => canvasMarkStamps(elements).get(id);
const edit = (id: string, change: Record<string, unknown>) =>
  board.map((element) =>
    element.id === id ? { ...element, ...change, version: element.version + 1 } : element,
  );

// A note off the pixel grid, before and after the board saves the anchor it worked out for it.
const offGrid = board.map((e) =>
  e.id === "note" ? { ...e, y: 40.6 } : e.id === "turn-box:1" ? { ...e, y: 0.4 } : e,
);
const anchored = offGrid.map((e) =>
  e.id === "note"
    ? {
        ...e,
        version: 3,
        customData: { t3Below: { turn: "1", edge: "top", at: 0.4, dy: 40.6 - 0.4, x: 900 } },
      }
    : e,
);

describe("canvasMarkStamps", () => {
  it("stamps only the user's own marks, a labelled shape as one", () => {
    expect([...canvasMarkStamps(board).keys()].toSorted()).toEqual(
      ["arrow", "box", "card", "note", "stroke"].toSorted(),
    );
  });

  const holding = edit("box", { customData: { t3Holds: { drawing: "d" } } });
  it.each([
    [
      "the board shifting everything down with a turn",
      board,
      board.map((e) => ("y" in e ? { ...e, y: e.y + 22 } : e)),
    ],
    ["a bare version bump", board, edit("note", {})],
    ["a text re-measured to another size", board, edit("note", { width: 180, height: 50 })],
    [
      "a bound arrow re-routed by its card",
      board,
      edit("arrow", {
        points: [
          [0, 0],
          [260, 90],
        ],
      }),
    ],
    [
      "a box holding a drawing growing to fit it",
      holding,
      holding.map((e) => (e.id === "box" ? { ...e, height: 900, version: e.version + 1 } : e)),
    ],
    ["a note dragged sideways", board, edit("note", { x: 1000 })],
    [
      "a turn shrinking out from under a mark",
      board,
      board.map((e) =>
        e.id === "turn-box:1" ? { ...e, height: 40 } : e.id === "turn-box:2" ? { ...e, y: 100 } : e,
      ),
    ],
    ["the board saving the anchor it worked out", offGrid, anchored],
    [
      "the words under a mark being noted",
      board,
      edit("stroke", { customData: { t3Covers: "x" } }),
    ],
  ])("keeps every mark's stamp through %s", (_case, before, after) => {
    expect(canvasMarkStamps(after)).toEqual(canvasMarkStamps(before));
  });

  it.each([
    ["edited text", "note", { text: "Show me that", originalText: "Show me that" }],
    ["a recolor", "note", { strokeColor: "#e03131" }],
    ["a fill", "box", { backgroundColor: "#ffec99" }],
    ["a resize", "box", { width: 500 }],
    [
      "a stroke redrawn",
      "stroke",
      {
        points: [
          [0, 0],
          [10, 40],
        ],
      },
    ],
    ["an arrow pointed at another card", "arrow", { endBinding: { elementId: "box" } }],
    ["a note dragged within its turn", "note", { y: 120 }],
    ["a note dragged onto a turn", "note", { x: 100, y: 300 }],
    ["a stroke dragged onto the agent's drawing", "stroke", { x: 2050, y: 50 }],
    ["a placed panel shown another file", "card", { customData: { t3Card: { kind: "surface" } } }],
  ])("changes a mark's stamp for %s", (_case, id, change) => {
    expect(stamp(edit(id, change), id)).not.toBe(stamp(board, id));
  });

  it("changes a shape's stamp when its label is edited", () => {
    const relabelled = board.map((element) =>
      element.id === "label" ? { ...element, text: "gateway", version: 2 } : element,
    );
    expect(stamp(relabelled, "box")).not.toBe(stamp(board, "box"));
  });
});

describe("unseenCanvasMarkIds", () => {
  it("knows a mark by its content stamp, and by its old version stamp until then", () => {
    const seenMarks = Object.fromEntries(canvasMarkStamps(board));
    expect(unseenCanvasMarkIds(board, { seenMarks }).size).toBe(0);
    // Boards recorded each mark's version plus its labels' before content stamps.
    const legacy = { note: 2, box: 5, card: 5, arrow: 6, stroke: 7 };
    expect(unseenCanvasMarkIds(board, { seen: legacy }).size).toBe(0);
    expect([...unseenCanvasMarkIds(edit("note", { y: 41 }), { seen: legacy })]).toEqual(["note"]);
    // Stamps recorded before anchors, when a mark was named by what it overlapped.
    const byOverlap = { note: "zhsqaq.12swnqs", box: "1xf81bp.17nl6pk" };
    expect(unseenCanvasMarkIds(board, { seenMarks: byOverlap }).has("note")).toBe(false);
    expect(unseenCanvasMarkIds(board, { seenMarks: byOverlap }).has("box")).toBe(false);
    expect([...unseenCanvasMarkIds(edit("note", { y: 120 }), { seenMarks })]).toEqual(["note"]);
    expect([...unseenCanvasMarkIds(board, {})].toSorted()).toEqual(
      ["arrow", "box", "card", "note", "stroke"].toSorted(),
    );
  });
});
