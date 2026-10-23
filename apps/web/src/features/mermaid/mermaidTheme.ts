import { useSyncExternalStore } from "react";

import { themeColorToHex } from "~/themePalette";

export type MermaidAppearance = "light" | "dark";

export interface MermaidThemePalette {
  readonly appearance: MermaidAppearance;
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly foreground: string;
  readonly muted: string;
  readonly mutedForeground: string;
  readonly border: string;
  readonly accent: string;
  readonly accentSurface: string;
  readonly accentSurfaceForeground: string;
  readonly warning: string;
  readonly warningSurface: string;
  readonly warningForeground: string;
  readonly fontFamily: string;
}

export interface MermaidThemeSnapshot {
  readonly key: string;
  readonly palette: MermaidThemePalette;
}

export interface MermaidThemeEnvironment {
  readPalette(): MermaidThemePalette | null;
  observePalette(onChange: () => void): () => void;
  defer(callback: () => void): void;
}

type MermaidPaletteColor = Exclude<keyof MermaidThemePalette, "appearance" | "fontFamily">;

const MERMAID_PALETTE_COLORS: ReadonlyArray<MermaidPaletteColor> = [
  "background",
  "surface",
  "surfaceRaised",
  "foreground",
  "muted",
  "mutedForeground",
  "border",
  "accent",
  "accentSurface",
  "accentSurfaceForeground",
  "warning",
  "warningSurface",
  "warningForeground",
];

const LIGHT_PALETTE: MermaidThemePalette = Object.freeze({
  appearance: "light",
  background: "#ffffff",
  surface: "#f8fafc",
  surfaceRaised: "#f1f5f9",
  foreground: "#1f2937",
  muted: "#f1f5f9",
  mutedForeground: "#64748b",
  border: "#cbd5e1",
  accent: "#2563eb",
  accentSurface: "#eff6ff",
  accentSurfaceForeground: "#1e3a8a",
  warning: "#f59e0b",
  warningSurface: "#fffbeb",
  warningForeground: "#78350f",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
});

const DARK_PALETTE: MermaidThemePalette = Object.freeze({
  appearance: "dark",
  background: "#111318",
  surface: "#151922",
  surfaceRaised: "#1f2937",
  foreground: "#f8fafc",
  muted: "#252a34",
  mutedForeground: "#94a3b8",
  border: "#475569",
  accent: "#38bdf8",
  accentSurface: "#12333c",
  accentSurfaceForeground: "#e0f2fe",
  warning: "#a16207",
  warningSurface: "#2a2414",
  warningForeground: "#fef3c7",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
});

function snapshotForPalette(palette: MermaidThemePalette): MermaidThemeSnapshot {
  const frozenPalette = Object.freeze({ ...palette });
  return Object.freeze({ key: JSON.stringify(frozenPalette), palette: frozenPalette });
}

const DEFAULT_SNAPSHOTS: Readonly<Record<MermaidAppearance, MermaidThemeSnapshot>> = Object.freeze({
  light: snapshotForPalette(LIGHT_PALETTE),
  dark: snapshotForPalette(DARK_PALETTE),
});

export function getDefaultMermaidThemeSnapshot(
  appearance: MermaidAppearance,
): MermaidThemeSnapshot {
  return DEFAULT_SNAPSHOTS[appearance];
}

