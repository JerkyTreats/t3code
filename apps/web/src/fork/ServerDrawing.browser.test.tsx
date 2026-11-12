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
  readonly fontFamily?: number;
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

  it("keeps a font picked from the font list while the text is being edited", async () => {
    localStorage.removeItem(STORAGE_KEY);
    await page.viewport(1300, 800);
    await using _ = await render(
      <div data-board-root style={{ position: "relative", width: 1200, height: 700 }}>
        <ExcalidrawBoard
          draft={false}
          storageId="server-drawing"
          turnBoard={createTurnBoard()}
          canvasThread={{ environmentId: "e", threadId: "t" } as never}
        />
      </div>,
    );
    const interactive = () => document.querySelector(".excalidraw__canvas.interactive");
    await vi.waitFor(() => expect(interactive()).not.toBeNull());
    sync.onScene?.({ revision: 1, elements: serverElements() });
    await vi.waitFor(() => expect(saved("d/a/label")).toBeDefined());

    const label = saved("d/a/label")!;
    await userEvent.dblClick(page.elementLocator(interactive()!), {
      position: { x: label.x + label.width / 2, y: label.y + 10 },
      force: true,
    });
    await vi.waitFor(() => expect(document.querySelector(".excalidraw-wysiwyg")).not.toBeNull());
    await userEvent.click(page.getByTestId("font-family-show-fonts"));
    await userEvent.click(page.getByText("Lilita One", { exact: false }));
    await vi.waitFor(() => expect(document.querySelector(".QuickSearch__input")).toBeNull());
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(document.querySelector(".excalidraw-wysiwyg")).toBeNull());

    // Lilita One is Excalidraw's font family 7.
    await vi.waitFor(() => expect(saved("d/a/label")?.fontFamily).toBe(7));
  });
});

describe("an html card on the board", () => {
  it("lets a middle drag and the wheel reach the board until a click opens the page", async () => {
    localStorage.removeItem(STORAGE_KEY);
    await page.viewport(1300, 800);
    const turnBoard = createTurnBoard();
    // The chat publishes the layer cards render into; here a bare one stands in for it.
    const layer = document.createElement("div");
    document.body.append(layer);
    turnBoard.publish(layer, []);
    await using _ = await render(
      <div data-board-root style={{ position: "relative", width: 1200, height: 700 }}>
        <ExcalidrawBoard
          draft={false}
          storageId="server-drawing"
          turnBoard={turnBoard}
          canvasThread={{ environmentId: "e", threadId: "t" } as never}
        />
      </div>,
    );
    await vi.waitFor(() =>
      expect(document.querySelector(".excalidraw__canvas.interactive")).not.toBeNull(),
    );
    const card: ThreadCanvasShape = {
      id: "page",
      type: "html",
      attachmentId: "a-1-html",
      title: "Chart",
      width: 480,
      height: 320,
    };
    sync.onScene?.({
      revision: 1,
      elements: buildDrawingElements({
        drawingId: "h",
        turn: null,
        placed: [{ shape: card, ...shapeSize(card), x: 100, y: 100, localX: 0, localY: 0 }],
        versionOf: () => 0,
        randomInt: () => 7,
        now: 1,
      }),
    });
    const cover = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>(
        '[data-canvas-card-id="h/page"] .canvas-card-cover',
      );
      expect(found).not.toBeNull();
      return found!;
    });
    const canvas = document.querySelector(".excalidraw__canvas.interactive")!;
    const pressed: number[] = [];
    // The forwarded press stops at the canvas: Excalidraw cannot capture a pointer that never was.
    canvas.addEventListener("pointerdown", (event) => {
      pressed.push((event as PointerEvent).button);
      event.stopImmediatePropagation();
    });
    cover.dispatchEvent(
      new PointerEvent("pointerdown", { button: 1, bubbles: true, cancelable: true }),
    );
    window.dispatchEvent(new PointerEvent("pointerup", { button: 1 }));
    expect(pressed).toEqual([1]);
    expect(cover.hidden).toBe(false);
    const wheeled: number[] = [];
    canvas.addEventListener("wheel", (event) => {
      wheeled.push((event as WheelEvent).deltaY);
      event.stopImmediatePropagation();
    });
    cover.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
    expect(wheeled).toEqual([120]);

    cover.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }));
    expect(cover.hidden).toBe(true);
    // React reads leaving from pointerout to an element outside the card.
    cover.parentElement!.dispatchEvent(
      new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }),
    );
    expect(cover.hidden).toBe(false);
    layer.remove();
  });
});
