import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  exportToBlob,
  MainMenu,
  newElementWith,
  restoreElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { ThreadCanvasScene } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ChatMarkdown from "../components/ChatMarkdown";
import { HtmlRenderFrame } from "../components/chat/HtmlRenderFrame";
import { Button } from "../components/ui/button";
import { observeResize } from "../lib/observeResize";
import { useStableCallback } from "../hooks/useStableCallback";
import { useTheme } from "../hooks/useTheme";
import {
  ThreadCanvasSync,
  type SaveThreadCanvas,
  type ThreadCanvasTarget,
} from "./ThreadCanvasSync";
import {
  coveredText,
  renderedCardsIn,
  drawingTurnOf,
  isUserMark,
  selectedNotes,
  toSavableElements,
  unseenSketchMarks,
  unseenMarks,
} from "./canvasMarks";
import {
  isStaleDrawingCopy,
  TURN_ANCHOR_KEY,
  type TurnAnchor,
  turnAnchorOf,
} from "@t3tools/shared/threadCanvasDrawing";
import {
  type CanvasCard,
  canvasCardsOf,
  fittedCardHeights,
  onCanvasReveal,
  sameCanvasCards,
} from "./canvasCards";
import { forwardCardMiddleDrag } from "./cardMiddleDrag";
import { reportDraftScene, takeDraftMarks, withoutTakenMarks } from "./draftBoardHandoff";
import { layoutTurns, TURN_INSET_PX, type BoardBox, type TurnBoard } from "./turnBoard";
import { tableWidthOf } from "./turnTableWidth";

type ExcalidrawProps = React.ComponentProps<typeof Excalidraw>;
type BoardChange = NonNullable<ExcalidrawProps["onChange"]>;
type BoardElements = Parameters<BoardChange>[0];
type BoardElement = BoardElements[number];
type BoardView = Pick<Parameters<BoardChange>[1], "scrollX" | "scrollY" | "zoom">;
type BoardPiece = "hero" | "composer";
type BoardRect = { x: number; y: number; width: number; height: number };

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

const DRAFT_STORAGE_KEY = "t3code:demo:draft-excalidraw-board";
const TURN_STORAGE_PREFIX = "t3code:demo:turn-board:";
const BOARD_SAVE_DELAY_MS = 400;
const BOARD_PIECES: readonly BoardPiece[] = ["hero", "composer"];
// T3's pieces sit inside their box, so its stroke and handles stay grabbable.
const FRAME_INSET_PX = 12;
const FRAME_STROKE_COLOR = "#868e96";
const HERO_DEFAULT_HEIGHT_PX = 130;
const COMPOSER_DEFAULT_HEIGHT_PX = 122;
const COMPOSER_DEFAULT_WIDTH_PX = 760;
const TOPBAR_FALLBACK_PX = 48;
// A landing turn stops under Excalidraw's toolbar and above the composer.
const TOOLBAR_CLEARANCE_PX = 64;
const COMPOSER_CLEARANCE_PX = 24;
const TURN_STROKE_OPACITY = 40;
const PAN_DURATION_MS = 280;
// How far the camera may sit from the latest turn and still count as following it.
const FOLLOW_TOLERANCE_PX = 48;
const NOTE_ACTION_GAP_PX = 10;
const SKETCH_MAX_EDGE_PX = 1600;
// Base64 costs a third more, and a larger picture would be refused by the save.
const SKETCH_MAX_BYTES = 5_000_000;

// Fonts are copied into public/excalidraw so the board never reaches a CDN.
window.EXCALIDRAW_ASSET_PATH = "/excalidraw/";

function readSavedBoard(storageKey: string): ExcalidrawInitialDataState {
  const appState = { viewBackgroundColor: "transparent" };
  try {
    const saved = localStorage.getItem(storageKey);
    const elements: BoardElement[] = saved === null ? [] : JSON.parse(saved);
    // The first demo kept one chat box per board; turns have their own boxes now.
    return { elements: elements.filter((el) => el.customData?.t3Piece !== "chat"), appState };
  } catch {
    return { elements: [], appState };
  }
}

function framePiece(element: BoardElement): BoardPiece | null {
  const piece = element.customData?.t3Piece;
  return BOARD_PIECES.find((candidate) => candidate === piece) ?? null;
}

