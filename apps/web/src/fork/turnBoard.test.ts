import { TURN_ANCHOR_KEY, turnAnchorOf } from "@t3tools/shared/threadCanvasDrawing";
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

describe("layoutTurns keeps content beside the turn it sits by", () => {
  const settle = (boxes: ReadonlyArray<BoardBox>, bHeight: number) =>
    layoutTurns(boxes, [measured("a", 100), measured("b", bHeight)]);
  const start = settle([], 1000);
  const b = boxFor(start, "b");
  const note = mark("note", 700, b.y + 900);

  it("puts a note beside a turn's lower part back where it was after the turn shrinks and grows", () => {
    const grown = settle(settle([...start, note], 555), 1000);
    expect(boxFor(grown, "note").y).toBe(note.y);
  });

  it("restores the note when the shrunk layout was saved and reloaded before the turn grew", () => {
    const reloaded = settle([...start, note], 555).map((box) => ({
      ...box,
      anchor: turnAnchorOf({
        customData: JSON.parse(JSON.stringify({ [TURN_ANCHOR_KEY]: box.anchor ?? undefined })),
      }),
    }));
    expect(boxFor(settle(reloaded, 1000), "note").y).toBe(note.y);
  });

  it("keeps a map of the agent's pieces and the user's notes beside one turn together as an earlier turn grows", () => {
    const piece = (key: string, y: number): BoardBox => ({ ...mark(key, 600, y), group: "map" });
    const map = [piece("map/high", 10), piece("map/low", b.y + 300), mark("note", 700, b.y + 300)];
    const grown = layoutTurns([...start, ...map], [measured("a", 250), measured("b", 1000)]);
    expect(boxFor(grown, "map/low").y).toBe(b.y + 450);
    expect(boxFor(grown, "note").y).toBe(b.y + 450);
    expect(boxFor(grown, "map/high").y).toBe(10);
  });
});

