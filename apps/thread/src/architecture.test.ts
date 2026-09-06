// @effect-diagnostics nodeBuiltinImport:off -- Execute main composition using synthetic Electron adapters and private fixture paths.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeEvents from "node:events";
import * as NodeStream from "node:stream";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { BrowserWindowConstructorOptions } from "electron";
import {
  THREAD_CLIENT_ACTIVATION_CHANNEL,
  THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL,
  THREAD_ENROLLMENT_SUBMISSION_CHANNEL,
} from "./bridge.ts";

const origin = "https://host.example.test";
const activation = {
  contractVersion: 1,
  launchId: "01234567-89ab-4def-8abc-0123456789ab",
  draft: "  draft\r\n雪  ",
};
const roots: string[] = [];
function fixtureRoot() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "thread-main-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

async function launch(input: {
  root: string;
  activationText?: string;
  redirect?: string;
  loadFailure?: boolean;
  storageAvailable?: boolean;
  serverUrl?: string;
}) {
  vi.resetModules();
  vi.stubEnv("T3_THREAD_SERVER_URL", input.serverUrl ?? origin);
  vi.stubEnv("T3_THREAD_PROFILE", NodePath.join(input.root, "profiles"));
  vi.stubGlobal("__dirname", "/synthetic/thread");
  const headersListeners: Array<
    (
      details: { url: string; requestHeaders: Record<string, string> },
      callback: (result: unknown) => void,
    ) => void
  > = [];
  const handlers = new Map<string, (event: unknown, value: unknown) => Promise<unknown>>();
  const windows: FakeWindow[] = [];
  const readyBytes: Buffer[] = [];
  const closeReady = vi.fn();
  const calls: string[] = [];
  const app = {
    commandLine: { hasSwitch: () => false, appendSwitch: vi.fn() },
    getPath: vi.fn(() => input.root),
    setPath: vi.fn((name: string) => {
      calls.push(`path:${name}`);
    }),
    setName: vi.fn(),
    enableSandbox: vi.fn(),
    whenReady: vi.fn(async () => {
      calls.push("ready");
    }),
    quit: vi.fn(),
    exit: vi.fn(),
    requestSingleInstanceLock: vi.fn(),
  };
  const response = Response.json({
    access_token: "synthetic-main-bearer",
    issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
    token_type: "Bearer",
    expires_in: 3600,
  });
  Object.defineProperty(response, "url", { value: `${origin}/oauth/token` });
  const fetch = vi.fn(async () => response);
  class FakeWindow extends NodeEvents.EventEmitter {
    destroyed = false;
    url = "";
    redirectPrevented = false;
    webContents = Object.assign(new NodeEvents.EventEmitter(), {
      getURL: () => this.url,
      mainFrame: { url: "" },
      isLoadingMainFrame: () => false,
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      session: Object.assign(new NodeEvents.EventEmitter(), {
        webRequest: {
          onBeforeSendHeaders: (listener: (typeof headersListeners)[number]) =>
            headersListeners.push(listener),
          onBeforeRequest: vi.fn(),
        },
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      }),
    });
    constructor(readonly options: BrowserWindowConstructorOptions) {
      super();
      windows.push(this);
    }
    removeMenu = vi.fn();
    setTitle = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    isMinimized = () => false;
    isDestroyed = () => this.destroyed;
    destroy() {
      this.destroyed = true;
      this.emit("closed");
    }
    async loadURL(url: string) {
      expect(this.webContents.listenerCount("will-redirect")).toBe(1);
      expect(headersListeners).toHaveLength(1);
      expect(handlers.has(THREAD_ENROLLMENT_SUBMISSION_CHANNEL)).toBe(true);
      expect(handlers.has(THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL)).toBe(true);
      if (input.redirect) {
        const event = {
          url: input.redirect,
          isMainFrame: true,
          preventDefault: () => {
            this.redirectPrevented = true;
          },
        };
        this.webContents.emit("will-redirect", event);
        if (this.redirectPrevented) throw new Error("synthetic blocked redirect");
        url = input.redirect;
      }
      if (input.loadFailure) throw new Error("synthetic load failure");
      this.url = url;
      this.webContents.mainFrame.url = url;
      this.webContents.emit("did-finish-load");
      this.emit("ready-to-show");
    }
  }
  vi.doMock("electron", () => ({
    app,
    BrowserWindow: FakeWindow,
    ipcMain: {
      handle: (
        channel: string,
        handler: typeof handlers extends Map<string, infer T> ? T : never,
      ) => handlers.set(channel, handler),
      removeHandler: (channel: string) => handlers.delete(channel),
    },
    net: { fetch },
    shell: { openExternal: vi.fn() },
    safeStorage: {
      isEncryptionAvailable: () => input.storageAvailable ?? true,
      getSelectedStorageBackend: () => "gnome_libsecret",
      encryptString: (text: string) =>
        Buffer.from(`synthetic:${Buffer.from(text).toString("base64")}`),
      decryptString: (bytes: Buffer) =>
        Buffer.from(bytes.toString().slice("synthetic:".length), "base64").toString(),
    },
  }));
  vi.doMock("./activation.ts", async () => {
    const actual = await vi.importActual<typeof import("./activation.ts")>("./activation.ts");
    return {
      ...actual,
      readThreadAppActivation: () =>
        actual.readThreadAppActivation(
          NodeStream.Readable.from([input.activationText ?? JSON.stringify(activation)]),
        ),
      ThreadAppReadyChannel: class extends actual.ThreadAppReadyChannel {
        constructor() {
          super(3, {
            write: ((fd: number, bytes: Uint8Array, offset: number, length: number) => {
              expect(fd).toBe(3);
              readyBytes.push(Buffer.from(bytes).subarray(offset, offset + length));
              return length;
            }) as typeof NodeFS.writeSync,
            close: closeReady,
          });
        }
      },
    };
  });
  await (
    await import("./main.ts")
  ).threadStartup;
  return { app, windows, readyBytes, closeReady, fetch, handlers, calls, headersListeners };
}

