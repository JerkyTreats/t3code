import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { DesktopSystemTheme } from "@t3tools/contracts";

function createStorage(overrides: Partial<Storage> = {}): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
    ...overrides,
  };
}

function createStyleDeclaration(): CSSStyleDeclaration {
  const values = new Map<string, string>();
  return {
    setProperty: (key: string, value: string) => {
      values.set(key, value);
    },
    removeProperty: (key: string) => {
      values.delete(key);
    },
    getPropertyValue: (key: string) => values.get(key) ?? "",
  } as CSSStyleDeclaration;
}

function stubThemeDocument(): CSSStyleDeclaration {
  const rootStyle = createStyleDeclaration();
  vi.stubGlobal("document", {
    body: { style: createStyleDeclaration() },
    createElement: () => ({
      name: "",
      setAttribute: () => undefined,
    }),
    documentElement: {
      classList: {
        add: () => undefined,
        remove: () => undefined,
        toggle: () => undefined,
      },
      style: rootStyle,
    },
    head: { append: () => undefined },
    querySelector: () => null,
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  return rootStyle;
}

afterEach(() => {
  vi.doUnmock("react");
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("theme failure handling", () => {
  it("preserves exact storage causes and operation context", async () => {
    const readCause = new Error("storage read blocked");
    const writeCause = new Error("storage quota exceeded");
    vi.stubGlobal("window", {
      localStorage: createStorage({
        getItem: () => {
          throw readCause;
        },
        setItem: () => {
          throw writeCause;
        },
      }),
    });

    const { readThemePreference, ThemeStorageError, writeThemePreference } =
      await import("./useTheme");

    try {
      readThemePreference();
      expect.unreachable("expected the theme read to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeStorageError);
      expect(error).toMatchObject({
        operation: "read",
        storageKey: "t3code:theme",
        cause: readCause,
      });
    }

    try {
      writeThemePreference("dark");
      expect.unreachable("expected the theme write to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ThemeStorageError);
      expect(error).toMatchObject({
        operation: "write",
        storageKey: "t3code:theme",
        theme: "dark",
        cause: writeCause,
      });
    }
  });

  it("falls back during initial theme application and logs only safe attributes", async () => {
    const cause = new Error("private browsing storage failure");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", {
      localStorage: createStorage({
        getItem: () => {
          throw cause;
        },
      }),
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("document", {
      documentElement: {
        classList: { toggle: vi.fn() },
      },
    });

    await expect(import("./useTheme")).resolves.toBeDefined();

    expect(errorLog).toHaveBeenCalledWith(
      "Failed to read theme preference for t3code:theme.",
      expect.objectContaining({
        operation: "read",
        storageKey: "t3code:theme",
        errorTag: "ThemeStorageError",
      }),
    );
    const attributes = errorLog.mock.calls[0]?.[1];
    expect(attributes).not.toHaveProperty("cause");
    expect(JSON.stringify(attributes)).not.toContain(cause.message);
  });

  it("retries a failed storage read only after a relevant storage event", async () => {
    const cause = new Error("persistent storage failure");
    const getItem = vi.fn(() => {
      throw cause;
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    let readSnapshot: (() => unknown) | undefined;
    let subscribeToTheme: ((listener: () => void) => () => void) | undefined;
    let storageHandler: ((event: StorageEvent) => void) | undefined;
    vi.doMock("react", () => ({
      useCallback: <A>(callback: A) => callback,
      useEffect: () => undefined,
      useSyncExternalStore: (
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => unknown,
      ) => {
        subscribeToTheme = subscribe;
        readSnapshot = getSnapshot;
        return getSnapshot();
      },
    }));
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: StorageEvent) => void) => {
        if (type === "storage") storageHandler = listener;
      },
      localStorage: createStorage({ getItem }),
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
      removeEventListener: () => undefined,
    });

    const { useTheme } = await import("./useTheme");
    useTheme();
    readSnapshot?.();
    readSnapshot?.();

    expect(getItem).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledTimes(1);

    const unsubscribe = subscribeToTheme?.(() => undefined);
    storageHandler?.({ key: "t3code:theme" } as StorageEvent);
    readSnapshot?.();

    expect(getItem).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledTimes(2);
    unsubscribe?.();
  });

  it("preserves desktop sync causes and retries after a failed cosmetic sync", async () => {
    const cause = new Error("desktop IPC unavailable");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const setTheme = vi.fn().mockRejectedValue(cause);
    vi.stubGlobal("window", { desktopBridge: { setTheme } });

    const { DesktopThemeSyncError, syncDesktopTheme, syncDesktopThemePreference } =
      await import("./useTheme");

    const error = await syncDesktopThemePreference({ setTheme }, "dark").then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(DesktopThemeSyncError);
    expect(error).toMatchObject({ theme: "dark", cause });

    setTheme.mockClear();
    syncDesktopTheme("dark");
    await Promise.resolve();
    await Promise.resolve();
    syncDesktopTheme("dark");
    await Promise.resolve();
    await Promise.resolve();

    expect(setTheme).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledWith(
      "Failed to sync the dark theme to the desktop shell.",
      expect.objectContaining({
        theme: "dark",
        errorTag: "DesktopThemeSyncError",
      }),
    );
    for (const [, attributes] of errorLog.mock.calls) {
      expect(attributes).not.toHaveProperty("cause");
      expect(JSON.stringify(attributes)).not.toContain(cause.message);
    }
  });

  it("projects desktop system theme colors into CSS variables", async () => {
    const style = stubThemeDocument();
    vi.stubGlobal("window", {
      localStorage: createStorage(),
      matchMedia: () => ({ matches: false }),
    });

    const { applyDesktopSystemTheme } = await import("./useTheme");
    applyDesktopSystemTheme({
      source: "omarchy",
      name: "nord",
      mode: "dark",
      colors: {
        background: "#2e3440",
        foreground: "#d8dee9",
        accent: "#81a1c1",
        cursor: "#d8dee9",
        selection_background: "#4c566a",
        selection_foreground: "#d8dee9",
        color0: "#3b4252",
        color15: "#eceff4",
      },
    });

    expect(style.getPropertyValue("--background")).toBe("#2e3440");
    expect(style.getPropertyValue("--foreground")).toBe("#d8dee9");
    expect(style.getPropertyValue("--primary")).toBe("#81a1c1");
    expect(style.getPropertyValue("--omarchy-selection-background")).toBe("#4c566a");
    expect(style.getPropertyValue("--terminal-color-0")).toBe("#3b4252");
    expect(style.getPropertyValue("--terminal-color-15")).toBe("#eceff4");

    applyDesktopSystemTheme(null);
    expect(style.getPropertyValue("--background")).toBe("");
    expect(style.getPropertyValue("--terminal-color-15")).toBe("");
  });

  it("subscribes to desktop system theme bridge updates", async () => {
    const style = stubThemeDocument();
    let unsubscribeTheme: (() => void) | undefined;
    let bridgeListener: ((theme: DesktopSystemTheme | null) => void) | undefined;
    vi.doMock("react", () => ({
      useCallback: <A>(callback: A) => callback,
      useEffect: () => undefined,
      useSyncExternalStore: (
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => unknown,
      ) => {
        unsubscribeTheme = subscribe(() => undefined);
        return getSnapshot();
      },
    }));
    vi.stubGlobal("window", {
      addEventListener: () => undefined,
      desktopBridge: {
        getSystemTheme: vi.fn().mockResolvedValue({
          source: "omarchy",
          name: "nord",
          mode: "dark",
          colors: {
            background: "#2e3440",
            foreground: "#d8dee9",
            accent: "#81a1c1",
          },
        }),
        onSystemTheme: vi.fn((listener) => {
          bridgeListener = listener;
          return () => undefined;
        }),
      },
      localStorage: createStorage(),
      matchMedia: () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
      removeEventListener: () => undefined,
    });

    const { useTheme } = await import("./useTheme");
    useTheme();
    await Promise.resolve();

    expect(style.getPropertyValue("--background")).toBe("#2e3440");

    bridgeListener?.({
      source: "omarchy",
      name: "catppuccin",
      mode: "light",
      colors: {
        background: "#eff1f5",
        foreground: "#4c4f69",
        accent: "#1e66f5",
      },
    });

    expect(style.getPropertyValue("--background")).toBe("#eff1f5");
    unsubscribeTheme?.();
  });
});
