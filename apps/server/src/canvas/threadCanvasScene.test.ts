import type { ThreadCanvasScene } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { describeCanvas, describeCanvasChanges, mergeCanvasElements } from "./threadCanvasScene.ts";

const scene = (elements: ThreadCanvasScene["elements"]): ThreadCanvasScene => ({
  revision: 1,
  elements,
});

describe("mergeCanvasElements", () => {
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
    expect(changes.note).not.toContain("agent-box");
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
