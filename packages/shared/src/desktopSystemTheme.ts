import type { DesktopSystemTheme } from "@t3tools/contracts";

export const SYSTEM_THEME_MAX_COLORS = 64;

// Portable decoder for sandboxed preload. Keep in conformance with ipc.ts.
export function decodeDesktopSystemTheme(value: unknown): DesktopSystemTheme | null {
  if (value === null) return null;
  if (
    typeof value !== "object" ||
    !value ||
    !("source" in value) ||
    value.source !== "omarchy" ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.trim().length > 128 ||
    !("mode" in value) ||
    (value.mode !== "light" && value.mode !== "dark") ||
    !("colors" in value) ||
    typeof value.colors !== "object" ||
    !value.colors ||
    Array.isArray(value.colors)
  )
    throw new Error("Invalid local system theme");
  const colors: Record<string, string> = {};
  const entries = Object.entries(value.colors);
  if (entries.length > SYSTEM_THEME_MAX_COLORS) throw new Error("Too many local theme colors");
  for (const [key, color] of entries) {
    if (
      !/^[a-z][a-z0-9_-]*$/.test(key) ||
      key.length > 64 ||
      typeof color !== "string" ||
      color.length < 1 ||
      color.length > 256
    )
      throw new Error("Invalid local theme color");
    colors[key] = color;
  }
  if (!colors.background || !colors.foreground || !colors.accent)
    throw new Error("Missing local theme colors");
  return {
    source: "omarchy",
    name: value.name.trim(),
    mode: value.mode,
    colors: {
      ...colors,
      background: colors.background,
      foreground: colors.foreground,
      accent: colors.accent,
    },
  };
}
