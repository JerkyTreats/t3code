import "../index.css";

import type { ThreadCanvasScene, ThreadCanvasShape } from "@t3tools/contracts";
import { buildDrawingElements, shapeSize } from "@t3tools/shared/threadCanvasDrawing";
import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

import ExcalidrawBoard from "./ExcalidrawBoard";
import { createTurnBoard } from "./turnBoard";

const sync = vi.hoisted(() => ({
  onScene: null as ((scene: ThreadCanvasScene) => void) | null,
}));

vi.mock("./ThreadCanvasSync", () => ({
  ThreadCanvasSync: (props: { onScene: (scene: ThreadCanvasScene) => void }) => {
    sync.onScene = props.onScene;
    return null;
  },
}));

const STORAGE_KEY = "t3code:demo:turn-board:server-drawing";
const shapes: ReadonlyArray<ThreadCanvasShape> = [
  { id: "a", type: "rectangle", text: "A long enough label" },
  { id: "b", type: "rectangle", text: "B" },
  { id: "ab", type: "arrow", start: "a", end: "b", text: "feeds" },
];
const at: Record<string, { x: number; y: number }> = {
  a: { x: 150, y: 150 },
  b: { x: 800, y: 400 },
  ab: { x: 0, y: 0 },
};

function serverElements() {
  let next = 1;
  return buildDrawingElements({
    drawingId: "d",
    turn: null,
    placed: shapes.map((shape) => ({
      shape,
      ...shapeSize(shape),
      ...at[shape.id]!,
      localX: at[shape.id]!.x,
      localY: at[shape.id]!.y,
    })),
    versionOf: () => 0,
    randomInt: () => next++,
    now: 1,
  });
}

interface SavedElement {
  readonly id: string;
  readonly index: string | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly containerId?: string | null;
  readonly text?: string;
  readonly points?: ReadonlyArray<readonly [number, number]>;
  readonly endBinding?: { readonly elementId: string } | null;
}

const saved = (id: string) =>
  (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ReadonlyArray<SavedElement>).find(
    (element) => element.id === id,
  );

describe("a drawing built on the server", () => {
  it("loads into Excalidraw as real elements that can be bent and dragged", async () => {
    localStorage.removeItem(STORAGE_KEY);
    await page.viewport(1300, 800);
    await using _ = await render(
      <div data-board-root style={{ position: "relative", width: 1200, height: 700 }}>
        <ExcalidrawBoard
          draft={false}
          storageId="server-drawing"
          turnBoard={createTurnBoard()}
          canvasThread={{ environmentId: "e", threadId: "t" } as never}
          onSendNote={() => {}}
        />
      </div>,
    );
    const interactive = () => document.querySelector(".excalidraw__canvas.interactive");
    await vi.waitFor(() => expect(interactive()).not.toBeNull());

    sync.onScene?.({ revision: 1, elements: serverElements() });

    await vi.waitFor(() => expect(saved("d/a")).toBeDefined());
    expect(saved("d/a")?.index).not.toBeNull();
    const label = saved("d/a/label");
    expect(label?.containerId).toBe("d/a");
    // The client measured the real font in place of the server's estimate.
    expect(label?.width).not.toBe(Math.ceil("A long enough label".length * 20 * 0.6));

    const canvas = page.elementLocator(interactive()!);
    const arrow = saved("d/ab")!;
    const end = arrow.points![1]!;
    const middle = { x: arrow.x + end[0] / 2, y: arrow.y + end[1] / 2 };
    // The label sits at the middle, so the line is picked up a quarter of the way along.
    const onLine = { x: arrow.x + end[0] / 4, y: arrow.y + end[1] / 4 };
    await userEvent.click(canvas, { position: onLine, force: true });
    await userEvent.dragAndDrop(canvas, canvas, {
      sourcePosition: middle,
      targetPosition: { x: middle.x + 40, y: middle.y - 160 },
    } as never);
    await vi.waitFor(() => expect(saved("d/ab")?.points).toHaveLength(3));
    expect(saved("d/ab")?.points?.[0]).toEqual([0, 0]);
    expect(saved("d/ab")?.endBinding?.elementId).toBe("d/b");

    await userEvent.click(canvas, { position: { x: 1100, y: 640 }, force: true });
    const before = saved("d/ab")!;
    await userEvent.dragAndDrop(canvas, canvas, {
      sourcePosition: { x: 840, y: 410 },
      targetPosition: { x: 700, y: 560 },
    } as never);
    await vi.waitFor(() => expect(saved("d/b")?.x).toBe(660));

    const after = saved("d/ab")!;
    expect(after.points?.at(-1)).not.toEqual(before.points?.at(-1));
    expect(saved("d/b/label")?.x).toBeLessThan(800);
  });
});
