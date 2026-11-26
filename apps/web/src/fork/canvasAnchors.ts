import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { canvasSurfaceCardOf } from "@t3tools/shared/canvasSurfaceCard";
import { create } from "zustand";

/**
 * A chat pinned on a Workspace Canvas, as the sidebar lists it. No geometry: jumps read the live
 * scene, so dragging a card never changes an anchor.
 */
export interface CanvasChatAnchor {
  readonly elementId: string;
  readonly threadId: ThreadId;
  readonly title: string;
}

/** A frame on a Workspace Canvas, as the sidebar lists it. */
export interface CanvasFrameAnchor {
  readonly elementId: string;
  readonly name: string;
}

export interface CanvasAnchorsSnapshot {
  readonly chats: ReadonlyArray<CanvasChatAnchor>;
  readonly frames: ReadonlyArray<CanvasFrameAnchor>;
}

export interface WorkspaceBoardActions {
  readonly jumpToElement: (elementId: string, options?: { readonly fit?: boolean }) => boolean;
  readonly zoomToFit: () => void;
  readonly addFrame: (
    at?: { readonly x: number; readonly y: number },
    name?: string,
  ) => string | null;
  readonly placeChatPin: (
    thread: { readonly threadId: ThreadId; readonly title: string },
    at?: { readonly x: number; readonly y: number },
  ) => string | null;
}

interface AnchorSceneElement {
  readonly id: string;
  readonly type: string;
  readonly isDeleted?: boolean;
  readonly name?: string | null;
  readonly customData?: Record<string, unknown> | undefined;
}

/**
 * Extracts spatial waypoints (pinned Peer Chats and named Frames) from an Excalidraw scene,
 * ignoring deleted elements and keeping scene order.
 */
export function extractCanvasAnchors(
  elements: ReadonlyArray<AnchorSceneElement>,
): CanvasAnchorsSnapshot {
  const chats: CanvasChatAnchor[] = [];
  const frames: CanvasFrameAnchor[] = [];
  let unnamedFrameIndex = 0;

  for (const element of elements) {
    if (element.isDeleted) continue;

    if (element.type === "frame") {
      const trimmed = typeof element.name === "string" ? element.name.trim() : "";
      const name = trimmed.length > 0 ? trimmed : `Frame ${++unnamedFrameIndex}`;
      frames.push({ elementId: element.id, name });
      continue;
    }

    const card = canvasSurfaceCardOf(element.customData?.t3Card);
    if (card?.surface.kind === "side-chat") {
      chats.push({
        elementId: element.id,
        threadId: card.surface.threadId as ThreadId,
        title: card.title,
      });
    }
  }

  return { chats, frames };
}

export function sameCanvasAnchors(a: CanvasAnchorsSnapshot, b: CanvasAnchorsSnapshot): boolean {
  if (a.chats.length !== b.chats.length || a.frames.length !== b.frames.length) return false;
  for (let i = 0; i < a.chats.length; i++) {
    const left = a.chats[i]!;
    const right = b.chats[i]!;
    if (
      left.elementId !== right.elementId ||
      left.threadId !== right.threadId ||
      left.title !== right.title
    ) {
      return false;
    }
  }
  for (let i = 0; i < a.frames.length; i++) {
    const left = a.frames[i]!;
    const right = b.frames[i]!;
    if (left.elementId !== right.elementId || left.name !== right.name) return false;
  }
  return true;
}

/** `${prefix} N` one past the highest N already used, so a deleted name is never handed out twice. */
export function nextDefaultName(prefix: string, names: ReadonlyArray<string>): string {
  let highest = 0;
  for (const name of names) {
    if (!name.startsWith(`${prefix} `)) continue;
    const suffix = name.slice(prefix.length + 1);
    if (/^\d+$/.test(suffix)) highest = Math.max(highest, Number(suffix));
  }
  return `${prefix} ${highest + 1}`;
}

/**
 * The chat pin that Cite and the focus ring target: the one last clicked on the board or in the
 * sidebar while it is still pinned, otherwise the first pin.
 */
