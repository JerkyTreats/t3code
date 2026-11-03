import type { ThreadCanvasElement, ThreadCanvasScene, ThreadCanvasShape } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { type DrawInput, planDrawing } from "./threadCanvasPlan.ts";

const box = (id: string, x: number, y: number, text?: string): ThreadCanvasShape => ({
  id,
  type: "rectangle",
  x,
  y,
  ...(text === undefined ? {} : { text }),
});
const node = (id: string): ThreadCanvasShape => ({ id, type: "rectangle", text: id });
const link = (id: string, start: string, end: string): ThreadCanvasShape => ({
  id,
  type: "arrow",
  start,
  end,
});
const turn: ThreadCanvasElement = {
  id: "turn-box:1",
  type: "rectangle",
  version: 3,
  x: -430,
  y: 0,
  width: 860,
  height: 300,
  customData: { t3Turn: "1", t3TurnTitle: "Show me" },
};
const empty: ThreadCanvasScene = { revision: 1, elements: [turn] };

const plan = (scene: ThreadCanvasScene, draw: DrawInput) =>
  planDrawing({ scene, draw, randomInt: () => 7, now: 1 });
const live = (elements: ReadonlyArray<ThreadCanvasElement>, id: string) =>
  elements.find((element) => element.id === id && element.isDeleted !== true);
const drag = (scene: ThreadCanvasScene, id: string, dx: number, dy: number): ThreadCanvasScene => ({
  ...scene,
  elements: scene.elements.map((element) =>
    element.id === id
      ? { ...element, x: Number(element.x) + dx, y: Number(element.y) + dy, version: 50 }
      : element,
  ),
});
const applied = (scene: ThreadCanvasScene, draw: DrawInput): ThreadCanvasScene => ({
  ...scene,
  elements: plan(scene, draw).elements,
});

