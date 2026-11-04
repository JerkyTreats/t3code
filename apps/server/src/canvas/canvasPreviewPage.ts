import type { ThreadCanvasElement, ThreadCanvasScene } from "@t3tools/contracts";
import { markdownToHtml } from "@t3tools/shared/markdownToHtml";

// Matches the board: a card's reading block sits this far inside its box, with this padding.
const CARD_INSET_PX = 12;
const MAX_PAGE_WIDTH_PX = 1600;
const MAX_PAGE_HEIGHT_PX = 4000;
const REGION_MARGIN_PX = 80;
// The default view: the latest turn and what lies within this much of it.
const AROUND_LATEST_ABOVE_PX = 600;
const AROUND_LATEST_BELOW_PX = 3000;
export const CANVAS_PREVIEW_MEASURE_PREFIX = "t3-canvas-cards:";
// ChatMarkdown's classes for a block of text, so the app stylesheet styles a card as the board does.
const CHAT_MARKDOWN_CLASSES =
  "chat-markdown w-full min-w-0 [overflow-wrap:anywhere] [word-break:break-word] text-sm leading-relaxed";
const APPROXIMATE_CARD_STYLE = `
    .card.markdown { font-size: 14px; line-height: 1.625; }
    .card table { border-collapse: collapse; } .card th, .card td { border-bottom: 1px solid #333; padding: 4px 8px; text-align: left; }
    .card a { color: #7aa2ff; } .card h1, .card h2, .card h3 { margin: 0.4em 0; }`;

export interface CanvasRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const numberOf = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const recordOf = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
const boxOf = (element: ThreadCanvasElement): CanvasRegion => ({
  x: numberOf(element.x),
  y: numberOf(element.y),
  width: numberOf(element.width),
  height: numberOf(element.height),
});
const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// The board is dark, where Excalidraw shows its default near-black ink as near-white.
const DEFAULT_INK = new Set(["#1e1e1e", "#000000", "#000"]);
const colorOf = (value: unknown, fallback: string) => {
  const color =
    typeof value === "string" && /^(#[0-9a-fA-F]{3,8}|transparent|[a-z]+)$/.test(value)
      ? value
      : fallback;
  return DEFAULT_INK.has(color.toLowerCase()) ? "#e8e8e8" : color;
};

function boundsOf(boxes: ReadonlyArray<CanvasRegion>): CanvasRegion | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  return {
    x: left,
    y: top,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - left,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - top,
  };
}

const intersects = (left: CanvasRegion, right: CanvasRegion) =>
  left.x < right.x + right.width &&
  right.x < left.x + left.width &&
  left.y < right.y + right.height &&
  right.y < left.y + left.height;

/**
 * The part of the canvas a preview shows: one drawing, a given box, or by default the latest
 * turn with everything from a little above it to well below it, which is where new work lands.
 */
export function previewRegion(
  scene: ThreadCanvasScene,
  input: { readonly drawingId?: string | undefined; readonly region?: CanvasRegion | undefined },
): CanvasRegion | null {
  const live = scene.elements.filter((element) => element.isDeleted !== true);
  const pad = (box: CanvasRegion | null) =>
    box === null
      ? null
      : {
          x: box.x - REGION_MARGIN_PX,
          y: box.y - REGION_MARGIN_PX,
          width: box.width + 2 * REGION_MARGIN_PX,
          height: box.height + 2 * REGION_MARGIN_PX,
        };
  if (input.region !== undefined) return input.region;
  if (input.drawingId !== undefined) {
    return pad(
      boundsOf(
        live
          .filter(
            (element) => recordOf(recordOf(element.customData).t3Drawing).id === input.drawingId,
          )
          .map(boxOf),
      ),
    );
  }
  const turns = live.filter((element) => typeof recordOf(element.customData).t3Turn === "string");
  const latest = turns.toSorted((left, right) => boxOf(right).y - boxOf(left).y)[0];
  if (latest === undefined) return pad(boundsOf(live.map(boxOf)));
  const turn = boxOf(latest);
  const band = {
    x: -Number.MAX_SAFE_INTEGER / 2,
    y: turn.y - AROUND_LATEST_ABOVE_PX,
    width: Number.MAX_SAFE_INTEGER,
    height: turn.height + AROUND_LATEST_ABOVE_PX + AROUND_LATEST_BELOW_PX,
  };
  return pad(boundsOf(live.map(boxOf).filter((box) => intersects(box, band))));
}

