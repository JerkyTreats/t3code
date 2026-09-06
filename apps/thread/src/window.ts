// @effect-diagnostics nodeBuiltinImport:off -- Electron main owns its independent profile path.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type * as Electron from "electron";

export const THREAD_WINDOW_WIDTH = 410;
export const THREAD_WINDOW_MIN_WIDTH = 360;

export function resolveThreadProfileRoot(input: {
  readonly appDataPath: string;
  readonly configuredPath?: string;
}): string {
  const configured = input.configuredPath?.trim();
  const path = configured || NodePath.join(input.appDataPath, "t3code-thread-profiles");
  if (!NodePath.isAbsolute(path)) {
    throw new Error("T3 Thread profile root must be absolute.");
  }
  return NodePath.resolve(path);
}

export function allocateThreadProfilePath(input: {
  readonly profileRoot: string;
  readonly launchId: string;
}): string {
  NodeFS.mkdirSync(input.profileRoot, { recursive: true, mode: 0o700 });
  // mkdtemp is the ownership boundary: repeated launch ids must still never share Chromium state.
  const profilePath = NodeFS.mkdtempSync(
    NodePath.join(input.profileRoot, `thread-${input.launchId}-`),
  );
  NodeFS.chmodSync(profilePath, 0o700);
  return profilePath;
}

export function resolveThreadApplicationUrl(configuredUrl?: string): string {
  const configured = configuredUrl?.trim();
  if (!configured) {
    throw new Error("T3 Thread server URL is required.");
  }
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("T3 Thread server URL must use HTTPS without credentials.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("t3-thread-client", "1");
  return url.href;
}

export function threadWindowOptions(input: {
  readonly preloadPath: string;
}): Electron.BrowserWindowConstructorOptions {
  return {
    width: THREAD_WINDOW_WIDTH,
    minWidth: THREAD_WINDOW_MIN_WIDTH,
    height: 760,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: "T3 Thread",
    backgroundColor: "#111310",
    webPreferences: {
      preload: input.preloadPath,
      backgroundThrottling: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      devTools: false,
      disableDialogs: true,
      navigateOnDragDrop: false,
      plugins: false,
    },
  };
}

export function installThreadWindowGuards(
  window: Electron.BrowserWindow,
  input: {
    readonly applicationOrigin: string;
    readonly openExternal: (url: string) => void;
  },
): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (
        (target.protocol === "https:" || target.protocol === "http:") &&
        target.username === "" &&
        target.password === ""
      )
        input.openExternal(url);
    } catch {
      // Invalid external URLs fail closed.
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => {
    if (!isThreadApplicationTarget(event.url, input.applicationOrigin)) event.preventDefault();
  });
  window.webContents.on("will-frame-navigate", (event) => {
    if (event.isMainFrame && !isThreadApplicationTarget(event.url, input.applicationOrigin)) {
      event.preventDefault();
    }
  });
  // will-navigate does not cover loadURL redirects. Install this before the first
  // load so preload never anchors enrollment to a redirected foreign document.
  window.webContents.on("will-redirect", (event) => {
    if (event.isMainFrame && !isThreadApplicationTarget(event.url, input.applicationOrigin)) {
      event.preventDefault();
    }
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.session.on("will-download", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
}

export function isThreadApplicationTarget(url: string, applicationOrigin: string): boolean {
  try {
    const target = new URL(url);
    return (
      target.protocol === "https:" &&
      target.origin === applicationOrigin &&
      target.username === "" &&
      target.password === ""
    );
  } catch {
    return false;
  }
}
