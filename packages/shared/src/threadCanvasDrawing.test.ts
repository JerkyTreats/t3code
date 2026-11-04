import type { ThreadCanvasShape } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildDrawingElements, drawingShapesOf, shapeSize } from "./threadCanvasDrawing.ts";

describe("drawingShapesOf", () => {
  it("gives back the shapes a drawing was built from, leaving out sizes and colors T3 would pick", () => {
    const shapes: ReadonlyArray<ThreadCanvasShape> = [
      { id: "api", type: "rectangle", x: 0, y: 0, text: "API" },
      { id: "db", type: "ellipse", x: 400, y: 0, width: 300, height: 90, strokeColor: "#e03131" },
      { id: "calls", type: "arrow", x: 0, y: 0, start: "api", end: "db", text: "SQL" },
      { id: "title", type: "text", x: 0, y: -48, text: "System", fontSize: 28 },
      { id: "notes", type: "markdown", x: 0, y: 200, width: 600, height: 400, text: "# Notes" },
      {
        id: "chart",
        type: "html",
        x: 700,
        y: 200,
        width: 480,
        height: 320,
        attachmentId: "t-1-html",
        title: "Burn",
      },
    ];
    const elements = buildDrawingElements({
      drawingId: "d",
      turn: null,
      placed: shapes.map((shape) => ({
        shape,
        ...shapeSize(shape),
        x: (shape.x ?? 0) + 1000,
        y: (shape.y ?? 0) + 50,
        localX: shape.x ?? 0,
        localY: shape.y ?? 0,
      })),
      versionOf: () => 0,
      randomInt: () => 7,
      now: 1,
    });
    expect(drawingShapesOf(elements, "d")).toEqual(shapes);
  });
});
