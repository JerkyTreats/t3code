import { describe, expect, it, vi } from "vite-plus/test";

import type { RightPanelSurface } from "../rightPanelStore";
import {
  canvasSurfaceCardFor,
  createSurfaceActivation,
  liveSurfaceCards,
  type SurfaceCardBox,
} from "./canvasSurfaceCards";

const viewport = { x: 0, y: 0, width: 1000, height: 800 };
const file = (id: string, x: number, y = 0): SurfaceCardBox => ({
  id,
  kind: "file",
  x,
  y,
  width: 200,
  height: 200,
});
const live = (input: Partial<Parameters<typeof liveSurfaceCards>[0]>) => [
  ...liveSurfaceCards({
    cards: [],
    viewport,
    zoom: 1,
    live: new Set(),
    interacting: null,
    ...input,
  }),
];

describe("liveSurfaceCards", () => {
  it("goes live in view at zoom 0.5, and holds until a quarter viewport out or below 0.45", () => {
    // Just off the right edge: not live yet, but a live card there holds on.
    const nearby = file("a", 1100);
    expect(live({ cards: [nearby] })).toEqual([]);
    expect(live({ cards: [nearby], live: new Set(["a"]) })).toEqual(["a"]);
    // Past the quarter-viewport margin (1000 + 250), it leaves.
    expect(live({ cards: [file("a", 1300)], live: new Set(["a"]) })).toEqual([]);

    const inView = file("a", 100);
    expect(live({ cards: [inView], zoom: 0.48 })).toEqual([]);
    expect(live({ cards: [inView], zoom: 0.48, live: new Set(["a"]) })).toEqual(["a"]);
    expect(live({ cards: [inView], zoom: 0.44, live: new Set(["a"]) })).toEqual([]);
  });

  it("caps live file cards at four, keeping those already live, then by element id", () => {
    const cards = ["e", "d", "c", "b", "a"].map((id, index) => file(id, index * 10));
    expect(live({ cards }).toSorted()).toEqual(["a", "b", "c", "d"]);
    // A card already live keeps its place over a lower id that comes into view.
    expect(live({ cards, live: new Set(["e", "d", "c", "b"]) }).toSorted()).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("keeps the card the user is interacting with live past the cap and out of view", () => {
    const cards = [...["a", "b", "c", "d"].map((id) => file(id, 0)), file("z", 5000)];
    const result = live({ cards, live: new Set(["a", "b", "c", "d", "z"]), interacting: "z" });
    expect(result).toContain("z");
    expect(result).toHaveLength(4);
  });

  it("does not cap cards that only show a face", () => {
    const faces = ["p", "q", "r", "s", "t"].map((id) => ({
      ...file(id, 0),
      kind: "terminal" as const,
    }));
    expect(live({ cards: faces })).toHaveLength(5);
  });
});

describe("createSurfaceActivation", () => {
  const element = (id: string, x: number) => ({
    id,
    x,
    y: 0,
    width: 200,
    height: 200,
    customData: {
      t3Card: { kind: "surface", surface: { kind: "file", relativePath: `${id}.ts` } },
    },
  });
  const view = (scrollX: number, zoom = 1) => ({ scrollX, scrollY: 0, zoom: { value: zoom } });
  const size = { width: 1000, height: 800 };

  it("publishes only membership changes as the camera moves and the zoom crosses back and forth", () => {
    const publish = vi.fn();
    const activation = createSurfaceActivation(publish);
    const scene = [element("a", 100), { id: "note", x: 0, y: 0, width: 10, height: 10 }];
    activation.update(scene, view(0), size);
    expect(publish).toHaveBeenLastCalledWith(new Set(["a"]));
    // Small pans and a zoom wavering around the threshold change nothing.
    for (const scroll of [-10, -20, -30]) activation.update(scene, view(scroll), size);
    for (const zoom of [0.49, 0.47, 0.5, 0.46]) activation.update(scene, view(0, zoom), size);
    expect(publish).toHaveBeenCalledTimes(1);
    // Panned well away, the card leaves; panned back, it returns.
    activation.update(scene, view(-3000), size);
    activation.update(scene, view(0), size);
    expect(publish.mock.calls.map(([members]) => [...members])).toEqual([["a"], [], ["a"]]);
  });
});

describe("canvasSurfaceCardFor", () => {
  const context = { previewSessions: {}, title: "app.ts" };
  const fileSurface = {
    id: "file:src/app.ts",
    kind: "file",
    relativePath: "src/app.ts",
    revealLine: 4,
    revealRequestId: 1,
  } satisfies RightPanelSurface;

  it("places workspace files, terminal groups and pull requests by their identity", () => {
    expect(canvasSurfaceCardFor(fileSurface, context)).toEqual({
      kind: "surface",
      surface: { kind: "file", relativePath: "src/app.ts", revealLine: 4 },
      title: "app.ts",
    });
    expect(
      canvasSurfaceCardFor(
        {
          id: "pull-request:p:acme%2Fapp:7",
          kind: "pull-request",
          projectId: "p",
          repository: "acme/app",
          number: 7,
        },
        { ...context, title: "#7" },
      )?.title,
    ).toBe("acme/app#7");
  });

  it("refuses what only this client could resolve, and previews without a page", () => {
    const attachment = {
      ...fileSurface,
      id: "attachment:a1",
      attachment: {
        type: "file",
        id: "a1",
        name: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 1,
      },
    } as RightPanelSurface;
    expect(canvasSurfaceCardFor(attachment, context)).toBeNull();
    expect(
      canvasSurfaceCardFor({ ...fileSurface, relativePath: "/home/user/notes.txt" }, context),
    ).toBeNull();
    expect(
      canvasSurfaceCardFor({ id: "browser:new", kind: "preview", resourceId: null }, context),
    ).toBeNull();
    expect(canvasSurfaceCardFor({ id: "diff", kind: "diff" }, context)).toBeNull();
  });
});
