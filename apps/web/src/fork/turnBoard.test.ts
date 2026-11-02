import { describe, expect, it } from "vite-plus/test";

import {
  layoutTurns,
  TURN_COLUMN_WIDTH_PX,
  TURN_GAP_PX,
  TURN_INSET_PX,
  type BoardBox,
} from "./turnBoard";

const measured = (id: string, height: number, requestedWidth: number | null = null) => ({
  id,
  height,
  requestedWidth,
});
const boxFor = (boxes: ReadonlyArray<BoardBox>, id: string) => {
  const box = boxes.find((candidate) => candidate.key === id);
  if (box === undefined) throw new Error(`No box for ${id}`);
  return box;
};
const mark = (key: string, x: number, y: number): BoardBox => ({
  key,
  turnId: null,
  requestedWidth: null,
  x,
  y,
  width: 40,
  height: 40,
});

describe("layoutTurns", () => {
  it("lands turns down the column", () => {
    const boxes = layoutTurns([], [measured("a", 100), measured("b", 200)]);
    expect(boxFor(boxes, "a")).toMatchObject({ x: -TURN_COLUMN_WIDTH_PX / 2, y: 0 });
    expect(boxFor(boxes, "b").y).toBe(100 + 2 * TURN_INSET_PX + TURN_GAP_PX);
  });

  it("leaves a moved turn where the reader put it and keeps the hole", () => {
    const start = layoutTurns([], [measured("a", 100), measured("b", 100)]);
    const moved = start.map((box) => (box.key === "a" ? { ...box, x: 900, y: 40 } : box));
    const next = layoutTurns(moved, [measured("a", 300), measured("b", 100)]);
    expect(boxFor(next, "a")).toMatchObject({ x: 900, y: 40 });
    expect(boxFor(next, "b").y).toBe(boxFor(start, "b").y);
  });

  it("carries marks with the turns below a turn that grows", () => {
    const start = layoutTurns([], [measured("a", 100), measured("b", 100)]);
    const b = boxFor(start, "b");
    const next = layoutTurns(
      [...start, mark("beside-a", 700, 10), mark("beside-b", 700, b.y + 5)],
      [measured("a", 250), measured("b", 100)],
    );
    expect(boxFor(next, "b").y).toBe(b.y + 150);
    expect(boxFor(next, "beside-b").y).toBe(b.y + 155);
    expect(boxFor(next, "beside-a").y).toBe(10);
  });

  it("lands a new turn under marks in the column but ignores marks beside it", () => {
    const start = layoutTurns([], [measured("a", 100)]);
    const a = boxFor(start, "a");
    const inTheWay = mark("in-the-way", 0, a.height + 100);
    const beside = mark("beside", TURN_COLUMN_WIDTH_PX, a.height + 900);
    const next = layoutTurns(
      [...start, inTheWay, beside],
      [measured("a", 100), measured("b", 100)],
    );
    expect(boxFor(next, "b").y).toBe(inTheWay.y + inTheWay.height + TURN_GAP_PX);
  });

  it("widens a turn when its agent asks and keeps it centered", () => {
    const start = layoutTurns([], [measured("a", 100)]);
    const next = layoutTurns(start, [measured("a", 100, 1400)]);
    expect(boxFor(next, "a")).toMatchObject({
      width: 1400 + 2 * TURN_INSET_PX,
      x: -(1400 + 2 * TURN_INSET_PX) / 2,
    });
  });

  it("places turns loaded from history above the turns they precede", () => {
    const start = layoutTurns([], [measured("b", 100)]);
    const next = layoutTurns(start, [measured("a", 100), measured("b", 100)]);
    expect(boxFor(next, "a").y).toBe(-(100 + 2 * TURN_INSET_PX + TURN_GAP_PX));
  });
});

describe("layoutTurns with drawings", () => {
  it("moves a drawing whole when the turn above it grows, even if it starts beside the turn", () => {
    const start = layoutTurns([], [measured("a", 100)]);
    const turnBottom = boxFor(start, "a").y + boxFor(start, "a").height;
    const piece = (key: string, y: number): BoardBox => ({ ...mark(key, 600, y), group: "map" });
    const grown = layoutTurns(
      [
        ...start,
        piece("map/top", turnBottom - 20),
        piece("map/low", turnBottom + 200),
        mark("loose", 600, turnBottom - 20),
      ],
      [measured("a", 300)],
    );
    // The drawing starts above the old bottom, so it stays together where it was.
    expect(boxFor(grown, "map/top").y).toBe(turnBottom - 20);
    expect(boxFor(grown, "map/low").y).toBe(turnBottom + 200);
    expect(boxFor(grown, "loose").y).toBe(turnBottom - 20);
  });

  it("pushes a drawing below the turn down as one", () => {
    const start = layoutTurns([], [measured("a", 100)]);
    const turnBottom = boxFor(start, "a").y + boxFor(start, "a").height;
    const piece = (key: string, y: number): BoardBox => ({ ...mark(key, 0, y), group: "map" });
    const grown = layoutTurns(
      [...start, piece("map/one", turnBottom + 40), piece("map/two", turnBottom + 400)],
      [measured("a", 300)],
    );
    expect(boxFor(grown, "map/one").y).toBe(turnBottom + 40 + 200);
    expect(boxFor(grown, "map/two").y).toBe(turnBottom + 400 + 200);
  });
});