describe("planDrawing", () => {
  it("builds a markdown card as one box carrying its text, with no label", () => {
    const { elements, report } = plan(empty, {
      drawingId: "d",
      shapes: [{ id: "notes", type: "markdown", text: "# Plan\n\n- one\n- two" }],
    });
    const card = live(elements, "d/notes");
    expect(card).toMatchObject({
      type: "rectangle",
      width: 480,
      height: 320,
      customData: { t3Card: { kind: "markdown", text: "# Plan\n\n- one\n- two" } },
    });
    expect(live(elements, "d/notes/label")).toBeUndefined();
    expect(report.clippedLabels).toEqual([]);
  });

  it("builds an html card around the attachment it was given, at the size asked for", () => {
    const { elements } = plan(empty, {
      drawingId: "d",
      shapes: [
        {
          id: "chart",
          type: "html",
          attachmentId: "t-1-html",
          title: "Burn",
          width: 900,
          height: 400,
        },
      ],
    });
    expect(live(elements, "d/chart")).toMatchObject({
      type: "rectangle",
      width: 900,
      height: 400,
      customData: { t3Card: { kind: "html", attachmentId: "t-1-html", title: "Burn" } },
    });
  });

  it("lands a new drawing beside the latest turn and ties it to that turn", () => {
    const { elements, report } = plan(empty, {
      drawingId: "d",
      shapes: [box("a", 0, 0), box("b", 300, 0)],
    });
    expect(report.placed).toMatchObject({ x: 430 + 32, y: 0 });
    expect(live(elements, "d/a")?.customData).toMatchObject({ t3Drawing: { turn: "1" } });
  });

  it("drops a drawing too wide to sit beside the turn under it", () => {
    const { report } = plan(empty, {
      drawingId: "d",
      shapes: [{ ...box("a", 0, 0), width: 1200 }],
    });
    expect(report.placed).toMatchObject({ x: -600, y: 332 });
  });

  it("takes the free side of a note it was asked to land near", () => {
    const note = { id: "note", type: "text", text: "hi", x: -600, y: 100, width: 150, height: 25 };
    const { report } = plan(
      { ...empty, elements: [turn, note] },
      { drawingId: "d", shapes: [box("a", 0, 0)], near: "note" },
    );
    expect(report.placed).toMatchObject({ x: -600 - 200 - 32, y: 100 });
  });

  it("lays a graph out with no coordinates, sized to labels, and reports no problems", () => {
    const { elements, report } = plan(empty, {
      drawingId: "d",
      layout: "right",
      shapes: [
        { id: "title", type: "text", text: "Pipeline" },
        node("a"),
        node("a-much-longer-label-than-the-default-box-holds"),
        node("c"),
        link("ab", "a", "a-much-longer-label-than-the-default-box-holds"),
        link("bc", "a-much-longer-label-than-the-default-box-holds", "c"),
      ],
    });
    const first = live(elements, "d/a");
    const second = live(elements, "d/a-much-longer-label-than-the-default-box-holds");
    expect(Number(second?.x)).toBeGreaterThan(Number(first?.x) + Number(first?.width));
    expect(Number(second?.width)).toBeGreaterThan(200);
    expect(Number(live(elements, "d/title")?.y)).toBeLessThan(Number(first?.y));
    expect(report).toMatchObject({
      crossings: 0,
      arrowsThroughBoxes: [],
      clippedLabels: [],
      overlaps: [],
    });
  });

  it("binds an arrow to both boxes, starting at its origin", () => {
    const { elements } = plan(empty, {
      drawingId: "d",
      shapes: [box("a", 0, 0), box("b", 500, 200), link("ab", "a", "b")],
    });
    const arrow = live(elements, "d/ab");
    expect(arrow).toMatchObject({
      startBinding: { elementId: "d/a" },
      endBinding: { elementId: "d/b" },
      elbowed: false,
    });
    expect((arrow!.points as ReadonlyArray<unknown>)[0]).toEqual([0, 0]);
    expect(live(elements, "d/a")?.boundElements).toEqual([{ id: "d/ab", type: "arrow" }]);
  });

  it("counts real crossings and arrows through boxes", () => {
    const { report } = plan(empty, {
      drawingId: "d",
      shapes: [
        box("a", 0, 0),
        box("b", 600, 400),
        box("c", 0, 400),
        box("d", 600, 0),
        box("middle", 300, 200),
        link("ab", "a", "b"),
        link("cd", "c", "d"),
      ],
    });
    expect(report.crossings).toBe(1);
    expect(report.arrowsThroughBoxes).toEqual(["ab", "cd"]);
  });

  it("reports a label that cannot fit a box the agent sized", () => {
    const { report } = plan(empty, {
      drawingId: "d",
      shapes: [{ ...box("a", 0, 0, "far too many words for this"), width: 60, height: 30 }],
    });
    expect(report.clippedLabels).toEqual(["a"]);
  });

  it("reports what the drawing lands on", () => {
    const note = { id: "note", type: "text", text: "mine", x: 500, y: 40, width: 60, height: 25 };
    const drawn = applied(
      { ...empty, elements: [turn] },
      {
        drawingId: "d",
        shapes: [box("a", 0, 0)],
      },
    );
    const { report } = plan(
      { ...drawn, elements: [...drawn.elements, note] },
      { drawingId: "d", shapes: [box("a", 0, 0)] },
    );
    expect(report.overlaps).toEqual(['"mine"']);
  });

  it("keeps a dragged box and its label through a re-layout, and moves its arrows to it", () => {
    const shapes = [box("a", 0, 0, "A"), box("b", 400, 0, "B"), box("c", 800, 0, "C")];
    const draw = { drawingId: "d", shapes: [...shapes, link("ab", "a", "b")] };
    const first = applied(empty, draw);
    const moved = drag(first, "d/b", 0, 500);
    const { elements, report } = plan(moved, {
      ...draw,
      shapes: [
        box("a", 0, 100, "A"),
        box("b", 0, 300, "B"),
        box("c", 0, 500, "C"),
        link("ab", "a", "b"),
      ],
    });

    const pinned = live(elements, "d/b");
    const dragged = live(moved.elements, "d/b");
    expect(pinned).toMatchObject({ x: dragged?.x, y: dragged?.y });
    const label = live(elements, "d/b/label");
    expect(Number(label?.y)).toBeGreaterThan(Number(pinned?.y));
    expect(Number(label?.y)).toBeLessThan(Number(pinned?.y) + Number(pinned?.height));
    expect(live(elements, "d/a")?.y).toBe(Number(live(first.elements, "d/a")?.y) + 100);
    const arrow = live(elements, "d/ab");
    const end = (arrow!.points as ReadonlyArray<readonly [number, number]>)[1]!;
    expect(Number(arrow?.y) + end[1]).toBeGreaterThan(Number(dragged?.y) - 10);
    expect(report.keptUserMoves).toEqual(["b"]);
  });

  it("drops the reader's moves only when asked", () => {
    const shapes = [box("a", 0, 0), box("b", 400, 0), box("c", 800, 0)];
    const first = applied(empty, { drawingId: "d", shapes });
    const moved = drag(first, "d/b", 0, 500);
    const { elements, report } = plan(moved, { drawingId: "d", shapes, resetMoves: true });
    expect(live(elements, "d/b")?.y).toBe(live(first.elements, "d/b")?.y);
    expect(report.keptUserMoves).toEqual([]);
  });

  it("stays where the reader dragged the whole drawing", () => {
    const shapes = [box("a", 0, 0), box("b", 400, 0)];
    const first = applied(empty, { drawingId: "d", shapes });
    const moved = drag(drag(first, "d/a", 100, 100), "d/b", 100, 100);
    const { elements, report } = plan(moved, { drawingId: "d", shapes });
    expect(live(elements, "d/a")?.x).toBe(Number(live(first.elements, "d/a")?.x) + 100);
    expect(report.keptUserMoves).toEqual([]);
  });

  it("removes the drawing on an empty list, and a reused id outranks the deletion", () => {
    const first = applied(empty, { drawingId: "d", shapes: [box("a", 0, 0, "A")] });
    const cleared = applied(first, { drawingId: "d", shapes: [] });
    const tombstone = cleared.elements.find((element) => element.id === "d/a");
    expect(tombstone?.isDeleted).toBe(true);
    expect(cleared.elements.find((element) => element.id === "d/a/label")?.isDeleted).toBe(true);

    const { elements } = plan(cleared, { drawingId: "d", shapes: [box("a", 0, 0, "A")] });
    expect(Number(live(elements, "d/a")?.version)).toBeGreaterThan(Number(tombstone?.version));
  });
});

