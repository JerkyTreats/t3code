import type { ThreadCanvasElement, ThreadCanvasScene } from "@t3tools/contracts";

const versionOf = (element: ThreadCanvasElement) =>
  typeof element.version === "number" ? element.version : 0;
const idOf = (element: ThreadCanvasElement) =>
  typeof element.id === "string" ? element.id : undefined;

/** Merges by element id, keeping the higher version, so no writer can erase a newer edit. */
export function mergeCanvasElements(
  current: ReadonlyArray<ThreadCanvasElement>,
  incoming: ReadonlyArray<ThreadCanvasElement>,
) {
  const merged = new Map<string, ThreadCanvasElement>();
  for (const element of current) {
    const id = idOf(element);
    if (id !== undefined) merged.set(id, element);
  }
  let changed = false;
  for (const element of incoming) {
    const id = idOf(element);
    if (id === undefined) continue;
    const existing = merged.get(id);
    if (existing !== undefined && versionOf(existing) >= versionOf(element)) continue;
    merged.set(id, element);
    changed = true;
  }
  return { elements: [...merged.values()], changed };
}

interface CanvasBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const numberOf = (value: unknown) => (typeof value === "number" ? Math.round(value) : 0);
const boxOf = (element: ThreadCanvasElement): CanvasBox => ({
  x: numberOf(element.x),
  y: numberOf(element.y),
  width: numberOf(element.width),
  height: numberOf(element.height),
});
const recordOf = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

function distanceBetween(left: CanvasBox, right: CanvasBox) {
  const dx = Math.max(left.x - (right.x + right.width), right.x - (left.x + left.width), 0);
  const dy = Math.max(left.y - (right.y + right.height), right.y - (left.y + left.height), 0);
  return Math.hypot(dx, dy);
}

/** The scene as an agent reads it: turns by their opening words, everything else beside them. */
export function describeCanvas(scene: ThreadCanvasScene) {
  const live = scene.elements.filter((element) => element.isDeleted !== true);
  const turns = live.flatMap((element) => {
    const customData = recordOf(element.customData);
    return typeof customData.t3Turn === "string"
      ? [{ ...boxOf(element), title: String(customData.t3TurnTitle ?? "") }]
      : [];
  });
  const labels = new Map<string, string>();
  for (const element of live) {
    if (typeof element.containerId === "string" && typeof element.text === "string") {
      labels.set(element.containerId, element.text);
    }
  }
  const elements = live.flatMap((element) => {
    const customData = recordOf(element.customData);
    const id = idOf(element);
    if (id === undefined || typeof customData.t3Turn === "string") return [];
    if (typeof element.containerId === "string") return [];
    const box = boxOf(element);
    const nearestTurn = turns.reduce<(typeof turns)[number] | null>(
      (nearest, turn) =>
        nearest === null || distanceBetween(box, turn) < distanceBetween(box, nearest)
          ? turn
          : nearest,
      null,
    );
    const text = labels.get(id) ?? (typeof element.text === "string" ? element.text : undefined);
    const start = recordOf(element.startBinding).elementId;
    const end = recordOf(element.endBinding).elementId;
    const drawing = recordOf(customData.t3Drawing).id;
    const covers = customData.t3Covers;
    return [
      {
        id,
        type: String(element.type),
        ...box,
        drawnBy: typeof drawing === "string" ? ("agent" as const) : ("user" as const),
        ...(typeof drawing === "string" ? { drawingId: drawing } : {}),
        ...(text === undefined ? {} : { text }),
        ...(typeof covers === "string" ? { covers } : {}),
        ...(typeof start === "string" ? { start } : {}),
        ...(typeof end === "string" ? { end } : {}),
        ...(nearestTurn === null ? {} : { nearestTurn: nearestTurn.title }),
      },
    ];
  });
  return { turns, elements };
}

const NOTE_MAX_CHANGES = 20;
const NOTE_MAX_TEXT_CHARS = 300;

const clipped = (text: string) =>
  text.length > NOTE_MAX_TEXT_CHARS ? `${text.slice(0, NOTE_MAX_TEXT_CHARS)}…` : text;
const quoted = (text: string) => JSON.stringify(clipped(text));

function describeMark(mark: ReturnType<typeof describeCanvas>["elements"][number]) {
  const parts = [
    `${mark.type}${mark.text === undefined ? "" : ` ${quoted(mark.text)}`} [${mark.id}]`,
    ...(mark.nearestTurn === undefined ? [] : [`near turn ${quoted(mark.nearestTurn)}`]),
    ...(mark.covers === undefined ? [] : [`over ${quoted(mark.covers)}`]),
  ];
  return `- ${parts.join(", ")}`;
}

/**
 * What the user did on the canvas since the agent last knew about it. `seen` is the state to save
 * once the agent has this note, and `sketched` says a mark exists that only a picture can show.
 */
export function describeCanvasChanges(scene: ThreadCanvasScene, message: string) {
  const previous = scene.seen ?? {};
  const stamps = new Map<string, number>();
  for (const element of scene.elements) {
    const owner = typeof element.containerId === "string" ? element.containerId : idOf(element);
    if (owner === undefined || element.isDeleted === true) continue;
    stamps.set(owner, (stamps.get(owner) ?? 0) + versionOf(element));
  }
  const marks = describeCanvas(scene)
    .elements.filter((element) => element.drawnBy === "user")
    .toSorted((left, right) => left.y - right.y);
  const isFresh = (mark: (typeof marks)[number]) => previous[mark.id] !== stamps.get(mark.id);
  const asked = message.trim();
  const sentNotes = marks.filter((mark) => {
    const text = mark.text?.trim();
    return (
      text !== undefined &&
      text !== "" &&
      (text === asked || (isFresh(mark) && asked.includes(text)))
    );
  });
  const sentIds = new Set(sentNotes.map((mark) => mark.id));
  const fresh = marks.filter((mark) => isFresh(mark) && !sentIds.has(mark.id));
  const liveIds = new Set(marks.map((mark) => mark.id));
  const removed = scene.elements.flatMap((element) => {
    const id = idOf(element);
    return id !== undefined &&
      element.isDeleted === true &&
      previous[id] !== undefined &&
      !liveIds.has(id)
      ? [
          typeof element.text === "string"
            ? `- removed ${quoted(element.text)}`
            : `- removed [${id}]`,
        ]
      : [];
  });
  const lines = [...fresh.map(describeMark), ...removed];
  const shown = lines.slice(0, NOTE_MAX_CHANGES);
  if (lines.length > shown.length) {
    shown.push(`- and ${lines.length - shown.length} more; canvas_read lists them`);
  }
  const sections = [
    ...(shown.length === 0
      ? []
      : [
          `The user changed this thread's Excalidraw canvas since you last looked. A note addressed to you is a request from them.\n${shown.join("\n")}`,
        ]),
    ...sentNotes
      .slice(0, 1)
      .map(
        (mark) =>
          `This message was sent from the canvas note [${mark.id}]. Pass that id as \`near\` to canvas_update so your drawing lands beside it.`,
      ),
  ];
  return {
    note: sections.join("\n\n"),
    seen: Object.fromEntries(marks.map((mark) => [mark.id, stamps.get(mark.id) ?? 0])),
    sketched: fresh.some((mark) => mark.text === undefined),
  };
}
