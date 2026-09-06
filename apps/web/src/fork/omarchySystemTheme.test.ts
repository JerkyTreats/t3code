import type { DesktopSystemTheme } from "@t3tools/contracts";
import { THEME_COLOR_ROLES } from "@t3tools/shared/themePalettes";
import { describe, expect, it } from "vite-plus/test";

import { projectOmarchySystemTheme } from "./omarchySystemTheme";

const theme: DesktopSystemTheme = {
  source: "omarchy",
  name: "Nord",
  mode: "dark",
  colors: {
    background: "#2e3440",
    foreground: "#d8dee9",
    accent: "#81a1c1",
    cursor: "#eceff4",
    selection_background: "#4c566a",
    selection_foreground: "#ffffff",
  },
};

function project(input: Partial<Parameters<typeof projectOmarchySystemTheme>[0]> = {}) {
  return projectOmarchySystemTheme({
    theme,
    appearanceMode: "system",
    themePreference: "system",
    themeHalves: null,
    ...input,
  });
}

describe("projectOmarchySystemTheme", () => {
  it("projects the pinned exact-seed restrained reference palette", () => {
    const colors = project();

    expect(Object.keys(colors ?? {}).toSorted()).toEqual([...THEME_COLOR_ROLES].toSorted());
    // These values come from the exact-origin managed projection with exact
    // seeds and restrained hierarchy, before that general generator retired.
    expect(colors).toMatchObject({
      canvas: "oklch(0.324374 0.022945 264.182)",
      surfaceRaised: "oklch(0.355388 0.021734 265.205)",
      border: "oklch(0.370655 0.021166 265.74)",
      text: "oklch(0.899258 0.016374 262.749)",
      accent: "oklch(0.696516 0.059108 248.687)",
      messageAction: "oklch(0.696516 0.059108 248.687)",
      messageActionHover: "oklch(0.733826 0.051471 248.531)",
      updateSurface: "oklch(0.397056 0.029919 257.774)",
      sidebar: "oklch(0.336745 0.024117 262.792)",
      terminalCursor: "oklch(0.951276 0.007445 260.732)",
      terminalSelection: "oklch(0.45229 0.035214 264.131)",
    });
  });

  it("uses only the active system appearance half", () => {
    expect(
      project({
        theme: { ...theme, mode: "light" },
        themePreference: "grove",
        themeHalves: { light: "system", dark: "iris" },
      }),
    ).not.toBeNull();
    expect(
      project({
        themePreference: "system",
        themeHalves: { light: "system", dark: "iris" },
      }),
    ).toBeNull();
  });

  it("does not override fixed appearance or explicit theme selection", () => {
    expect(project({ appearanceMode: "dark" })).toBeNull();
    expect(project({ themeHalves: { dark: "grove" } })).toBeNull();
    expect(project({ themePreference: "grove" })).toBeNull();
    expect(project({ theme: null })).toBeNull();
  });

  it("maps terminal aliases and preserves preferred keys", () => {
    expect(
      project({
        theme: {
          ...theme,
          colors: {
            background: "#2e3440",
            foreground: "#d8dee9",
            accent: "#81a1c1",
            selection: "#434c5e",
            bright_foreground: "#eceff4",
          },
        },
      }),
    ).toMatchObject({
      terminalCursor: "oklch(0.951276 0.007445 260.732)",
      terminalSelection: "oklch(0.415739 0.032367 264.131)",
    });

    expect(
      project({
        theme: {
          ...theme,
          colors: {
            ...theme.colors,
            bright_foreground: "#000000",
            selection: "#000000",
          },
        },
      }),
    ).toMatchObject({
      terminalCursor: "oklch(0.951276 0.007445 260.732)",
      terminalSelection: "oklch(0.45229 0.035214 264.131)",
    });
  });

  it("rejects every invalid mapped CSS color without a partial palette", () => {
    for (const key of [
      "background",
      "foreground",
      "accent",
      "cursor",
      "selection_background",
      "selection_foreground",
    ]) {
      expect(
        project({ theme: { ...theme, colors: { ...theme.colors, [key]: "not a css color" } } }),
      ).toBeNull();
    }
  });
});
