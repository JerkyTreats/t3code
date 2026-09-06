import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createDocumentMermaidThemeEnvironment,
  createMermaidThemeStore,
  getDefaultMermaidThemeSnapshot,
  normalizeMermaidThemeColor,
  readDocumentMermaidThemePalette,
  type MermaidThemePalette,
} from "./mermaidTheme";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Mermaid document theme", () => {
  it("captures immutable default palettes", () => {
    const snapshot = getDefaultMermaidThemeSnapshot("dark");

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.palette)).toBe(true);
    expect(snapshot.palette.appearance).toBe("dark");
    expect(snapshot.palette.background).toBe("#111318");
  });

  it("normalizes modern CSS colors and preserves alpha", () => {
    expect(normalizeMermaidThemeColor("oklch(14.5% 0 none)", "#111318")).toBe("#0a0a0a");
    expect(normalizeMermaidThemeColor("oklch(14.5% 0 none / 50%)", "#111318")).toBe("#0a0a0a80");
  });

  it("uses browser-resolved composed colors and falls back per invalid value", () => {
    const resolveCssColor = vi.fn((value: string) =>
      value.startsWith("color-mix") ? "rgba(10, 20, 30, 0.5)" : null,
    );

    expect(
      normalizeMermaidThemeColor("color-mix(in srgb, red 50%, blue)", "#ffffff", resolveCssColor),
    ).toBe("#0a141e80");
    expect(normalizeMermaidThemeColor("invalid", "#123456", resolveCssColor)).toBe("#123456");
  });

  it("resolves composed custom properties on a connected document probe", () => {
    const root = { classList: { contains: () => false } };
    const values = new Map<string, string>([
      ["--background", "oklch(14.5% 0 none)"],
      ["--surface-raised", "color-mix(in srgb, var(--background) 80%, white)"],
    ]);
    const rootStyles = {
      fontFamily: "Test Sans",
      getPropertyValue: (name: string) => values.get(name) ?? "",
    } as CSSStyleDeclaration;
    const probe = {
      remove: vi.fn(),
      style: { color: "", pointerEvents: "", position: "", visibility: "" },
    };
    const appendChild = vi.fn();

    vi.stubGlobal("document", {
      body: { appendChild },
      createElement: vi.fn(() => probe),
      documentElement: root,
    });
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn((element: unknown) =>
        element === root ? rootStyles : ({ color: "rgba(10, 20, 30, 0.5)" } as CSSStyleDeclaration),
      ),
    );

    const palette = readDocumentMermaidThemePalette();

    expect(palette).toMatchObject({
      background: "#0a0a0a",
      surfaceRaised: "#0a141e80",
    });
    expect(appendChild).toHaveBeenCalledWith(probe);
    expect(probe.remove).toHaveBeenCalledOnce();
  });

  it("shares one observer, tracks same-mode colors, and cleans up its last listener", async () => {
    const root = {
      classList: { contains: vi.fn(() => true) },
    };
    const values = new Map<string, string>([
      ["--background", "oklch(14.5% 0 none)"],
      ["--card", "#181818"],
      ["--contrast-foreground", "#f5f5f5"],
      ["--primary", "#55aaff"],
    ]);
    const styles = {
      fontFamily: "Test Sans",
      getPropertyValue: (name: string) => values.get(name) ?? "",
    } as CSSStyleDeclaration;
    const mutationCallback: { current: MutationCallback | null } = { current: null };
    const observe = vi.fn();
    const disconnect = vi.fn();
    const MutationObserverMock = vi.fn(function (
      this: MutationObserver,
      callback: MutationCallback,
    ) {
      mutationCallback.current = callback;
      return { observe, disconnect };
    });

    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => styles),
    );
    vi.stubGlobal("MutationObserver", MutationObserverMock);

    const store = createMermaidThemeStore(createDocumentMermaidThemeEnvironment());
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const stopFirst = store.subscribe(firstListener);
    const stopSecond = store.subscribe(secondListener);

    expect(MutationObserverMock).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(root, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme-id"],
    });
    const initial = store.getSnapshot("dark");
    expect(initial.palette.background).toBe("#0a0a0a");

    values.set("--background", "#0a0a0a");
    mutationCallback.current?.([], {} as MutationObserver);
    await Promise.resolve();

    expect(store.getSnapshot("dark")).toBe(initial);
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).not.toHaveBeenCalled();

    values.set("--background", "#202020");
    mutationCallback.current?.([], {} as MutationObserver);
    await Promise.resolve();

    const updated = store.getSnapshot("dark");
    expect(updated.key).not.toBe(initial.key);
    expect(updated.palette.background).toBe("#202020");
    expect(updated.palette.appearance).toBe("dark");
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);

    mutationCallback.current?.([], {} as MutationObserver);
    await Promise.resolve();
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);

    stopFirst();
    expect(disconnect).not.toHaveBeenCalled();
    stopSecond();
    expect(disconnect).toHaveBeenCalledOnce();

    values.set("--background", "#303030");
    const stopRemount = store.subscribe(vi.fn());
    expect(MutationObserverMock).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot("dark").palette.background).toBe("#303030");
    stopRemount();
  });

  it("coalesces a burst of palette mutations", () => {
    let palette: MermaidThemePalette = getDefaultMermaidThemeSnapshot("light").palette;
    let onChange = (): void => undefined;
    const deferred: Array<() => void> = [];
    const listener = vi.fn();
    const store = createMermaidThemeStore({
      readPalette: () => palette,
      observePalette(callback) {
        onChange = callback;
        return () => undefined;
      },
      defer: (callback) => deferred.push(callback),
    });
    const stop = store.subscribe(listener);

    palette = { ...palette, accent: "#123456" };
    onChange();
    onChange();
    onChange();

    expect(deferred).toHaveLength(1);
    deferred[0]?.();
    expect(listener).toHaveBeenCalledOnce();
    stop();
  });
});