function readVariable(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

type MermaidCssColorResolver = (value: string) => string | null;

function createDocumentCssColorResolver(): {
  readonly resolve: MermaidCssColorResolver;
  readonly dispose: () => void;
} {
  let probe: HTMLElement | null = null;
  return {
    resolve(value) {
      if (
        typeof document === "undefined" ||
        typeof getComputedStyle === "undefined" ||
        typeof document.createElement !== "function"
      ) {
        return null;
      }
      const parent = document.body ?? document.documentElement;
      if (!parent) return null;

      if (!probe) {
        probe = document.createElement("span");
        probe.style.position = "fixed";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";
        parent.appendChild(probe);
      }
      probe.style.color = "";
      probe.style.color = value;
      if (!probe.style.color) return null;
      return getComputedStyle(probe).color.trim() || null;
    },
    dispose() {
      probe?.remove();
      probe = null;
    },
  };
}

export function normalizeMermaidThemeColor(
  value: string,
  fallback: string,
  resolveCssColor: MermaidCssColorResolver = () => null,
): string {
  const literal = themeColorToHex(value);
  if (literal) return literal;

  // Computed custom properties retain expressions such as color-mix. Resolve
  // those in the live document, then cross the narrow hex-only Mermaid boundary.
  const resolved = resolveCssColor(value);
  const resolvedHex = resolved ? themeColorToHex(resolved) : null;
  return resolvedHex ?? themeColorToHex(fallback) ?? "#000000";
}

export function normalizeMermaidThemePalette(
  palette: MermaidThemePalette,
  fallbackAppearance: MermaidAppearance = palette.appearance,
): MermaidThemePalette {
  const fallback = fallbackAppearance === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const resolver = createDocumentCssColorResolver();
  try {
    const normalized = { ...palette };
    for (const role of MERMAID_PALETTE_COLORS) {
      normalized[role] = normalizeMermaidThemeColor(
        palette[role],
        fallback[role],
        resolver.resolve,
      );
    }
    return normalized;
  } finally {
    resolver.dispose();
  }
}

export function readDocumentMermaidThemePalette(): MermaidThemePalette | null {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return null;
  const root = document.documentElement;
  if (!root) return null;

  const appearance: MermaidAppearance = root.classList.contains("dark") ? "dark" : "light";
  const defaults = appearance === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const styles = getComputedStyle(root);
  return normalizeMermaidThemePalette({
    appearance,
    background: readVariable(styles, "--background", defaults.background),
    surface: readVariable(styles, "--card", defaults.surface),
    surfaceRaised: readVariable(styles, "--surface-raised", defaults.surfaceRaised),
    foreground: readVariable(styles, "--contrast-foreground", defaults.foreground),
    muted: readVariable(styles, "--muted", defaults.muted),
    mutedForeground: readVariable(styles, "--contrast-muted-foreground", defaults.mutedForeground),
    border: readVariable(styles, "--contrast-border", defaults.border),
    accent: readVariable(styles, "--primary", defaults.accent),
    accentSurface: readVariable(styles, "--accent", defaults.accentSurface),
    accentSurfaceForeground: readVariable(
      styles,
      "--contrast-accent-foreground",
      defaults.accentSurfaceForeground,
    ),
    warning: readVariable(styles, "--warning", defaults.warning),
    warningSurface: readVariable(styles, "--warning-surface", defaults.warningSurface),
    warningForeground: readVariable(styles, "--warning-foreground", defaults.warningForeground),
    fontFamily: readVariable(styles, "--font-sans", styles.fontFamily || defaults.fontFamily),
  });
}

export function createDocumentMermaidThemeEnvironment(): MermaidThemeEnvironment {
  return {
    readPalette: readDocumentMermaidThemePalette,
    observePalette(onChange) {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
        return () => undefined;
      }
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme-id"],
      });
      return () => observer.disconnect();
    },
    defer(callback) {
      queueMicrotask(callback);
    },
  };
}

export function createMermaidThemeStore(environment: MermaidThemeEnvironment) {
  const initialPalette = environment.readPalette();
  let currentSnapshot = initialPalette ? snapshotForPalette(initialPalette) : null;
  let stopObserving: (() => void) | null = null;
  let refreshScheduled = false;
  let observationGeneration = 0;
  const listeners = new Set<() => void>();

  const refresh = () => {
    const next = environment.readPalette();
    if (!next) return;
    const nextSnapshot = snapshotForPalette(next);
    if (nextSnapshot.key === currentSnapshot?.key) return;
    currentSnapshot = nextSnapshot;
    for (const listener of listeners) listener();
  };

  const scheduleRefresh = () => {
    if (refreshScheduled) return;
    refreshScheduled = true;
    const generation = observationGeneration;
    environment.defer(() => {
      refreshScheduled = false;
      if (generation !== observationGeneration || listeners.size === 0) return;
      refresh();
    });
  };

  return {
    getSnapshot(appearance: MermaidAppearance): MermaidThemeSnapshot {
      return currentSnapshot ?? DEFAULT_SNAPSHOTS[appearance];
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (listeners.size === 1) {
        observationGeneration += 1;
        // Observation starts before the refresh so no theme transition can land
        // between the initial read and listener installation.
        stopObserving = environment.observePalette(scheduleRefresh);
        refresh();
      }

      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        observationGeneration += 1;
        refreshScheduled = false;
        stopObserving?.();
        stopObserving = null;
        currentSnapshot = null;
      };
    },
  };
}

const documentMermaidThemeStore = createMermaidThemeStore(createDocumentMermaidThemeEnvironment());

export function useMermaidThemeSnapshot(appearance: MermaidAppearance): MermaidThemeSnapshot {
  return useSyncExternalStore(
    documentMermaidThemeStore.subscribe,
    () => documentMermaidThemeStore.getSnapshot(appearance),
    () => DEFAULT_SNAPSHOTS[appearance],
  );
}
