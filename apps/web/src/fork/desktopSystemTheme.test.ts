import type { DesktopSystemTheme } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  observeDesktopSystemTheme,
  localDesktopTheme,
  localSystemDark,
} from "./desktopSystemTheme";

const dark: DesktopSystemTheme = {
  source: "omarchy",
  name: "Synthetic",
  mode: "dark",
  colors: { background: "#111111", foreground: "#eeeeee", accent: "#4488cc" },
};
const light: DesktopSystemTheme = {
  ...dark,
  mode: "light",
  colors: { ...dark.colors, background: "#eeeeee", foreground: "#111111" },
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("local system theme observation", () => {
  it("subscribes before fetching and lets pushed state win over a late initial result", async () => {
    const order: string[] = [];
    let push!: (theme: DesktopSystemTheme | null) => void;
    let resolve!: (theme: DesktopSystemTheme | null) => void;
    const changed = vi.fn();
    const stop = observeDesktopSystemTheme(
      {
        onSystemTheme: (listener) => {
          order.push("subscribe");
          push = listener;
          return () => {};
        },
        getSystemTheme: () => {
          order.push("fetch");
          return new Promise((done) => {
            resolve = done;
          });
        },
      },
      changed,
    );
    await flush();
    push(light);
    resolve(dark);
    await flush();
    expect(order).toEqual(["subscribe", "fetch"]);
    expect(changed.mock.calls).toEqual([[light]]);
    stop();
  });

  it("keeps a push delivered synchronously during subscription", async () => {
    const changed = vi.fn();
    const stop = observeDesktopSystemTheme(
      {
        onSystemTheme: (listener) => {
          listener(light);
          return () => {};
        },
        getSystemTheme: async () => dark,
      },
      changed,
    );
    await flush();
    expect(changed.mock.calls).toEqual([[light]]);
    stop();
  });

  it("deduplicates colors regardless of key order and rejects unusable palettes", async () => {
    let push!: (theme: DesktopSystemTheme | null) => void;
    const changed = vi.fn();
    const stop = observeDesktopSystemTheme(
      {
        onSystemTheme: (listener) => {
          push = listener;
          return () => {};
        },
        getSystemTheme: async () => dark,
      },
      changed,
    );
    await flush();
    push({ ...dark, colors: { accent: "#4488cc", foreground: "#eeeeee", background: "#111111" } });
    push({ ...dark, colors: { ...dark.colors, accent: "invalid" } });
    expect(changed.mock.calls).toEqual([[dark]]);
    push({ ...dark, colors: { ...dark.colors, accent: "#339966" } });
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
    expect(changed).toHaveBeenLastCalledWith(null);
  });

  it("clears on disposal and ignores old pending results after resubscription", async () => {
    const changed = vi.fn();
    let resolveOld!: (theme: DesktopSystemTheme | null) => void;
    const stopOld = observeDesktopSystemTheme(
      {
        onSystemTheme: () => () => {},
        getSystemTheme: () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      },
      changed,
    );
    await flush();
    stopOld();
    const stopNew = observeDesktopSystemTheme(
      { onSystemTheme: () => () => {}, getSystemTheme: async () => light },
      changed,
    );
    await flush();
    resolveOld(dark);
    await flush();
    expect(changed.mock.calls).toEqual([[light]]);
    stopNew();
    stopNew();
    expect(changed.mock.calls).toEqual([[light], [null]]);
  });

  it("does not fetch after immediate disposal and tolerates optional bridge failures", async () => {
    const fetch = vi.fn(async () => dark);
    const changed = vi.fn();
    const stop = observeDesktopSystemTheme(
      {
        getSystemTheme: fetch,
        onSystemTheme: () => () => {
          throw new Error("Unavailable");
        },
      },
      changed,
    );
    expect(() => stop()).not.toThrow();
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    observeDesktopSystemTheme(undefined, changed)();
  });

  it("uses local mode only for a system-selected appearance", () => {
    expect(localSystemDark(dark, false)).toBe(true);
    expect(localSystemDark(light, true)).toBe(false);
    expect(localSystemDark(null, true)).toBe(true);
    expect(localDesktopTheme(dark, "system")).toBe("dark");
    expect(localDesktopTheme(dark, "light")).toBe("light");
    expect(localDesktopTheme(null, "system")).toBe("system");
  });
});
