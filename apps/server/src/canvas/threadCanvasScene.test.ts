import type { ThreadCanvasScene } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  describeCanvas,
  describeCanvasChanges,
  mergeCanvasElements,
  readCanvas,
} from "./threadCanvasScene.ts";

const scene = (elements: ThreadCanvasScene["elements"]): ThreadCanvasScene => ({
  revision: 1,
  elements,
});

describe("mergeCanvasElements", () => {
  it("keeps the agent's newer write over a client copy that only counted higher", () => {
    const card = (version: number, y: number, written: number) => ({
      id: "map/asks",
      type: "rectangle",
      version,
      y,
      customData: { t3Drawing: { id: "map", localY: 0, written } },
    });
    // The agent moved the card at t=2; the client shifted its t=1 copy five times meanwhile.
    const { elements, changed } = mergeCanvasElements([card(4, 900, 2)], [card(8, 120, 1)]);
    expect(changed).toBe(true);
    expect(elements).toEqual([expect.objectContaining({ y: 900, version: 9 })]);
    // Once the client holds the agent's write, its own shifts count again.
    expect(mergeCanvasElements([card(9, 900, 2)], [card(10, 940, 2)]).elements).toEqual([
      expect.objectContaining({ y: 940, version: 10 }),
    ]);
    // A stale copy that already counts lower changes nothing.
    expect(mergeCanvasElements([card(9, 900, 2)], [card(3, 120, 1)]).changed).toBe(false);
  });

  it("keeps the newer version from either side and reports whether anything changed", () => {
    const current = [
      { id: "a", version: 3, x: 1 },
      { id: "b", version: 1, x: 1 },
    ];
    const merged = mergeCanvasElements(current, [
      { id: "a", version: 2, x: 2 },
      { id: "b", version: 2, x: 2 },
      { id: "c", version: 1, x: 2 },
    ]);
    expect(merged.changed).toBe(true);
    expect(merged.elements).toEqual([
      { id: "a", version: 3, x: 1 },
      { id: "b", version: 2, x: 2 },
      { id: "c", version: 1, x: 2 },
    ]);
    expect(mergeCanvasElements(merged.elements, merged.elements).changed).toBe(false);
  });
});

