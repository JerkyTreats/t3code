import { assert, describe, it } from "@effect/vitest";
import * as NodeEvents from "node:events";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { beforeEach, vi } from "vite-plus/test";

const { openExternalMock, writeTextMock, spawnMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(),
  writeTextMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

vi.mock("electron", () => ({
  shell: {
    openExternal: openExternalMock,
  },
  clipboard: {
    writeText: writeTextMock,
  },
}));

import * as ElectronShell from "./ElectronShell.ts";

const defaultShellLayer = Layer.succeed(
  ElectronShell.ElectronShell,
  ElectronShell.make(Option.none()),
);
const sessionShellLayer = Layer.succeed(
  ElectronShell.ElectronShell,
  ElectronShell.make(Option.some("/home/user/.config")),
);

const fakeChild = (event: "spawn" | "error") => {
  const child = Object.assign(new NodeEvents.EventEmitter(), { unref: vi.fn() });
  queueMicrotask(() => child.emit(event, event === "error" ? new Error("ENOENT") : undefined));
  return child;
};

describe("ElectronShell", () => {
  beforeEach(() => {
    openExternalMock.mockReset();
    writeTextMock.mockReset();
    spawnMock.mockReset();
  });

  it("derives the session config home only for the standalone Linux profile", () => {
    const standaloneServerUrl = Option.some(new URL("https://t3.example.test/"));
    assert.deepEqual(
      ElectronShell.resolveSessionXdgConfigHome({
        platform: "linux",
        appDataDirectory: "/home/user/.config/t3code-production",
        standaloneServerUrl,
      }),
      Option.some("/home/user/.config"),
    );
    assert.deepEqual(
      ElectronShell.resolveSessionXdgConfigHome({
        platform: "linux",
        appDataDirectory: "/home/user/.config",
        standaloneServerUrl: Option.none(),
      }),
      Option.none(),
    );
    assert.deepEqual(
      ElectronShell.resolveSessionXdgConfigHome({
        platform: "linux",
        appDataDirectory: "/home/user/.config/t3code-staging",
        standaloneServerUrl,
      }),
      Option.some("/home/user/.config"),
    );
    assert.deepEqual(
      ElectronShell.resolveSessionXdgConfigHome({
        platform: "darwin",
        appDataDirectory: "/home/user/.config/t3code-production",
        standaloneServerUrl,
      }),
      Option.none(),
    );
  });

  it.effect("opens standalone Linux links with the session config home", () =>
    Effect.gen(function* () {
      spawnMock.mockImplementation(() => fakeChild("spawn"));

      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal("https://example.com/path");

      assert.equal(result, true);
      assert.equal(openExternalMock.mock.calls.length, 0);
      const [command, args, options] = spawnMock.mock.calls[0]!;
      assert.equal(command, "xdg-open");
      assert.deepEqual(args, ["https://example.com/path"]);
      assert.equal(options.env.XDG_CONFIG_HOME, "/home/user/.config");
      assert.equal(options.detached, true);
    }).pipe(Effect.provide(sessionShellLayer)),
  );

  it.effect("returns false when the standalone Linux handler cannot launch", () =>
    Effect.gen(function* () {
      spawnMock.mockImplementation(() => fakeChild("error"));

      const electronShell = yield* ElectronShell.ElectronShell;
      const results = yield* Effect.all([
        electronShell.openExternal("https://example.com/path"),
        electronShell.openExternal("file:///etc/passwd"),
      ]);

      assert.deepEqual(results, [false, false]);
      assert.equal(spawnMock.mock.calls.length, 1);
    }).pipe(Effect.provide(sessionShellLayer)),
  );

  it.effect("opens safe external URLs", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal("https://example.com/path");

      assert.equal(result, true);
      assert.deepEqual(openExternalMock.mock.calls, [["https://example.com/path"]]);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("copies text to the system clipboard", () =>
    Effect.gen(function* () {
      writeTextMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      yield* electronShell.copyText("https://example.com/path");

      assert.deepEqual(writeTextMock.mock.calls, [["https://example.com/path"]]);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("does not fail when the clipboard write rejects", () =>
    Effect.gen(function* () {
      writeTextMock.mockRejectedValue(new Error("write failed"));

      const electronShell = yield* ElectronShell.ElectronShell;
      yield* electronShell.copyText("https://example.com/path");

      assert.deepEqual(writeTextMock.mock.calls, [["https://example.com/path"]]);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("opens the Full Disk Access settings anchor", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openSystemSettings("full-disk-access");

      assert.equal(result, true);
      assert.deepEqual(openExternalMock.mock.calls, [
        ["x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles"],
      ]);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("opens remote SSH editor URLs", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal(
        "vscode://vscode-remote/ssh-remote+example.com/home/user/project",
      );

      assert.equal(result, true);
      assert.deepEqual(openExternalMock.mock.calls, [
        ["vscode://vscode-remote/ssh-remote+example.com/home/user/project"],
      ]);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("opens Zed's ssh deep link", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const results = yield* Effect.all([
        electronShell.openExternal("zed://ssh/example.com/home/user/project"),
        electronShell.openExternal("zed://ssh/example.com/"),
      ]);

      assert.deepEqual(results, [true, true]);
      assert.deepEqual(openExternalMock.mock.calls, [
        ["zed://ssh/example.com/home/user/project"],
        ["zed://ssh/example.com/"],
      ]);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("does not open editor URLs that mix up link shapes", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const results = yield* Effect.all([
        electronShell.openExternal("zed://extension/attacker"),
        electronShell.openExternal("vscode://ssh/example.com/home/user/project"),
      ]);

      assert.deepEqual(results, [false, false]);
      assert.equal(openExternalMock.mock.calls.length, 0);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("does not open remote editor URLs with userinfo", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const results = yield* Effect.all([
        electronShell.openExternal(
          "vscode://user@vscode-remote/ssh-remote+example.com/home/user/project",
        ),
        electronShell.openExternal(
          "vscode://:secret@vscode-remote/ssh-remote+example.com/home/user/project",
        ),
        electronShell.openExternal("zed://ssh/user@example.com/home/user/project"),
      ]);

      assert.deepEqual(results, [false, false, false]);
      assert.equal(openExternalMock.mock.calls.length, 0);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("does not open unsafe external URLs", () =>
    Effect.gen(function* () {
      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal("file:///etc/passwd");

      assert.equal(result, false);
      assert.equal(openExternalMock.mock.calls.length, 0);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("does not open non-remote editor URLs", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal(
        "vscode://ms-python.python/some-command?argument=attacker",
      );

      assert.equal(result, false);
      assert.equal(openExternalMock.mock.calls.length, 0);
    }).pipe(Effect.provide(defaultShellLayer)),
  );

  it.effect("returns false when Electron rejects openExternal", () =>
    Effect.gen(function* () {
      openExternalMock.mockRejectedValue(new Error("open failed"));

      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal("https://example.com/path");

      assert.equal(result, false);
    }).pipe(Effect.provide(defaultShellLayer)),
  );
});