function pathOf(points: unknown) {
  if (!Array.isArray(points)) return "";
  return points
    .flatMap((point) =>
      Array.isArray(point)
        ? [`${numberOf(point[0]).toFixed(1)},${numberOf(point[1]).toFixed(1)}`]
        : [],
    )
    .join(" ");
}

function shapeSvg(element: ThreadCanvasElement, box: CanvasRegion) {
  const stroke = colorOf(element.strokeColor, "#1e1e1e");
  const fill = colorOf(element.backgroundColor, "transparent");
  const width = Math.max(1, numberOf(element.strokeWidth) || 1);
  const common = `stroke="${stroke}" fill="${fill === "transparent" ? "none" : fill}" stroke-width="${width}"`;
  switch (element.type) {
    case "rectangle":
      return `<rect x="0" y="0" width="${box.width}" height="${box.height}" rx="8" ${common}/>`;
    case "ellipse":
      return `<ellipse cx="${box.width / 2}" cy="${box.height / 2}" rx="${box.width / 2}" ry="${box.height / 2}" ${common}/>`;
    case "diamond":
      return `<polygon points="${box.width / 2},0 ${box.width},${box.height / 2} ${box.width / 2},${box.height} 0,${box.height / 2}" ${common}/>`;
    case "arrow":
    case "line":
    case "freedraw":
      return `<polyline points="${pathOf(element.points)}" stroke="${stroke}" fill="none" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${element.type === "arrow" ? ' marker-end="url(#tip)"' : ""}/>`;
    default:
      return "";
  }
}

const FLEX_ALIGN: Record<string, string> = {
  left: "flex-start",
  right: "flex-end",
  top: "flex-start",
  bottom: "flex-end",
};

/** A bound label sits where Excalidraw puts it: a user's frame title at its top left, say. */
function labelAlignment(label: { readonly textAlign?: unknown; readonly verticalAlign?: unknown }) {
  const across = typeof label.textAlign === "string" ? label.textAlign : "center";
  const down = typeof label.verticalAlign === "string" ? label.verticalAlign : "middle";
  return `justify-content:${FLEX_ALIGN[across] ?? "center"};align-items:${FLEX_ALIGN[down] ?? "center"};text-align:${across}`;
}

/**
 * A static page of one canvas region at scene scale, shrunk to fit: turns as titled boxes (the
 * board renders their text in the app), shapes and strokes as SVG, text as text, and markdown
 * and html cards rendered as the board renders them. A script reports which cards overflow.
 */
