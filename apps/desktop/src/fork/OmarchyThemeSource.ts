// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import {
  DESKTOP_SYSTEM_THEME_MAX_COLORS,
  DesktopSystemThemeSchema,
  type DesktopSystemTheme,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const THEME_NAME_MAX_BYTES = 1024;
const THEME_COLORS_MAX_BYTES = 64 * 1024;
const THEME_RELOAD_DEBOUNCE_MS = 120;

const isDesktopSystemTheme = Schema.is(DesktopSystemThemeSchema);

export interface OmarchyThemeSourceHost {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
}

function defaultHost(): OmarchyThemeSourceHost {
  return {
    platform: NodeProcess.platform,
    homeDirectory: NodeOS.homedir(),
  };
}

type StableFile = Readonly<{
  content: string;
  identity: string;
}>;

type ResolvedDirectory = Readonly<{
  path: string;
  identity: string;
}>;

type ThemeLayout = Readonly<{
  generation: "quattro" | "legacy";
  rootPath: string;
  currentPath: string;
}>;

function stableFileIdentity(stat: NodeFS.Stats): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}

function directoryIdentity(stat: NodeFS.Stats): string {
  return [stat.dev, stat.ino].join(":");
}

function readStableUtf8File(filePath: string, maxBytes: number): StableFile | null {
  let descriptor: number | null = null;
  try {
    descriptor = NodeFS.openSync(filePath, "r");
    const before = NodeFS.fstatSync(descriptor);
    if (!before.isFile() || before.size > maxBytes) return null;
    const content = NodeFS.readFileSync(descriptor, "utf8");
    const after = NodeFS.fstatSync(descriptor);
    const beforeIdentity = stableFileIdentity(before);
    if (beforeIdentity !== stableFileIdentity(after) || Buffer.byteLength(content) !== after.size) {
      return null;
    }
    return { content, identity: beforeIdentity };
  } catch {
    return null;
  } finally {
    if (descriptor !== null) {
      try {
        NodeFS.closeSync(descriptor);
      } catch {
        // A failed close cannot make a previously failed or completed read more authoritative.
      }
    }
  }
}

function optionalFileIdentity(filePath: string): string | null | undefined {
  try {
    const stat = NodeFS.statSync(filePath);
    return stat.isFile() ? stableFileIdentity(stat) : undefined;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? null : undefined;
  }
}

function resolvedDirectory(directoryPath: string): ResolvedDirectory | null {
  try {
    const path = NodeFS.realpathSync(directoryPath);
    const stat = NodeFS.statSync(path);
    if (!stat.isDirectory()) return null;
    return { path, identity: directoryIdentity(stat) };
  } catch {
    return null;
  }
}

function directorySignature(directory: ResolvedDirectory | null): string | null {
  return directory ? `${directory.path}:${directory.identity}` : null;
}

