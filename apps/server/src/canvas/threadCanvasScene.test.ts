import type { ThreadCanvasScene } from "@t3tools/contracts";
import { canvasMarkStamps, canvasMarksSeenOnLoad } from "@t3tools/shared/threadCanvasMarks";
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

  it("names a placed panel surface by its kind, identity and title, and skips a bad ref", () => {
    const surfaceCard = (id: string, x: number, t3Card: Record<string, unknown>) => ({
      id,
      type: "rectangle",
      x,
      y: 0,
      width: 400,
      height: 300,
      customData: { t3Card },
    });
    const described = describeCanvas(
      scene([
        surfaceCard("file", 0, {
          kind: "surface",
          surface: { kind: "file", relativePath: "src/app.ts", revealLine: 12 },
          title: "app.ts",
        }),
        surfaceCard("pr", 500, {
          kind: "surface",
          surface: { kind: "pull-request", projectId: "p1", repository: "acme/app", number: 7 },
        }),
        surfaceCard("term", 1500, {
          kind: "surface",
          surface: {
            kind: "terminal",
            resourceId: "t1",
            terminalIds: ["t1", "t2"],
            activeTerminalId: "t2",
          },
          title: "Terminal",
        }),
        surfaceCard("chat", 2000, {
          kind: "surface",
          surface: { kind: "side-chat", threadId: "side-1" },
        }),
        surfaceCard("phone", 2500, {
          kind: "surface",
          surface: {
            kind: "device",
            target: { hostId: "h", deviceId: "d", platform: "ios", name: "iPhone 17" },
          },
        }),
        surfaceCard("files", 3000, {
          kind: "surface",
          surface: { kind: "files", folderTrail: "src/app" },
        }),
        // A path that climbs out of the workspace is no surface card.
        surfaceCard("host", 1000, {
          kind: "surface",
          surface: { kind: "file", relativePath: "../outside.txt" },
          title: "outside",
        }),
      ]),
    );
    expect(described.elements).toEqual([
      expect.objectContaining({
        id: "file",
        card: "surface",
        drawnBy: "user",
        surface: { kind: "file", relativePath: "src/app.ts", revealLine: 12, title: "app.ts" },
      }),
      expect.objectContaining({
        id: "pr",
        card: "surface",
        surface: {
          kind: "pull-request",
          projectId: "p1",
          repository: "acme/app",
          number: 7,
          title: "acme/app#7",
        },
      }),
      expect.objectContaining({
        id: "term",
        surface: {
          kind: "terminal",
          title: "Terminal",
          resourceId: "t1",
          terminalIds: ["t1", "t2"],
        },
      }),
      expect.objectContaining({
        id: "chat",
        surface: { kind: "side-chat", threadId: "side-1", title: "Side chat" },
      }),
      expect.objectContaining({
        id: "phone",
        surface: { kind: "device", title: "iPhone 17", device: "iPhone 17", platform: "ios" },
      }),
      expect.objectContaining({ id: "files", surface: { kind: "files", title: "Files" } }),
      expect.objectContaining({ id: "host" }),
    ]);
    expect(described.elements[6]).not.toHaveProperty("card");
    expect(described.elements[6]).not.toHaveProperty("surface");
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
        { id: "d/node-label", type: "text", text: "Example AI Platform", containerId: "d/node" },
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
          customData: { t3Covers: "TASK-101: inventory token" },
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
      on: { id: "d/node", text: "Example AI Platform", x: 50, y: 20 },
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
    const seen = { ...scene([turn, note]), seenMarks: first.seenMarks };
    expect(describeCanvasChanges(seen, "Hello").note).toBe("");
    const edited = { ...note, version: 3, text: "Show me that" };
    expect(describeCanvasChanges({ ...seen, elements: [turn, edited] }, "Hello").note).toContain(
      "Show me that",
    );
  });

  it("tells each chat on the board only the marks nearest its card", () => {
    const chat = {
      id: "chat-card",
      version: 1,
      type: "rectangle",
      x: 3000,
      y: 0,
      width: 400,
      height: 500,
      customData: { t3Card: { kind: "surface", surface: { kind: "side-chat", threadId: "side" } } },
    };
    const chatNote = {
      id: "chat-note",
      version: 1,
      type: "text",
      text: "Draw it here",
      x: 3450,
      y: 0,
    };
    const board = scene([turn, note, chat, chatNote]);
    const owner = describeCanvasChanges(board, "Hello");
    expect(owner.note).toContain("Show me this");
    expect(owner.note).not.toContain("Draw it here");
    const side = describeCanvasChanges(board, "Hello", "side");
    expect(side.note).toContain("Draw it here");
    expect(side.note).not.toContain("Show me this");
    expect(side.note).not.toContain("[chat-card]");
    expect(Object.keys(side.seenMarks)).toEqual(["chat-note"]);
  });

  it("notices a label edit on an already seen shape", () => {
    const box = { id: "box", version: 1, type: "rectangle" };
    const label = { id: "label", version: 1, type: "text", text: "old", containerId: "box" };
    const seenMarks = describeCanvasChanges(scene([box, label]), "").seenMarks;
    const edited = { ...label, version: 2, text: "new" };
    const changes = describeCanvasChanges({ ...scene([box, edited]), seenMarks }, "");
    expect(changes.note).toContain('rectangle "new" [box]');
  });

  it("names a sent note as the message's anchor instead of repeating it", () => {
    const changes = describeCanvasChanges(scene([turn, note]), " Show me this ");
    expect(changes.note).not.toContain("changed this thread");
    expect(changes.note).toContain("sent from the canvas note [note]");
  });

  it("reports what the user removed", () => {
    const seenMarks = describeCanvasChanges(scene([turn, note]), "").seenMarks;
    const removed = { ...note, version: 3, isDeleted: true };
    expect(describeCanvasChanges({ ...scene([turn, removed]), seenMarks }, "").note).toContain(
      'removed "Show me this"',
    );
    // A board from before content stamps still reports a removal it knew by version.
    expect(
      describeCanvasChanges({ ...scene([turn, removed]), seen: { note: 2 } }, "").note,
    ).toContain('removed "Show me this"');
  });

  it("is silent when the board only moved the marks with a growing turn", () => {
    const board = [turn, note, stroke, agentBox];
    const { seenMarks } = describeCanvasChanges(scene(board), "");
    // A turn re-measured 22px taller above them all: everything shifts and is written again.
    const shifted = board.map((element) => ({
      ...element,
      version: element.version + 1,
      y: ("y" in element ? element.y : 0) + 22,
    }));
    expect(describeCanvasChanges({ ...scene(shifted), seenMarks }, "").note).toBe("");
  });

  it("takes in a board's version record without reporting marks unchanged since", () => {
    // The store restates the record when it loads the scene.
    const loaded = (saved: ThreadCanvasScene) => ({ ...saved, ...canvasMarksSeenOnLoad(saved) });
    const legacy = { ...scene([turn, note, stroke]), seen: { note: 2, stroke: 4 } };
    const adopted = describeCanvasChanges(loaded(legacy), "");
    expect(adopted.note).toBe("");
    expect(Object.keys(adopted.seenMarks).toSorted()).toEqual(["note", "stroke"]);
    // What changed after the board last recorded it is still news.
    const edited = { ...note, version: 3, text: "Show me that" };
    expect(
      describeCanvasChanges(loaded({ ...legacy, elements: [turn, edited, stroke] }), "").note,
    ).toContain("Show me that");
  });

  it("caps a long list and points at canvas_read for the rest", () => {
    const notes = Array.from({ length: 25 }, (_, index) => ({
      ...note,
      id: `note-${index}`,
      text: `note ${index}`,
    }));
    const changes = describeCanvasChanges(scene(notes), "");
    expect(changes.note.split("\n").at(-1)).toBe("- and 5 more; canvas_read lists them");
    // The five the note leaves out stay unseen, so the next turn names them.
    expect(Object.keys(changes.seenMarks)).toHaveLength(20);
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
        origin: { x: 462, y: 0 },
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
    expect(read.elements[0]).toMatchObject({ turn: 0 });
    expect(read.elements[0]).not.toHaveProperty("nearestTurn");
  });

  it("names the piece a mark sits on by id and clips the words under it", () => {
    const read = readCanvas(
      scene([
        turn,
        card("map", "today", 462, "Today"),
        {
          id: "cite",
          type: "text",
          x: 500,
          y: 40,
          width: 60,
          height: 20,
          text: "cite?",
          customData: { t3Covers: "w".repeat(500) },
        },
      ]),
    );
    expect(read.elements).toEqual([
      expect.objectContaining({ id: "cite", on: "map/today", covers: `${"w".repeat(160)}…` }),
    ]);
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

  it("keeps an overview of a busy board within one tool result, unseen and newest marks first", () => {
    const turns = Array.from({ length: 83 }, (_, index) => ({
      id: `turn-${index}`,
      type: "rectangle",
      x: -430,
      y: index * 400,
      width: 860,
      height: 300,
      customData: { t3Turn: `t${index}`, t3TurnTitle: `Synthetic turn ${index} ${"t".repeat(30)}` },
    }));
    const drawings = Array.from({ length: 50 }, (_, index) =>
      card(`drawing-${index}`, "only", 600, `## Synthetic drawing ${index}\n\nbody`),
    ).map((element, index) => ({ ...element, y: index * 600 }));
    const marks = Array.from({ length: 282 }, (_, index) => ({
      id: `mark-${index}`,
      type: "text",
      version: 1,
      updated: 1_000 + index,
      x: -900,
      y: index * 120,
      width: 300,
      height: 40,
      text: `synthetic note ${index} ${"n".repeat(24)}`,
      customData: { t3Covers: "c".repeat(48) },
    }));
    const all = [...turns, ...drawings, ...marks];
    // The agent has seen every mark but the ten oldest.
    const stamps = canvasMarkStamps(all);
    const unseen = marks.slice(0, 10).map((mark) => mark.id);
    const seenMarks = Object.fromEntries([...stamps].filter(([id]) => !unseen.includes(id)));
    const read = readCanvas({ ...scene(all), seenMarks });

    expect(JSON.stringify(read).length).toBeLessThanOrEqual(40_000);
    expect(read.turns).toHaveLength(83);
    expect(read.drawings).toHaveLength(50);
    const kept = read.elements.map((element) => element.id);
    expect(kept).toEqual(expect.arrayContaining(unseen));
    const keptSeen = kept.filter((id) => !unseen.includes(id));
    expect(keptSeen.length).toBeGreaterThan(0);
    // Past the unseen marks, the newest come first: the seen marks kept are the newest seen ones.
    expect(keptSeen).toEqual(marks.slice(282 - keptSeen.length).map((mark) => mark.id));
    expect(read.note).toContain(`${282 - kept.length} older marks are left out`);
  });

  it("acknowledges only the marks a read lists, so the ones it left out come first next time", () => {
    const board = scene(
      Array.from({ length: 400 }, (_, index) => ({
        id: `mark-${index}`,
        type: "text",
        version: 1,
        updated: index,
        x: -700,
        y: index * 50,
        width: 100,
        height: 20,
        text: `synthetic note ${index} ${"n".repeat(60)}`,
      })),
    );
    const listed = readCanvas(board).elements.map((element) => element.id);
    expect(listed).not.toContain("mark-0");
    const { seenMarks } = describeCanvasChanges(board, "", null, new Set(listed));
    expect(Object.keys(seenMarks).toSorted()).toEqual(listed.toSorted());
    const next = readCanvas({ ...board, seenMarks }).elements.map((element) => element.id);
    expect(next).toContain("mark-0");
  });

  it("cuts an oversized mark's text, still lists the other marks, and returns it by id", () => {
    const huge = {
      id: "huge",
      type: "text",
      updated: 2,
      x: -700,
      y: 80,
      width: 100,
      height: 20,
      text: "h".repeat(40_000),
    };
    const short = {
      id: "short",
      type: "text",
      updated: 1,
      x: -700,
      y: 40,
      width: 100,
      height: 20,
      text: "ok",
    };
    const read = readCanvas(scene([turn, huge, short]));
    expect(read.elements.map((element) => element.id)).toEqual(["huge", "short"]);
    expect(read.elements[0]?.text).toBe(`${"h".repeat(4000)}… [36000 more characters cut]`);
    const byId = readCanvas(scene([turn, huge, short]), { ids: ["huge"] });
    expect(byId.elements.map((element) => element.id)).toEqual(["huge"]);
  });

  it("drops the earliest turns past the budget and counts mark turns from the first kept", () => {
    const turns = Array.from({ length: 400 }, (_, index) => ({
      id: `turn-${index}`,
      type: "rectangle",
      x: -430,
      y: index * 400,
      width: 860,
      height: 300,
      customData: { t3Turn: `t${index}`, t3TurnTitle: `Synthetic turn ${index}` },
    }));
    const read = readCanvas(
      scene([
        ...turns,
        { id: "late", type: "text", x: -700, y: 399 * 400, width: 100, height: 20, text: "here" },
        { id: "early", type: "text", x: -700, y: 0, width: 100, height: 20, text: "there" },
      ]),
    );
    expect(read.turns.at(-1)?.title).toBe("Synthetic turn 399");
    expect(read.turns.length).toBeLessThan(400);
    const late = read.elements.find((element) => element.id === "late");
    expect(read.turns[late?.turn ?? -1]?.title).toBe("Synthetic turn 399");
    expect(read.elements.find((element) => element.id === "early")).not.toHaveProperty("turn");
    expect(read.note).toContain(`The ${400 - read.turns.length} earliest turns are left out`);
  });
});
