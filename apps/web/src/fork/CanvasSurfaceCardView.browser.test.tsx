import "../index.css";

import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { page } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";

const state = vi.hoisted(() => ({
  menus: [] as Array<ReadonlyArray<{ id: string; label: string; disabled?: boolean }>>,
  pick: null as string | null,
}));

vi.mock("./ThreadCanvasSync", () => ({ ThreadCanvasSync: () => null }));
vi.mock(import("../localApi"), async (original) => ({
  ...(await original()),
  readLocalApi: () =>
    ({
      contextMenu: {
        show: async (items: ReadonlyArray<{ id: string; label: string; disabled?: boolean }>) => {
          state.menus.push(items);
          return state.pick;
        },
      },
    }) as never,
}));

import ExcalidrawBoard from "./ExcalidrawBoard";
import { canvasBoardMounted, placeSurfaceOnCanvas } from "./canvasSurfaceCards";
import { createTurnBoard } from "./turnBoard";

const threadRef = {
  environmentId: EnvironmentId.make("surface-card-test"),
  threadId: ThreadId.make("thread"),
};
const STORAGE_KEY = "t3code:demo:turn-board:surface-cards";

const savedCards = () =>
  (
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ReadonlyArray<{
      id: string;
      x: number;
      y: number;
      customData?: { t3Card?: unknown };
    }>
  ).filter((element) => element.customData?.t3Card !== undefined);

const rightClick = (target: Element, clientX: number, clientY: number) =>
  target.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX, clientY }),
  );

async function renderBoard(options: {
  readonly onCite?: Parameters<typeof ExcalidrawBoard>[0]["onCite"];
  readonly placed?: Array<{ x: number; y: number }>;
  /** Elements the board opens with, as a saved board would hold them. */
  readonly scene?: ReadonlyArray<Record<string, unknown>>;
}) {
  localStorage.removeItem(STORAGE_KEY);
  if (options.scene) localStorage.setItem(STORAGE_KEY, JSON.stringify(options.scene));
  state.menus = [];
  await page.viewport(1300, 800);
  const turnBoard = createTurnBoard();
  const layer = document.createElement("div");
  // The board's cards sit in the timeline's citation viewport, as in the chat.
  layer.dataset.assistantCitationViewport = "true";
  document.body.append(layer);
  turnBoard.publish(layer, []);
  const screen = await render(
    <div data-board-root style={{ position: "relative", width: 1200, height: 700 }}>
      <ExcalidrawBoard
        draft={false}
        storageId="surface-cards"
        turnBoard={turnBoard}
        canvasThread={threadRef}
        renderPanelSurface={(surface, card) => (
          <button
            type="button"
            data-testid="panel-surface"
            onClick={() => card.show({ kind: "file", relativePath: "README.md" })}
          >
            {surface.id}
          </button>
        )}
        newSurfaces={[
          { label: "Browser", available: false, place: () => {} },
          { label: "Files", available: true, place: (at) => options.placed?.push(at) },
        ]}
        onCite={options.onCite}
      />
    </div>,
  );
  await vi.waitFor(() => expect(canvasBoardMounted(threadRef)).toBe(true));
  return { screen, layer };
}

describe("a right panel tab placed on the canvas", () => {
  it("runs the panel's component, whose navigation changes the card and not the panel", async () => {
    const { screen, layer } = await renderBoard({});
    await using _ = screen;
    expect(
      placeSurfaceOnCanvas(threadRef, {
        kind: "surface",
        surface: { kind: "files" },
        title: "Files",
      }),
    ).toBe(true);
    const panel = await vi.waitFor(() => {
      const found = layer.querySelector<HTMLButtonElement>('[data-testid="panel-surface"]');
      expect(found?.textContent).toBe("files");
      return found!;
    });
    // The card is saved as a reference, never a copy of what it shows.
    await vi.waitFor(() =>
      expect(savedCards().map((element) => element.customData?.t3Card)).toEqual([
        { kind: "surface", surface: { kind: "files" }, title: "Files" },
      ]),
    );
    panel.click();
    await vi.waitFor(() => {
      expect(layer.querySelector('[data-testid="panel-surface"]')?.textContent).toBe(
        "file:README.md",
      );
      expect(savedCards().map((element) => element.customData?.t3Card)).toEqual([
        {
          kind: "surface",
          surface: { kind: "file", relativePath: "README.md" },
          title: "README.md",
        },
      ]);
    });
    layer.remove();
  });
});

