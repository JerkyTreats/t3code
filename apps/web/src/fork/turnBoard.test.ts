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

describe("layoutTurns with a response region", () => {
  const card = (key: string, x: number, y: number, height: number, bottom: number): BoardBox => ({
    key,
    turnId: null,
    requestedWidth: null,
    group: "region",
    card: true,
    x,
    y,
    width: 400,
    height,
    anchor: { turn: "a", bottom, dy: y - bottom, x },
  });

  it("keeps a card that arrived inside a grown turn below it", () => {
    const [turn] = layoutTurns([], [measured("a", 600)]);
    // The server placed the card under the turn as it was saved, 600 px shorter than now.
    const stale = card("c", -200, 32 + 24, 300, 24);
    const boxes = layoutTurns([turn!, stale], [measured("a", 600)]);
    const bottom = 600 + 2 * TURN_INSET_PX;
    expect(boxFor(boxes, "c")).toMatchObject({
      y: bottom + 32,
      anchor: { turn: "a", bottom, dy: 32 },
    });
  });

  it("follows the turn as it grows and shrinks", () => {
    const [turn] = layoutTurns([], [measured("a", 100)]);
    const bottom = 100 + 2 * TURN_INSET_PX;
    const start = [turn!, card("c", -200, bottom + 32, 300, bottom)];
    const grown = layoutTurns(start, [measured("a", 500)]);
    expect(boxFor(grown, "c").y).toBe(500 + 2 * TURN_INSET_PX + 32);
    const shrunk = layoutTurns(grown, [measured("a", 50)]);
    expect(boxFor(shrunk, "c").y).toBe(50 + 2 * TURN_INSET_PX + 32);
  });

  it("leaves a card the user dragged off its anchor", () => {
    const [turn] = layoutTurns([], [measured("a", 100)]);
    const bottom = 100 + 2 * TURN_INSET_PX;
    const dragged = { ...card("c", -200, bottom + 32, 300, bottom), x: 1500, y: 40 };
    const boxes = layoutTurns([turn!, dragged], [measured("a", 500)]);
    expect(boxFor(boxes, "c")).toMatchObject({ x: 1500, y: 40, anchor: null });
  });

  it("moves a card down past a card above it that grew", () => {
    const [turn] = layoutTurns([], [measured("a", 100)]);
    const bottom = 100 + 2 * TURN_INSET_PX;
    const top = { ...card("top", -200, bottom + 32, 300, bottom), height: 700 };
    const under = card("under", -200, bottom + 32 + 300 + 32, 200, bottom);
    const beside = card("beside", 400, bottom + 32 + 300 + 32, 200, bottom);
    const boxes = layoutTurns([turn!, top, under, beside], [measured("a", 100)]);
    expect(boxFor(boxes, "under")).toMatchObject({
      y: bottom + 32 + 700 + 32,
      anchor: { dy: 32 + 700 + 32 },
    });
    expect(boxFor(boxes, "beside").y).toBe(bottom + 32 + 300 + 32);
  });

  it("lands the next turn below the region", () => {
    const [turn] = layoutTurns([], [measured("a", 100)]);
    const bottom = 100 + 2 * TURN_INSET_PX;
    const region = card("c", -200, bottom + 32, 300, bottom);
    const boxes = layoutTurns([turn!, region], [measured("a", 100), measured("b", 100)]);
    expect(boxFor(boxes, "b").y).toBe(bottom + 32 + 300 + TURN_GAP_PX);
  });
});
