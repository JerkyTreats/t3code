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

import { collectAssistantCitations } from "@t3tools/shared/assistantCitations";
import { AssistantSelectionToolbar } from "../components/chat/AssistantSelectionToolbar";
import ExcalidrawBoard from "./ExcalidrawBoard";
import {
  canvasBoardMounted,
  canvasPlacementStore,
  placeSurfaceOnCanvas,
} from "./canvasSurfaceCards";
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
  /** Renders the timeline's selection actions over the card layer, which holds an agent's words. */
  readonly selectionToolbar?: boolean;
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
  if (options.selectionToolbar) {
    layer.insertAdjacentHTML(
      "beforeend",
      `<p data-assistant-citation-source="agent-card" data-assistant-citation-environment="${threadRef.environmentId}" data-assistant-citation-thread="${threadRef.threadId}">the answer is 42</p>`,
    );
  }
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
      {options.selectionToolbar ? (
        <AssistantSelectionToolbar viewport={layer} threadRef={threadRef} onCite={() => true} />
      ) : null}
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

describe("a surface card zoomed in past 100%", () => {
  it("lays out at the settled zoom and scales back, keeping its size on the board", async () => {
    const { screen, layer } = await renderBoard({});
    await using _ = screen;
    placeSurfaceOnCanvas(
      threadRef,
      { kind: "surface", surface: { kind: "diff" }, title: "Diff" },
      { at: { x: 100, y: 100 } },
    );
    const raster = await vi.waitFor(() => {
      const found = layer.querySelector<HTMLElement>(".canvas-card-raster");
      expect(found).not.toBeNull();
      return found!;
    });
    const card = raster.parentElement!;
    expect(raster.style.zoom).toBe("");
    const canvas = document.querySelector(".excalidraw__canvas.interactive")!;
    const zoom = () => Number(/scale\(([\d.]+)\)/.exec(layer.style.transform)?.[1] ?? 1);
    // Excalidraw takes one wheel zoom per frame, so each step waits for the last to land.
    while (zoom() < 1.5) {
      const before = layer.style.transform;
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -100,
          ctrlKey: true,
          clientX: 600,
          clientY: 350,
          bubbles: true,
          cancelable: true,
        }),
      );
      await vi.waitFor(() => expect(layer.style.transform).not.toBe(before));
    }
    const settled = Math.round(zoom() * 100) / 100;
    await vi.waitFor(() => expect(Number(raster.style.zoom)).toBe(settled));
    expect(Number(/scale\(([\d.]+)\)/.exec(raster.style.transform)?.[1])).toBeCloseTo(
      1 / settled,
      5,
    );
    const cardBox = card.getBoundingClientRect();
    const rasterBox = raster.getBoundingClientRect();
    expect(rasterBox.width).toBeCloseTo(cardBox.width, 0);
    expect(rasterBox.height).toBeCloseTo(cardBox.height, 0);
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

describe("a selection placed on the canvas", () => {
  /** Selects the agent's words from the keyboard and waits for the selection's actions. */
  async function selectQuote(layer: HTMLElement) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    document.getSelection()!.selectAllChildren(layer.querySelector("p")!);
    await expect
      .element(page.getByRole("button", { name: "Cite selection in composer" }))
      .toBeVisible();
  }
  const press = (target: Element, clientX: number, clientY: number) =>
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        button: 0,
        clientX,
        clientY,
      }),
    );
  const quoteCards = () =>
    savedCards().filter(
      (element) =>
        (element.customData?.t3Card as { kind?: string } | undefined)?.kind === "markdown",
    );

  it("offers Cite beside Place on canvas, which drops the quote where the board is clicked", async () => {
    const { screen, layer } = await renderBoard({ selectionToolbar: true });
    await using _ = screen;
    await selectQuote(layer);
    await page.getByRole("button", { name: "Place on canvas" }).click();
    await vi.waitFor(() => {
      expect(document.querySelector("[data-canvas-placement]")).not.toBeNull();
      expect(document.querySelector('[aria-label="Cite selection in composer"]')).toBeNull();
    });
    press(document.querySelector(".excalidraw__canvas.interactive")!, 600, 400);

    const [card] = await vi.waitFor(() => {
      const found = quoteCards();
      expect(found).toHaveLength(1);
      return found;
    });
    expect(document.querySelector("[data-canvas-placement]")).toBeNull();
    const text = (card!.customData!.t3Card as { text: string }).text;
    expect(text.startsWith("> the answer is 42\n\n")).toBe(true);
    expect(collectAssistantCitations(text).map(({ citation }) => citation)).toMatchObject([
      { ...threadRef, messageId: "agent-card", text: "the answer is 42" },
    ]);
    // The card's top-left lands under the pointer.
    const box = await vi.waitFor(() => {
      const found = layer.querySelector(`[data-canvas-card-id="${card!.id}"]`);
      expect(found).not.toBeNull();
      return found!.getBoundingClientRect();
    });
    expect(box.left).toBeCloseTo(600, 0);
    expect(box.top).toBeCloseTo(400, 0);
    // Only the placing press's mouse click is swallowed, never a later keyboard click.
    const button = document.createElement("button");
    let clicks = 0;
    button.addEventListener("click", () => (clicks += 1));
    document.body.append(button);
    button.click();
    expect(clicks).toBe(1);
    button.remove();
    layer.remove();
  });

  it("ends the placement when the board goes away", async () => {
    const { screen, layer } = await renderBoard({ selectionToolbar: true });
    await selectQuote(layer);
    await page.getByRole("button", { name: "Place on canvas" }).click();
    await vi.waitFor(() => expect(canvasPlacementStore.get()).not.toBeNull());
    await screen.unmount();
    expect(canvasPlacementStore.get()).toBeNull();
    expect(document.querySelector("[data-canvas-placement]")).toBeNull();
    await screen[Symbol.asyncDispose]();
    layer.remove();
  });

  it("places nothing when Escape cancels", async () => {
    const { screen, layer } = await renderBoard({ selectionToolbar: true });
    await using _ = screen;
    const canvas = document.querySelector(".excalidraw__canvas.interactive")!;
    await selectQuote(layer);
    await page.getByRole("button", { name: "Place on canvas" }).click();
    await vi.waitFor(() =>
      expect(document.querySelector("[data-canvas-placement]")).not.toBeNull(),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector("[data-canvas-placement]")).toBeNull());

    // A second placement is the only card the board then holds.
    await selectQuote(layer);
    await page.getByRole("button", { name: "Place on canvas" }).click();
    await vi.waitFor(() =>
      expect(document.querySelector("[data-canvas-placement]")).not.toBeNull(),
    );
    press(canvas, 300, 300);
    await vi.waitFor(() => expect(quoteCards()).toHaveLength(1));
    layer.remove();
  });
});
