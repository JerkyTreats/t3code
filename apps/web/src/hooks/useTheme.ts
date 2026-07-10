import type { DesktopBridge, DesktopSystemTheme } from "@t3tools/contracts";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import * as Schema from "effect/Schema";
import { useCallback, useEffect, useSyncExternalStore } from "react";

const ThemePreference = Schema.Literals(["light", "dark", "system"]);
type Theme = typeof ThemePreference.Type;
type ThemeSnapshot = {
  theme: Theme;
  systemDark: boolean;
};

type DesktopThemeBridge = Pick<DesktopBridge, "setTheme">;
type DesktopSystemThemeBridge = Pick<DesktopBridge, "getSystemTheme" | "onSystemTheme">;

const STORAGE_KEY = "t3code:theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_THEME_SNAPSHOT: ThemeSnapshot = {
  theme: "system",
  systemDark: false,
};
const THEME_COLOR_META_NAME = "theme-color";
const DYNAMIC_THEME_COLOR_SELECTOR = `meta[name="${THEME_COLOR_META_NAME}"][data-dynamic-theme-color="true"]`;
const PROJECTED_SYSTEM_THEME_VARIABLES = [
  "--omarchy-background",
  "--omarchy-foreground",
  "--omarchy-accent",
  "--omarchy-selection-background",
  "--omarchy-selection-foreground",
  "--background",
  "--app-chrome-background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--ring",
  "--accent",
  "--accent-foreground",
  "--muted",
  "--muted-foreground",
  "--border",
  "--input",
  "--terminal-background",
  "--terminal-foreground",
  "--terminal-cursor",
  "--terminal-selection-background",
  "--terminal-selection-foreground",
  "--terminal-color-0",
  "--terminal-color-1",
  "--terminal-color-2",
  "--terminal-color-3",
  "--terminal-color-4",
  "--terminal-color-5",
  "--terminal-color-6",
  "--terminal-color-7",
  "--terminal-color-8",
  "--terminal-color-9",
  "--terminal-color-10",
  "--terminal-color-11",
  "--terminal-color-12",
  "--terminal-color-13",
  "--terminal-color-14",
  "--terminal-color-15",
] as const;

export class ThemeStorageError extends Schema.TaggedErrorClass<ThemeStorageError>()(
  "ThemeStorageError",
  {
    operation: Schema.Literals(["read", "write"]),
    storageKey: Schema.String,
    theme: Schema.optional(ThemePreference),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} theme preference for ${this.storageKey}.`;
  }
}

export const isThemeStorageError = Schema.is(ThemeStorageError);

export class DesktopThemeSyncError extends Schema.TaggedErrorClass<DesktopThemeSyncError>()(
  "DesktopThemeSyncError",
  {
    theme: ThemePreference,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to sync the ${this.theme} theme to the desktop shell.`;
  }
}

export const isDesktopThemeSyncError = Schema.is(DesktopThemeSyncError);

let listeners: Array<() => void> = [];
let lastSnapshot: ThemeSnapshot | null = null;
let lastDesktopTheme: Theme | null = null;
let lastAppliedTheme: ThemeSnapshot | null = null;
let themeStorageReadFailure: ThemeStorageError | null = null;
let desktopSystemTheme: DesktopSystemTheme | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

function getSystemDark() {
  if (desktopSystemTheme) {
    return desktopSystemTheme.mode === "dark";
  }
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MEDIA_QUERY).matches
  );
}

function normalizeThemeCssColor(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (typeof CSS !== "undefined" && CSS.supports?.("color", normalized)) {
    return normalized;
  }
  if (
    /^#[0-9a-f]{3,8}$/i.test(normalized) ||
    /^rgba?\([^)]+\)$/i.test(normalized) ||
    /^hsla?\([^)]+\)$/i.test(normalized) ||
    /^oklch\([^)]+\)$/i.test(normalized) ||
    /^color-mix\([^)]+\)$/i.test(normalized)
  ) {
    return normalized;
  }
  return null;
}

function systemThemeColor(colors: DesktopSystemTheme["colors"], key: string): string | null {
  return normalizeThemeCssColor(colors[key]);
}

function setThemeVariable(rootStyle: CSSStyleDeclaration, name: string, value: string | null) {
  if (value) {
    rootStyle.setProperty(name, value);
  } else {
    rootStyle.removeProperty(name);
  }
}