/** Default boxes in view pixels, stacked around the column's center like the regular draft hero. */
function defaultViewRect(piece: BoardPiece, root: HTMLElement): BoardRect {
  const { width: columnWidth, height: columnHeight } = root.getBoundingClientRect();
  const centered = (width: number) => (columnWidth - width) / 2;
  const width = Math.min(COMPOSER_DEFAULT_WIDTH_PX, columnWidth - 2 * FRAME_INSET_PX);
  const composerTop = columnHeight / 2 - COMPOSER_DEFAULT_HEIGHT_PX / 2;
  return piece === "composer"
    ? { x: centered(width), y: composerTop, width, height: COMPOSER_DEFAULT_HEIGHT_PX }
    : {
        x: centered(width),
        y: composerTop - HERO_DEFAULT_HEIGHT_PX,
        width,
        height: HERO_DEFAULT_HEIGHT_PX,
      };
}

function createFrame(piece: BoardPiece, root: HTMLElement, view: BoardView) {
  const rect = defaultViewRect(piece, root);
  const zoom = view.zoom.value;
  const [frame] = convertToExcalidrawElements([
    {
      type: "rectangle",
      x: rect.x / zoom - view.scrollX,
      y: rect.y / zoom - view.scrollY,
      width: rect.width / zoom,
      height: rect.height / zoom,
      strokeColor: FRAME_STROKE_COLOR,
      roundness: { type: 3 },
      customData: { t3Piece: piece },
    },
  ]);
  return frame;
}

function composerStack(root: HTMLElement) {
  return root.querySelector<HTMLElement>('[data-board-piece="composer"]');
}

/** Replaces any missing box and fits the composer's. */
function reconcileFrames(elements: BoardElements, root: HTMLElement, view: BoardView) {
  const composer = composerStack(root);
  const composerHeight = composer
    ? (composer.getBoundingClientRect().height + 2 * FRAME_INSET_PX) / view.zoom.value
    : null;
  const present = new Set(elements.filter((element) => !element.isDeleted).map(framePiece));
  const created = BOARD_PIECES.filter((piece) => !present.has(piece)).flatMap((piece) => {
    const frame = createFrame(piece, root, view);
    return frame === undefined ? [] : [frame];
  });
  let changed = created.length > 0;
  const reconciled = [...elements, ...created].map((element) => {
    const piece = framePiece(element);
    if (piece === null || element.isDeleted) return element;
    const height =
      piece === "composer" &&
      composerHeight !== null &&
      Math.abs(element.height - composerHeight) >= 1
        ? composerHeight
        : element.height;
    if (element.angle === 0 && element.height === height) return element;
    changed = true;
    return newElementWith(element, { angle: 0 as typeof element.angle, height });
  });
  return changed ? reconciled : null;
}

/** Publishes each box's view rect as column variables, so moving a box skips React. */
function publishFrames(elements: BoardElements, root: HTMLElement, view: BoardView) {
  const zoom = view.zoom.value;
  for (const element of elements) {
    const piece = framePiece(element);
    if (piece === null || element.isDeleted) continue;
    const rect = {
      left: (element.x + view.scrollX) * zoom + FRAME_INSET_PX,
      top: (element.y + view.scrollY) * zoom + FRAME_INSET_PX,
      width: element.width * zoom - 2 * FRAME_INSET_PX,
      height: element.height * zoom - 2 * FRAME_INSET_PX,
    };
    for (const [edge, value] of Object.entries(rect)) {
      root.style.setProperty(`--board-${piece}-${edge}`, `${value}px`);
    }
  }
  root.dataset.boardFrames = "true";
}

function boardRootOf(board: HTMLElement | null) {
  return board?.closest<HTMLElement>("[data-board-root]") ?? null;
}

// Boxes are bookkeeping, so they stay out of undo history.
function syncFrames(
  api: ExcalidrawImperativeAPI,
  root: HTMLElement,
  elements: BoardElements,
  view: BoardView,
) {
  const reconciled = reconcileFrames(elements, root, view);
  if (reconciled !== null) {
    api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER });
  }
  publishFrames(reconciled ?? elements, root, view);
}

/** The drawing an element moves with: its own, or the one whose card a mark was carried on. */
function drawingGroupOf(customData: Record<string, unknown> | undefined) {
  for (const key of ["t3Drawing", "t3Follow"]) {
    const record = customData?.[key];
    const id =
      typeof record === "object" && record !== null
        ? Reflect.get(record, key === "t3Drawing" ? "id" : "drawing")
        : undefined;
    if (typeof id === "string" && id !== "") return id;
  }
  return null;
}