describe("placement below the latest turn", () => {
  const later: ThreadCanvasElement = {
    id: "turn-box:2",
    type: "rectangle",
    version: 1,
    x: -430,
    y: 2000,
    width: 860,
    height: 400,
    customData: { t3Turn: "2", t3TurnTitle: "Later" },
  };
  const cards: ReadonlyArray<ThreadCanvasShape> = [
    { id: "a", type: "markdown", text: "A", x: 0, y: 0, width: 400, height: 200 },
    { id: "b", type: "markdown", text: "B", x: 420, y: 0, width: 400, height: 200 },
    { id: "c", type: "markdown", text: "C", x: 840, y: 0, width: 400, height: 200 },
  ];
  // The older turn comes last in the scene, as a reloaded history can leave it.
  const scene: ThreadCanvasScene = { revision: 1, elements: [later, turn] };

  it("brings only the named cards under the lowest turn and leaves the rest", () => {
    const first = applied(scene, { drawingId: "map", shapes: cards });
    const before = live(first.elements, "map/a")!;
    const { elements } = plan(first, {
      drawingId: "map",
      shapes: cards,
      moveBelowLatestTurn: ["b", "c"],
    });
    expect(live(elements, "map/a")).toMatchObject({ x: before.x, y: before.y });
    const b = live(elements, "map/b")!;
    const c = live(elements, "map/c")!;
    expect(Number(b.y)).toBeGreaterThanOrEqual(2400);
    expect(c.y).toBe(b.y);
    expect(Number(c.x)).toBeGreaterThan(Number(b.x));
    // The next call keeps them where they landed.
    const again = plan({ ...first, elements }, { drawingId: "map", shapes: cards });
    expect(live(again.elements, "map/b")).toMatchObject({ x: b.x, y: b.y });
  });

  it("moves a whole existing drawing under the lowest turn", () => {
    const first = applied(scene, { drawingId: "map", shapes: cards });
    const { elements, report } = plan(first, {
      drawingId: "map",
      shapes: cards,
      place: "belowLatestTurn",
    });
    expect(report.placed?.y).toBeGreaterThanOrEqual(2400);
    expect(Number(live(elements, "map/a")!.y)).toBe(report.placed?.y);
  });
});