export function canvasPreviewPage(input: {
  readonly scene: ThreadCanvasScene;
  readonly region: CanvasRegion;
  readonly htmlOf: (attachmentId: string) => string | null;
  /** The web client's stylesheet; without it cards use an approximation of its typography. */
  readonly appStylesheet?: string | null;
}) {
  const { scene, region, htmlOf } = input;
  const appStylesheet = input.appStylesheet ?? null;
  const scale = Math.min(1, MAX_PAGE_WIDTH_PX / region.width, MAX_PAGE_HEIGHT_PX / region.height);
  const live = scene.elements.filter((element) => element.isDeleted !== true);
  const labels = new Map<string, ThreadCanvasElement>();
  for (const element of live) {
    if (typeof element.containerId === "string") labels.set(element.containerId, element);
  }
  const pieces = live.flatMap((element) => {
    if (typeof element.containerId === "string") return [];
    const box = boxOf(element);
    // Arrows and strokes can have a zero-size box, so their points decide whether they show.
    if (
      !intersects(
        { ...box, width: Math.max(box.width, 1), height: Math.max(box.height, 1) },
        region,
      )
    ) {
      return [];
    }
    const customData = recordOf(element.customData);
    const left = box.x - region.x;
    const top = box.y - region.y;
    const at = `left:${left}px;top:${top}px;width:${Math.max(box.width, 1)}px;height:${Math.max(box.height, 1)}px`;
    if (typeof customData.t3Turn === "string") {
      return [
        `<div class="turn" style="${at}"><div class="turn-title">Turn: ${escapeHtml(String(customData.t3TurnTitle ?? ""))}</div></div>`,
      ];
    }
    const card = recordOf(customData.t3Card);
    const id = escapeHtml(String(element.id));
    const inner = `left:${left + CARD_INSET_PX}px;top:${top + CARD_INSET_PX}px;width:${Math.max(1, box.width - 2 * CARD_INSET_PX)}px;height:${Math.max(1, box.height - 2 * CARD_INSET_PX)}px`;
    if (card.kind === "markdown") {
      return [
        `<div class="card-frame" style="${at}"></div><div class="card markdown canvas-card bg-background text-foreground rounded-lg" data-canvas-card="markdown" data-card="${id}" style="${inner}"><div class="${CHAT_MARKDOWN_CLASSES}">${markdownToHtml(typeof card.text === "string" ? card.text : "")}</div></div>`,
      ];
    }
    if (card.kind === "html") {
      const page = typeof card.attachmentId === "string" ? htmlOf(card.attachmentId) : null;
      return [
        page === null
          ? `<div class="card-frame" style="${at}"></div><div class="card missing" style="${inner}">html card ${id}: page not found</div>`
          : `<div class="card-frame" style="${at}"></div><iframe class="card" sandbox="allow-scripts" style="${inner}" srcdoc="${escapeHtml(page)}"></iframe>`,
      ];
    }
    const label = labels.get(String(element.id));
    const userMark = customData.t3Drawing === undefined;
    if (element.type === "text") {
      const size = numberOf(element.fontSize) || 20;
      return [
        `<div class="text${userMark ? " user" : ""}" style="${at};font-size:${size}px;color:${colorOf(element.strokeColor, "#1e1e1e")}">${escapeHtml(String(element.text ?? ""))}</div>`,
      ];
    }
    const svg = shapeSvg(element, box);
    if (svg === "") return [];
    const caption =
      label === undefined
        ? ""
        : `<div class="label" style="font-size:${numberOf(label.fontSize) || 16}px;${labelAlignment(label)}${element.type === "arrow" || element.type === "line" ? ";white-space:nowrap;padding:0" : ""}">${escapeHtml(String(label.text ?? ""))}</div>`;
    return [
      `<div class="shape" style="${at}"><svg width="${Math.max(box.width, 1)}" height="${Math.max(box.height, 1)}" overflow="visible">${svg}</svg>${caption}</div>`,
    ];
  });
  const measure = `
    addEventListener("load", () => {
      const cards = [...document.querySelectorAll(".card.markdown")].flatMap((card) =>
        card.scrollHeight > card.clientHeight + 1
          ? [{ id: card.dataset.card, height: card.clientHeight + ${2 * CARD_INSET_PX}, neededHeight: card.scrollHeight + ${2 * CARD_INSET_PX} }]
          : []);
      console.log(${JSON.stringify(CANVAS_PREVIEW_MEASURE_PREFIX)} + JSON.stringify(cards));
    });`;
  const html = `<!doctype html><html class="dark"><head><meta charset="utf-8">${
    appStylesheet === null
      ? `<style>${APPROXIMATE_CARD_STYLE}</style>`
      : `<style>${appStylesheet}</style>`
  }<style>
    html, body { margin: 0; background: #121212; color: #e8e8e8; font-family: var(--font-sans, system-ui, sans-serif); }
    .board { position: relative; width: ${region.width}px; height: ${region.height}px; transform: scale(${scale}); transform-origin: 0 0; }
    .viewport { width: ${Math.ceil(region.width * scale)}px; height: ${Math.ceil(region.height * scale)}px; overflow: hidden; }
    .board > * { position: absolute; box-sizing: border-box; }
    .turn { border: 1px solid #555; border-radius: 16px; background: #1b1b1b; }
    .turn-title { padding: 16px 24px; font-size: 18px; color: #9a9a9a; }
    .card-frame { border: 2px solid #868e96; border-radius: 8px; }
    .card { overflow: hidden; background: #181818; border-radius: 8px; border: 0; }
    .card.markdown { padding: 12px 16px; }
    .card.missing { color: #ff8787; padding: 12px; }
    .text { white-space: pre; line-height: 1.25; } .text.user { color: #ffd43b !important; }
    .shape svg { position: absolute; inset: 0; }
    .label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; color: #e8e8e8; padding: 8px; }
  </style></head><body><div class="viewport"><div class="board">
    <svg width="0" height="0" style="position:absolute"><defs><marker id="tip" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c8c8c8"/></marker></defs></svg>
    ${pieces.join("\n")}
  </div></div><script>${measure}</script></body></html>`;
  return { html, scale, width: Math.max(240, Math.ceil(region.width * scale)) };
}