describe("describeCanvas", () => {
  const turn = (title: string, y: number) => ({
    id: `turn-${title}`,
    type: "rectangle",
    x: -430,
    y,
    width: 860,
    height: 300,
    customData: { t3Turn: title, t3TurnTitle: title },
  });

  it("reads the user's text and names the turn it sits beside", () => {
    const described = describeCanvas(
      scene([
        turn("first", 0),
        turn("second", 400),
        { id: "note", type: "text", x: -700, y: 500, width: 100, height: 20, text: "draw here?" },
      ]),
    );
    expect(described.turns.map((entry) => entry.title)).toEqual(["first", "second"]);
    expect(described.elements).toEqual([
      expect.objectContaining({
        id: "note",
        text: "draw here?",
        drawnBy: "user",
        nearestTurn: "second",
      }),
    ]);
  });

  it("names a card's kind and previews a markdown card's text", () => {
    const described = describeCanvas(
      scene([
        {
          id: "d/notes",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 480,
          height: 320,
          customData: { t3Drawing: { id: "d" }, t3Card: { kind: "markdown", text: "# Plan" } },
        },
        {
          id: "d/page",
          type: "rectangle",
          x: 500,
          y: 0,
          width: 480,
          height: 320,
          customData: {
            t3Drawing: { id: "d" },
            t3Card: { kind: "html", attachmentId: "a-html", title: "Chart" },
          },
        },
      ]),
    );
    expect(described.elements).toEqual([
      expect.objectContaining({
        id: "d/notes",
        card: "markdown",
        text: "# Plan",
        drawnBy: "agent",
      }),
      expect.objectContaining({ id: "d/page", card: "html", drawnBy: "agent" }),
    ]);
    expect(described.elements[1]).not.toHaveProperty("text");
  });

  it("places a user mark on the agent's smallest piece under it, or beside the nearest", () => {
    const described = describeCanvas(
      scene([
        {
          id: "d/asks",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 1000,
          height: 1000,
          customData: {
            t3Drawing: { id: "d" },
            t3Card: { kind: "markdown", text: "## Asks on you\n\n| Due |" },
          },
        },
        {
          id: "d/node",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 200,
          height: 80,
          customData: { t3Drawing: { id: "d" } },
        },
        { id: "d/node-label", type: "text", text: "IREN AI Platform", containerId: "d/node" },
        {
          id: "d/edge",
          type: "arrow",
          x: 0,
          y: 0,
          width: 2000,
          height: 2000,
          customData: { t3Drawing: { id: "d" } },
        },
        {
          id: "box",
          type: "rectangle",
          x: 150,
          y: 120,
          width: 300,
          height: 30,
          customData: { t3Covers: "PENG-274: NetBox token" },
        },
        { id: "cite", type: "text", text: "CITE", x: 460, y: 110, width: 60, height: 25 },
        {
          id: "pointer",
          type: "arrow",
          x: 1300,
          y: 500,
          width: 100,
          height: 10,
          points: [
            [0, 0],
            [-310, 0],
          ],
        },
        { id: "far", type: "text", text: "elsewhere", x: 1050, y: 1050, width: 60, height: 25 },
      ]),
    );
    const placed = Object.fromEntries(described.elements.map((element) => [element.id, element]));
    expect(placed["box"]).toMatchObject({
      on: { id: "d/node", text: "IREN AI Platform", x: 50, y: 20 },
    });
    expect(placed["cite"]).toMatchObject({
      on: { id: "d/asks", card: "markdown", x: 460, y: 110 },
    });
    expect(placed["cite"]).not.toHaveProperty("beside");
    expect(placed["pointer"]).toMatchObject({ on: { id: "d/asks" } });
    expect(placed["far"]).toMatchObject({ beside: { id: "d/asks", card: "markdown" } });
    expect(placed["far"]).not.toHaveProperty("on");
    expect(placed["d/node"]).not.toHaveProperty("on");
  });

  it("folds labels into their shape, keeps arrow ends, and skips deleted marks", () => {
    const described = describeCanvas(
      scene([
        {
          id: "box",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          customData: { t3Drawing: { id: "design" } },
        },
        { id: "label", type: "text", containerId: "box", text: "Server" },
        { id: "arrow", type: "arrow", startBinding: { elementId: "box" } },
        { id: "gone", type: "freedraw", isDeleted: true },
      ]),
    );
    expect(described.elements).toEqual([
      expect.objectContaining({
        id: "box",
        text: "Server",
        drawnBy: "agent",
        drawingId: "design",
      }),
      expect.objectContaining({ id: "arrow", start: "box" }),
    ]);
  });
});

describe("describeCanvasChanges", () => {
  const turn = {
    id: "turn-box:1",
    version: 9,
    x: 0,
    y: 0,
    width: 800,
    height: 200,
    customData: { t3Turn: "1", t3TurnTitle: "Rust timings" },
  };
  const note = { id: "note", version: 2, type: "text", text: "Show me this", x: 900, y: 0 };
  const stroke = {
    id: "stroke",
    version: 4,
    type: "freedraw",
    x: 10,
    y: 10,
    customData: { t3Covers: "94% of compile time was rebuilds" },
  };
  const agentBox = {
    id: "agent-box",
    version: 3,
    type: "rectangle",
    customData: { t3Drawing: { id: "design" } },
  };

  it("lists the user's new marks with what they sit on, and nothing of the agent's", () => {
    const changes = describeCanvasChanges(scene([turn, note, stroke, agentBox]), "Hello");
    expect(changes.note).toContain('text "Show me this" [note], near turn "Rust timings"');
    expect(changes.note).toContain('freedraw [stroke], near turn "Rust timings"');
    expect(changes.note).toContain('over "94% of compile time was rebuilds"');
    expect(changes.note).toContain(
      'freedraw [stroke], near turn "Rust timings", beside your [agent-box]',
    );
    expect(changes.note).not.toContain("agent-box [");
    expect(changes.sketched).toBe(true);
  });

  it("stays silent once the agent has seen the marks, until one changes", () => {
    const first = describeCanvasChanges(scene([turn, note]), "Hello");
    const seen = { ...scene([turn, note]), seen: first.seen };
    expect(describeCanvasChanges(seen, "Hello").note).toBe("");
    const edited = { ...note, version: 3, text: "Show me that" };
    expect(describeCanvasChanges({ ...seen, elements: [turn, edited] }, "Hello").note).toContain(
      "Show me that",
    );
  });

  it("notices a label edit on an already seen shape", () => {
    const box = { id: "box", version: 1, type: "rectangle" };
    const label = { id: "label", version: 1, type: "text", text: "old", containerId: "box" };
    const seen = describeCanvasChanges(scene([box, label]), "").seen;
    const edited = { ...label, version: 2, text: "new" };
    const changes = describeCanvasChanges({ ...scene([box, edited]), seen }, "");
    expect(changes.note).toContain('rectangle "new" [box]');
  });

  it("names a sent note as the message's anchor instead of repeating it", () => {
    const changes = describeCanvasChanges(scene([turn, note]), " Show me this ");
    expect(changes.note).not.toContain("changed this thread");
    expect(changes.note).toContain("sent from the canvas note [note]");
  });

  it("reports what the user removed", () => {
    const seen = describeCanvasChanges(scene([turn, note]), "").seen;
    const removed = { ...note, version: 3, isDeleted: true };
    expect(describeCanvasChanges({ ...scene([turn, removed]), seen }, "").note).toContain(
      'removed "Show me this"',
    );
  });

  it("caps a long list and points at canvas_read for the rest", () => {
    const notes = Array.from({ length: 25 }, (_, index) => ({
      ...note,
      id: `note-${index}`,
      text: `note ${index}`,
    }));
    const lines = describeCanvasChanges(scene(notes), "").note.split("\n");
    expect(lines.at(-1)).toBe("- and 5 more; canvas_read lists them");
  });
});

