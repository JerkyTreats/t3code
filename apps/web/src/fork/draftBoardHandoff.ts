/** Enough of an Excalidraw element to carry it from a draft's board to its thread's. */
interface DraftElement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly version: number;
  readonly isDeleted: boolean;
  readonly customData?: Record<string, unknown>;
}

// Only a send moves marks, and the thread's board mounts right after it.
const HANDOFF_WINDOW_MS = 10_000;

let armedAt: number | null = null;
let latest: ReadonlyArray<DraftElement> = [];
const taken = new Set<string>();

/** Called as a draft is sent. Keep this module free of Excalidraw: ChatView loads it eagerly. */
export function armDraftHandoff() {
  armedAt = Date.now();
  return () => {
    armedAt = null;
  };
}

/** The draft board reports its scene here on every change, ahead of its debounced save. */
export function reportDraftScene(elements: ReadonlyArray<DraftElement>) {
  latest = elements;
}

/** Drops what a thread took, so a save still pending cannot bring it back to the next draft. */
export function withoutTakenMarks<Element extends DraftElement>(elements: ReadonlyArray<Element>) {
  return elements.filter((element) => !taken.has(element.id));
}

/**
 * Hands the draft's marks to the board of the thread it became. Draft boxes sit in view pixels and
 * turns sit around x = 0, so marks keep their place relative to the hero box and the first turn.
 */
export function takeDraftMarks<Element extends DraftElement>(): ReadonlyArray<Element> {
  const armed = armedAt !== null && Date.now() - armedAt < HANDOFF_WINDOW_MS;
  armedAt = null;
  if (!armed) return [];
  const hero = latest.find((element) => element.customData?.t3Piece === "hero");
  const marks = latest.filter(
    (element) => !element.isDeleted && element.customData?.t3Piece === undefined,
  );
  for (const mark of marks) taken.add(mark.id);
  const dx = hero === undefined ? 0 : -(hero.x + hero.width / 2);
  const dy = hero === undefined ? 0 : -hero.y;
  return marks.map(
    (mark) => ({ ...mark, x: mark.x + dx, y: mark.y + dy, version: mark.version + 1 }) as Element,
  );
}