describe("the board's right-click menus", () => {
  it("offers the panel's new tabs on empty canvas, and Canvas options opens Excalidraw's menu", async () => {
    const placed: Array<{ x: number; y: number }> = [];
    const { screen, layer } = await renderBoard({ placed });
    await using _ = screen;
    const board = document.querySelector<HTMLElement>("[data-excalidraw-board]")!;
    const canvas = document.querySelector(".excalidraw__canvas.interactive")!;

    state.pick = "surface:1";
    rightClick(canvas, 600, 400);
    await vi.waitFor(() => expect(placed).toHaveLength(1));
    expect(state.menus[0]).toEqual([
      { id: "surface:0", label: "Browser", disabled: true },
      { id: "surface:1", label: "Files", disabled: false },
      { id: "canvas-options", label: "Canvas options…", separatorBefore: true },
    ]);
    expect(board.querySelector("ul.context-menu")).toBeNull();

    state.pick = "canvas-options";
    rightClick(canvas, 600, 400);
    await vi.waitFor(() =>
      expect(board.querySelector('ul.context-menu [data-testid="selectAll"]')).not.toBeNull(),
    );
    expect(board.querySelector('[data-testid="t3-cite"]')).toBeNull();
    layer.remove();
  });

  it("leaves the element test to Excalidraw for rotated, outlined and linear shapes", async () => {
    const shape = (id: string, overrides: Record<string, unknown>) => ({
      id,
      type: "rectangle",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 0,
      opacity: 100,
      version: 1,
      isDeleted: false,
      ...overrides,
    });
    const { screen, layer } = await renderBoard({
      scene: [
        // Turned upright, it covers x 350 to 450 and y 50 to 250.
        shape("turned", { x: 300, y: 100, angle: Math.PI / 2, backgroundColor: "#a5d8ff" }),
        shape("ring", { type: "ellipse", x: 600, y: 100 }),
        shape("arrow", {
          type: "arrow",
          x: 300,
          y: 350,
          height: 200,
          points: [
            [0, 0],
            [200, 200],
          ],
        }),
      ],
    });
    await using _ = screen;
    const board = document.querySelector<HTMLElement>("[data-excalidraw-board]")!;
    const canvas = document.querySelector(".excalidraw__canvas.interactive")!;
    const origin = canvas.getBoundingClientRect();
    state.pick = null;
    // Excalidraw answers a right-click within React's flush, so act settles it before reading.
    const opensT3Menu = async (x: number, y: number) => {
      const asked = state.menus.length;
      await act(() => rightClick(canvas, origin.left + x, origin.top + y));
      if (state.menus.length > asked) {
        expect(board.querySelector("ul.context-menu")).toBeNull();
        return true;
      }
      expect(board.querySelector('[data-testid="deleteSelectedElements"]')).not.toBeNull();
      return false;
    };
    // Inside each shape's upright box, but off the shape: Excalidraw counts an ellipse's inside.
    expect(await opensT3Menu(480, 150)).toBe(true);
    expect(await opensT3Menu(605, 105)).toBe(true);
    expect(await opensT3Menu(480, 370)).toBe(true);
    // On the turned rectangle outside its upright box, the ring's outline, and the arrow's line,
    // each asked while the last one's menu is still open.
    expect(await opensT3Menu(400, 230)).toBe(false);
    expect(await opensT3Menu(700, 100)).toBe(false);
    expect(await opensT3Menu(400, 450)).toBe(false);
    // And back on empty canvas with an element menu open.
    expect(await opensT3Menu(480, 370)).toBe(true);
    layer.remove();
  });

  it("puts Cite atop Excalidraw's element menu, quoting the element through the composer", async () => {
    const cited: Array<{ messageId: string; text: string; source: string | undefined }> = [];
    const { screen, layer } = await renderBoard({
      onCite: (citation, anchor) => {
        cited.push({
          messageId: citation.messageId,
          text: citation.text,
          source: anchor.source.dataset.assistantCitationSource,
        });
        return true;
      },
    });
    await using _ = screen;
    placeSurfaceOnCanvas(
      threadRef,
      { kind: "surface", surface: { kind: "diff" }, title: "Diff" },
      { at: { x: 100, y: 100 } },
    );
    const [element] = await vi.waitFor(() => {
      const found = savedCards();
      expect(found).toHaveLength(1);
      return found;
    });
    const board = document.querySelector<HTMLElement>("[data-excalidraw-board]")!;
    const canvas = document.querySelector(".excalidraw__canvas.interactive")!;
    const cardBox = layer.querySelector(".canvas-card")!.getBoundingClientRect();
    const zoom = Number(/scale\(([\d.]+)\)/.exec(layer.style.transform)?.[1] ?? 1);
    // On the card's outline, which is the Excalidraw box's edge around the card's view.
    rightClick(canvas, cardBox.left + cardBox.width / 2, cardBox.top - 12 * zoom);
    const cite = await vi.waitFor(() => {
      const items = [...board.querySelectorAll("ul.context-menu > li")];
      expect(items[0]?.getAttribute("data-testid")).toBe("t3-cite");
      expect(
        items.some((item) => item.getAttribute("data-testid") === "deleteSelectedElements"),
      ).toBe(true);
      return items[0] as HTMLElement;
    });
    expect(state.menus).toEqual([]);
    cite.click();
    expect(cited).toEqual([{ messageId: element!.id, text: "Diff", source: element!.id }]);
    await vi.waitFor(() => expect(board.querySelector("ul.context-menu")).toBeNull());

    // The anchor the citation points at follows its element, and goes with it.
    const anchor = () =>
      layer.querySelector<HTMLElement>(`[data-canvas-cite-anchor="${element!.id}"]`);
    const before = anchor()!.style.transform;
    expect(before).toBe(`translate(${element!.x}px, ${element!.y}px)`);
    // Excalidraw reads keys only while focus is inside it, as the board gives it on a press.
    const container = board.querySelector<HTMLElement>(".excalidraw-container")!;
    container.focus();
    const press = (key: string) =>
      container.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    await act(() => press("ArrowRight"));
    await vi.waitFor(() => expect(anchor()!.style.transform).not.toBe(before));
    await act(() => press("Delete"));
    await vi.waitFor(() => expect(anchor()).toBeNull());
    layer.remove();
  });
});
