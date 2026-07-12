// @effect-diagnostics nodeBuiltinImport:off
import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mockedHomedir } = vi.hoisted(() => ({
  mockedHomedir: vi.fn(),
}));

const originalPlatform = process.platform;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: mockedHomedir,
  };
});

describe("OmarchyThemeSource", () => {
  const tempDirectories: string[] = [];

  beforeEach(() => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux",
    });
    vi.resetModules();
    mockedHomedir.mockReset();
  });

  afterEach(async () => {
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directoryPath) => FS.rm(directoryPath, { recursive: true, force: true })),
    );
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
  });

  async function writeTheme(
    input: {
      readonly name?: string;
      readonly colors?: string;
      readonly light?: boolean;
    } = {},
  ): Promise<string> {
    const tempHome = await FS.mkdtemp(Path.join(OS.tmpdir(), "omarchy-theme-home-"));
    tempDirectories.push(tempHome);
    const currentDirectory = Path.join(tempHome, ".config", "omarchy", "current");
    const themeDirectory = Path.join(currentDirectory, "theme");
    await FS.mkdir(themeDirectory, { recursive: true });
    await FS.writeFile(Path.join(currentDirectory, "theme.name"), input.name ?? "Tokyo Night\n");
    await FS.writeFile(
      Path.join(themeDirectory, "colors.toml"),
      input.colors ??
        [
          'background = "#111827"',
          'foreground = "#f9fafb"',
          'accent = "#22d3ee"',
          'surface_1 = "#1f2937"',
        ].join("\n"),
    );
    if (input.light) {
      await FS.writeFile(Path.join(themeDirectory, "light.mode"), "");
    }
    return tempHome;
  }

  it("reads Omarchy theme colors and dark mode", async () => {
    const tempHome = await writeTheme();
    mockedHomedir.mockReturnValue(tempHome);

    const { readDesktopSystemTheme } = await import("./OmarchyThemeSource.ts");

    expect(readDesktopSystemTheme()).toEqual({
      source: "omarchy",
      name: "Tokyo Night",
      mode: "dark",
      colors: {
        background: "#111827",
        foreground: "#f9fafb",
        accent: "#22d3ee",
        surface_1: "#1f2937",
      },
    });
  });

  it("detects light mode from the Omarchy marker file", async () => {
    const tempHome = await writeTheme({ light: true });
    mockedHomedir.mockReturnValue(tempHome);

    const { readDesktopSystemTheme } = await import("./OmarchyThemeSource.ts");

    expect(readDesktopSystemTheme()?.mode).toBe("light");
  });

  it("returns null when required theme colors are missing", async () => {
    const tempHome = await writeTheme({
      colors: ['background = "#111827"', 'foreground = "#f9fafb"'].join("\n"),
    });
    mockedHomedir.mockReturnValue(tempHome);

    const { readDesktopSystemTheme } = await import("./OmarchyThemeSource.ts");

    expect(readDesktopSystemTheme()).toBeNull();
  });
});