describe("layoutTurns with drawings", () => {
  it("keeps a drawing and a loose mark beside and below a turn in place as that turn grows", () => {
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
    expect(boxFor(grown, "map/top").y).toBe(turnBottom - 20);
    expect(boxFor(grown, "map/low").y).toBe(turnBottom + 200);
    expect(boxFor(grown, "loose").y).toBe(turnBottom - 20);
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
    anchor: { turn: "a", edge: "bottom", at: bottom, dy: y - bottom, x },
  });

  it("keeps a card that arrived inside a grown turn below it", () => {
    const [turn] = layoutTurns([], [measured("a", 600)]);
    // The server placed the card under the turn as it was saved, 600 px shorter than now.
    const stale = card("c", -200, 32 + 24, 300, 24);
    const boxes = layoutTurns([turn!, stale], [measured("a", 600)]);
    const bottom = 600 + 2 * TURN_INSET_PX;
    expect(boxFor(boxes, "c")).toMatchObject({
      y: bottom + 32,
      anchor: { turn: "a", at: bottom, dy: 32 },
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

  it("leaves a card the user dragged off its anchor, anchored where they put it", () => {
    const [turn] = layoutTurns([], [measured("a", 100)]);
    const bottom = 100 + 2 * TURN_INSET_PX;
    const dragged = { ...card("c", -200, bottom + 32, 300, bottom), x: 1500, y: 40 };
    const boxes = layoutTurns([turn!, dragged], [measured("a", 500)]);
    expect(boxFor(boxes, "c")).toMatchObject({
      x: 1500,
      y: 40,
      anchor: { turn: "a", edge: "top", dy: 40 },
    });
  });

  it("moves a card down past a card above it that grew", () => {
    const [turn] = layoutTurns([], [measured("a", 100)]);
    const bottom = 100 + 2 * TURN_INSET_PX;
    const top = { ...card("top", -200, bottom + 32, 300, bottom), height: 700, grew: true };
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

describe("layoutTurns with a box the user drew around a drawing", () => {
  it("grows the box when a card in it grows, and never shrinks it", () => {
    const holder: BoardBox = {
      key: "frame",
      turnId: null,
      requestedWidth: null,
      group: "org",
      holds: "org",
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    const held: BoardBox = { ...mark("org/a", 24, 80), group: "org", width: 900, height: 700 };
    const grown = layoutTurns([holder, held], []);
    expect(boxFor(grown, "frame")).toMatchObject({ width: 24 + 900 + 24, height: 80 + 700 + 24 });
    const small = layoutTurns([holder, { ...held, width: 100, height: 100 }], []);
    expect(boxFor(small, "frame")).toMatchObject({ width: 800, height: 600 });
  });
});

describe("layoutTurns with labels", () => {
  it("moves a label with its anchored shape, even after the board refit its text", () => {
    const [turn] = layoutTurns([], [measured("a", 100)]);
    const bottom = 100 + 2 * TURN_INSET_PX;
    const shape: BoardBox = {
      ...mark("d/box", -200, bottom + 32),
      width: 400,
      height: 200,
      anchor: { turn: "a", edge: "bottom", at: bottom, dy: 32, x: -200 },
    };
    // Refitting the text nudged the label off the anchor the server gave it.
    const label: BoardBox = {
      ...mark("d/box/label", -60, bottom + 32 + 85),
      width: 120,
      height: 30,
      container: "d/box",
      anchor: { turn: "a", edge: "bottom", at: bottom, dy: 80, x: -63 },
    };
    const boxes = layoutTurns([turn!, shape, label], [measured("a", 1300)]);
    const grownBottom = 1300 + 2 * TURN_INSET_PX;
    expect(boxFor(boxes, "d/box").y).toBe(grownBottom + 32);
    expect(boxFor(boxes, "d/box/label")).toMatchObject({ x: -60, y: grownBottom + 32 + 85 });
  });

  it("puts a label found far from its shape back in the middle of it", () => {
    const shape: BoardBox = { ...mark("d/box", 0, 2000), width: 400, height: 200 };
    const label: BoardBox = {
      ...mark("d/box/label", 50, 900),
      width: 100,
      height: 40,
      container: "d/box",
    };
    const boxes = layoutTurns([shape, label], []);
    expect(boxFor(boxes, "d/box/label")).toMatchObject({ x: 150, y: 2080 });
  });
});

describe("layoutTurns with a region beside a turn", () => {
  it("keeps the region level with the turn's top as turns above it grow, whatever its own height", () => {
    const start = layoutTurns([], [measured("a", 100), measured("b", 100)]);
    const b = boxFor(start, "b");
    const beside: BoardBox = {
      ...mark("r/card", 462, b.y),
      width: 600,
      height: 900,
      card: true,
      anchor: { turn: "b", edge: "top", at: b.y, dy: 0, x: 462 },
    };
    const grown = layoutTurns([...start, beside], [measured("a", 700), measured("b", 1500)]);
    expect(boxFor(grown, "r/card").y).toBe(boxFor(grown, "b").y);
    expect(boxFor(grown, "r/card").y).toBe(b.y + 600);
  });

  it("moves a card beside a later turn below an earlier turn's card that grew into its place", () => {
    const start = layoutTurns([], [measured("a", 100), measured("b", 100)]);
    const a = boxFor(start, "a");
    const b = boxFor(start, "b");
    const beside = (key: string, turn: BoardBox, height: number): BoardBox => ({
      ...mark(key, 462, turn.y),
      width: 480,
      height,
      card: true,
      anchor: { turn: turn.key, edge: "top", at: turn.y, dy: 0, x: 462 },
    });
    // The earlier card's text fitted taller than the gap to the next turn.
    const tall = { ...beside("r/old", a, b.y - a.y + 300), grew: true };
    const moved = beside("r/moved", b, 200);
    const laid = layoutTurns([...start, tall, moved], [measured("a", 100), measured("b", 100)]);
    const old = boxFor(laid, "r/old");
    expect(boxFor(laid, "r/moved").y).toBeGreaterThanOrEqual(old.y + old.height);
    // A card that already sat against one that did not grow is where someone put it.
    const kept = layoutTurns(
      [...start, { ...tall, grew: false }, moved],
      [measured("a", 100), measured("b", 100)],
    );
    expect(boxFor(kept, "r/moved").y).toBe(b.y);
  });
});
