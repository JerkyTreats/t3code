import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  type RightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "../rightPanelStore";
import {
  canvasSurfaceCardFor,
  canvasSurfaceAdders,
  canvasSurfaceRefFor,
  cardsShowingElsewhere,
  createSurfaceActivation,
  liveSurfaceCards,
  panelSurfaceOf,
  registerCanvasBoard,
  surfaceShownElsewhere,
  type SurfaceCardBox,
} from "./canvasSurfaceCards";

const viewport = { x: 0, y: 0, width: 1000, height: 800 };
const card = (id: string, x: number, kind: SurfaceCardBox["kind"] = "file"): SurfaceCardBox => ({
  id,
  kind,
  x,
  y: 0,
  width: 200,
  height: 200,
});
const live = (input: Partial<Parameters<typeof liveSurfaceCards>[0]>) => [
  ...liveSurfaceCards({ cards: [], viewport, live: new Set(), interacting: null, ...input }),
];

describe("liveSurfaceCards", () => {
  it("goes live in view, and holds until a quarter viewport out", () => {
    // Just off the right edge: not live yet, but a live card there holds on.
    const nearby = card("a", 1100);
    expect(live({ cards: [nearby] })).toEqual([]);
    expect(live({ cards: [nearby], live: new Set(["a"]) })).toEqual(["a"]);
    // Past the quarter-viewport margin (1000 + 250), it leaves.
    expect(live({ cards: [card("a", 1300)], live: new Set(["a"]) })).toEqual([]);
    // Zoom only changes what the viewport covers: a card in it is live however small it reads.
    expect(live({ cards: [card("a", 9000)], viewport: { ...viewport, width: 10_000 } })).toEqual([
      "a",
    ]);
  });

  it("caps live cards of every kind at six, keeping those already live, then by element id", () => {
    const kinds = ["file", "terminal", "preview", "diff", "side-chat", "device", "files"] as const;
    const cards = ["g", "f", "e", "d", "c", "b", "a"].map((id, index) =>
      card(id, index * 10, kinds[index]),
    );
    expect(live({ cards }).toSorted()).toEqual(["a", "b", "c", "d", "e", "f"]);
    // A card already live keeps its place over a lower id that comes into view.
    expect(live({ cards, live: new Set(["g", "f", "e", "d", "c", "b"]) }).toSorted()).toEqual([
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ]);
  });

  it("keeps the card the user is interacting with live past the cap and out of view", () => {
    const cards = [...["a", "b", "c", "d", "e", "f"].map((id) => card(id, 0)), card("z", 5000)];
    const result = live({ cards, live: new Set(["a", "b", "c", "d", "e", "z"]), interacting: "z" });
    expect(result).toContain("z");
    expect(result).toHaveLength(6);
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
      t3Card: { kind: "surface", surface: { kind: "preview", tabId: id } },
    },
  });
  const view = (scrollX: number, zoom = 1) => ({ scrollX, scrollY: 0, zoom: { value: zoom } });
  const size = { width: 1000, height: 800 };

  it("publishes membership changes once the camera rests, never mid-pan", () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const activation = createSurfaceActivation(publish, 150);
    const scene = [element("a", 100), { id: "note", x: 0, y: 0, width: 10, height: 10 }];
    activation.update(scene, view(0), size);
    // The board opening shows its cards at once.
    expect(publish).toHaveBeenLastCalledWith(new Set(["a"]));
    expect(activation.showsLive("preview")).toBe(true);
    // Small pans and any zoom that keeps it in view change nothing.
    for (const scroll of [-10, -20, -30]) activation.update(scene, view(scroll), size);
    for (const zoom of [0.2, 0.1, 2]) activation.update(scene, view(0, zoom), size);
    // A pan that sweeps the card out and back without resting leaves it mounted.
    activation.update(scene, view(-3000), size);
    vi.advanceTimersByTime(100);
    activation.update(scene, view(0), size);
    vi.advanceTimersByTime(500);
    expect(publish).toHaveBeenCalledTimes(1);
    // Panned away and resting, the card leaves; panned back and resting, it returns.
    activation.update(scene, view(-3000), size);
    expect(activation.showsLive("preview")).toBe(true);
    vi.advanceTimersByTime(150);
    expect(activation.showsLive("preview")).toBe(false);
    activation.update(scene, view(0), size);
    vi.advanceTimersByTime(150);
    expect(publish.mock.calls.map(([members]) => [...members])).toEqual([["a"], [], ["a"]]);
    // The card the user engages joins at once, past the wait.
    activation.update([...scene, element("b", 5000)], view(0), size);
    activation.setInteracting("b");
    expect(publish).toHaveBeenLastCalledWith(new Set(["a", "b"]));
    activation.dispose();
    vi.useRealTimers();
  });
});

