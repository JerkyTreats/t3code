import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../../test/render";
import { ThreadClientStatus, formatElapsedTime } from "./ThreadClientStatus";

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
    using _timers = fakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    {
      await using screen = await render(
        <ThreadClientStatus
          modelLabel="model-name"
          isWorking
          isConnecting={false}
          disconnected={false}
          startedAt="2026-01-01T00:00:00Z"
        />,
        { router: false },
      );
      const text = () => screen.container.textContent ?? "";
      expect(text()).toContain("Working");
      expect(text()).toContain("model-name");
      expect(text()).toContain("1m 1s");
      await act(async () => vi.advanceTimersByTime(1000));
      expect(text()).toContain("1m 2s");
      expect(screen.container.querySelector("header")).toBeNull();

      await screen.rerender(
        <ThreadClientStatus
          modelLabel="model-name"
          isWorking={false}
          isConnecting={false}
          disconnected
        />,
      );
      expect(text()).toContain("Disconnected");
      expect(vi.getTimerCount()).toBe(0);

      await screen.rerender(
        <ThreadClientStatus modelLabel="" isWorking={false} isConnecting disconnected />,
      );
      expect(text()).toContain("Connecting");
      expect(text()).not.toContain("Disconnected");

      await screen.rerender(
        <ThreadClientStatus
          modelLabel=""
          isWorking={false}
          isConnecting={false}
          disconnected={false}
        />,
      );
      expect(screen.container.childElementCount).toBe(0);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
