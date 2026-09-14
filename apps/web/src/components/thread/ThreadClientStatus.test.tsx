import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ThreadClientStatus, formatElapsedTime } from "./ThreadClientStatus";

afterEach(() => vi.useRealTimers());
describe("Thread composer status", () => {
  it("retains timing precision without changing ordinary duration formats", () => {
    expect(formatElapsedTime("invalid", 0)).toBeNull();
    expect(formatElapsedTime("2026-01-01T00:00:00Z", Date.parse("2026-01-01T00:01:02Z"))).toBe(
      "1m 2s",
    );
    expect(formatElapsedTime("2026-01-01T00:00:00Z", Date.parse("2026-01-01T01:01:02Z"))).toBe(
      "1h 1m",
    );
    expect(formatElapsedTime("2026-01-01T00:00:00Z", 0)).toBe("0s");
  });
  it("shows running model and elapsed work without a header, then releases its timer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    const node = { textContent: "", setAttribute: vi.fn() };
    let root!: ReactTestRenderer;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    try {
      await act(async () => {
        root = create(
          createElement(ThreadClientStatus, {
            modelLabel: "model-name",
            isWorking: true,
            isConnecting: false,
            disconnected: false,
            startedAt: "2026-01-01T00:00:00Z",
          }),
          { createNodeMock: () => node },
        );
      });
      expect(JSON.stringify(root.toJSON())).toContain("Working");
      expect(JSON.stringify(root.toJSON())).toContain("model-name");
      expect(JSON.stringify(root.toJSON())).toContain("1m 1s");
      await act(async () => vi.advanceTimersByTime(1000));
      expect(node.textContent).toBe("1m 2s");
      expect(root.root.findAllByType("header")).toHaveLength(0);
      await act(async () =>
        root.update(
          createElement(ThreadClientStatus, {
            modelLabel: "model-name",
            isWorking: false,
            isConnecting: false,
            disconnected: true,
          }),
        ),
      );
      expect(JSON.stringify(root.toJSON())).toContain("Disconnected");
      expect(vi.getTimerCount()).toBe(0);
      await act(async () =>
        root.update(
          createElement(ThreadClientStatus, {
            modelLabel: "",
            isWorking: false,
            isConnecting: true,
            disconnected: true,
          }),
        ),
      );
      expect(JSON.stringify(root.toJSON())).toContain("Connecting");
      expect(JSON.stringify(root.toJSON())).not.toContain("Disconnected");
      await act(async () =>
        root.update(
          createElement(ThreadClientStatus, {
            modelLabel: "",
            isWorking: false,
            isConnecting: false,
            disconnected: false,
          }),
        ),
      );
      expect(root.toJSON()).toBeNull();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