export function focusedChatOf(
  chats: ReadonlyArray<CanvasChatAnchor>,
  focused: ThreadId | undefined,
): ThreadId | null {
  if (focused !== undefined && chats.some((chat) => chat.threadId === focused)) return focused;
  return chats[0]?.threadId ?? null;
}

/** The Workspace Canvas board mounted now, which the sidebar lists waypoints for. */
export interface ActiveWorkspaceBoard extends CanvasAnchorsSnapshot {
  readonly boardKey: string;
  readonly environmentId: EnvironmentId;
  readonly boardId: ThreadId;
  readonly actions: WorkspaceBoardActions;
}

interface CanvasAnchorsStore {
  readonly activeBoard: ActiveWorkspaceBoard | null;
  /** The chat pin last focused on each board, by board key. */
  readonly focusedChat: Readonly<Record<string, ThreadId>>;
  /**
   * Each canvas view's "+ chat pin" action, by board key. Kept apart from the board, which mounts
   * lazily after the view, so the action is there whichever registers first.
   */
  readonly chatPinCreators: Readonly<Record<string, () => void>>;
  readonly registerBoard: (board: ActiveWorkspaceBoard) => void;
  readonly updateAnchors: (boardKey: string, snapshot: CanvasAnchorsSnapshot) => void;
  readonly focusChat: (boardKey: string, threadId: ThreadId) => void;
  readonly setChatPinCreator: (boardKey: string, create: (() => void) | null) => void;
  /** Forgets the view's state for a board: its focus and its chat pin action. */
  readonly releaseView: (boardKey: string) => void;
  readonly unregisterBoard: (boardKey: string) => void;
}

const withoutKey = <V>(record: Readonly<Record<string, V>>, key: string) => {
  if (!(key in record)) return record;
  const { [key]: _removed, ...rest } = record;
  return rest;
};

export const useCanvasAnchorsStore = create<CanvasAnchorsStore>((set) => ({
  activeBoard: null,
  focusedChat: {},
  chatPinCreators: {},
  registerBoard: (board) => set({ activeBoard: board }),
  updateAnchors: (boardKey, snapshot) =>
    set((state) => {
      if (state.activeBoard?.boardKey !== boardKey) return state;
      if (sameCanvasAnchors(state.activeBoard, snapshot)) return state;
      return {
        activeBoard: { ...state.activeBoard, chats: snapshot.chats, frames: snapshot.frames },
      };
    }),
  focusChat: (boardKey, threadId) =>
    set((state) =>
      state.focusedChat[boardKey] === threadId
        ? state
        : { focusedChat: { ...state.focusedChat, [boardKey]: threadId } },
    ),
  setChatPinCreator: (boardKey, create) =>
    set((state) => {
      if (create === null) {
        const next = withoutKey(state.chatPinCreators, boardKey);
        return next === state.chatPinCreators ? state : { chatPinCreators: next };
      }
      return state.chatPinCreators[boardKey] === create
        ? state
        : { chatPinCreators: { ...state.chatPinCreators, [boardKey]: create } };
    }),
  releaseView: (boardKey) =>
    set((state) => ({
      focusedChat: withoutKey(state.focusedChat, boardKey),
      chatPinCreators: withoutKey(state.chatPinCreators, boardKey),
    })),
  unregisterBoard: (boardKey) =>
    set((state) => (state.activeBoard?.boardKey === boardKey ? { activeBoard: null } : state)),
}));

const NO_CHATS: ReadonlyArray<CanvasChatAnchor> = [];

/** The chats pinned on `boardKey`'s board while it is mounted. */
export function useBoardChats(boardKey: string): ReadonlyArray<CanvasChatAnchor> {
  return useCanvasAnchorsStore((state) =>
    state.activeBoard?.boardKey === boardKey ? state.activeBoard.chats : NO_CHATS,
  );
}

/** The chat pin Cite and the focus ring target on `boardKey`'s board, or null. */
export function useFocusedChat(boardKey: string): ThreadId | null {
  return useCanvasAnchorsStore((state) =>
    focusedChatOf(
      state.activeBoard?.boardKey === boardKey ? state.activeBoard.chats : NO_CHATS,
      state.focusedChat[boardKey],
    ),
  );
}