describe("T3 Thread main composition", () => {
  it("owns one protected window and profile per process and isolates close and crash lifetimes", async () => {
    const root = fixtureRoot();
    const first = await launch({ root });
    const second = await launch({ root });
    for (const process of [first, second]) {
      expect(process.windows).toHaveLength(1);
      expect(process.app.requestSingleInstanceLock).not.toHaveBeenCalled();
      expect(process.app.enableSandbox).toHaveBeenCalledOnce();
      expect(process.calls.indexOf("path:userData")).toBeLessThan(process.calls.indexOf("ready"));
      expect(process.windows[0]?.options.webPreferences).toMatchObject({
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      });
      expect(process.windows[0]?.url).toBe(`${origin}/?t3-thread-client=1`);
      expect(process.windows[0]?.webContents.send).toHaveBeenCalledWith(
        THREAD_CLIENT_ACTIVATION_CHANNEL,
        activation,
      );
      expect(JSON.parse(Buffer.concat(process.readyBytes).toString())).toEqual({
        contractVersion: 1,
        launchId: activation.launchId,
        ready: true,
      });
      expect(process.closeReady).toHaveBeenCalledExactlyOnceWith(3);
      expect(process.app.exit).not.toHaveBeenCalled();
    }
    const profiles = NodeFS.readdirSync(NodePath.join(root, "profiles"));
    expect(profiles).toHaveLength(2);
    first.windows[0]?.destroy();
    expect(first.handlers.size).toBe(0);
    expect(first.app.quit).toHaveBeenCalledOnce();
    expect(second.windows[0]?.destroyed).toBe(false);
    expect(second.app.quit).not.toHaveBeenCalled();
    second.windows[0]?.webContents.emit("render-process-gone", {}, { reason: "crashed" });
    expect(second.app.quit).toHaveBeenCalledOnce();
  });

  it("accepts exact-origin initial redirects and replays the same activation after reload", async () => {
    const process = await launch({ root: fixtureRoot(), redirect: `${origin}/login` });
    const window = process.windows[0]!;
    expect(process.app.exit).not.toHaveBeenCalled();
    expect(window.url).toBe(`${origin}/login`);
    expect(process.readyBytes.length).toBeGreaterThan(0);
    window.webContents.send.mockClear();
    window.webContents.emit("did-finish-load");
    expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith(
      THREAD_CLIENT_ACTIVATION_CHANNEL,
      activation,
    );
    window.url = "https://foreign.example.test/";
    window.webContents.send.mockClear();
    window.webContents.emit("did-finish-load");
    expect(window.webContents.send).not.toHaveBeenCalled();
  });

  it("keeps pending replay after invalid receipts and stops only for the admitted launch completion", async () => {
    const process = await launch({ root: fixtureRoot() });
    const window = process.windows[0]!;
    const complete = process.handlers.get(THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL)!;
    const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
    const completion = { contractVersion: 1, launchId: activation.launchId };
    const assertPendingReplay = () => {
      window.webContents.send.mockClear();
      window.webContents.emit("did-finish-load");
      expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith(
        THREAD_CLIENT_ACTIVATION_CHANNEL,
        activation,
      );
    };
    for (const invalidSender of [
      { ...sender, sender: {} },
      { ...sender, senderFrame: null },
      { ...sender, senderFrame: { url: window.url } },
    ]) {
      expect(await complete(invalidSender, completion)).toBe(false);
      assertPendingReplay();
    }
    for (const url of ["https://foreign.example.test/", "https://user:pass@host.example.test/"]) {
      window.webContents.mainFrame.url = url;
      expect(await complete(sender, completion)).toBe(false);
      window.webContents.mainFrame.url = window.url;
      assertPendingReplay();
    }
    for (const invalid of [
      null,
      {},
      [],
      { ...completion, contractVersion: 2 },
      { ...completion, launchId: "bad" },
      { ...completion, launchId: "11234567-89ab-4def-8abc-0123456789ab" },
      { ...completion, draft: activation.draft },
      { ...completion, credential: "synthetic-secret" },
      { ...completion, url: "https://foreign.example.test/" },
    ]) {
      expect(await complete(sender, invalid)).toBe(false);
      assertPendingReplay();
    }
    expect(await complete(sender, completion)).toBe(true);
    expect(await complete(sender, completion)).toBe(true);
    expect(
      await complete(sender, { ...completion, launchId: "11234567-89ab-4def-8abc-0123456789ab" }),
    ).toBe(false);
    window.webContents.send.mockClear();
    window.webContents.emit("did-finish-load");
    window.webContents.emit("did-finish-load");
    expect(window.webContents.send).not.toHaveBeenCalled();
    window.destroy();
    expect(process.handlers.has(THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL)).toBe(false);
    expect(await complete(sender, completion)).toBe(false);
  });

  it("keeps completion isolated from another process with the same launch identity", async () => {
    const root = fixtureRoot();
    const first = await launch({ root });
    const second = await launch({ root });
    const window = first.windows[0]!;
    expect(
      await first.handlers.get(THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL)!(
        { sender: window.webContents, senderFrame: window.webContents.mainFrame },
        { contractVersion: 1, launchId: activation.launchId },
      ),
    ).toBe(true);
    const otherWindow = second.windows[0]!;
    otherWindow.webContents.send.mockClear();
    otherWindow.webContents.emit("did-finish-load");
    expect(otherWindow.webContents.send).toHaveBeenCalledExactlyOnceWith(
      THREAD_CLIENT_ACTIVATION_CHANNEL,
      activation,
    );
  });

  it.each([
    { activationText: "malformed" },
    { serverUrl: "https://user:pass@host.example.test" },
    { storageAvailable: false },
    { loadFailure: true },
    { redirect: "https://foreign.example.test/" },
    { redirect: "https://user:pass@host.example.test/" },
  ])("withdraws readiness and cleans up a startup failure: %j", async (failure) => {
    const process = await launch({ root: fixtureRoot(), ...failure });
    expect(process.readyBytes).toEqual([]);
    expect(process.closeReady).toHaveBeenCalledExactlyOnceWith(3);
    expect(process.app.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(process.handlers.size).toBe(0);
    for (const window of process.windows) expect(window.destroyed).toBe(true);
  });

  it("admits only its exact main frame, exposes a result and injects protected enrollment at the real request hook", async () => {
    const root = fixtureRoot();
    const process = await launch({ root });
    const window = process.windows[0]!;
    const submit = process.handlers.get(THREAD_ENROLLMENT_SUBMISSION_CHANNEL)!;
    const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
    for (const invalid of [
      { ...sender, sender: {} },
      { ...sender, senderFrame: { url: window.url } },
    ])
      expect(await submit(invalid, "synthetic-pairing")).toEqual({ status: "rejected" });
    window.webContents.mainFrame.url = "https://foreign.example.test/";
    expect(await submit(sender, "synthetic-pairing")).toEqual({ status: "rejected" });
    expect(process.fetch).not.toHaveBeenCalled();
    window.webContents.mainFrame.url = window.url;
    expect(await submit(sender, "synthetic-pairing")).toEqual({ status: "accepted" });
    const headers = vi.fn();
    process.headersListeners[0]!(
      { url: `${origin}/api/auth/websocket-ticket`, requestHeaders: {} },
      headers,
    );
    expect(headers).toHaveBeenLastCalledWith({
      requestHeaders: { Authorization: "Bearer synthetic-main-bearer" },
    });
    process.headersListeners[0]!(
      {
        url: "https://foreign.example.test/api/auth/websocket-ticket",
        requestHeaders: { Authorization: "Bearer synthetic-main-bearer" },
      },
      headers,
    );
    expect(headers).toHaveBeenLastCalledWith({ requestHeaders: {} });
    expect(window.webContents.session.webRequest.onBeforeRequest).not.toHaveBeenCalled();
    const later = await launch({ root });
    later.headersListeners[0]!({ url: `${origin}/api/auth/session`, requestHeaders: {} }, headers);
    expect(headers).toHaveBeenLastCalledWith({
      requestHeaders: { Authorization: "Bearer synthetic-main-bearer" },
    });
    expect(later.fetch).not.toHaveBeenCalled();
  });
});