describe("a response region below the latest turn", () => {
  const wide = (id: string): ThreadCanvasShape => ({
    id,
    type: "markdown",
    text: id,
    x: 0,
    y: 0,
    width: 1100,
    height: 500,
  });
  const anchorOf = (elements: ReadonlyArray<ThreadCanvasElement>, id: string) =>
    (live(elements, id)?.customData as { t3Below?: unknown } | undefined)?.t3Below;

  it("lays cards in rows that never overlap, whatever coordinates the agent sent", () => {
    const { elements } = plan(empty, {
      drawingId: "r",
      shapes: ["a", "b", "c", "d"].map(wide),
      place: "belowLatestTurn",
    });
    const [a, b, c, d] = ["r/a", "r/b", "r/c", "r/d"].map((id) => live(elements, id)!);
    expect(a!.y).toBe(332);
    expect([b!.y, c!.y]).toEqual([332, 332]);
    expect(Number(b!.x)).toBe(Number(a!.x) + 1100 + 32);
    expect(Number(c!.x)).toBe(Number(b!.x) + 1100 + 32);
    expect(d).toMatchObject({ x: a!.x, y: 332 + 500 + 32 });
  });

  it("anchors each piece to the turn, so it stays below as the turn grows", () => {
    const { elements } = plan(empty, {
      drawingId: "r",
      shapes: [wide("a")],
      place: "belowLatestTurn",
    });
    const a = live(elements, "r/a")!;
    expect(anchorOf(elements, "r/a")).toEqual({ turn: "1", bottom: 300, dy: 32, x: a.x });
  });

  it("keeps the anchor on a later call, and drops it once the user drags the card", () => {
    const first = applied(empty, {
      drawingId: "r",
      shapes: [wide("a"), wide("b")],
      place: "belowLatestTurn",
    });
    const again = plan(first, { drawingId: "r", shapes: [wide("a"), wide("b")] });
    expect(anchorOf(again.elements, "r/a")).toMatchObject({ turn: "1", dy: 32 });
    const dragged = plan(drag(first, "r/b", 0, 900), {
      drawingId: "r",
      shapes: [wide("a"), wide("b")],
    });
    expect(anchorOf(dragged.elements, "r/a")).toMatchObject({ turn: "1" });
    expect(anchorOf(dragged.elements, "r/b")).toBeUndefined();
  });

  it("keeps an agent's own layout when the drawing holds more than cards", () => {
    const { elements } = plan(empty, {
      drawingId: "r",
      shapes: [wide("a"), box("n", 0, 600, "Note")],
      place: "belowLatestTurn",
    });
    expect(Number(live(elements, "r/n")!.y) - Number(live(elements, "r/a")!.y)).toBe(600);
  });

  it("anchors a card brought below, and the user's mark on it", () => {
    const first = applied(empty, { drawingId: "r", shapes: [wide("a")] });
    const card = live(first.elements, "r/a")!;
    const mark: ThreadCanvasElement = {
      id: "mark",
      type: "rectangle",
      version: 1,
      x: Number(card.x) + 10,
      y: Number(card.y) + 10,
      width: 40,
      height: 20,
    };
    const { elements } = plan(
      { ...first, elements: [...first.elements, mark] },
      { drawingId: "r", shapes: [wide("a")], moveBelowLatestTurn: ["a"] },
    );
    const moved = live(elements, "r/a")!;
    const dy = Number(moved.y) - 300;
    expect(dy).toBeGreaterThanOrEqual(32);
    expect(anchorOf(elements, "r/a")).toEqual({ turn: "1", bottom: 300, dy, x: moved.x });
    expect(anchorOf(elements, "mark")).toEqual({
      turn: "1",
      bottom: 300,
      dy: dy + 10,
      x: Number(moved.x) + 10,
    });
  });
});

describe("a box the user drew to hold a drawing", () => {
  const frame: ThreadCanvasElement = {
    id: "frame",
    type: "rectangle",
    version: 4,
    x: -3000,
    y: 1000,
    width: 1200,
    height: 600,
    groupIds: [],
  };
  const title: ThreadCanvasElement = {
    id: "frame-title",
    type: "text",
    version: 2,
    x: -2995,
    y: 1005,
    width: 400,
    height: 45,
    containerId: "frame",
    text: "Org structure (fill this out)",
  };
  const scene: ThreadCanvasScene = {
    revision: 1,
    elements: [turn, frame, title],
    seen: { frame: 6 },
  };
  const card = (id: string, width: number): ThreadCanvasShape => ({
    id,
    type: "markdown",
    text: id,
    x: 5000,
    y: 5000,
    width,
    height: 800,
  });

  it("lands inside under the title, grows the box to fit, and groups them", () => {
    const { elements, seen } = plan(scene, {
      drawingId: "org",
      shapes: [card("a", 700), card("b", 700)],
      inside: "frame",
    });
    const a = live(elements, "org/a")!;
    const b = live(elements, "org/b")!;
    expect(a).toMatchObject({ x: -3000 + 24, y: 1005 + 45 + 24 });
    // Two 700 px cards do not fit across the 1200 px box, so the second starts a row.
    expect(b).toMatchObject({ x: a.x, y: Number(a.y) + 800 + 32 });
    const grown = live(elements, "frame")!;
    expect(grown).toMatchObject({
      x: -3000,
      y: 1000,
      width: 1200,
      height: Number(b.y) + 800 + 24 - 1000,
      version: 5,
      customData: { t3Holds: { drawing: "org", written: 1 } },
    });
    const group = (grown.groupIds as string[])[0];
    expect(a.groupIds).toEqual([group]);
    expect(live(elements, "frame-title")!.groupIds).toEqual([group]);
    expect(a.customData).not.toHaveProperty("t3Below");
    // The agent grew the box itself, so the box is not news to it.
    expect(seen).toEqual({ frame: 8 });
  });

  it("ignores an agent shape or a missing id and places the drawing as usual", () => {
    const { elements } = plan(scene, {
      drawingId: "org",
      shapes: [card("a", 700)],
      inside: "nope",
    });
    expect(live(elements, "frame")).toBe(frame);
  });
});

