import type { DesktopSystemTheme } from "@t3tools/contracts";

import {
  getDefaultThemeColors,
  mixThemeRgbColors,
  parseThemeRgbColor,
  readableThemeForeground,
  readableThemeText,
  standardMutedThemeText,
  standardStatusColors,
  themeRgbToThemeColor,
  toCanonicalThemeColor,
  type ThemeColors,
  type ThemeHalves,
  type ThemePreferenceMode,
  type ThemeRgbColor,
} from "../themePalette";

export const OMARCHY_SYSTEM_THEME_ID = "omarchy-system";

export type OmarchySystemThemeProjectionInput = Readonly<{
  theme: DesktopSystemTheme | null;
  appearanceMode: ThemePreferenceMode;
  themePreference: string;
  themeHalves: ThemeHalves | null;
}>;

const WHITE: ThemeRgbColor = { r: 255, g: 255, b: 255 };
const BLACK: ThemeRgbColor = { r: 0, g: 0, b: 0 };

function mappedColor(
  theme: DesktopSystemTheme,
  keys: readonly string[],
  required: boolean,
): string | null | undefined {
  for (const key of keys) {
    const value = theme.colors[key];
    if (value !== undefined) return toCanonicalThemeColor(value);
  }
  return required ? null : undefined;
}

// This is the retained Omarchy projection only. It intentionally fixes the
// former managed palette engine to exact seeds and restrained surface ratios.
function projectRestrainedColors(
  appearance: DesktopSystemTheme["mode"],
  backgroundValue: string,
  accentValue: string,
): ThemeColors {
  const defaults = getDefaultThemeColors(appearance);
  const canvas = parseThemeRgbColor(
    backgroundValue,
    appearance === "dark" ? { r: 24, g: 15, b: 27 } : { r: 250, g: 245, b: 250 },
  );
  const accent = parseThemeRgbColor(accentValue, { r: 168, g: 67, b: 112 });
  const text = readableThemeForeground(canvas);
  const textMuted = standardMutedThemeText(canvas, text);
  const chrome = canvas;
  const sidebar = mixThemeRgbColors(canvas, accent, 0.03);
  const surfaceRaised = mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.04 : 0.035);
  const surfaceOverlay = mixThemeRgbColors(canvas, text, 0.06);
  const quietSurfaceMix = appearance === "dark" ? 0.04 : 0.025;
  const secondary = mixThemeRgbColors(canvas, text, quietSurfaceMix);
  const muted = mixThemeRgbColors(canvas, text, quietSurfaceMix);
  const mutedForeground = readableThemeText(muted, text, 1, 4.6);
  const placeholder = readableThemeText(surfaceRaised, text, 1, 4.6);
  const accentSurface = mixThemeRgbColors(canvas, text, quietSurfaceMix);
  const messageSurface = mixThemeRgbColors(canvas, text, quietSurfaceMix);
  const toolbarControl = mixThemeRgbColors(chrome, text, appearance === "dark" ? 0.06 : 0.035);
  const toolbarBorder = mixThemeRgbColors(chrome, text, appearance === "dark" ? 0.06 : 0.05);
  const accentForeground = readableThemeForeground(accent);
  const codeBackground = mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.06 : 0.025);
  const messageActionHover = mixThemeRgbColors(
    accent,
    accentForeground.r >= 250 && accentForeground.g >= 250 && accentForeground.b >= 250
      ? BLACK
      : WHITE,
    0.12,
  );
  const updateSurface = mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.18 : 0.12);
  const updateForeground = mixThemeRgbColors(accent, appearance === "dark" ? WHITE : BLACK, 0.35);

  return {
    ...defaults,
    ...standardStatusColors(canvas),
    update: themeRgbToThemeColor(accent),
    updateForeground: themeRgbToThemeColor(updateForeground),
    updateSurface: themeRgbToThemeColor(updateSurface),
    canvas: themeRgbToThemeColor(canvas),
    chrome: themeRgbToThemeColor(chrome),
    toolbar: themeRgbToThemeColor(chrome),
    toolbarForeground: themeRgbToThemeColor(text),
    toolbarBorder: themeRgbToThemeColor(toolbarBorder),
    toolbarControl: themeRgbToThemeColor(toolbarControl),
    toolbarControlForeground: themeRgbToThemeColor(text),
    toolbarControlHover: themeRgbToThemeColor(accentSurface),
    surface: themeRgbToThemeColor(canvas),
    surfaceRaised: themeRgbToThemeColor(surfaceRaised),
    surfaceOverlay: themeRgbToThemeColor(surfaceOverlay),
    text: themeRgbToThemeColor(text),
    textMuted: themeRgbToThemeColor(textMuted),
    border: themeRgbToThemeColor(
      mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.06 : 0.05),
    ),
    input: themeRgbToThemeColor(
      mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.08 : 0.07),
    ),
    focus: themeRgbToThemeColor(accent),
    accent: themeRgbToThemeColor(accent),
    accentForeground: themeRgbToThemeColor(accentForeground),
    secondary: themeRgbToThemeColor(secondary),
    secondaryForeground: themeRgbToThemeColor(readableThemeForeground(secondary)),
    muted: themeRgbToThemeColor(muted),
    mutedForeground: themeRgbToThemeColor(mutedForeground),
    placeholder: themeRgbToThemeColor(placeholder),
    secondaryLabel: themeRgbToThemeColor(textMuted),
    iconMuted: themeRgbToThemeColor(textMuted),
    accentSurface: themeRgbToThemeColor(accentSurface),
    accentSurfaceForeground: themeRgbToThemeColor(readableThemeForeground(accentSurface)),
    messageSurface: themeRgbToThemeColor(messageSurface),
    messageForeground: themeRgbToThemeColor(readableThemeForeground(messageSurface)),
    messageAction: themeRgbToThemeColor(accent),
    messageActionForeground: themeRgbToThemeColor(accentForeground),
    messageActionHover: themeRgbToThemeColor(messageActionHover),
    codeBackground: themeRgbToThemeColor(codeBackground),
    codeForeground: themeRgbToThemeColor(readableThemeForeground(codeBackground)),
    sidebar: themeRgbToThemeColor(sidebar),
    sidebarForeground: themeRgbToThemeColor(readableThemeForeground(sidebar)),
    sidebarMutedForeground: themeRgbToThemeColor(standardMutedThemeText(sidebar, text)),
    sidebarControlSurface: themeRgbToThemeColor(mixThemeRgbColors(sidebar, text, quietSurfaceMix)),
    sidebarRowHover: themeRgbToThemeColor(mixThemeRgbColors(sidebar, text, 0.025)),
    sidebarRowActive: themeRgbToThemeColor(mixThemeRgbColors(sidebar, text, 0.04)),
    sidebarRowSelected: themeRgbToThemeColor(mixThemeRgbColors(sidebar, text, 0.06)),
    sidebarBorder: themeRgbToThemeColor(
      mixThemeRgbColors(sidebar, text, appearance === "dark" ? 0.06 : 0.05),
    ),
    terminalBackground: themeRgbToThemeColor(canvas),
    terminalForeground: themeRgbToThemeColor(readableThemeForeground(canvas)),
    terminalCursor: themeRgbToThemeColor(accent),
    terminalSelection: themeRgbToThemeColor(
      mixThemeRgbColors(canvas, accent, appearance === "dark" ? 0.35 : 0.18),
    ),
    terminalScrollbar: themeRgbToThemeColor(
      mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.42 : 0.22),
    ),
    terminalScrollbarHover: themeRgbToThemeColor(
      mixThemeRgbColors(canvas, text, appearance === "dark" ? 0.55 : 0.32),
    ),
  };
}

