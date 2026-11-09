import "../index.css";

import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

import type { MessagesTimelineRow } from "../components/chat/MessagesTimeline.logic";
import ExcalidrawBoard from "./ExcalidrawBoard";
import { TurnCards } from "./TurnCards";
import { createTurnBoard, TURN_INSET_PX } from "./turnBoard";

function userRow(id: string) {
  return {
    id,
    kind: "message",
    message: { id, role: "user", text: id },
  } as unknown as MessagesTimelineRow;
}

function Fixture(props: {
  board: ReturnType<typeof createTurnBoard>;
  rows: ReadonlyArray<MessagesTimelineRow>;
  onFollowChange: (following: boolean) => void;
}) {
  return (
    <div
      className="board-chrome"
      data-board-root
      style={{ position: "relative", width: 1200, height: 700, overflow: "hidden" }}
    >
      <ExcalidrawBoard
        draft={false}
        storageId="fixture"
        turnBoard={props.board}
        canvasThread={null}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <TurnCards
          board={props.board}
          rows={props.rows}
          renderRow={({ item }) => <div style={{ height: 400 }}>{item.id}</div>}
          header={null}
          footer={null}
          onFollowChange={props.onFollowChange}
          onReady={() => {}}
        />
      </div>
    </div>
  );
}

const cardRect = (id: string) =>
  document.querySelector(`[data-turn-card="${id}"]`)?.getBoundingClientRect();

const interactiveCanvas = () =>
  document.querySelector<HTMLCanvasElement>(".excalidraw__canvas.interactive");

describe("TurnCards on the board", () => {
  it("lands turns down the board, pans to the latest, and pans when wheeled over a card", async () => {
    await page.viewport(1400, 900);
    const board = createTurnBoard();
    const onFollowChange = vi.fn();
    const first = [userRow("one"), userRow("two")];
    await using screen = await render(
      <Fixture board={board} rows={first} onFollowChange={onFollowChange} />,
    );

    await vi.waitFor(() => {
      const two = cardRect("two");
      expect(document.querySelector('[data-turn-card="two"]')).toHaveProperty(
        "dataset.placed",
        "true",
      );
      expect(two?.top).toBeLessThan(200);
    });
    expect(cardRect("one")!.bottom).toBeLessThan(cardRect("two")!.top);

    await screen.rerender(
      <Fixture board={board} rows={[...first, userRow("three")]} onFollowChange={onFollowChange} />,
    );
    await vi.waitFor(() => expect(cardRect("three")?.top).toBeLessThan(200), { timeout: 2000 });

    const before = cardRect("three")!.top;
    const card = document.querySelector('[data-turn-card="three"]')!;
    const wheel = new WheelEvent("wheel", { deltaY: -300, bubbles: true, cancelable: true });
    card.dispatchEvent(wheel);
    await vi.waitFor(() => expect(cardRect("three")!.top).toBeGreaterThan(before + 100));
    expect(wheel.defaultPrevented).toBe(true);
    expect(interactiveCanvas()).not.toBeNull();
    await vi.waitFor(() => expect(onFollowChange).toHaveBeenCalledWith(false));

    board.panToLatest();
    await vi.waitFor(() => expect(cardRect("three")!.top).toBeLessThan(200), { timeout: 2000 });
    expect(onFollowChange).toHaveBeenLastCalledWith(true);
  });

  it("moves a turn with its box when the reader drags it aside, and leaves the others", async () => {
    await page.viewport(1400, 900);
    const rows = [userRow("one"), userRow("two")];
    await using _screen = await render(
      <Fixture board={createTurnBoard()} rows={rows} onFollowChange={() => {}} />,
    );
    await vi.waitFor(() => {
      expect(document.querySelector('[data-turn-card="two"]')).toHaveProperty(
        "dataset.placed",
        "true",
      );
      expect(cardRect("two")?.top).toBeLessThan(200);
      expect(interactiveCanvas()).not.toBeNull();
    });
    const canvas = interactiveCanvas()!;
    const card = cardRect("two")!;
    const two = { left: card.left, top: card.top };
    const one = cardRect("one")!.top;
    const bounds = canvas.getBoundingClientRect();
    const grab = { x: card.left - TURN_INSET_PX - bounds.left, y: card.top + 100 - bounds.top };
    const surface = page.elementLocator(canvas);
    await userEvent.dragAndDrop(surface, surface, {
      sourcePosition: grab,
      targetPosition: { x: grab.x + 220, y: grab.y },
      force: true,
    });

    await vi.waitFor(() => expect(cardRect("two")!.left).toBeGreaterThan(two.left + 150));
    expect(cardRect("two")!.top).toBeCloseTo(two.top, 0);
    expect(cardRect("one")!.top).toBeCloseTo(one, 0);
  });

  it("keeps the layout across a remount, because the scene is saved per thread", async () => {
    await page.viewport(1400, 900);
    const rows = [userRow("one")];
    await using _screen = await render(
      <Fixture board={createTurnBoard()} rows={rows} onFollowChange={() => {}} />,
    );
    await vi.waitFor(() =>
      expect(document.querySelector('[data-turn-card="one"]')).toHaveProperty(
        "dataset.placed",
        "true",
      ),
    );
    await vi.waitFor(() =>
      expect(localStorage.getItem("t3code:demo:turn-board:fixture")).toContain("t3Turn"),
    );
  });
});
