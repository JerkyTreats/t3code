import { describe, expect, it } from "vite-plus/test";

import { compileDiagram, DiagramError, parseDiagram, tableWidth } from "./canvasDiagram.ts";

const byId = (source: string) => new Map(compileDiagram(source).map((shape) => [shape.id, shape]));

describe("parseDiagram", () => {
  it("reads nodes, shapes, edge labels, chains, subgraphs and classes", () => {
    const { root, nodes, edges } = parseDiagram(`flowchart LR
      a["Alpha"] -->|calls| b((Beta)) --- c{Gamma}:::risk
      subgraph S["Side"]; d; end
      class a lead`);
    expect(root.direction).toBe("right");
    expect(nodes.get("b")).toMatchObject({ label: "Beta", shape: "ellipse" });
    expect(nodes.get("c")).toMatchObject({ shape: "diamond", classes: ["risk"] });
    expect(nodes.get("a")?.classes).toEqual(["lead"]);
    expect(edges).toEqual([
      { from: "a", to: "b", label: "calls", line: false },
      { from: "b", to: "c", label: null, line: true },
    ]);
    expect(root.children.map((child) => child.id)).toEqual(["a", "b", "c", "S"]);
  });

  it("says what it could not read", () => {
    expect(() => parseDiagram("flowchart TB\n a --> ")).toThrow(DiagramError);
    expect(() => parseDiagram("flowchart TB\n subgraph S\n a")).toThrow("has no end");
    expect(() => parseDiagram("flowchart TB\n a\n class z lead")).toThrow("z, which is not drawn");
  });
});

describe("compileDiagram", () => {
  it("puts the lead first on a row of its own, as a wider card, with the rest under it", () => {
    const shapes = byId(`flowchart LR
      one["\`**One**\`"]; two["\`**Two**\`"]; answer["\`**The answer**\`"]
      class answer lead`);
    expect(shapes.get("answer")).toMatchObject({ type: "markdown", x: 0, y: 0, width: 960 });
    const one = shapes.get("one")!;
    expect(one).toMatchObject({ type: "markdown", x: 0, width: 480 });
    expect(one.y).toBeGreaterThan(shapes.get("answer")!.height!);
    expect(shapes.get("two")).toMatchObject({ y: one.y });
  });

  it("stacks bands in order at one width, stepping their text down, with arrows between them", () => {
    const shapes = byId(`flowchart TB
      subgraph WHY["WHY"]; safe; end
      subgraph HOW["HOW"]; serve; door; reach; end
      WHY -->|achieved by| HOW`);
    const why = shapes.get("WHY")!;
    const how = shapes.get("HOW")!;
    expect(why.width).toBe(how.width);
    expect(how.y).toBeGreaterThan(why.y! + why.height!);
    expect(shapes.get("safe")!.fontSize).toBeGreaterThan(shapes.get("serve")!.fontSize!);
    expect(shapes.get("e1")).toMatchObject({
      type: "arrow",
      start: "WHY",
      end: "HOW",
      text: "achieved by",
    });
  });

  it("gives each kind one outline colour and a legend, and leaves blank-titled groups unframed", () => {
    const shapes = byId(`flowchart LR
      subgraph wrap[" "]; a:::platform; b:::platform; c:::prototype; end`);
    expect(shapes.has("wrap")).toBe(false);
    expect(shapes.get("a")!.strokeColor).toBe(shapes.get("b")!.strokeColor);
    expect(shapes.get("c")!.strokeColor).not.toBe(shapes.get("a")!.strokeColor);
    expect(shapes.get("legend-platform-label")).toMatchObject({ text: "platform" });
    expect(shapes.get("legend-prototype")).toMatchObject({
      strokeColor: shapes.get("c")!.strokeColor,
    });
  });

  it("lays nodes joined by edges out as a graph flowing the chosen way", () => {
    const shapes = byId("flowchart TB\n a --> b --> c");
    expect(shapes.get("b")!.y).toBeGreaterThan(shapes.get("a")!.y!);
    expect(shapes.get("c")!.y).toBeGreaterThan(shapes.get("b")!.y!);
  });
});

describe("tableWidth", () => {
  it("widens a card for its widest table row, up to two cards and a gap", () => {
    expect(tableWidth("**Title**\n- one item")).toBe(0);
    const narrow = tableWidth("| A | B |\n| - | - |\n| x | y |");
    expect(narrow).toBeGreaterThan(0);
    expect(narrow).toBeLessThan(480);
    const wide = `| ${"long cell text ".repeat(12)} | ${"more text ".repeat(12)} |`;
    expect(tableWidth(wide)).toBe(1000);
  });

  it("gives a card holding a wide table that width in the diagram", () => {
    const row = `| ${"column ".repeat(10)} | ${"value ".repeat(10)} |`;
    const shapes = byId(`flowchart TB\n t["\`${row}\n| - | - |\n| a | b |\`"]`);
    expect(shapes.get("t")!.width).toBeGreaterThan(480);
  });
});