export function projectOmarchySystemTheme({
  theme,
  appearanceMode,
  themePreference,
  themeHalves,
}: OmarchySystemThemeProjectionInput): ThemeColors | null {
  if (!theme || theme.source !== "omarchy" || appearanceMode !== "system") return null;
  if ((themeHalves?.[theme.mode] ?? themePreference) !== "system") return null;

  const background = mappedColor(theme, ["background"], true);
  const foreground = mappedColor(theme, ["foreground"], true);
  const accent = mappedColor(theme, ["accent"], true);
  const cursor = mappedColor(theme, ["cursor", "bright_foreground"], false);
  const selection = mappedColor(theme, ["selection_background", "selection"], false);
  const selectionForeground = mappedColor(
    theme,
    ["selection_foreground", "bright_foreground"],
    false,
  );
  if (
    !background ||
    !foreground ||
    !accent ||
    cursor === null ||
    selection === null ||
    selectionForeground === null
  ) {
    return null;
  }

  const seed = projectRestrainedColors(theme.mode, background, accent);
  return {
    ...seed,
    canvas: background,
    chrome: background,
    toolbar: background,
    toolbarForeground: foreground,
    text: foreground,
    codeForeground: foreground,
    sidebarForeground: foreground,
    terminalBackground: background,
    terminalForeground: foreground,
    focus: accent,
    accent,
    terminalCursor: cursor ?? accent,
    terminalSelection: selection ?? seed.terminalSelection,
  };
}
