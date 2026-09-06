// @effect-diagnostics nodeBuiltinImport:off -- The isolated profile test owns temporary filesystem state.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeEvents from "node:events";
import type { BrowserWindow } from "electron";

import { describe, expect, it, vi } from "vite-plus/test";

import {
  allocateThreadProfilePath,
  installThreadWindowGuards,
  resolveThreadApplicationUrl,
  resolveThreadProfileRoot,
  threadWindowOptions,
} from "./window.ts";

describe("independent T3 Thread window", () => {
  it("loads the compact production surface", () => {
    expect(resolveThreadApplicationUrl("https://production.example.test/path?q=1")).toBe(
      "https://production.example.test/?t3-thread-client=1",
    );
    expect(() => resolveThreadApplicationUrl()).toThrow("server URL is required");
    expect(() => resolveThreadApplicationUrl("http://127.0.0.1:5733")).toThrow("must use HTTPS");
  });

  it("allocates a unique writable profile outside T3 Code", () => {
    expect(resolveThreadProfileRoot({ appDataPath: "/config" })).toBe(
      "/config/t3code-thread-profiles",
    );
    expect(
      resolveThreadProfileRoot({
        appDataPath: "/config",
        configuredPath: "/private/thread-profile",
      }),
    ).toBe("/private/thread-profile");
    expect(() =>
      resolveThreadProfileRoot({ appDataPath: "/config", configuredPath: "relative" }),
    ).toThrow("root must be absolute");

    const profileRoot = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "t3-thread-profile-test-"),
    );
    try {
      const launchId = "01234567-89ab-4def-8abc-0123456789ab";
      const first = allocateThreadProfilePath({ profileRoot, launchId });
      const second = allocateThreadProfilePath({ profileRoot, launchId });
      expect(first).not.toBe(second);
      expect(NodeFS.statSync(first).isDirectory()).toBe(true);
      expect(NodeFS.statSync(second).isDirectory()).toBe(true);
      expect(NodeFS.statSync(first).mode & 0o777).toBe(0o700);
      expect(NodeFS.statSync(second).mode & 0o777).toBe(0o700);
      expect(NodePath.dirname(first)).toBe(profileRoot);
      expect(NodePath.dirname(second)).toBe(profileRoot);
    } finally {
      NodeFS.rmSync(profileRoot, { recursive: true, force: true });
    }
  });

  it("does not enable desktop-only renderer authority", () => {
    const options = threadWindowOptions({ preloadPath: "/app/preload.cjs" });
    expect(options.webPreferences).toMatchObject({
      preload: "/app/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    });
  });
});

describe("exact-origin Thread window guards", () => {
  function guardedWindow() {
    const session = Object.assign(new NodeEvents.EventEmitter(), {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    });
    const webContents = Object.assign(new NodeEvents.EventEmitter(), {
      session,
      setWindowOpenHandler: vi.fn(),
    });
    const openExternal = vi.fn();
    installThreadWindowGuards({ webContents } as unknown as BrowserWindow, {
      applicationOrigin: "https://host.example.test:444",
      openExternal,
    });
    return { webContents, session, openExternal };
  }

  it("rejects foreign, downgraded, userinfo and invalid main-frame navigation and redirects", () => {
    const { webContents, openExternal } = guardedWindow();
    for (const name of ["will-navigate", "will-frame-navigate", "will-redirect"]) {
      for (const url of [
        "https://foreign.example.test",
        "http://host.example.test:444",
        "https://host.example.test",
        "https://user:pass@host.example.test:444",
        "javascript:alert(1)",
        "invalid",
      ]) {
        const event = { url, isMainFrame: true, preventDefault: vi.fn() };
        webContents.emit(name, event);
        expect(event.preventDefault).toHaveBeenCalledOnce();
      }
      const event = {
        url: "https://host.example.test:444/thread/new",
        isMainFrame: true,
        preventDefault: vi.fn(),
      };
      webContents.emit(name, event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("does not confuse subframe redirects with the document and denies new window authority", () => {
    const { webContents, session, openExternal } = guardedWindow();
    const event = {
      url: "https://foreign.example.test",
      isMainFrame: false,
      preventDefault: vi.fn(),
    };
    webContents.emit("will-redirect", event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    const windowOpen = webContents.setWindowOpenHandler.mock.calls[0]![0];
    expect(windowOpen({ url: "https://docs.example.test/" })).toEqual({ action: "deny" });
    expect(openExternal).toHaveBeenCalledExactlyOnceWith("https://docs.example.test/");
    for (const url of [
      "file:///tmp/example",
      "javascript:alert(1)",
      "https://user:pass@host.example.test",
    ])
      windowOpen({ url });
    expect(openExternal).toHaveBeenCalledOnce();
    const permission = vi.fn();
    session.setPermissionRequestHandler.mock.calls[0]![0]({}, "camera", permission);
    expect(permission).toHaveBeenCalledExactlyOnceWith(false);
    expect(session.setPermissionCheckHandler.mock.calls[0]![0]()).toBe(false);
    const preventDefault = vi.fn();
    session.emit("will-download", { preventDefault });
    webContents.emit("will-attach-webview", { preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });
});
