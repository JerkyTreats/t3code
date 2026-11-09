import { describe, expect, it } from "vite-plus/test";

import { followCards } from "./canvasCardFollow";

const card = (x: number, y: number) => ({ id: "card", x, y });
const piece = (id: string, x: number, y: number, dx: number, dy: number) => ({
  id,
  x,
  y,
  customData: { t3OnCard: { card: "card", dx, dy } },
});

describe("followCards", () => {
  it("touches nothing when no piece follows a card", () => {
    expect(followCards([card(0, 0), { id: "mark", x: 5, y: 5 }], new Map())).toBeNull();
  });

  it("moves pieces and their labels to the card's new spot plus their offsets", () => {
    const result = followCards(
      [
        card(100, 50),
        piece("box", 400, 10, 300, 10),
        { id: "label", x: 410, y: 20, containerId: "box" },
        piece("arrow", 300, 0, 200, 0),
      ],
      new Map([["card", { x: 0, y: 0 }]]),
    );
    expect(Object.fromEntries(result?.changes ?? [])).toEqual({
      box: { kind: "move", x: 400, y: 60 },
      label: { kind: "move", x: 410, y: 70 },
      arrow: { kind: "move", x: 300, y: 50 },
    });
    expect(result?.cards.get("card")).toEqual({ x: 100, y: 50 });
  });

  it("rewrites the offset of a piece moved while its card stayed, or whose card is new", () => {
    const moved = piece("box", 350, 40, 300, 10);
    const stayed = followCards([card(0, 0), moved], new Map([["card", { x: 0, y: 0 }]]));
    const firstSeen = followCards([card(0, 0), moved], new Map());
    for (const result of [stayed, firstSeen]) {
      expect(Object.fromEntries(result?.changes ?? [])).toEqual({
        box: { kind: "anchor", anchor: { card: "card", dx: 350, dy: 40 } },
      });
    }
  });

  it("leaves pieces in place when they and the card moved together, or the card is gone", () => {
    const together = followCards(
      [card(100, 0), piece("box", 400, 10, 300, 10)],
      new Map([["card", { x: 0, y: 0 }]]),
    );
    expect(together?.changes.size).toBe(0);
    const gone = followCards(
      [{ ...card(100, 0), isDeleted: true }, piece("box", 0, 0, 300, 10)],
      new Map([["card", { x: 0, y: 0 }]]),
    );
    expect(gone?.changes.size).toBe(0);
  });

  it("settles after a rewritten offset that floats cannot add back exactly", () => {
    const first = followCards([card(0.1, 0), piece("box", 0.3, 0, 0, 0)], new Map());
    const change = first?.changes.get("box");
    if (change?.kind !== "anchor") throw new Error("expected an offset rewrite");
    const again = followCards(
      [card(0.1, 0), piece("box", 0.3, 0, change.anchor.dx, change.anchor.dy)],
      first?.cards ?? new Map(),
    );
    expect(again?.changes.size).toBe(0);
  });
});