describe("canvasSurfaceRefFor and panelSurfaceOf", () => {
  const surfaces: ReadonlyArray<RightPanelSurface> = [
    {
      id: "file:src/app.ts",
      kind: "file",
      relativePath: "src/app.ts",
      revealLine: 4,
      revealRequestId: 1,
      folderTrail: "src/app.ts/deeper",
    },
    { id: "files", kind: "files", folderTrail: "src/app" },
    { id: "browser:tab-1", kind: "preview", resourceId: "tab-1" },
    {
      id: "terminal:t1",
      kind: "terminal",
      resourceId: "t1",
      terminalIds: ["t1", "t2"],
      activeTerminalId: "t2",
      splitDirection: "vertical",
    },
    { id: "diff", kind: "diff" },
    {
      id: "pull-request:p:acme%2Fapp:7",
      kind: "pull-request",
      projectId: "p",
      repository: "acme/app",
      number: 7,
    },
    { id: "pull-requests", kind: "pull-requests" },
    { id: "side-chat:side-1", kind: "side-chat", threadId: ThreadId.make("side-1") },
    { id: "device", kind: "device" },
    {
      id: "device:host:phone",
      kind: "device",
      target: { hostId: "host", deviceId: "phone", platform: "ios", name: "iPhone" },
    },
  ];

  it.each(surfaces.map((surface) => [surface.id, surface] as const))(
    "%s comes back as the panel's own surface",
    (_id, surface) => {
      const ref = canvasSurfaceRefFor(surface);
      expect(ref).not.toBeNull();
      expect(panelSurfaceOf(ref!)).toEqual(surface);
    },
  );

  it("places a browser tab with its page, and refuses what only this client could resolve", () => {
    expect(
      canvasSurfaceRefFor(
        { id: "browser:tab-1", kind: "preview", resourceId: "tab-1" },
        {
          "tab-1": {
            navStatus: { _tag: "Ready", url: "http://localhost:3000", title: "App" },
          } as never,
        },
      ),
    ).toEqual({ kind: "preview", tabId: "tab-1", url: "http://localhost:3000" });
    const attachment = {
      ...surfaces[0],
      id: "attachment:a1",
      attachment: {
        type: "file",
        id: "a1",
        name: "notes.txt",
        mimeType: "text/plain",
        sizeBytes: 1,
      },
    } as RightPanelSurface;
    expect(canvasSurfaceRefFor(attachment)).toBeNull();
    expect(
      canvasSurfaceRefFor({ ...surfaces[0], relativePath: "/home/user/notes.txt" } as never),
    ).toBeNull();
    expect(
      canvasSurfaceRefFor({ id: "browser:new", kind: "preview", resourceId: null }),
    ).toBeNull();
  });

  it("titles a pull request card by repository, since its tab's number names nothing on a board", () => {
    expect(canvasSurfaceCardFor(surfaces[5]!, { previewSessions: {}, title: "#7" })?.title).toBe(
      "acme/app#7",
    );
  });
});

