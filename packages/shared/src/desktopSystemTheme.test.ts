import { describe, expect, it } from "vite-plus/test";
import { DesktopSystemThemeSchema } from "@t3tools/contracts";
import { Schema } from "effect";
import { decodeDesktopSystemTheme } from "./desktopSystemTheme.ts";

const theme = {
  source: "omarchy",
  name: " Synthetic ",
  mode: "dark",
  colors: { background: "#050806", foreground: "#edf2ed", accent: "#7fff9f", selection: "#16261c" },
};
const schema = Schema.decodeUnknownSync(DesktopSystemThemeSchema);

describe("portable system theme boundary", () => {
  it("matches the canonical contract and copies every palette instead of exposing IPC data", () => {
    const result = decodeDesktopSystemTheme(theme);
    expect(result).toEqual(schema(theme));
    expect(result?.colors).not.toBe(theme.colors);
    expect(decodeDesktopSystemTheme(null)).toBeNull();
  });

  it("fails closed at the same wire limits as the canonical contract", () => {
    const colors = Object.fromEntries(
      Array.from({ length: 65 }, (_, i) => [`color${i}`, "#000000"]),
    );
    for (const value of [
      {},
      { ...theme, source: "foreign" },
      { ...theme, mode: "automatic" },
      { ...theme, name: " " },
      { ...theme, name: "x".repeat(129) },
      { ...theme, colors: {} },
      { ...theme, colors: [] },
      { ...theme, colors: { ...theme.colors, Accent: "#111111" } },
      { ...theme, colors: { ...theme.colors, background: "" } },
      { ...theme, colors: { ...theme.colors, background: "x".repeat(257) } },
      { ...theme, colors: { ...theme.colors, ...colors } },
    ]) {
      expect(() => schema(value)).toThrow();
      expect(() => decodeDesktopSystemTheme(value)).toThrow();
    }
  });
});
