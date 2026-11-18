import { describe, expect, it } from "vite-plus/test";

import { sketchAreas, sketchFrame } from "./sketchAreas";

const mark = (id: string, x: number, y: number, updated = 0, size = 100) => ({
  id,
  box: { x, y, width: size, height: size },
  updated,
});

describe("sketchAreas", () => {
  it("merges overlapping marks and marks within the gap, and splits far-apart ones", () => {
    const areas = sketchAreas([
      mark("outer", 0, 0, 0, 300),
      mark("inner", 100, 100),
      mark("beside", 400, 0),
      mark("far", 0, 3000),
    ]);
    expect(areas.map((area) => area.ids)).toEqual([["outer", "inner", "beside"], ["far"]]);
    expect(areas[0]?.box).toEqual({ x: 0, y: 0, width: 500, height: 300 });
  });

  it("chains merges until none are left, whatever the input order", () => {
    // a and c are too far apart alone; b joins both.
    const areas = sketchAreas([mark("a", 0, 0), mark("c", 400, 0), mark("b", 200, 0)]);
    expect(areas.map((area) => area.ids.toSorted())).toEqual([["a", "b", "c"]]);
  });

  it("keeps the most recently changed areas past the cap, top to bottom", () => {
    const areas = sketchAreas(
      [0, 1, 2, 3, 4, 5].map((index) => mark(`m${index}`, 0, index * 1000, 10 - index)),
    );
    expect(areas.map((area) => area.ids)).toEqual([["m0"], ["m1"], ["m2"], ["m3"]]);
  });

  it("draws the words around an area, whole, and leaves far ones out", () => {
    const element = (id: string, type: string, x: number, width = 100) => ({
      id,
      type,
      box: { x, y: 0, width, height: 40 },
    });
    const ring = element("ring", "ellipse", 0);
    const { crop, drawn } = sketchFrame(
      [
        ring,
        element("label", "text", 150),
        element("edge", "text", 200, 400),
        element("far", "text", 2000),
      ],
      ring.box,
      (each) => each.box,
    );
    expect(drawn.map((each) => each.id)).toEqual(["ring", "label", "edge"]);
    expect(crop).toEqual({ x: -120, y: -120, width: 720, height: 280 });
  });
});