export function applyDesktopSystemTheme(theme: DesktopSystemTheme | null): void {
  desktopSystemTheme = theme;
  lastSnapshot = null;

  if (typeof document === "undefined") return;
  const rootStyle = document.documentElement.style;

  if (!theme) {
    for (const variableName of PROJECTED_SYSTEM_THEME_VARIABLES) {
      rootStyle.removeProperty(variableName);
    }
    syncBrowserChromeTheme();
    return;
  }

  const background = systemThemeColor(theme.colors, "background");
  const foreground = systemThemeColor(theme.colors, "foreground");
  const accent = systemThemeColor(theme.colors, "accent");
  if (!background || !foreground || !accent) {
    return;
  }

  const selectionBackground = systemThemeColor(theme.colors, "selection_background");
  const selectionForeground = systemThemeColor(theme.colors, "selection_foreground");

  setThemeVariable(rootStyle, "--omarchy-background", background);
  setThemeVariable(rootStyle, "--omarchy-foreground", foreground);
  setThemeVariable(rootStyle, "--omarchy-accent", accent);
  setThemeVariable(rootStyle, "--omarchy-selection-background", selectionBackground);
  setThemeVariable(rootStyle, "--omarchy-selection-foreground", selectionForeground);
  setThemeVariable(rootStyle, "--background", background);
  setThemeVariable(rootStyle, "--app-chrome-background", background);
  setThemeVariable(rootStyle, "--foreground", foreground);
  setThemeVariable(rootStyle, "--card", `color-mix(in srgb, ${background} 96%, ${foreground})`);
  setThemeVariable(rootStyle, "--card-foreground", foreground);
  setThemeVariable(rootStyle, "--popover", `color-mix(in srgb, ${background} 96%, ${foreground})`);
  setThemeVariable(rootStyle, "--popover-foreground", foreground);
  setThemeVariable(rootStyle, "--primary", accent);
  setThemeVariable(rootStyle, "--primary-foreground", background);
  setThemeVariable(rootStyle, "--ring", accent);
  setThemeVariable(rootStyle, "--accent", `color-mix(in srgb, ${accent} 18%, transparent)`);
  setThemeVariable(rootStyle, "--accent-foreground", foreground);
  setThemeVariable(rootStyle, "--muted", `color-mix(in srgb, ${foreground} 8%, transparent)`);
  setThemeVariable(
    rootStyle,
    "--muted-foreground",
    `color-mix(in srgb, ${foreground} 68%, ${background})`,
  );
  setThemeVariable(rootStyle, "--border", `color-mix(in srgb, ${foreground} 16%, transparent)`);
  setThemeVariable(rootStyle, "--input", `color-mix(in srgb, ${foreground} 12%, transparent)`);
  setThemeVariable(rootStyle, "--terminal-background", background);
  setThemeVariable(rootStyle, "--terminal-foreground", foreground);
  setThemeVariable(rootStyle, "--terminal-cursor", systemThemeColor(theme.colors, "cursor"));
  setThemeVariable(rootStyle, "--terminal-selection-background", selectionBackground);
  setThemeVariable(rootStyle, "--terminal-selection-foreground", selectionForeground);

  for (let index = 0; index <= 15; index += 1) {
    setThemeVariable(
      rootStyle,
      `--terminal-color-${index}`,
      systemThemeColor(theme.colors, `color${index}`),
    );
  }

  syncBrowserChromeTheme();
}

function getDesktopSystemThemeBridge(): DesktopSystemThemeBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.desktopBridge;
  if (!bridge) return null;
  if (typeof bridge.getSystemTheme !== "function" && typeof bridge.onSystemTheme !== "function") {
    return null;
  }
  return bridge;
}

export function readThemePreference(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME_SNAPSHOT.theme;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (cause) {
    throw new ThemeStorageError({
      operation: "read",
      storageKey: STORAGE_KEY,
      cause,
    });
  }
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return DEFAULT_THEME_SNAPSHOT.theme;
}

export function writeThemePreference(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
    themeStorageReadFailure = null;
  } catch (cause) {
    throw new ThemeStorageError({
      operation: "write",
      storageKey: STORAGE_KEY,
      theme,
      cause,
    });
  }
}

function getStored(): Theme {
  if (themeStorageReadFailure !== null) {
    return DEFAULT_THEME_SNAPSHOT.theme;
  }
  try {
    return readThemePreference();
  } catch (cause) {
    const error = isThemeStorageError(cause)
      ? cause
      : new ThemeStorageError({
          operation: "read",
          storageKey: STORAGE_KEY,
          cause,
        });
    themeStorageReadFailure = error;
    console.error(error.message, {
      operation: error.operation,
      storageKey: error.storageKey,
      ...safeErrorLogAttributes(error),
    });
    return DEFAULT_THEME_SNAPSHOT.theme;
  }
}

function ensureThemeColorMetaTag(): HTMLMetaElement {
  let element = document.querySelector<HTMLMetaElement>(DYNAMIC_THEME_COLOR_SELECTOR);
  if (element) {
    return element;
  }

  element = document.createElement("meta");
  element.name = THEME_COLOR_META_NAME;
  element.setAttribute("data-dynamic-theme-color", "true");
  document.head.append(element);
  return element;
}

function normalizeThemeColor(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0 0 0 / 0)"
  ) {
    return null;
  }

  return value?.trim() ?? null;
}

function resolveBrowserChromeSurface(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("main[data-slot='sidebar-inset']") ??
    document.querySelector<HTMLElement>("[data-slot='sidebar-inner']") ??
    document.body
  );
}

