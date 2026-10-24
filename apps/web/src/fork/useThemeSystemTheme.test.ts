// F02 host evidence: current useTheme precedence, transient application and persistence non-mutation.
import type { DesktopSystemTheme } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

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

const lightSystemTheme: DesktopSystemTheme = {
  source: "omarchy",
  name: "Synthetic Light",
  mode: "light",
  colors: { background: "#f2f2f2", foreground: "#171717", accent: "#4488cc" },
};

function installSyntheticThemeHost(initialTheme: DesktopSystemTheme | null) {
  const storage = createStorage();
  const storageSetItem = vi.spyOn(storage, "setItem");
  const storageRemoveItem = vi.spyOn(storage, "removeItem");
  const classes = new Set<string>();
  const styleValues = new Map<string, string>();
  const style = {
    backgroundColor: "",
    removeProperty: vi.fn((name: string) => styleValues.delete(name)),
    setProperty: vi.fn((name: string, value: string) => styleValues.set(name, value)),
  };
  const root = {
    classList: {
      add: (name: string) => classes.add(name),
      contains: (name: string) => classes.has(name),
      remove: (name: string) => classes.delete(name),
      toggle: (name: string, force?: boolean) => {
        const next = force ?? !classes.has(name);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
    },
    dataset: {} as Record<string, string>,
    offsetHeight: 0,
    style,
  };
  const body = { style: { backgroundColor: "" } };
  const mediaAddEventListener = vi.fn();
  const mediaRemoveEventListener = vi.fn();
  const windowAddEventListener = vi.fn();
  const windowRemoveEventListener = vi.fn();
  const stopSystemTheme = vi.fn();
  let pushSystemTheme: ((theme: DesktopSystemTheme | null) => void) | undefined;
  const getSystemTheme = vi.fn(async () => initialTheme);
  const onSystemTheme = vi.fn((listener: (theme: DesktopSystemTheme | null) => void) => {
    pushSystemTheme = listener;
    return stopSystemTheme;
  });
  const setDesktopTheme = vi.fn().mockResolvedValue(undefined);
  const subscriptionCleanups: Array<() => void> = [];

  vi.doMock("react", () => ({
    useCallback: <A>(callback: A) => callback,
    useEffect: () => undefined,
    useSyncExternalStore: (
      subscribe: (listener: () => void) => () => void,
      getSnapshot: () => unknown,
    ) => {
      subscriptionCleanups.push(subscribe(() => undefined));
      return getSnapshot();
    },
  }));
  vi.stubGlobal("window", {
    addEventListener: windowAddEventListener,
    localStorage: storage,
    matchMedia: () => ({
      matches: false,
      addEventListener: mediaAddEventListener,
      removeEventListener: mediaRemoveEventListener,
    }),
    removeEventListener: windowRemoveEventListener,
    desktopBridge: { getSystemTheme, onSystemTheme, setTheme: setDesktopTheme },
  });
  vi.stubGlobal("document", {
    body,
    createElement: () => ({ name: "", setAttribute: () => undefined }),
    documentElement: root,
    head: { append: () => undefined },
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  vi.stubGlobal("getComputedStyle", () => ({
    backgroundColor: classes.has("dark") ? "rgb(10, 10, 10)" : "rgb(245, 245, 245)",
    getPropertyValue: () => "",
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });

  return {
    classes,
    getSystemTheme,
    mediaAddEventListener,
    mediaRemoveEventListener,
    onSystemTheme,
    pushSystemTheme: (theme: DesktopSystemTheme | null) => pushSystemTheme?.(theme),
    root,
    stopSystemTheme,
    storage,
    storageRemoveItem,
    storageSetItem,
    styleValues,
    subscriptionCleanups,
    windowAddEventListener,
    windowRemoveEventListener,
  };
}

async function flushThemeSource(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.doUnmock("react");
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Thread system theme integration", () => {
  it("uses the protected Thread source and the same transient palette without preference writes", async () => {
    const host = installSyntheticThemeHost(lightSystemTheme);
    const codeRead = vi.fn();
    vi.stubGlobal("window", {
      ...window,
      desktopBridge: { getSystemTheme: codeRead },
      t3ThreadBridge: { getSystemTheme: host.getSystemTheme, onSystemTheme: host.onSystemTheme },
    });
    const { useTheme } = await import("../hooks/useTheme");
    useTheme();
    await flushThemeSource();
    expect(host.getSystemTheme).toHaveBeenCalledOnce();
    expect(codeRead).not.toHaveBeenCalled();
    expect(host.root.dataset.themeId).toBe("omarchy-system");
    expect(host.storageSetItem).not.toHaveBeenCalled();
    expect(host.storageRemoveItem).not.toHaveBeenCalled();
    for (const cleanup of host.subscriptionCleanups) cleanup();
    expect(host.stopSystemTheme).toHaveBeenCalledOnce();
  });
});

describe("desktop system theme host", () => {
  it("replaces a same-mode transient palette and clears it when the source clears", async () => {
    const host = installSyntheticThemeHost(lightSystemTheme);
    const { useTheme } = await import("../hooks/useTheme");
    const { toCanonicalThemeColor } = await import("../themePalette");

    useTheme();
    await flushThemeSource();

    expect(host.root.dataset.themeId).toBe("omarchy-system");
    expect(host.styleValues.get("--app-theme-accent")).toBe(toCanonicalThemeColor("#4488cc"));

    host.pushSystemTheme({
      ...lightSystemTheme,
      name: "Synthetic Light Replacement",
      colors: { ...lightSystemTheme.colors, accent: "#339966" },
    });
    expect(host.root.dataset.themeId).toBe("omarchy-system");
    expect(host.styleValues.get("--app-theme-accent")).toBe(toCanonicalThemeColor("#339966"));

    host.pushSystemTheme(null);
    expect(host.root.dataset.themeId).toBeUndefined();
    expect(host.styleValues.size).toBe(0);
    expect(host.storageSetItem).not.toHaveBeenCalled();
    expect(host.storageRemoveItem).not.toHaveBeenCalled();
  });

  it("shares one source subscription and clears it after the final hook cleanup", async () => {
    const host = installSyntheticThemeHost(lightSystemTheme);
    const { useTheme } = await import("../hooks/useTheme");

    useTheme();
    useTheme();
    await flushThemeSource();

    expect(host.onSystemTheme).toHaveBeenCalledTimes(1);
    expect(host.getSystemTheme).toHaveBeenCalledTimes(1);
    expect(host.mediaAddEventListener).toHaveBeenCalledTimes(1);
    expect(host.windowAddEventListener).toHaveBeenCalledTimes(1);
    expect(host.root.dataset.themeId).toBe("omarchy-system");

    host.subscriptionCleanups[0]?.();
    expect(host.stopSystemTheme).not.toHaveBeenCalled();
    expect(host.root.dataset.themeId).toBe("omarchy-system");

    host.subscriptionCleanups[1]?.();
    expect(host.stopSystemTheme).toHaveBeenCalledTimes(1);
    expect(host.mediaRemoveEventListener).toHaveBeenCalledTimes(1);
    expect(host.windowRemoveEventListener).toHaveBeenCalledTimes(1);
    expect(host.root.dataset.themeId).toBeUndefined();
    expect(host.styleValues.size).toBe(0);
  });

  it("keeps an explicit theme selected while later source colors remain transient", async () => {
    const host = installSyntheticThemeHost(lightSystemTheme);
    const { useTheme } = await import("../hooks/useTheme");
    const theme = useTheme();
    await flushThemeSource();

    expect(host.root.dataset.themeId).toBe("omarchy-system");
    expect(theme.setTheme("t3-chat")).toBe(true);
    expect(host.root.dataset.themeId).toBe("t3-chat");
    expect(host.storage.getItem("t3code:theme")).toBe("t3-chat");
    expect(host.storageSetItem.mock.calls.map(([key]) => key)).toEqual([
      "t3code:theme-appearance-mode",
      "t3code:theme",
    ]);

    host.pushSystemTheme({
      ...lightSystemTheme,
      colors: { ...lightSystemTheme.colors, accent: "#cc4477" },
    });
    expect(host.root.dataset.themeId).toBe("t3-chat");
    expect(host.storageSetItem).toHaveBeenCalledTimes(2);
  });

  it("preserves preview precedence and applies the latest source after refresh", async () => {
    const host = installSyntheticThemeHost(null);
    const { useTheme } = await import("../hooks/useTheme");
    const { toCanonicalThemeColor } = await import("../themePalette");
    const theme = useTheme();
    await flushThemeSource();

    host.root.dataset.themeId = "__preview";
    host.root.style.setProperty("--app-theme-accent", "#123456");
    host.pushSystemTheme(lightSystemTheme);
    expect(host.root.dataset.themeId).toBe("__preview");
    expect(host.styleValues.get("--app-theme-accent")).toBe("#123456");

    const latestTheme = {
      ...lightSystemTheme,
      name: "Latest Synthetic Light",
      colors: { ...lightSystemTheme.colors, accent: "#663399" },
    };
    host.pushSystemTheme(latestTheme);
    expect(host.root.dataset.themeId).toBe("__preview");

    theme.refreshTheme();
    expect(host.root.dataset.themeId).toBe("omarchy-system");
    expect(host.styleValues.get("--app-theme-accent")).toBe(toCanonicalThemeColor("#663399"));
    expect(host.storageSetItem).not.toHaveBeenCalled();
    expect(host.storageRemoveItem).not.toHaveBeenCalled();
  });
});