describe("the user's marks on a moved card", () => {
  it("travel with the card, labels included, stamped against stale copies", () => {
    const shapes: ReadonlyArray<ThreadCanvasShape> = [
      { id: "asks", type: "markdown", text: "Asks", x: 0, y: 0, width: 600, height: 400 },
    ];
    const first = applied(empty, { drawingId: "map", shapes });
    const card = live(first.elements, "map/asks")!;
    const on: ThreadCanvasElement = {
      id: "cite-box",
      type: "rectangle",
      version: 3,
      x: Number(card.x) + 100,
      y: Number(card.y) + 50,
      width: 200,
      height: 40,
    };
    const label: ThreadCanvasElement = {
      id: "cite-label",
      type: "text",
      version: 2,
      containerId: "cite-box",
      x: on.x,
      y: on.y,
      text: "CITE",
    };
    const off: ThreadCanvasElement = {
      id: "elsewhere",
      type: "text",
      version: 1,
      x: -3000,
      y: -3000,
      width: 50,
      height: 20,
      text: "far",
    };
    const scene = { ...first, elements: [...first.elements, on, label, off] };
    const { elements } = plan(scene, { drawingId: "map", shapes, place: "belowLatestTurn" });
    const moved = live(elements, "map/asks")!;
    const dx = Number(moved.x) - Number(card.x);
    const dy = Number(moved.y) - Number(card.y);
    expect(dx !== 0 || dy !== 0).toBe(true);
    expect(live(elements, "cite-box")).toMatchObject({
      x: Number(on.x) + dx,
      y: Number(on.y) + dy,
      version: 4,
      customData: { t3Follow: { id: "map/asks", drawing: "map", written: 1 } },
    });
    expect(live(elements, "cite-label")).toMatchObject({
      x: Number(on.x) + dx,
      y: Number(on.y) + dy,
    });
    expect(live(elements, "elsewhere")).toMatchObject({ x: -3000, y: -3000, version: 1 });
  });
});

describe("replacing a drawing outright", () => {
  it("lands clear of the user's notes instead of over them", () => {
    const first = applied(empty, { drawingId: "map", shapes: [box("old", 0, 0, "Old")] });
    const old = live(first.elements, "map/old")!;
    const note: ThreadCanvasElement = {
      id: "note",
      type: "text",
      version: 1,
      x: Number(old.x) + 10,
      y: Number(old.y) + 100,
      width: 300,
      height: 25,
      text: "walk my MRs",
    };
    const scene = { ...first, elements: [...first.elements, note] };
    const { elements, report } = plan(scene, {
      drawingId: "map",
      shapes: [{ id: "card", type: "markdown", text: "New", x: 0, y: 0, width: 600, height: 400 }],
    });
    expect(report.overlaps).toEqual([]);
    expect(Number(live(elements, "map/card")!.y)).toBeGreaterThan(Number(note.y));
  });

  it("keeps an edited drawing in place", () => {
    const first = applied(empty, { drawingId: "map", shapes: [box("a", 0, 0, "A")] });
    const before = live(first.elements, "map/a")!;
    const { elements } = plan(first, {
      drawingId: "map",
      shapes: [box("a", 0, 0, "A2"), box("b", 300, 0, "B")],
    });
    expect(live(elements, "map/a")).toMatchObject({ x: before.x, y: before.y });
  });
});
