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
