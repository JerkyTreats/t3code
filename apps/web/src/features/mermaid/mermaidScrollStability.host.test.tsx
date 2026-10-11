// @vitest-environment jsdom

import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { usePreserveScrollOnMermaidResize } from "./mermaidScrollStability";

let renderer: ReactTestRenderer | undefined;

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Mermaid resize subscription", () => {
  it("adjusts before the resize delivery finishes and cancels on unmount", async () => {
    let deliver: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    const unobserve = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          deliver = callback;
        }
        observe = observe;
        unobserve = unobserve;
        disconnect = disconnect;
      },
    );
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const scrollContainer = document.createElement("div");
    const block = document.createElement("div");
    scrollContainer.style.overflowY = "auto";
    scrollContainer.append(block);
    scrollContainer.scrollTop = 200;
    Object.defineProperties(scrollContainer, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 100 },
    });
    vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
    let height = 20;
    vi.spyOn(block, "getBoundingClientRect").mockImplementation(
      () => ({ height, bottom: 60 - (scrollContainer.scrollTop - 200) + height }) as DOMRect,
    );
    const ref = { current: block };
    function ReplacementHost() {
      usePreserveScrollOnMermaidResize(ref);
      return null;
    }
    await act(() => {
      renderer = create(<ReplacementHost />);
    });
    expect(observe).toHaveBeenCalledWith(block);
    const resize = () => {
      if (!deliver) throw new Error("Resize subscription was not established.");
      deliver(
        [
          {
            target: block,
            contentRect: new DOMRect(0, 0, 100, height),
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          },
        ],
        {} as ResizeObserver,
      );
    };

    height = 200;
    expect(scrollContainer.scrollTop).toBe(200);
    resize();
    expect(scrollContainer.scrollTop).toBe(380);
    height = 140;
    resize();
    expect(scrollContainer.scrollTop).toBe(320);

    await act(() => renderer?.unmount());
    renderer = undefined;
    expect(disconnect).toHaveBeenCalledOnce();
    height = 300;
    resize();
    expect(scrollContainer.scrollTop).toBe(320);
  });
});
