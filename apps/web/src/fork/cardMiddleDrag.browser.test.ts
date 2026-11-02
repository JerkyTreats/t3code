import { describe, expect, it, vi } from "vite-plus/test";

import { fakeTimers } from "../../test/render";
import { forwardCardMiddleDrag } from "./cardMiddleDrag";

function fixture() {
  const layer = document.createElement("div");
  const canvas = document.createElement("canvas");
  document.body.append(layer, canvas);
  const received: PointerEvent[] = [];
  canvas.addEventListener("pointerdown", (event) => received.push(event));
  const detach = forwardCardMiddleDrag(layer, () => canvas);
  const press = (button: number) => {
    const event = new PointerEvent("pointerdown", {
      button,
      clientX: 40,
      clientY: 50,
      bubbles: true,
      cancelable: true,
    });
    layer.dispatchEvent(event);
    return event;
  };
  const paste = () => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event;
  };
  return { layer, canvas, received, detach, press, paste };
}

describe("forwardCardMiddleDrag", () => {
  it("hands a middle press to the canvas and swallows the paste its release brings", async () => {
    using _timers = fakeTimers();
    const { received, detach, press, paste } = fixture();
    const press1 = press(1);
    expect(press1.defaultPrevented).toBe(true);
    expect(received.map((event) => [event.button, event.clientX])).toEqual([[1, 40]]);
    window.dispatchEvent(new PointerEvent("pointerup", { button: 1 }));
    expect(paste().defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(101);
    expect(paste().defaultPrevented).toBe(false);
    detach();
  });

  it("leaves other buttons alone, so text in a card still selects", () => {
    const { received, detach, press, paste } = fixture();
    expect(press(0).defaultPrevented).toBe(false);
    expect(received).toEqual([]);
    expect(paste().defaultPrevented).toBe(false);
    detach();
  });
});
