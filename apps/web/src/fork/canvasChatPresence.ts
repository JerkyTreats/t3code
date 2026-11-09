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

/** How long an agent's presence plays, from its cursor setting out to the last fade. */
export const AGENT_PRESENCE_MS = 2000;
// The cursor reaches the drawing here, then the pieces show one by one until REVEAL_END_MS.
const GLIDE_MS = 700;
const REVEAL_END_MS = 1300;
const FADE_MS = 150;
const OUTLINE_HOLD_END_MS = 1700;
// Fading copies of the cursor that follow it on its glide, each a little later and fainter.
const TRAIL_OPACITIES = [0.45, 0.3, 0.18] as const;
const TRAIL_LAG_MS = 60;
// The fill hides most of a piece until it is revealed, not all of it.
const PLACEHOLDER_OPACITY = 0.85;
const GLIDE_EASING = "cubic-bezier(0.3, 0.7, 0.2, 1)";
// Past this many pieces, one outline around them all reads better than one each.
const MAX_OUTLINES = 24;
const OUTLINE_PAD_PX = 6;

const CURSOR_SVG =
  '<svg viewBox="0 0 16 20" width="16" height="20" aria-hidden="true"><path d="M1 1v15l4.2-4 2.8 6.5 2.6-1.1-2.8-6.4H14z" fill="currentColor" stroke="white" stroke-width="1.2" stroke-linejoin="round"/></svg>';

const at = (ms: number) => ms / AGENT_PRESENCE_MS;

/**
 * Plays an agent's cursor, trailed by fading copies, from its chat to what it drew: a soft fill on
 * each new piece lifts in drawing order, then outlines, then a fade. Overlay only, never the scene.
 * Plays nothing under reduced motion. Returns a stop for when the board unmounts.
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
  const boxes = input.pieces.length > MAX_OUTLINES ? [bounds] : input.pieces;
  // The layer scales with the zoom; the cursor and outline strokes stay at screen size.
  const unscale = 1 / input.zoom;
  const pad = OUTLINE_PAD_PX * unscale;
  const root = document.createElement("div");
  root.className = "canvas-agent-presence";
  root.style.setProperty("--canvas-chat-color", input.color);
  root.style.setProperty("--canvas-presence-unscale", String(unscale));
  const overBox = (className: string, box: Box) => {
    const element = document.createElement("div");
    element.className = className;
    element.style.transform = `translate(${box.x - pad}px, ${box.y - pad}px)`;
    element.style.width = `${box.width + 2 * pad}px`;
    element.style.height = `${box.height + 2 * pad}px`;
    root.append(element);
    return element;
  };
  const placeholders = boxes.map((box) => overBox("canvas-agent-placeholder", box));
  const outlines = boxes.map((box) => overBox("canvas-agent-outline", box));
  const ghosts = TRAIL_OPACITIES.map(() => {
    const ghost = document.createElement("div");
    ghost.className = "canvas-agent-cursor";
    ghost.innerHTML = CURSOR_SVG;
    root.append(ghost);
    return ghost;
  });
  const cursor = document.createElement("div");
  cursor.className = "canvas-agent-cursor";
  cursor.innerHTML = CURSOR_SVG;
  const tag = document.createElement("span");
  tag.textContent = input.name;
  cursor.append(tag);
  root.append(cursor);
  layer.append(root);

  const place = (point: { readonly x: number; readonly y: number }) =>
    `translate(${point.x}px, ${point.y}px) scale(${unscale})`;
  const to = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const timing = { duration: AGENT_PRESENCE_MS, fill: "forwards" } as const;
  const revealStep = (REVEAL_END_MS - GLIDE_MS) / placeholders.length;
  const animations = [
    cursor.animate(
      [
        { transform: place(input.from), opacity: 0, easing: GLIDE_EASING },
        { opacity: 1, offset: at(140) },
        { transform: place(to), opacity: 1, offset: at(GLIDE_MS) },
        { transform: place(to), opacity: 1, offset: at(OUTLINE_HOLD_END_MS) },
        { transform: place(to), opacity: 0 },
      ],
      timing,
    ),
    // Each copy runs the same glide a little later and is gone once the cursor arrives.
    ...ghosts.map((ghost, index) =>
      ghost.animate(
        [
          { transform: place(input.from), opacity: 0, easing: GLIDE_EASING },
          { opacity: TRAIL_OPACITIES[index], offset: 0.15 },
          { transform: place(to), opacity: 0 },
        ],
        { duration: GLIDE_MS, delay: (index + 1) * TRAIL_LAG_MS, fill: "forwards" },
      ),
    ),
    ...placeholders.map((placeholder, index) => {
      const lift = GLIDE_MS + index * revealStep;
      return placeholder.animate(
        [
          { opacity: 0 },
          { opacity: PLACEHOLDER_OPACITY, offset: at(200) },
          { opacity: PLACEHOLDER_OPACITY, offset: at(lift) },
          { opacity: 0, offset: at(lift + FADE_MS) },
          { opacity: 0 },
        ],
        timing,
      );
    }),
    ...outlines.map((outline) =>
      outline.animate(
        [
          { opacity: 0 },
          { opacity: 0, offset: at(REVEAL_END_MS) },
          { opacity: 1, offset: at(REVEAL_END_MS + FADE_MS) },
          { opacity: 1, offset: at(OUTLINE_HOLD_END_MS) },
          { opacity: 0 },
        ],
        timing,
      ),
    ),
  ];
  let timer: number | undefined;
  const stop = () => {
    window.clearTimeout(timer);
    for (const animation of animations) animation.cancel();
    root.remove();
  };
  timer = window.setTimeout(stop, AGENT_PRESENCE_MS);
  return stop;
}

function boundsOf(boxes: ReadonlyArray<Box>): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
