import "../index.css";

import { EnvironmentId, type ProjectReadFileResult, ThreadId } from "@t3tools/contracts";
import { page } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";
import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";

const state = vi.hoisted(() => ({
  file: null as ProjectReadFileResult | null,
  reads: [] as Array<{ relativePath: string | null; enabled: boolean | undefined }>,
}));

vi.mock("./ThreadCanvasSync", () => ({ ThreadCanvasSync: () => null }));
vi.mock(import("../components/files/projectFilesQueryState"), async (original) => ({
  ...(await original()),
  useProjectFileQuery: (
    _environmentId: unknown,
    _cwd: string,
    relativePath: string | null,
    enabled?: boolean,
  ) => {
    state.reads.push({ relativePath, enabled });
    return {
      data: enabled ? state.file : null,
      error: null,
      isPending: false,
      readError: null,
      isNotFile: false,
      isFile: true,
      refresh: () => {},
    };
  },
}));
vi.mock(import("../state/entities"), async (original) => ({
  ...(await original()),
  useQuietThreadShell: () =>
    ({ projectId: "project", worktreePath: "/workspace", latestRun: null }) as never,
  useProject: () => null,
}));

import ExcalidrawBoard from "./ExcalidrawBoard";
import { canvasBoardMounted, placeSurfaceOnCanvas } from "./canvasSurfaceCards";
import { createTurnBoard } from "./turnBoard";

const threadRef = {
  environmentId: EnvironmentId.make("surface-card-test"),
  threadId: ThreadId.make("thread"),
};
const STORAGE_KEY = "t3code:demo:turn-board:surface-cards";

/** Every element under `root`, through open shadow roots, as the file view renders into one. */
function deepElements(root: Element): Element[] {
  return [...root.querySelectorAll("*")].flatMap((element) => [
    element,
    ...(element.shadowRoot ? [...element.shadowRoot.children].flatMap(deepElements) : []),
  ]);
}

describe("a file placed on the canvas from the panel", () => {
  it("shows its source read-only, falls back to its face zoomed out, and reopens in the panel", async () => {
    localStorage.removeItem(STORAGE_KEY);
    state.file = {
      relativePath: "src/app.ts",
      contents: "export const answer = 42;\n",
      byteLength: 26,
      truncated: false,
    };
    await page.viewport(1300, 800);
    const turnBoard = createTurnBoard();
    const layer = document.createElement("div");
    document.body.append(layer);
    turnBoard.publish(layer, []);
    await using _ = await render(
      <div data-board-root style={{ position: "relative", width: 1200, height: 700 }}>
        <ExcalidrawBoard
          draft={false}
          storageId="surface-cards"
          turnBoard={turnBoard}
          canvasThread={threadRef}
          onSendNote={() => {}}
        />
      </div>,
    );
    await vi.waitFor(() => expect(canvasBoardMounted(threadRef)).toBe(true));

    expect(
      placeSurfaceOnCanvas(threadRef, {
        kind: "surface",
        surface: { kind: "file", relativePath: "src/app.ts" },
        title: "app.ts",
      }),
    ).toBe(true);

    const card = await vi.waitFor(() => {
      const found = document.querySelector('[data-canvas-card="surface"]');
      expect(found).not.toBeNull();
      expect(found!.querySelector("[data-surface-live-view]")).not.toBeNull();
      return found!;
    });
    expect(card.textContent).toContain("src/app.ts");
    const sourceText = () =>
      deepElements(card)
        .map((element) => (element.childElementCount === 0 ? element.textContent : ""))
        .join("");
    await vi.waitFor(() => expect(sourceText()).toContain("answer = 42"));
    // Nothing in the card can be typed into: the panel's editor is the only editable copy.
    expect(
      deepElements(card).filter(
        (element) =>
          element instanceof HTMLElement &&
          (element.isContentEditable || element.matches("input, textarea")),
      ),
    ).toEqual([]);
    // The card is saved as a reference, never a copy of the file.
    await vi.waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ReadonlyArray<{
        customData?: { t3Card?: unknown };
      }>;
      expect(saved.map((element) => element.customData?.t3Card)).toContainEqual({
        kind: "surface",
        surface: { kind: "file", relativePath: "src/app.ts" },
        title: "app.ts",
      });
    });

    const canvas = document.querySelector(".excalidraw__canvas.interactive")!;
    const zoom = () => Number(/scale\(([\d.]+)\)/.exec(layer.style.transform)?.[1] ?? 1);
    // Excalidraw takes one wheel zoom per frame, so each step waits for the last to land.
    const wheelZoom = async (deltaY: number) => {
      const before = layer.style.transform;
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY,
          ctrlKey: true,
          clientX: 600,
          clientY: 350,
          bubbles: true,
          cancelable: true,
        }),
      );
      await vi.waitFor(() => expect(layer.style.transform).not.toBe(before));
    };
    while (zoom() >= 0.45) await wheelZoom(100);
    await vi.waitFor(() => expect(card.querySelector("[data-surface-live-view]")).toBeNull());
    expect(card.textContent).toContain("Zoom in or scroll to read.");

    // A same-length edit while the card is away must not come back with the old highlighting.
    state.file = { ...state.file, contents: "export const answer = 43;\n" };
    while (zoom() < 0.5) await wheelZoom(-100);
    await vi.waitFor(() => expect(card.querySelector("[data-surface-live-view]")).not.toBeNull());
    await vi.waitFor(() => expect(sourceText()).toContain("answer = 43"));
    expect(sourceText()).not.toContain("answer = 42");

    card.querySelector<HTMLButtonElement>("button")!.click();
    const panel = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef);
    expect(panel.activeSurfaceId).toBe("file:src/app.ts");
    layer.remove();
  });
});
