// @effect-diagnostics nodeBuiltinImport:off -- Detached external handlers need Node's spawn event; waiting for process exit can wait until the browser closes.
import { MAC_PERMISSION_SETTINGS_URLS } from "../permissions/MacPermission.ts";
import {
  REMOTE_CAPABLE_EDITOR_IDS,
  remoteSchemeForEditor,
  type SystemSettingsPane,
} from "@t3tools/contracts";
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as Electron from "electron";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { isStandaloneDesktop } from "../fork/StandaloneDesktopPolicy.ts";

// Remote open-in-editor deep links (`vscode://vscode-remote/ssh-remote+…`,
// `zed://ssh/<host>/<path>`) must reach the OS handler; every other non-web
// scheme stays blocked.
const SAFE_WEB_PROTOCOLS = new Set(["http:", "https:"]);
const REMOTE_EDITOR_PROTOCOLS = new Set(
  REMOTE_CAPABLE_EDITOR_IDS.flatMap((id) => {
    const scheme = remoteSchemeForEditor(id);
    return scheme === undefined ? [] : [`${scheme}:`];
  }),
);

// Zed's host sits in the first path segment, so it needs its own userinfo ban.
const ZED_SSH_PATHNAME = /^\/[^/@:]+\/.*$/;

const isRemoteEditorUrl = (url: URL) =>
  REMOTE_EDITOR_PROTOCOLS.has(url.protocol) &&
  url.username.length === 0 &&
  url.password.length === 0 &&
  (url.protocol === "zed:"
    ? url.host === "ssh" && ZED_SSH_PATHNAME.test(url.pathname)
    : url.host === "vscode-remote" &&
      url.pathname.startsWith("/ssh-remote+") &&
      url.pathname.length > "/ssh-remote+".length);

export function parseSafeExternalUrl(rawUrl: unknown): Option.Option<string> {
  if (typeof rawUrl !== "string") {
    return Option.none();
  }

  try {
    const url = new URL(rawUrl);
    return SAFE_WEB_PROTOCOLS.has(url.protocol) || isRemoteEditorUrl(url)
      ? Option.some(url.href)
      : Option.none();
  } catch {
    return Option.none();
  }
}

export class ElectronShell extends Context.Service<
  ElectronShell,
  {
    readonly openExternal: (rawUrl: unknown) => Effect.Effect<boolean>;
    /** Opens a known System Settings pane by identifier, not by URL. */
    readonly openSystemSettings: (pane: SystemSettingsPane) => Effect.Effect<boolean>;
    readonly copyText: (text: string) => Effect.Effect<void>;
  }
>()("@t3tools/desktop/electron/ElectronShell") {}

// The managed Linux launcher points XDG_CONFIG_HOME at T3 Code's private
// profile, which Electron's `xdg-open` child inherits. That hides the session's
// default-browser choice and starts browsers and editors in stray profiles below
// ours, so external handlers launch with the session config home instead.
const openWithSessionConfigHome = (url: string, xdgConfigHome: string) =>
  Effect.callback<boolean>((resume) => {
    const child = NodeChildProcess.spawn("xdg-open", [url], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, XDG_CONFIG_HOME: xdgConfigHome },
    });
    child.once("error", () => resume(Effect.succeed(false)));
    child.once("spawn", () => {
      child.unref();
      resume(Effect.succeed(true));
    });
  });

/**
 * Resolves the config home external handlers should see. The standalone
 * policy only admits a profile directory named directly below the session
 * config home, so its parent is the session value.
 */
export function resolveSessionXdgConfigHome(environment: {
  readonly platform: NodeJS.Platform;
  readonly appDataDirectory: string;
  readonly standaloneServerUrl?: Option.Option<URL>;
}): Option.Option<string> {
  return environment.platform === "linux" && isStandaloneDesktop(environment)
    ? Option.some(NodePath.dirname(environment.appDataDirectory))
    : Option.none();
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = (sessionXdgConfigHome: Option.Option<string>) =>
  ElectronShell.of({
    openExternal: (rawUrl) =>
      Option.match(parseSafeExternalUrl(rawUrl), {
        onNone: () => Effect.succeed(false),
        onSome: (externalUrl) =>
          Option.match(sessionXdgConfigHome, {
            onSome: (xdgConfigHome) => openWithSessionConfigHome(externalUrl, xdgConfigHome),
            onNone: () =>
              Effect.promise(() =>
                Electron.shell.openExternal(externalUrl).then(
                  () => true,
                  () => false,
                ),
              ),
          }),
      }),
    openSystemSettings: (pane) =>
      Effect.promise(() =>
        Electron.shell.openExternal(MAC_PERMISSION_SETTINGS_URLS[pane]).then(
          () => true,
          () => false,
        ),
      ),
    copyText: (text) =>
      Effect.promise(() => Electron.clipboard.writeText(text).catch(() => undefined)),
  });

export const layer = Layer.effect(
  ElectronShell,
  Effect.map(DesktopEnvironment.DesktopEnvironment, (environment) =>
    make(resolveSessionXdgConfigHome(environment)),
  ),
);
