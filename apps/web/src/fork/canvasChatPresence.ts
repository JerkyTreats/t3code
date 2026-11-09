import { drawnByOf, isStaleDrawingCopy } from "@t3tools/shared/threadCanvasDrawing";

/**
 * Who is drawing on a board with several chats on it: each chat thread keeps one colour, shown on
 * its card and on the cursor that plays when its agent draws.
 */

// Mid shades that keep their contrast on the light and the dark board alike.
const CHAT_COLORS = [
  "#1c7ed6",
  "#e8590c",
  "#2f9e44",
  "#ae3ec9",
  "#0c8599",
  "#e64980",
  "#7048e8",
  "#d9480f",
] as const;

/** A chat thread's colour, the same on every client. */
export function chatColorOf(threadId: string): string {
  // FNV-1a: cheap, and spreads ids that differ in one character.
  let hash = 0x811c9dc5;
  for (let index = 0; index < threadId.length; index += 1) {
    hash = Math.imul(hash ^ threadId.charCodeAt(index), 0x01000193);
  }
  return CHAT_COLORS[(hash >>> 0) % CHAT_COLORS.length]!;
}

interface ScenePiece {
  readonly id: string;
  readonly isDeleted?: boolean;
  readonly customData?: unknown;
}

/**
 * The agent pieces a server scene brings that an agent wrote since this client last had them, by
 * the thread whose agent drew them. A piece the user only moved or restyled keeps its write stamp,
 * so the user's own edits, echoed back from any client, never count.
 */
export function agentStrokesOf<Piece extends ScenePiece>(
  incoming: Iterable<Piece>,
  local: ReadonlyMap<string, ScenePiece>,
): ReadonlyMap<string, ReadonlyArray<Piece>> {
  const byThread = new Map<string, Piece[]>();
  for (const piece of incoming) {
    const by = piece.isDeleted ? null : drawnByOf(piece);
    if (by === null) continue;
    const mine = local.get(piece.id);
    if (mine !== undefined && !isStaleDrawingCopy(mine, piece)) continue;
    byThread.set(by, [...(byThread.get(by) ?? []), piece]);
  }
  return byThread;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const PRESENCE_MS = 1400;
// Past this many pieces, one outline around them all reads better than one each.
const MAX_OUTLINES = 24;
const OUTLINE_PAD_PX = 6;

const CURSOR_SVG =
  '<svg viewBox="0 0 16 20" width="16" height="20" aria-hidden="true"><path d="M1 1v15l4.2-4 2.8 6.5 2.6-1.1-2.8-6.4H14z" fill="currentColor" stroke="white" stroke-width="1.2" stroke-linejoin="round"/></svg>';

/**
 * Plays an agent's cursor gliding from its chat to what it drew, with a short outline on each
 * piece, then removes it all. The board's card layer is in scene coordinates, so this follows the
 * camera without work of its own, and nothing reaches the saved scene. Plays nothing when the
 * reader asks for reduced motion. Returns a stop for when the board unmounts.
 */
export function playAgentPresence(
  layer: HTMLElement,
  input: {
    readonly from: { readonly x: number; readonly y: number };
    readonly pieces: ReadonlyArray<Box>;
    readonly color: string;
    readonly name: string;
    readonly zoom: number;
  },
): () => void {
  if (input.pieces.length === 0) return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const bounds = boundsOf(input.pieces);
  const outlines = input.pieces.length > MAX_OUTLINES ? [bounds] : input.pieces;
  // The layer scales with the zoom; the cursor and outline strokes stay at screen size.
  const unscale = 1 / input.zoom;
  const root = document.createElement("div");
  root.className = "canvas-agent-presence";
  root.style.setProperty("--canvas-chat-color", input.color);
  root.style.setProperty("--canvas-presence-unscale", String(unscale));
  for (const box of outlines) {
    const outline = document.createElement("div");
    outline.className = "canvas-agent-outline";
    const pad = OUTLINE_PAD_PX * unscale;
    outline.style.transform = `translate(${box.x - pad}px, ${box.y - pad}px)`;
    outline.style.width = `${box.width + 2 * pad}px`;
    outline.style.height = `${box.height + 2 * pad}px`;
    root.append(outline);
  }
  const cursor = document.createElement("div");
  cursor.className = "canvas-agent-cursor";
  cursor.innerHTML = CURSOR_SVG;
  const tag = document.createElement("span");
  tag.textContent = input.name;
  cursor.append(tag);
  root.append(cursor);
  layer.append(root);

  const at = (point: { readonly x: number; readonly y: number }) =>
    `translate(${point.x}px, ${point.y}px) scale(${unscale})`;
  const to = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const animations = [
    cursor.animate(
      [
        { transform: at(input.from), opacity: 0, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)" },
        { opacity: 1, offset: 0.1 },
        { transform: at(to), opacity: 1, offset: 0.55 },
        { transform: at(to), opacity: 1, offset: 0.75 },
        { transform: at(to), opacity: 0 },
      ],
      { duration: PRESENCE_MS, fill: "forwards" },
    ),
    ...[...root.querySelectorAll<HTMLElement>(".canvas-agent-outline")].map((outline) =>
      outline.animate(
        [
          { opacity: 0 },
          { opacity: 0, offset: 0.4 },
          { opacity: 1, offset: 0.55 },
          { opacity: 1, offset: 0.75 },
          { opacity: 0 },
        ],
        { duration: PRESENCE_MS, fill: "forwards" },
      ),
    ),
  ];
  let timer: number | undefined;
  const stop = () => {
    window.clearTimeout(timer);
    for (const animation of animations) animation.cancel();
    root.remove();
  };
  timer = window.setTimeout(stop, PRESENCE_MS);
  return stop;
}

function boundsOf(boxes: ReadonlyArray<Box>): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