function asBoardBox(element: BoardElement): BoardBox {
  const { t3Turn, t3TurnWidth, t3Card } = element.customData ?? {};
  return {
    key: element.id,
    group: drawingGroupOf(element.customData),
    anchor: turnAnchorOf(element),
    card: t3Card !== undefined,
    turnId: typeof t3Turn === "string" ? t3Turn : null,
    requestedWidth: typeof t3TurnWidth === "number" ? t3TurnWidth : null,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}

function readBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Renders marks an agent cannot read as data. T3's own elements stay out of the picture. */
function renderSketch(api: ExcalidrawImperativeAPI, marks: BoardElements) {
  const ids = new Set(marks.map((mark) => mark.id));
  return exportToBlob({
    elements: api
      .getSceneElements()
      .filter(
        (element) =>
          ids.has(element.id) || (element.type === "text" && ids.has(element.containerId ?? "")),
      ),
    files: api.getFiles(),
    mimeType: "image/png",
    appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
    getDimensions: (width: number, height: number) => {
      const scale = Math.min(1, SKETCH_MAX_EDGE_PX / Math.max(width, height));
      return { width: width * scale, height: height * scale, scale };
    },
  });
}

const turnElementId = (turnId: string | null) => `turn-box:${turnId}`;

function turnData(box: BoardBox, title: string) {
  return { t3Turn: box.turnId, t3TurnWidth: box.requestedWidth, t3TurnTitle: title };
}

// Ids follow the turn, so a second client lands the same box instead of a duplicate.
function createTurnBox(box: BoardBox, title: string) {
  const [element] = convertToExcalidrawElements(
    [
      {
        type: "rectangle",
        id: turnElementId(box.turnId),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        strokeColor: FRAME_STROKE_COLOR,
        strokeWidth: 1,
        opacity: TURN_STROKE_OPACITY,
        roundness: { type: 3 },
        customData: turnData(box, title),
      },
    ],
    { regenerateIds: false },
  );
  return element;
}

/** Each turn's height, and the width it asks for: an html render's, or a wide table's. */
function measureCards(turnBoard: TurnBoard) {
  return turnBoard.cards().map(({ id, element, requestedWidth }) => {
    const tableWidth = tableWidthOf(element);
    return {
      id,
      height: element.offsetHeight,
      requestedWidth:
        tableWidth === null ? requestedWidth : Math.max(requestedWidth ?? 0, tableWidth),
    };
  });
}

const sameAnchor = (left: TurnAnchor | null, right: TurnAnchor | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.turn === right.turn &&
    left.bottom === right.bottom &&
    left.dy === right.dy &&
    left.x === right.x);

function withAnchor(customData: BoardElement["customData"], anchor: TurnAnchor | null) {
  const { [TURN_ANCHOR_KEY]: _previous, ...rest } = customData ?? {};
  return anchor === null ? rest : { ...rest, [TURN_ANCHOR_KEY]: anchor };
}

/**
 * Applies the turn layout to the scene, restoring any turn box that was deleted. Markdown cards
 * take the height of their text first, so the layout makes room for what they really show.
 */
function reconcileTurns(api: ExcalidrawImperativeAPI, turnBoard: TurnBoard) {
  const all = api.getSceneElementsIncludingDeleted();
  const live = all.filter((element) => !element.isDeleted || asBoardBox(element).turnId !== null);
  const fitted = fittedCardHeights(turnBoard.layer(), TURN_INSET_PX);
  const boxes = live.map((element) => {
    const box = asBoardBox(element);
    const height = element.isDeleted ? undefined : fitted.get(element.id);
    return height === undefined || Math.abs(height - box.height) < 1 ? box : { ...box, height };
  });
  const titles = new Map(turnBoard.cards().map((card) => [card.id, card.title]));
  const placed = layoutTurns(boxes, measureCards(turnBoard));
  const byKey = new Map(placed.map((box) => [box.key, box]));
  let changed = false;
  const elements = all.map((element) => {
    const box = byKey.get(element.id);
    if (box === undefined) return element;
    const restored = element.isDeleted && box.turnId !== null;
    const title = box.turnId === null ? undefined : titles.get(box.turnId);
    const anchor = box.anchor ?? null;
    const anchorMoved = box.turnId === null && !sameAnchor(turnAnchorOf(element), anchor);
    if (
      !restored &&
      !anchorMoved &&
      (title === undefined || element.customData?.t3TurnTitle === title) &&
      box.x === element.x &&
      box.y === element.y &&
      box.width === element.width &&
      box.height === element.height
    ) {
      return element;
    }
    changed = true;
    return newElementWith(element, {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      isDeleted: false,
      ...(box.turnId !== null
        ? { customData: turnData(box, title ?? "") }
        : anchorMoved
          ? { customData: withAnchor(element.customData, anchor) }
          : {}),
    });
  });
  const known = new Set(all.map((element) => element.id));
  const created = placed.flatMap((box) => {
    if (known.has(box.key)) return [];
    const element = createTurnBox(box, titles.get(box.turnId ?? "") ?? "");
    return element === undefined ? [] : [element];
  });
  if (changed || created.length > 0) {
    api.updateScene({
      elements: [...elements, ...created],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }
}

/** Moves the card layer with the camera, and each card to its box, without touching React. */
function placeCards(
  api: ExcalidrawImperativeAPI,
  turnBoard: TurnBoard,
  board: HTMLElement,
  view: BoardView,
) {
  const layer = turnBoard.layer();
  const origin = layer?.parentElement;
  if (!layer || !origin) return;
  const boardRect = board.getBoundingClientRect();
  const originRect = origin.getBoundingClientRect();
  const zoom = view.zoom.value;
  const left = view.scrollX * zoom + boardRect.left - originRect.left;
  const top = view.scrollY * zoom + boardRect.top - originRect.top;
  layer.style.transform = `translate(${left}px, ${top}px) scale(${zoom})`;
  const boxes = new Map(
    api.getSceneElements().flatMap((element) => {
      const { turnId } = asBoardBox(element);
      return turnId === null ? [] : [[turnId, element] as const];
    }),
  );
  for (const card of turnBoard.cards()) {
    const box = boxes.get(card.id);
    if (box === undefined) continue;
    card.element.style.transform = `translate(${box.x + TURN_INSET_PX}px, ${box.y + TURN_INSET_PX}px)`;
    card.element.style.width = `${box.width - 2 * TURN_INSET_PX}px`;
    card.element.dataset.placed = "true";
  }
}

/** The camera that shows the latest turn: its top under the toolbar, or its end if it overflows. */
function latestTurnCamera(
  api: ExcalidrawImperativeAPI,
  turnBoard: TurnBoard,
  root: HTMLElement,
  view: BoardView,
) {
  const latest = turnBoard.cards().at(-1);
  const box = api
    .getSceneElements()
    .find((element) => latest !== undefined && asBoardBox(element).turnId === latest.id);
  if (box === undefined) return null;
  const rootRect = root.getBoundingClientRect();
  const headerHeight =
    root.querySelector("[data-chat-header]")?.getBoundingClientRect().height ?? TOPBAR_FALLBACK_PX;
  const composerTop =
    root.querySelector('[data-chat-composer-stack="true"]')?.getBoundingClientRect().top ??
    rootRect.bottom;
  const zoom = view.zoom.value;
  const visibleTop = (headerHeight + TOOLBAR_CLEARANCE_PX) / zoom;
  const visibleBottom = (composerTop - rootRect.top - COMPOSER_CLEARANCE_PX) / zoom;
  // A drawing the turn landed under counts as part of the turn, so the camera keeps it in view.
  const bottom = Math.max(
    box.y + box.height,
    ...api
      .getSceneElements()
      .filter((element) => latest !== undefined && drawingTurnOf(element) === latest.id)
      .map((element) => element.y + element.height),
  );
  const fits = bottom - box.y <= visibleBottom - visibleTop;
  return {
    scrollX: rootRect.width / 2 / zoom - (box.x + box.width / 2),
    scrollY: fits ? visibleTop - box.y : visibleBottom - bottom,
  };
}

function scrollsInside(event: WheelEvent, layer: HTMLElement) {
  let node = event.target instanceof Element ? event.target : null;
  while (node !== null && node !== layer) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight &&
      (event.deltaY < 0
        ? node.scrollTop > 0
        : node.scrollTop + node.clientHeight < node.scrollHeight - 1)
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Fills the chat column with a local Excalidraw board. A draft's boxes position the composer and
 * hero. A thread's boxes are its turns, which land down the board while the camera pans to follow.
 */
export default function ExcalidrawBoard({
  draft,
  storageId,
  turnBoard,
  canvasThread,
  onSendNote,
}: {
  draft: boolean;
  storageId: string;
  turnBoard: TurnBoard;
  /** The server thread whose canvas this board shows, once the thread exists there. */
  canvasThread: ThreadCanvasTarget | null;
  /** Sends the words of a note to the thread's agent as a user message. */
  onSendNote: (text: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const storageKey = draft ? DRAFT_STORAGE_KEY : `${TURN_STORAGE_PREFIX}${storageId}`;
  const [initialData] = useState(() => {
    const saved = readSavedBoard(storageKey);
    if (draft || storageId === "none") return saved;
    return { ...saved, elements: [...(saved.elements ?? []), ...takeDraftMarks<BoardElement>()] };
  });
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const saveCanvas = useRef<SaveThreadCanvas | null>(null);
  const savedVersions = useRef(0);
  // A scene that arrived before Excalidraw finished loading.
  const waitingScene = useRef<ThreadCanvasScene | null>(null);
  const seenByAgent = useRef<Readonly<Record<string, number>>>({});
  const pendingNotes = useRef(0);
  const [cards, setCards] = useState<ReadonlyArray<CanvasCard>>([]);
  const coveredCache = useRef(new Map<string, string | null>());
  const lastSketch = useRef("");
  const [noteAction, setNoteAction] = useState<{
    readonly key: string;
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
    readonly ids: ReadonlyArray<string>;
  } | null>(null);
  const camera = useRef({
    following: true,
    latestTurn: null as string | null,
    // The last position this board set, which tells its own moves from the reader's.
    set: null as { scrollX: number; scrollY: number } | null,
    panFrame: null as number | null,
  });

  const moveCamera = (target: { scrollX: number; scrollY: number }) => {
    camera.current.set = target;
    api?.updateScene({ appState: target, captureUpdate: CaptureUpdateAction.NEVER });
  };

  const setFollowing = (following: boolean) => {
    if (camera.current.following === following) return;
    camera.current.following = following;
    turnBoard.reportFollowing(following);
  };

  const cancelPan = useStableCallback(() => {
    if (camera.current.panFrame !== null) cancelAnimationFrame(camera.current.panFrame);
    camera.current.panFrame = null;
  });

  // Eases toward the latest turn, reading its position each frame because it may still be growing.
  const panToLatest = useStableCallback((animated: boolean) => {
    const root = boardRootOf(boardRef.current);
    if (!api || !root) return;
    cancelPan();
    setFollowing(true);
    const start = api.getAppState();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animated || reduceMotion) {
      const target = latestTurnCamera(api, turnBoard, root, start);
      if (target) moveCamera(target);
      return;
    }
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / PAN_DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      const target = latestTurnCamera(api, turnBoard, root, start);
      if (target) {
        moveCamera({
          scrollX: start.scrollX + (target.scrollX - start.scrollX) * eased,
          scrollY: start.scrollY + (target.scrollY - start.scrollY) * eased,
        });
      }
      camera.current.panFrame = progress < 1 ? requestAnimationFrame(step) : null;
    };
    camera.current.panFrame = requestAnimationFrame(step);
  });

  const syncTurns = useStableCallback(() => {
    const board = boardRef.current;
    const root = boardRootOf(board);
    if (!api || !board || !root || api.getAppState().isLoading) return;
    reconcileTurns(api, turnBoard);
    const view = api.getAppState();
    placeCards(api, turnBoard, board, view);
    const latest = turnBoard.cards().at(-1)?.id ?? null;
    if (latest !== camera.current.latestTurn) {
      const opening = camera.current.latestTurn === null;
      camera.current.latestTurn = latest;
      if (latest !== null) panToLatest(!opening);
    } else if (camera.current.following && camera.current.panFrame === null) {
      const target = latestTurnCamera(api, turnBoard, root, view);
      if (target && (target.scrollX !== view.scrollX || target.scrollY !== view.scrollY)) {
        moveCamera(target);
      }
    }
  });

  const pushScene = () => {
    if (!api || !saveCanvas.current) return;
    const elements = api.getSceneElementsIncludingDeleted();
    const versions = elements.reduce((total, element) => total + element.version, 0);
    if (versions === savedVersions.current) return;
    savedVersions.current = versions;
    const saved = saveCanvas.current?.(withCoveredText(elements));
    void pushSketch(elements);
    return saved;
  };

  /** Adds the text under each mark to what is saved. The scene never holds it, so no edit loops. */
  const withCoveredText = (elements: BoardElements) => {
    const layer = turnBoard.layer();
    const zoom = api?.getAppState().zoom.value ?? 1;
    const covered = (element: BoardElement) => {
      if (!layer || !isUserMark(element)) return null;
      const key = `${element.id}:${element.version}`;
      const known = coveredCache.current.get(key);
      if (known !== undefined) return known;
      const cards = [...turnBoard.cards(), ...renderedCardsIn(layer)];
      const text = coveredText(element, cards, layer, zoom);
      coveredCache.current.set(key, text);
      return text;
    };
    return toSavableElements(
      elements.map((element) => {
        const text = covered(element);
        return text === null
          ? element
          : { ...element, customData: { ...element.customData, t3Covers: text } };
      }),
    );
  };

  const pushSketch = async (elements: BoardElements) => {
    if (!api) return;
    const marks = unseenSketchMarks(elements, seenByAgent.current);
    const key = marks.map((mark) => `${mark.id}:${mark.version}`).join();
    if (marks.length === 0 || key === lastSketch.current) return;
    lastSketch.current = key;
    const blob = await renderSketch(api, marks);
    if (blob.size > SKETCH_MAX_BYTES) return;
    await saveCanvas.current?.([], await readBase64(blob));
  };

  /** Saves first, so the server knows the note by the time the turn it starts is prepared. */
  const sendNotes = useStableCallback(async (notes: ReadonlyArray<BoardElement>) => {
    if (!api) return;
    await pushScene();
    const text = notes
      .flatMap((note) => (note.type === "text" ? [note.text.trim()] : []))
      .join("\n");
    if (text === "") return;
    onSendNote(text);
    api.updateScene({
      appState: { selectedElementIds: {} },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  });

  const reportPendingNotes = (count: number) => {
    if (count === pendingNotes.current) return;
    pendingNotes.current = count;
    turnBoard.reportPendingNotes(count);
  };

  const trackNoteAction = (elements: BoardElements, appState: Parameters<BoardChange>[1]) => {
    const notes = selectedNotes(elements, appState.selectedElementIds);
    const idle =
      appState.activeTool.type === "selection" &&
      !appState.editingTextElement &&
      !appState.selectedElementsAreBeingDragged;
    const zoom = appState.zoom.value;
    const x = notes.length === 0 ? 0 : Math.min(...notes.map((note) => note.x));
    const y = Math.max(...notes.map((note) => note.y + note.height), 0);
    const ids = notes.map((note) => note.id);
    const key = `${ids.join()}:${x}:${y}:${zoom}`;
    const next = idle && ids.length > 0 ? { key, x, y, zoom, ids } : null;
    setNoteAction((current) => (current?.key === next?.key ? current : next));
  };

  // Excalidraw commits the text on this same keypress, so the note is read after it has.
  const sendEditedNote = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || !api) return;
    const editing = api.getAppState().editingTextElement;
    if (!editing) return;
    window.setTimeout(() => {
      const note = api.getSceneElements().find((element) => element.id === editing.id);
      if (note) void sendNotes([note]);
    }, 0);
  };

  /** Takes in whatever is newer on the server. */
  const applyScene = useStableCallback((scene: ThreadCanvasScene) => {
    if (!api || api.getAppState().isLoading) {
      waitingScene.current = scene;
      return;
    }
    syncTurns();
    seenByAgent.current = scene.seen ?? {};
    const local = api.getSceneElementsIncludingDeleted();
    const byId = new Map(local.map((element) => [element.id, element]));
    // The agent's newer write wins over a copy this client only shifted with the turns.
    const newer = (scene.elements as unknown as BoardElements).filter((remote) => {
      const mine = byId.get(remote.id);
      return (
        mine === undefined || mine.version < remote.version || isStaleDrawingCopy(mine, remote)
      );
    });
    const drawn = newer.filter((remote) => remote.customData?.t3Drawing !== undefined);
    // The server estimates text. This fits it to the real font, on the elements that came from it.
    const fitted = restoreElements(drawn, null, { refreshDimensions: true, repairBindings: true });
    const incoming = new Map<string, BoardElement>([
      ...newer.map((remote) => [remote.id, remote] as const),
      ...fitted.map((remote) => [remote.id, remote as BoardElement] as const),
    ]);
    const elements: BoardElements = [
      ...local.map((element) => incoming.get(element.id) ?? element),
      ...[...incoming.values()].filter((remote) => !byId.has(remote.id)),
    ];
    if (incoming.size > 0) {
      api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
      syncTurns();
    }
    // The first scene also means saving works, so marks made before it, like a draft's, go now.
    pushScene();
  });

  // A pending save still runs after unmount, so the last stroke survives sending a message.
  const saveBoard: BoardChange = (elements, appState) => {
    const board = boardRef.current;
    const root = boardRootOf(board);
    if (api && root && board && !appState.isLoading) {
      if (draft) {
        syncFrames(api, root, elements, appState);
        reportDraftScene(elements);
      } else {
        // The scene finishes loading after the cards mount, and only then can they be placed.
        if (waitingScene.current !== null) {
          const scene = waitingScene.current;
          waitingScene.current = null;
          applyScene(scene);
        } else if (camera.current.latestTurn === null) syncTurns();
        else placeCards(api, turnBoard, board, appState);
        // Moving a turn is the reader taking over, so the camera stops chasing it.
        if (appState.selectedElementsAreBeingDragged) setFollowing(false);
        // Every tool but select draws or pans, so it reaches through the cards to the canvas.
        root.toggleAttribute("data-board-marking", appState.activeTool.type !== "selection");
        trackNoteAction(elements, appState);
        reportPendingNotes(unseenMarks(elements, seenByAgent.current).length);
        const nextCards = canvasCardsOf(elements);
        setCards((current) => (sameCanvasCards(current, nextCards) ? current : nextCards));
      }
    }
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      localStorage.setItem(
        storageKey,
        JSON.stringify(withoutTakenMarks(elements.filter((element) => !element.isDeleted))),
      );
      if (!draft) pushScene();
    }, BOARD_SAVE_DELAY_MS);
  };

  const followScroll = (scrollX: number, scrollY: number, zoom: BoardView["zoom"]) => {
    const board = boardRef.current;
    const root = boardRootOf(board);
    if (!api || !root || !board) return;
    const view = { scrollX, scrollY, zoom };
    if (draft) {
      publishFrames(api.getSceneElements(), root, view);
      return;
    }
    placeCards(api, turnBoard, board, view);
    const { set } = camera.current;
    if (set?.scrollX === scrollX && set.scrollY === scrollY) return;
    cancelPan();
    const target = latestTurnCamera(api, turnBoard, root, view);
    if (target) {
      setFollowing(Math.abs(target.scrollY - scrollY) * zoom.value < FOLLOW_TOLERANCE_PX);
    }
  };

  const resetLayout = () => {
    if (!api) return;
    if (draft) {
      const elements = api.getSceneElements().filter((element) => framePiece(element) === null);
      api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
      return;
    }
    const scene = api.getSceneElements();
    const marks = scene.map(asBoardBox).filter((box) => box.turnId === null);
    const placed = layoutTurns(marks, measureCards(turnBoard));
    api.updateScene({
      elements: scene.map((element) => {
        const { turnId } = asBoardBox(element);
        const box = placed.find((candidate) => turnId !== null && candidate.turnId === turnId);
        return box === undefined
          ? element
          : newElementWith(element, { x: box.x, y: box.y, width: box.width, height: box.height });
      }),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    syncTurns();
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the scene lives outside React, so a chat state change must be pushed into it
  useEffect(() => {
    const root = boardRootOf(boardRef.current);
    if (!draft || !api || !root || api.getAppState().isLoading) return;
    syncFrames(api, root, api.getSceneElements(), api.getAppState());
  }, [api, draft]);

  // The composer sizes to its prompt, so its box follows every height change.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- observes the composer and writes its height to the external scene
  useEffect(() => {
    const root = boardRootOf(boardRef.current);
    const stack = root?.querySelector<HTMLElement>('[data-chat-composer-stack="true"]');
    if (!draft || !api || !root || !stack) return;
    return observeResize(stack, () => {
      if (!api.getAppState().isLoading) {
        syncFrames(api, root, api.getSceneElements(), api.getAppState());
      }
    });
  }, [api, draft]);

  // Turns grow while they stream and when a disclosure opens, so the boxes follow every card.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the card store and writes measured card sizes to the external scene
  useEffect(() => {
    if (draft || !api) return;
    let stopObserving: ReadonlyArray<() => void> = [];
    const observeCards = () => {
      for (const stop of stopObserving) stop();
      stopObserving = turnBoard
        .cards()
        .map((card) => observeResize(card.element, () => syncTurns()));
      syncTurns();
    };
    turnBoard.setPanToLatest(() => panToLatest(true));
    const unsubscribe = turnBoard.subscribe(observeCards);
    observeCards();
    return () => {
      unsubscribe();
      for (const stop of stopObserving) stop();
      cancelPan();
      pendingNotes.current = 0;
      turnBoard.reportPendingNotes(0);
    };
  }, [api, cancelPan, draft, panToLatest, syncTurns, turnBoard]);

  // A card's text settles after it renders, as fonts and code load, so its box follows it.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- observes rendered cards and writes their fitted heights to the external scene
  useEffect(() => {
    const layer = turnBoard.layer();
    if (draft || !api || !layer || cards.length === 0) return;
    const stops = [
      ...layer.querySelectorAll<HTMLElement>('.canvas-card[data-canvas-card="markdown"] > *'),
    ].map((content) => observeResize(content, () => syncTurns()));
    return () => {
      for (const stop of stops) stop();
    };
  }, [api, cards, draft, syncTurns, turnBoard]);

  // A citation of a card shows that card: the board stops following turns and centres on it.
  const revealElement = useStableCallback((elementId: string) => {
    const root = boardRootOf(boardRef.current);
    const element = api?.getSceneElements().find((candidate) => candidate.id === elementId);
    if (!api || !root || element === undefined) return;
    cancelPan();
    setFollowing(false);
    const zoom = api.getAppState().zoom.value;
    const rect = root.getBoundingClientRect();
    moveCamera({
      scrollX: rect.width / 2 / zoom - (element.x + element.width / 2),
      scrollY: Math.max(
        rect.height / 2 / zoom - (element.y + element.height / 2),
        TOPBAR_FALLBACK_PX / zoom - element.y,
      ),
    });
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a citation chip asks for this through a window event, outside React
  useEffect(() => (draft ? undefined : onCanvasReveal(revealElement)), [draft, revealElement]);

  // Cards float above the canvas, so wheel and middle-button gestures over them still pan and zoom it.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- binds a non-passive wheel listener to the card layer, which React cannot do
  useEffect(() => {
    if (draft || !api) return;
    let detach = () => {};
    const attach = () => {
      detach();
      const layer = turnBoard.layer();
      if (!layer) return;
      const forward = (event: WheelEvent) => {
        // Excalidraw mounts its canvas after handing over the api, so it is read per gesture.
        const canvas = boardRef.current?.querySelector(".excalidraw__canvas.interactive");
        if (!canvas || scrollsInside(event, layer)) return;
        event.preventDefault();
        cancelPan();
        canvas.dispatchEvent(new WheelEvent("wheel", event));
      };
      layer.addEventListener("wheel", forward, { passive: false });
      const detachMiddleDrag = forwardCardMiddleDrag(layer, () => {
        cancelPan();
        return boardRef.current?.querySelector(".excalidraw__canvas.interactive") ?? null;
      });
      detach = () => {
        layer.removeEventListener("wheel", forward);
        detachMiddleDrag();
      };
    };
    const unsubscribe = turnBoard.subscribe(attach);
    attach();
    return () => {
      unsubscribe();
      detach();
    };
  }, [api, cancelPan, draft, turnBoard]);

  const noteLayer = draft ? null : turnBoard.layer();

  // Excalidraw reads shortcuts only while focus is inside it, and the composer holds focus by default.
  const takeFocus = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.querySelector<HTMLElement>(".excalidraw-container")?.focus();
  };

  return (
    <div
      ref={boardRef}
      className="excalidraw-board pointer-events-auto absolute inset-0"
      data-excalidraw-board
      onPointerDownCapture={takeFocus}
      onKeyDownCapture={draft ? undefined : sendEditedNote}
    >
      {canvasThread === null ? null : (
        <ThreadCanvasSync target={canvasThread} onScene={applyScene} saveRef={saveCanvas} />
      )}
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        onChange={saveBoard}
        onScrollChange={followScroll}
        theme={resolvedTheme}
        UIOptions={{ canvasActions: { toggleTheme: false } }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Item onSelect={resetLayout}>Reset layout</MainMenu.Item>
        </MainMenu>
      </Excalidraw>
      {noteLayer === null || canvasThread === null || cards.length === 0
        ? null
        : createPortal(
            cards.map((card) => {
              const width = card.width - 2 * TURN_INSET_PX;
              const height = card.height - 2 * TURN_INSET_PX;
              return (
                <div
                  key={card.id}
                  className="canvas-card bg-background text-foreground rounded-lg"
                  data-canvas-card={card.card.kind}
                  data-canvas-card-id={card.id}
                  style={{
                    transform: `translate(${card.x + TURN_INSET_PX}px, ${card.y + TURN_INSET_PX}px)`,
                    width,
                    height,
                  }}
                >
                  {card.card.kind === "markdown" ? (
                    // A card is the agent's writing, so selecting in it offers the timeline's Cite.
                    <div
                      data-assistant-citation-source={card.id}
                      data-assistant-citation-environment={canvasThread.environmentId}
                      data-assistant-citation-thread={canvasThread.threadId}
                    >
                      <ChatMarkdown
                        text={card.card.text}
                        cwd={undefined}
                        environmentId={canvasThread.environmentId}
                        threadRef={canvasThread}
                      />
                    </div>
                  ) : (
                    <HtmlRenderFrame
                      key={card.card.attachmentId}
                      environmentId={canvasThread.environmentId}
                      htmlRender={{
                        attachmentId: card.card.attachmentId,
                        title: card.card.title,
                        height,
                      }}
                      threadRef={canvasThread}
                    />
                  )}
                </div>
              );
            }),
            noteLayer,
          )}
      {noteLayer === null || noteAction === null
        ? null
        : createPortal(
            <div
              className="pointer-events-auto absolute top-0 left-0 origin-top-left"
              style={{
                transform: `translate(${noteAction.x}px, ${noteAction.y + NOTE_ACTION_GAP_PX}px) scale(${1 / noteAction.zoom})`,
              }}
            >
              <Button
                size="xs"
                onClick={() => {
                  const ids = new Set(noteAction.ids);
                  void sendNotes(
                    (api?.getSceneElements() ?? [])
                      .filter((element) => ids.has(element.id))
                      .toSorted((left, right) => left.y - right.y),
                  );
                }}
              >
                Send to agent
              </Button>
            </div>,
            noteLayer,
          )}
    </div>
  );
}