function pathEntryExists(filePath: string): boolean {
  try {
    NodeFS.lstatSync(filePath);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

function parseColorToml(content: string): Record<string, string> | null {
  const colors: Record<string, string> = {};

  for (const sourceLine of content.split(/\r?\n/u)) {
    const line = sourceLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const match = /^([a-z][a-z0-9_-]*)\s*=\s*(["'])([^"']+)\2\s*(?:#.*)?$/iu.exec(line);
    const key = match?.[1]?.toLowerCase();
    const value = match?.[3]?.trim();
    if (!key || !value || Object.hasOwn(colors, key)) return null;

    colors[key] = value;
    if (Object.keys(colors).length > DESKTOP_SYSTEM_THEME_MAX_COLORS) return null;
  }

  return colors;
}

function themeLayouts(homeDirectory: string): readonly [ThemeLayout, ThemeLayout] {
  const quattroRoot = NodePath.join(homeDirectory, ".local", "state", "omarchy");
  const legacyRoot = NodePath.join(homeDirectory, ".config", "omarchy");
  return [
    {
      generation: "quattro",
      rootPath: quattroRoot,
      currentPath: NodePath.join(quattroRoot, "current"),
    },
    {
      generation: "legacy",
      rootPath: legacyRoot,
      currentPath: NodePath.join(legacyRoot, "current"),
    },
  ];
}

function selectThemeLayout(homeDirectory: string): ThemeLayout {
  const [quattro, legacy] = themeLayouts(homeDirectory);
  // Preferred state is authoritative once its entry exists. Broken or partial
  // preferred state must not expose a stale legacy palette.
  return pathEntryExists(quattro.currentPath) ? quattro : legacy;
}

function resolveThemeMode(
  layout: ThemeLayout,
  colors: Readonly<Record<string, string>>,
  lightModeIdentity: string | null,
): DesktopSystemTheme["mode"] | null {
  if (layout.generation === "legacy") return lightModeIdentity === null ? "dark" : "light";
  return colors.mode === "light" || colors.mode === "dark" ? colors.mode : null;
}

export function readDesktopSystemTheme(
  host: OmarchyThemeSourceHost = defaultHost(),
): DesktopSystemTheme | null {
  if (host.platform !== "linux") return null;

  const layout = selectThemeLayout(host.homeDirectory);
  const currentDirectory = resolvedDirectory(layout.currentPath);
  if (!currentDirectory) return null;

  const themeDirectory = resolvedDirectory(NodePath.join(currentDirectory.path, "theme"));
  if (!themeDirectory) return null;

  const themeNamePath = NodePath.join(currentDirectory.path, "theme.name");
  const themeColorsPath = NodePath.join(themeDirectory.path, "colors.toml");
  const lightModePath = NodePath.join(themeDirectory.path, "light.mode");
  const lightModeBefore = optionalFileIdentity(lightModePath);
  if (lightModeBefore === undefined) return null;

  const nameFile = readStableUtf8File(themeNamePath, THEME_NAME_MAX_BYTES);
  const colorsFile = readStableUtf8File(themeColorsPath, THEME_COLORS_MAX_BYTES);
  if (!nameFile || !colorsFile) return null;

  const name = nameFile.content.trim();
  const colors = parseColorToml(colorsFile.content);
  if (!name || !colors) return null;

  const mode = resolveThemeMode(layout, colors, lightModeBefore);
  if (!mode) return null;

  const lightModeAfter = optionalFileIdentity(lightModePath);
  const currentDirectoryAfter = resolvedDirectory(layout.currentPath);
  const themeDirectoryAfter = currentDirectoryAfter
    ? resolvedDirectory(NodePath.join(currentDirectoryAfter.path, "theme"))
    : null;
  if (
    selectThemeLayout(host.homeDirectory).generation !== layout.generation ||
    directorySignature(currentDirectoryAfter) !== directorySignature(currentDirectory) ||
    directorySignature(themeDirectoryAfter) !== directorySignature(themeDirectory) ||
    optionalFileIdentity(themeNamePath) !== nameFile.identity ||
    optionalFileIdentity(themeColorsPath) !== colorsFile.identity ||
    lightModeAfter !== lightModeBefore
  ) {
    return null;
  }

  const theme: DesktopSystemTheme = {
    source: "omarchy",
    name,
    mode,
    colors: colors as DesktopSystemTheme["colors"],
  };

  return isDesktopSystemTheme(theme) ? theme : null;
}

function themeSignature(theme: DesktopSystemTheme | null): string {
  return JSON.stringify(theme);
}

export function watchDesktopSystemTheme(
  onChange: (theme: DesktopSystemTheme | null) => void,
  host: OmarchyThemeSourceHost = defaultHost(),
): () => void {
  if (host.platform !== "linux") {
    onChange(null);
    return () => undefined;
  }

  let closed = false;
  let lastThemeSignature = themeSignature(readDesktopSystemTheme(host));
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  const watchers = new Map<string, NodeFS.FSWatcher>();

  const closeWatcher = (watcher: NodeFS.FSWatcher | null): void => {
    if (!watcher) return;
    try {
      watcher.close();
    } catch {
      // Cleanup remains idempotent when the platform already closed a watcher.
    }
  };

  const scheduleReload = (): void => {
    if (closed) return;
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      reload();
    }, THEME_RELOAD_DEBOUNCE_MS);
  };

  const watchDirectory = (signature: string, directoryPath: string): void => {
    let watcher: NodeFS.FSWatcher | null = null;
    try {
      watcher = NodeFS.watch(directoryPath, { persistent: false }, scheduleReload);
      watchers.set(signature, watcher);
      watcher.on("error", () => {
        // Node closes a watcher before reporting its error. Retire only the
        // still-current entry so late errors cannot remove its replacement.
        if (closed || watchers.get(signature) !== watcher) return;
        watchers.delete(signature);
        closeWatcher(watcher);
        scheduleReload();
      });
    } catch {
      if (watcher && watchers.get(signature) === watcher) watchers.delete(signature);
      closeWatcher(watcher);
    }
  };

  const closestExistingDirectory = (directoryPath: string): ResolvedDirectory | null => {
    let candidate = directoryPath;
    while (candidate.startsWith(host.homeDirectory)) {
      const directory = resolvedDirectory(candidate);
      if (directory) return directory;
      if (candidate === host.homeDirectory) return null;
      candidate = NodePath.dirname(candidate);
    }
    return null;
  };

  const rebindDecisionWatchers = (): void => {
    // Omarchy can replace current or its theme directory at the same pathname,
    // so device and inode identity must control watcher reuse.
    const desired = new Map<string, ResolvedDirectory>();
    for (const layout of themeLayouts(host.homeDirectory)) {
      const anchor = closestExistingDirectory(layout.rootPath);
      const root = resolvedDirectory(layout.rootPath);
      if (anchor) desired.set(directorySignature(anchor)!, anchor);
      if (root) desired.set(directorySignature(root)!, root);
    }

    const layout = selectThemeLayout(host.homeDirectory);
    const current = resolvedDirectory(layout.currentPath);
    const theme = current ? resolvedDirectory(NodePath.join(current.path, "theme")) : null;
    if (current) desired.set(directorySignature(current)!, current);
    if (theme) desired.set(directorySignature(theme)!, theme);

    for (const [signature, watcher] of watchers) {
      if (desired.has(signature)) continue;
      watchers.delete(signature);
      closeWatcher(watcher);
    }
    for (const [signature, directory] of desired) {
      if (watchers.has(signature)) continue;
      watchDirectory(signature, directory.path);
    }
  };

  const reload = (): void => {
    if (closed) return;
    rebindDecisionWatchers();
    const nextTheme = readDesktopSystemTheme(host);
    const nextThemeSignature = themeSignature(nextTheme);
    if (nextThemeSignature === lastThemeSignature) return;
    lastThemeSignature = nextThemeSignature;
    onChange(nextTheme);
  };

  rebindDecisionWatchers();

  return () => {
    if (closed) return;
    closed = true;
    if (reloadTimer) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
    for (const watcher of watchers.values()) closeWatcher(watcher);
    watchers.clear();
  };
}
