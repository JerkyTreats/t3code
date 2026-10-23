// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as NodeEvents from "node:events";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { watchMock } = vi.hoisted(() => ({ watchMock: vi.fn() }));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, watch: watchMock };
});

import { readDesktopSystemTheme, watchDesktopSystemTheme } from "./OmarchyThemeSource.js";

type FakeWatcher = NodeEvents.EventEmitter & { close: ReturnType<typeof vi.fn> };

function fakeWatcher(): FakeWatcher {
  const watcher = new NodeEvents.EventEmitter() as FakeWatcher;
  watcher.close = vi.fn();
  return watcher;
}

describe("OmarchyThemeSource", () => {
  const tempDirectories: string[] = [];

  beforeEach(() => {
    watchMock.mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directoryPath) => NodeFSP.rm(directoryPath, { recursive: true, force: true })),
    );
  });

  async function writeTheme(
    input: {
      readonly generation?: "quattro" | "legacy";
      readonly name?: string;
      readonly colors?: string;
      readonly light?: boolean;
    } = {},
  ): Promise<string> {
    const homeDirectory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "omarchy-theme-"));
    tempDirectories.push(homeDirectory);
    await writeThemeState(homeDirectory, input);
    return homeDirectory;
  }

  async function writeThemeState(
    homeDirectory: string,
    input: {
      readonly generation?: "quattro" | "legacy";
      readonly name?: string;
      readonly colors?: string;
      readonly light?: boolean;
    } = {},
  ): Promise<void> {
    const omarchyDirectory =
      input.generation === "quattro"
        ? NodePath.join(homeDirectory, ".local", "state", "omarchy")
        : NodePath.join(homeDirectory, ".config", "omarchy");
    const currentDirectory = NodePath.join(omarchyDirectory, "current");
    const themeDirectory = NodePath.join(currentDirectory, "theme");
    await NodeFSP.mkdir(themeDirectory, { recursive: true });
    await NodeFSP.writeFile(
      NodePath.join(currentDirectory, "theme.name"),
      input.name ?? "Tokyo Night\n",
    );
    await NodeFSP.writeFile(
      NodePath.join(themeDirectory, "colors.toml"),
      input.colors ??
        [
          'background = "#111827"',
          'foreground = "#f9fafb"',
          'accent = "#22d3ee"',
          'selection_background = "#334155"',
        ].join("\n"),
    );
    if (input.light) await NodeFSP.writeFile(NodePath.join(themeDirectory, "light.mode"), "");
  }

  it("reads a bounded validated legacy theme snapshot", async () => {
    const homeDirectory = await writeTheme({ light: true });

    expect(readDesktopSystemTheme({ platform: "linux", homeDirectory })).toEqual({
      source: "omarchy",
      name: "Tokyo Night",
      mode: "light",
      colors: {
        background: "#111827",
        foreground: "#f9fafb",
        accent: "#22d3ee",
        selection_background: "#334155",
      },
    });
  });

  it("prefers coherent Quattro state and reads its explicit mode", async () => {
    const homeDirectory = await writeTheme({
      name: "legacy",
      colors: ['background = "#111827"', 'foreground = "#f9fafb"', 'accent = "#22d3ee"'].join("\n"),
    });
    await writeThemeState(homeDirectory, {
      generation: "quattro",
      name: "nord\n",
      colors: [
        'mode = "light"',
        'background = "#ffffff"',
        'foreground = "#111827"',
        'accent = "#2563eb"',
        'selection = "#cbd5e1"',
        'bright_foreground = "#0f172a"',
      ].join("\n"),
    });

    expect(readDesktopSystemTheme({ platform: "linux", homeDirectory })).toEqual({
      source: "omarchy",
      name: "nord",
      mode: "light",
      colors: {
        mode: "light",
        background: "#ffffff",
        foreground: "#111827",
        accent: "#2563eb",
        selection: "#cbd5e1",
        bright_foreground: "#0f172a",
      },
    });
  });

  it("falls back to legacy only while preferred state is absent", async () => {
    const homeDirectory = await writeTheme({ light: true });
    expect(readDesktopSystemTheme({ platform: "linux", homeDirectory })?.mode).toBe("light");

    await writeThemeState(homeDirectory, {
      generation: "quattro",
      name: "broken-preferred",
      colors: [
        'mode = "automatic"',
        'background = "#ffffff"',
        'foreground = "#111827"',
        'accent = "#2563eb"',
      ].join("\n"),
    });

    expect(readDesktopSystemTheme({ platform: "linux", homeDirectory })).toBeNull();
  });

  it("fails closed for unsupported, malformed, incomplete, and oversized input", async () => {
    const incompleteHome = await writeTheme({
      colors: ['background = "#111827"', 'foreground = "#f9fafb"'].join("\n"),
    });
    const malformedHome = await writeTheme({
      colors: ['background = "#111827"', "this is not toml"].join("\n"),
    });
    const duplicateHome = await writeTheme({
      colors: [
        'background = "#111827"',
        'foreground = "#f9fafb"',
        'accent = "#22d3ee"',
        'accent = "#ffffff"',
      ].join("\n"),
    });
    const oversizedHome = await writeTheme({ colors: `#${"x".repeat(64 * 1024)}` });

    expect(
      readDesktopSystemTheme({ platform: "darwin", homeDirectory: incompleteHome }),
    ).toBeNull();
    expect(readDesktopSystemTheme({ platform: "linux", homeDirectory: incompleteHome })).toBeNull();
    expect(readDesktopSystemTheme({ platform: "linux", homeDirectory: malformedHome })).toBeNull();
    expect(readDesktopSystemTheme({ platform: "linux", homeDirectory: duplicateHome })).toBeNull();
    expect(readDesktopSystemTheme({ platform: "linux", homeDirectory: oversizedHome })).toBeNull();
  });

  it("deduplicates events and closes each watcher once", async () => {
    vi.useFakeTimers();
    const homeDirectory = await writeTheme();
    const homeWatcher = fakeWatcher();
    const omarchyWatcher = fakeWatcher();
    const currentWatcher = fakeWatcher();
    const themeWatcher = fakeWatcher();
    const watchers = [homeWatcher, omarchyWatcher, currentWatcher, themeWatcher];
    const callbacks: Array<() => void> = [];
    watchMock.mockImplementation(
      (_path: string, _options: unknown, callback: () => void): FakeWatcher => {
        callbacks.push(callback);
        return watchers[callbacks.length - 1]!;
      },
    );
    const onChange = vi.fn();

    const cleanup = watchDesktopSystemTheme(onChange, { platform: "linux", homeDirectory });
    expect(watchMock).toHaveBeenCalledTimes(4);
    expect(watchMock.mock.calls.map(([path]) => path)).toEqual([
      homeDirectory,
      NodePath.join(homeDirectory, ".config", "omarchy"),
      NodePath.join(homeDirectory, ".config", "omarchy", "current"),
      NodePath.join(homeDirectory, ".config", "omarchy", "current", "theme"),
    ]);

    for (const callback of callbacks) callback();
    await vi.advanceTimersByTimeAsync(120);
    expect(onChange).not.toHaveBeenCalled();

    await NodeFSP.writeFile(
      NodePath.join(homeDirectory, ".config", "omarchy", "current", "theme.name"),
      "Catppuccin\n",
    );
    callbacks[2]?.();
    await vi.advanceTimersByTimeAsync(120);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0]?.name).toBe("Catppuccin");

    callbacks[2]?.();
    await vi.advanceTimersByTimeAsync(120);
    expect(onChange).toHaveBeenCalledOnce();

    cleanup();
    cleanup();
    for (const watcher of watchers) expect(watcher.close).toHaveBeenCalledOnce();
  });

  it("replaces a failed same-identity watcher without accepting late callbacks", async () => {
    vi.useFakeTimers();
    const homeDirectory = await writeTheme();
    const watchers = Array.from({ length: 5 }, fakeWatcher);
    const callbacks: Array<() => void> = [];
    watchMock.mockImplementation(
      (_path: string, _options: unknown, callback: () => void): FakeWatcher => {
        callbacks.push(callback);
        return watchers[callbacks.length - 1]!;
      },
    );
    const onChange = vi.fn();
    const cleanup = watchDesktopSystemTheme(onChange, { platform: "linux", homeDirectory });
    const themeDirectory = NodePath.join(homeDirectory, ".config", "omarchy", "current", "theme");
    const initialThemeWatchIndex = watchMock.mock.calls.findIndex(
      ([directoryPath]) => directoryPath === themeDirectory,
    );

    watchers[initialThemeWatchIndex]?.emit("error", new Error("watch failed"));
    await vi.advanceTimersByTimeAsync(120);

    const themeWatchCalls = () =>
      watchMock.mock.calls.filter(([directoryPath]) => directoryPath === themeDirectory);
    expect(themeWatchCalls()).toHaveLength(2);
    expect(watchers[initialThemeWatchIndex]?.close).toHaveBeenCalledOnce();
    const replacementThemeWatchIndex = callbacks.length - 1;
    expect(watchMock.mock.calls[replacementThemeWatchIndex]?.[0]).toBe(themeDirectory);

    watchers[initialThemeWatchIndex]?.emit("error", new Error("late watch failure"));
    await vi.advanceTimersByTimeAsync(120);
    expect(themeWatchCalls()).toHaveLength(2);

    await NodeFSP.writeFile(
      NodePath.join(themeDirectory, "colors.toml"),
      ['background = "#111827"', 'foreground = "#f9fafb"', 'accent = "#f97316"'].join("\n"),
    );
    callbacks[replacementThemeWatchIndex]?.();
    await vi.advanceTimersByTimeAsync(120);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0]?.colors.accent).toBe("#f97316");

    cleanup();
    const watchCallCountAfterCleanup = watchMock.mock.calls.length;
    watchers[initialThemeWatchIndex]?.emit("error", new Error("late old failure"));
    watchers[replacementThemeWatchIndex]?.emit("error", new Error("late current failure"));
    callbacks[replacementThemeWatchIndex]?.();
    await vi.advanceTimersByTimeAsync(120);
    expect(watchMock).toHaveBeenCalledTimes(watchCallCountAfterCleanup);
    expect(onChange).toHaveBeenCalledOnce();
    expect(watchers[initialThemeWatchIndex]?.close).toHaveBeenCalledOnce();
    expect(watchers[replacementThemeWatchIndex]?.close).toHaveBeenCalledOnce();
  });

  it("rebinds watchers after current is atomically retargeted", async () => {
    vi.useFakeTimers();
    const homeDirectory = await NodeFSP.mkdtemp(
      NodePath.join(NodeOS.tmpdir(), "omarchy-theme-retarget-"),
    );
    tempDirectories.push(homeDirectory);
    const omarchyDirectory = NodePath.join(homeDirectory, ".config", "omarchy");
    const firstDirectory = NodePath.join(omarchyDirectory, "themes", "first");
    const secondDirectory = NodePath.join(omarchyDirectory, "themes", "second");
    for (const [directory, name] of [
      [firstDirectory, "First"],
      [secondDirectory, "Second"],
    ] as const) {
      await NodeFSP.mkdir(NodePath.join(directory, "theme"), { recursive: true });
      await NodeFSP.writeFile(NodePath.join(directory, "theme.name"), name);
      await NodeFSP.writeFile(
        NodePath.join(directory, "theme", "colors.toml"),
        ['background = "#111827"', 'foreground = "#f9fafb"', 'accent = "#22d3ee"'].join("\n"),
      );
    }
    const currentPath = NodePath.join(omarchyDirectory, "current");
    await NodeFSP.symlink(firstDirectory, currentPath);

    const watchers = Array.from({ length: 6 }, fakeWatcher);
    const callbacks: Array<() => void> = [];
    watchMock.mockImplementation(
      (_path: string, _options: unknown, callback: () => void): FakeWatcher => {
        callbacks.push(callback);
        return watchers[callbacks.length - 1]!;
      },
    );
    const onChange = vi.fn();
    const cleanup = watchDesktopSystemTheme(onChange, { platform: "linux", homeDirectory });

    const replacementPath = NodePath.join(omarchyDirectory, "current.next");
    await NodeFSP.symlink(secondDirectory, replacementPath);
    await NodeFSP.rename(replacementPath, currentPath);
    callbacks[1]?.();
    await vi.advanceTimersByTimeAsync(120);

    expect(onChange.mock.calls[0]?.[0]?.name).toBe("Second");
    expect(watchMock.mock.calls[4]?.[0]).toBe(secondDirectory);
    expect(watchMock.mock.calls[5]?.[0]).toBe(NodePath.join(secondDirectory, "theme"));
    expect(watchers[2]?.close).toHaveBeenCalledOnce();
    expect(watchers[3]?.close).toHaveBeenCalledOnce();
    cleanup();
  });

  it("rebinds the Quattro watcher when the theme directory identity changes", async () => {
    vi.useFakeTimers();
    const homeDirectory = await writeTheme({
      generation: "quattro",
      name: "first",
      colors: [
        'mode = "dark"',
        'background = "#111827"',
        'foreground = "#f9fafb"',
        'accent = "#22d3ee"',
      ].join("\n"),
    });
    const watchers = Array.from({ length: 6 }, fakeWatcher);
    const callbacks: Array<() => void> = [];
    watchMock.mockImplementation(
      (_path: string, _options: unknown, callback: () => void): FakeWatcher => {
        callbacks.push(callback);
        return watchers[callbacks.length - 1]!;
      },
    );
    const onChange = vi.fn();
    const cleanup = watchDesktopSystemTheme(onChange, { platform: "linux", homeDirectory });
    const currentDirectory = NodePath.join(homeDirectory, ".local", "state", "omarchy", "current");
    const themeDirectory = NodePath.join(currentDirectory, "theme");
    const initialThemeWatchIndex = watchMock.mock.calls.findIndex(
      ([directoryPath]) => directoryPath === themeDirectory,
    );
    const currentWatchIndex = watchMock.mock.calls.findIndex(
      ([directoryPath]) => directoryPath === currentDirectory,
    );
    const nextThemeDirectory = NodePath.join(currentDirectory, "next-theme");
    await NodeFSP.mkdir(nextThemeDirectory);
    await NodeFSP.writeFile(
      NodePath.join(nextThemeDirectory, "colors.toml"),
      [
        'mode = "light"',
        'background = "#ffffff"',
        'foreground = "#111827"',
        'accent = "#2563eb"',
      ].join("\n"),
    );
    await NodeFSP.rm(themeDirectory, { recursive: true });
    await NodeFSP.rename(nextThemeDirectory, themeDirectory);
    await NodeFSP.writeFile(NodePath.join(currentDirectory, "theme.name"), "second\n");

    callbacks[currentWatchIndex]?.();
    await vi.advanceTimersByTimeAsync(120);

    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ name: "second", mode: "light" });
    expect(
      watchMock.mock.calls.filter(([directoryPath]) => directoryPath === themeDirectory),
    ).toHaveLength(2);
    expect(watchers[initialThemeWatchIndex]?.close).toHaveBeenCalledOnce();
    cleanup();
  });

  it.runIf(NodeProcess.platform === "linux")(
    "observes direct atomic theme name replacement through the real filesystem watcher",
    async () => {
      vi.doUnmock("node:fs");
      vi.resetModules();
      const { watchDesktopSystemTheme: watchRealDesktopSystemTheme } =
        await import("./OmarchyThemeSource.js");
      const homeDirectory = await writeTheme();
      const currentDirectory = NodePath.join(homeDirectory, ".config", "omarchy", "current");
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let cleanup = (): void => undefined;
      const notification = new Promise<void>((resolve) => {
        cleanup = watchRealDesktopSystemTheme(
          (theme) => {
            if (theme?.name === "Catppuccin") resolve();
          },
          { platform: "linux", homeDirectory },
        );
      });
      const timedOut = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Real filesystem theme name notification timed out.")),
          2_000,
        );
      });

      try {
        const replacementPath = NodePath.join(currentDirectory, "theme.name.next");
        await NodeFSP.writeFile(replacementPath, "Catppuccin\n");
        await NodeFSP.rename(replacementPath, NodePath.join(currentDirectory, "theme.name"));
        await Promise.race([notification, timedOut]);
      } finally {
        cleanup();
        if (timeout) clearTimeout(timeout);
      }
    },
  );
});