describe("readCanvas", () => {
  const turn = {
    id: "turn-a",
    type: "rectangle",
    x: -430,
    y: 0,
    width: 860,
    height: 300,
    customData: { t3Turn: "a", t3TurnTitle: "Map the platform" },
  };
  const card = (drawing: string, id: string, x: number, text: string) => ({
    id: `${drawing}/${id}`,
    type: "rectangle",
    x,
    y: 0,
    width: 400,
    height: 200,
    customData: {
      t3Drawing: { id: drawing },
      t3Card: { kind: "markdown", text },
      t3Below: { turn: "a", edge: "top", at: 0, dy: 0, x },
    },
  });
  const canvas = scene([
    turn,
    card("map", "today", 462, `## **Today** as built\n\n${"x".repeat(1000)}`),
    card("map", "next", 900, "Next"),
    card("map~0123abcd", "child", 1400, "Child finding"),
    { id: "note", type: "text", x: -700, y: 40, width: 100, height: 20, text: "cite?" },
  ]);

  it("gives an overview: the spine, each drawing as one box, and only the user's marks", () => {
    const read = readCanvas(canvas);
    expect(read.spine).toEqual({ left: -430, right: 430, nextTurnY: 300 });
    expect(read.drawings).toEqual([
      {
        drawingId: "map",
        x: 462,
        y: 0,
        width: 838,
        height: 200,
        shapes: 2,
        cards: 2,
        title: "Today as built",
        followsTurn: "Map the platform",
      },
      expect.objectContaining({ drawingId: "map~0123abcd", title: "Child finding" }),
    ]);
    expect(read.elements.map((element) => element.id)).toEqual(["note"]);
  });

  it("lists a drawing in full, a delegated copy of it included, or what overlaps a region", () => {
    const byDrawing = readCanvas(canvas, { drawingIds: ["map"] });
    expect(byDrawing.elements.map((element) => element.id)).toEqual([
      "map/today",
      "map/next",
      "map~0123abcd/child",
    ]);
    expect(byDrawing.elements[0]?.text).toHaveLength(1000 + "## **Today** as built\n\n".length);
    const byRegion = readCanvas(canvas, { region: { x: 870, y: 0, width: 100, height: 100 } });
    expect(byRegion.elements.map((element) => element.id)).toEqual(["map/next"]);
    expect(readCanvas(canvas, { ids: ["note"] }).elements.map((element) => element.id)).toEqual([
      "note",
    ]);
  });

  it("leaves out what does not fit one tool result and says so", () => {
    const many = scene(
      Array.from({ length: 30 }, (_, index) =>
        card("big", `c${index}`, index * 500, "y".repeat(3000)),
      ),
    );
    const read = readCanvas(many, { drawingIds: ["big"] });
    expect(JSON.stringify(read).length).toBeLessThan(45_000);
    expect(read.elements.length).toBeLessThan(30);
    expect(read.note).toContain(`${30 - read.elements.length} more matching elements left out`);
  });
});
