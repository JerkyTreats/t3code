import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  extractCanvasAnchors,
  focusedChatOf,
  nextDefaultName,
  sameCanvasAnchors,
  useCanvasAnchorsStore,
  type WorkspaceBoardActions,
} from "./canvasAnchors";

const chatCard = (id: string, threadId: string, title: string, x = 100) => ({
  id,
  type: "rectangle",
  x,
  y: 120,
  width: 484,
  height: 624,
  customData: {
    t3Card: { kind: "surface", surface: { kind: "side-chat", threadId }, title },
  },
});

describe("extractCanvasAnchors", () => {
  it("extracts live pinned chats and named/unnamed frames while ignoring deleted elements", () => {
    const scene = [
      { id: "frame-1", type: "frame", name: "API Architecture", x: 10.4, y: 20.6 },
      { id: "frame-deleted", type: "frame", name: "Old Zone", isDeleted: true },
      { id: "frame-2", type: "frame", name: "  ", x: 900, y: 40 },
      chatCard("chat-card-1", "thread-alpha", "Backend Planner"),
      { ...chatCard("chat-card-deleted", "thread-gone", "Gone"), isDeleted: true },
      {
        id: "file-card-1",
        type: "rectangle",
        customData: { t3Card: { kind: "surface", surface: { kind: "files" }, title: "Files" } },
      },
    ];
    const anchors = extractCanvasAnchors(scene);

    expect(anchors.frames).toEqual([
      { elementId: "frame-1", name: "API Architecture" },
      { elementId: "frame-2", name: "Frame 1" },
    ]);
    expect(anchors.chats).toEqual([
      {
        elementId: "chat-card-1",
        threadId: ThreadId.make("thread-alpha"),
        title: "Backend Planner",
      },
    ]);

    // Dragging a card changes only its geometry, which no anchor carries.
    const dragged = scene.map((element) =>
      element.id === "chat-card-1" ? { ...element, x: 640, y: 900 } : element,
    );
    expect(sameCanvasAnchors(anchors, extractCanvasAnchors(dragged))).toBe(true);
    expect(
      sameCanvasAnchors(anchors, {
        ...anchors,
        frames: [{ ...anchors.frames[0]!, name: "Renamed" }, anchors.frames[1]!],
      }),
    ).toBe(false);
  });
});

describe("nextDefaultName", () => {
  it("counts past the highest number in use, so a deleted name is not handed out again", () => {
    expect(nextDefaultName("Zone", [])).toBe("Zone 1");
    // Zone 2 was deleted from [Zone 1, Zone 2, Zone 3]; the count of two would repeat Zone 3.
    expect(nextDefaultName("Zone", ["Zone 1", "Zone 3", "Auth", "Zone 3b", "Zoned 9"])).toBe(
      "Zone 4",
    );
  });
});

describe("focusedChatOf", () => {
  const chats = [
    { elementId: "a", threadId: ThreadId.make("thread-a"), title: "A" },
    { elementId: "b", threadId: ThreadId.make("thread-b"), title: "B" },
  ];
  it("keeps the focused pin while it is pinned and otherwise falls back to the first", () => {
    expect(focusedChatOf(chats, ThreadId.make("thread-b"))).toBe("thread-b");
    expect(focusedChatOf(chats, undefined)).toBe("thread-a");
    expect(focusedChatOf(chats, ThreadId.make("thread-unpinned"))).toBe("thread-a");
    expect(focusedChatOf([], ThreadId.make("thread-b"))).toBeNull();
  });
});

describe("useCanvasAnchorsStore", () => {
  it("keeps a chat pin action registered before the lazy board mounts", () => {
    const store = useCanvasAnchorsStore.getState();
    const boardKey = "env-anchors:canvas:store-test";
    const create = () => {};
    store.setChatPinCreator(boardKey, create);
    store.registerBoard({
      boardKey,
      environmentId: EnvironmentId.make("env-anchors"),
      boardId: ThreadId.make("canvas:store-test"),
      actions: {} as WorkspaceBoardActions,
      chats: [],
      frames: [],
    });
    expect(useCanvasAnchorsStore.getState().chatPinCreators[boardKey]).toBe(create);

    store.unregisterBoard(boardKey);
    expect(useCanvasAnchorsStore.getState().activeBoard).toBeNull();
    // The view, not the board, owns the action.
    expect(useCanvasAnchorsStore.getState().chatPinCreators[boardKey]).toBe(create);
    store.releaseView(boardKey);
    expect(useCanvasAnchorsStore.getState().chatPinCreators[boardKey]).toBeUndefined();
  });
});
