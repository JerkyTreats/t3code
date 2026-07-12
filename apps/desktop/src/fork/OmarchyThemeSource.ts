// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

import type { DesktopSystemTheme } from "@t3tools/contracts";

const OMARCHY_CURRENT_DIR = Path.join(OS.homedir(), ".config", "omarchy", "current");
const OMARCHY_THEME_DIR = Path.join(OMARCHY_CURRENT_DIR, "theme");
const OMARCHY_THEME_NAME_PATH = Path.join(OMARCHY_CURRENT_DIR, "theme.name");
const OMARCHY_THEME_COLORS_PATH = Path.join(OMARCHY_THEME_DIR, "colors.toml");
const OMARCHY_THEME_LIGHT_MODE_PATH = Path.join(OMARCHY_THEME_DIR, "light.mode");
const THEME_RELOAD_DEBOUNCE_MS = 120;

function parseColorToml(content: string): Record<string, string> {
  const colors: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([a-z0-9_]+)\s*=\s*"([^"]+)"\s*$/i);
    if (!match) continue;
    const [_, colorKey, colorValue] = match;
    if (!colorKey || !colorValue) continue;
    colors[colorKey] = colorValue;
  }

  return colors;
}

function normalizeThemeName(content: string): string | null {
  const normalized = content.trim();
  return normalized.length > 0 ? normalized : null;
}

export function readDesktopSystemTheme(): DesktopSystemTheme | null {
  if (process.platform !== "linux") return null;
  if (!FS.existsSync(OMARCHY_THEME_NAME_PATH) || !FS.existsSync(OMARCHY_THEME_COLORS_PATH)) {
    return null;
  }

  const name = normalizeThemeName(FS.readFileSync(OMARCHY_THEME_NAME_PATH, "utf8"));
  if (!name) return null;

  const colors = parseColorToml(FS.readFileSync(OMARCHY_THEME_COLORS_PATH, "utf8"));
  if (!colors.background || !colors.foreground || !colors.accent) {
    return null;
  }

  return {
    source: "omarchy",
    name,
    mode: FS.existsSync(OMARCHY_THEME_LIGHT_MODE_PATH) ? "light" : "dark",
    colors,
  };
}

function serializeTheme(theme: DesktopSystemTheme | null): string {
  return JSON.stringify(theme);
}

export function watchDesktopSystemTheme(
  onChange: (theme: DesktopSystemTheme | null) => void,
): () => void {
  if (process.platform !== "linux") {
    onChange(null);
    return () => undefined;
  }

  let closed = false;
  let lastSerializedTheme = serializeTheme(readDesktopSystemTheme());
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  const watchers: FS.FSWatcher[] = [];

  const emitIfChanged = (): void => {
    if (closed) return;
    const nextTheme = readDesktopSystemTheme();
    const nextSerializedTheme = serializeTheme(nextTheme);
    if (nextSerializedTheme === lastSerializedTheme) return;
    lastSerializedTheme = nextSerializedTheme;
    onChange(nextTheme);
  };

  const scheduleReload = (): void => {
    if (reloadTimer) {
      clearTimeout(reloadTimer);
    }
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      emitIfChanged();
    }, THEME_RELOAD_DEBOUNCE_MS);
  };

  for (const watchPath of [OMARCHY_CURRENT_DIR, OMARCHY_THEME_DIR]) {
    try {
      watchers.push(
        FS.watch(watchPath, { persistent: false }, () => {
          scheduleReload();
        }),
      );
    } catch {
      continue;
    }
  }

  return () => {
    closed = true;
    if (reloadTimer) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}