describe("surfaceShownElsewhere", () => {
  const terminal = {
    id: "terminal:t1",
    kind: "terminal",
    resourceId: "t1",
    terminalIds: ["t1", "t2"],
    activeTerminalId: "t1",
  } satisfies RightPanelSurface;
  const browser = { kind: "preview", tabId: "tab-1" } as const;

  it("yields a browser, terminal, side chat or device to the panel, then the mini player", () => {
    const none = { panel: null, miniPlayer: null };
    expect(surfaceShownElsewhere(browser, none)).toBeNull();
    expect(
      surfaceShownElsewhere(browser, {
        panel: { id: "browser:tab-1", kind: "preview", resourceId: "tab-1" },
        miniPlayer: { kind: "browser", tabId: "tab-1" },
      }),
    ).toBe("panel");
    expect(
      surfaceShownElsewhere(browser, {
        panel: null,
        miniPlayer: { kind: "browser", tabId: "tab-1" },
      }),
    ).toBe("mini-player");
    // A card with one terminal of a panel group still collides with that group.
    expect(
      surfaceShownElsewhere({ kind: "terminal", resourceId: "t2" }, { ...none, panel: terminal }),
    ).toBe("panel");
    expect(
      surfaceShownElsewhere(
        { kind: "side-chat", threadId: "side-1" },
        {
          ...none,
          panel: { id: "side-chat:side-1", kind: "side-chat", threadId: ThreadId.make("side-1") },
        },
      ),
    ).toBe("panel");
    const target = { hostId: "h", deviceId: "d", platform: "ios", name: "iPhone" } as const;
    expect(
      surfaceShownElsewhere(
        { kind: "device", target },
        { panel: null, miniPlayer: { kind: "device", ...target } },
      ),
    ).toBe("mini-player");
  });

  it("lets files, the diff and pull requests show in a card and the panel at once", () => {
    const panel = {
      id: "file:a.ts",
      kind: "file",
      relativePath: "a.ts",
      revealLine: null,
      revealRequestId: 0,
    } as const;
    expect(
      surfaceShownElsewhere({ kind: "file", relativePath: "a.ts" }, { panel, miniPlayer: null }),
    ).toBeNull();
    expect(
      surfaceShownElsewhere(
        { kind: "diff" },
        { panel: { id: "diff", kind: "diff" }, miniPlayer: null },
      ),
    ).toBeNull();
    // A different browser tab in the panel leaves the card live.
    expect(
      surfaceShownElsewhere(browser, {
        panel: { id: "browser:tab-2", kind: "preview", resourceId: "tab-2" },
        miniPlayer: null,
      }),
    ).toBeNull();
  });
});

describe("cardsShowingElsewhere", () => {
  const browser = { kind: "preview", tabId: "tab-1" } as const;

  it("lets the lowest element id show a browser two cards name, unless the user picked one", () => {
    const cards = [
      { id: "b", ref: browser },
      { id: "a", ref: browser },
      { id: "c", ref: { kind: "preview", tabId: "tab-2" } as const },
    ];
    expect([...cardsShowingElsewhere(cards, null)]).toEqual([["b", "a"]]);
    expect([...cardsShowingElsewhere(cards, "b")]).toEqual([["a", "b"]]);
  });

  it("yields a terminal group that shares any terminal with a group already shown", () => {
    const cards = [
      { id: "a", ref: { kind: "terminal", resourceId: "t1", terminalIds: ["t1", "t2"] } as const },
      { id: "b", ref: { kind: "terminal", resourceId: "t2" } as const },
      { id: "c", ref: { kind: "terminal", resourceId: "t3" } as const },
      // Files and the diff can show twice.
      { id: "d", ref: { kind: "diff" } as const },
      { id: "e", ref: { kind: "diff" } as const },
    ];
    expect([...cardsShowingElsewhere(cards, null)]).toEqual([["b", "a"]]);
  });
});

describe("canvasSurfaceAdders", () => {
  it("opens a browser tab in the panel when its board is gone by the time the tab starts", () => {
    const threadRef = {
      environmentId: "adders-test" as never,
      threadId: ThreadId.make("thread"),
    };
    useRightPanelStore.getState().removeThread(threadRef);
    const placed = vi.fn();
    const started: Array<(tabId: string) => void> = [];
    const adders = canvasSurfaceAdders(threadRef, {
      browser: (place) => started.push(place),
      terminal: () => {},
      sideChat: () => {},
      pullRequest: null,
    });
    const unregister = registerCanvasBoard(threadRef, placed);
    adders.onAddBrowser({ x: 10, y: 20 });
    adders.onAddBrowser({ x: 30, y: 40 });
    started[0]!("tab-1");
    unregister();
    started[1]!("tab-2");
    expect(placed.mock.calls).toEqual([
      [
        { kind: "surface", surface: { kind: "preview", tabId: "tab-1" }, title: "Browser" },
        { at: { x: 10, y: 20 } },
      ],
    ]);
    const panel = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef);
    expect(panel.activeSurfaceId).toBe("browser:tab-2");
    expect(panel.surfaces.map((surface) => surface.id)).toEqual(["browser:tab-2"]);
  });
});