export function syncBrowserChromeTheme() {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return;
  const surfaceColor = normalizeThemeColor(
    getComputedStyle(resolveBrowserChromeSurface()).backgroundColor,
  );
  const fallbackColor = normalizeThemeColor(getComputedStyle(document.body).backgroundColor);
  const backgroundColor = surfaceColor ?? fallbackColor;
  if (!backgroundColor) return;

  document.documentElement.style.backgroundColor = backgroundColor;
  document.body.style.backgroundColor = backgroundColor;
  ensureThemeColorMetaTag().setAttribute("content", backgroundColor);
}

function applyTheme(theme: Theme, suppressTransitions = false) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const systemDark = theme === "system" ? getSystemDark() : false;
  if (lastAppliedTheme?.theme === theme && lastAppliedTheme.systemDark === systemDark) {
    syncDesktopTheme(theme);
    return;
  }

  if (suppressTransitions) {
    document.documentElement.classList.add("no-transitions");
  }
  const isDark = theme === "dark" || (theme === "system" && systemDark);
  document.documentElement.classList.toggle("dark", isDark);
  lastAppliedTheme = { theme, systemDark };
  syncBrowserChromeTheme();
  syncDesktopTheme(theme);
  if (suppressTransitions) {
    // Force a reflow so the no-transitions class takes effect before removal
    // oxlint-disable-next-line no-unused-expressions
    document.documentElement.offsetHeight;
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transitions");
    });
  }
}

export async function syncDesktopThemePreference(
  bridge: DesktopThemeBridge,
  theme: Theme,
): Promise<void> {
  try {
    await bridge.setTheme(theme);
  } catch (cause) {
    throw new DesktopThemeSyncError({ theme, cause });
  }
}

export function syncDesktopTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const bridge = window.desktopBridge;
  if (!bridge || typeof bridge.setTheme !== "function" || lastDesktopTheme === theme) {
    return;
  }

  lastDesktopTheme = theme;
  void syncDesktopThemePreference(bridge, theme).catch((cause: unknown) => {
    const error = isDesktopThemeSyncError(cause)
      ? cause
      : new DesktopThemeSyncError({ theme, cause });
    console.error(error.message, {
      theme: error.theme,
      ...safeErrorLogAttributes(error),
    });
    if (lastDesktopTheme === theme) {
      lastDesktopTheme = null;
    }
  });
}

// Apply immediately on module load to prevent flash
if (typeof document !== "undefined" && typeof window !== "undefined") {
  applyTheme(getStored());
}

function getSnapshot(): ThemeSnapshot {
  if (typeof window === "undefined") return DEFAULT_THEME_SNAPSHOT;
  const theme = getStored();
  const systemDark = theme === "system" ? getSystemDark() : false;

  if (lastSnapshot && lastSnapshot.theme === theme && lastSnapshot.systemDark === systemDark) {
    return lastSnapshot;
  }

  lastSnapshot = { theme, systemDark };
  return lastSnapshot;
}

function getServerSnapshot() {
  return DEFAULT_THEME_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);

  const applyDesktopThemeChange = (theme: DesktopSystemTheme | null) => {
    applyDesktopSystemTheme(theme);
    if (getStored() === "system") {
      applyTheme("system", true);
    } else {
      syncBrowserChromeTheme();
    }
    emitChange();
  };

  const desktopBridge = getDesktopSystemThemeBridge();
  if (typeof desktopBridge?.getSystemTheme === "function") {
    void desktopBridge
      .getSystemTheme()
      .then(applyDesktopThemeChange)
      .catch((cause: unknown) => {
        console.error("Failed to read desktop system theme.", safeErrorLogAttributes(cause));
      });
  }
  const unsubscribeDesktopSystemTheme =
    typeof desktopBridge?.onSystemTheme === "function"
      ? desktopBridge.onSystemTheme(applyDesktopThemeChange)
      : undefined;

  // Listen for system preference changes
  const mq = typeof window.matchMedia === "function" ? window.matchMedia(MEDIA_QUERY) : null;
  const handleChange = () => {
    if (getStored() === "system") applyTheme("system", true);
    emitChange();
  };
  mq?.addEventListener("change", handleChange);

  // Listen for storage changes from other tabs
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      themeStorageReadFailure = null;
      applyTheme(getStored(), true);
      emitChange();
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners = listeners.filter((l) => l !== listener);
    unsubscribeDesktopSystemTheme?.();
    mq?.removeEventListener("change", handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const theme = snapshot.theme;

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (snapshot.systemDark ? "dark" : "light") : theme;

  const setTheme = useCallback((next: Theme) => {
    if (typeof window === "undefined") return;
    try {
      writeThemePreference(next);
    } catch (cause) {
      const error = isThemeStorageError(cause)
        ? cause
        : new ThemeStorageError({
            operation: "write",
            storageKey: STORAGE_KEY,
            theme: next,
            cause,
          });
      console.error(error.message, {
        operation: error.operation,
        storageKey: error.storageKey,
        theme: next,
        ...safeErrorLogAttributes(error),
      });
      return;
    }
    applyTheme(next, true);
    emitChange();
  }, []);

  // Keep DOM in sync on mount/change
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return { theme, setTheme, resolvedTheme } as const;
}
