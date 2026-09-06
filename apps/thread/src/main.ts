// @effect-diagnostics nodeBuiltinImport:off -- Electron main owns the independent client profile and process lifecycle.
import * as NodePath from "node:path";
import * as NodeOS from "node:os";

import { decodeThreadAppActivationCompletion } from "@t3tools/shared/threadAppActivation";
import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  safeStorage,
  shell,
  type IpcMainInvokeEvent,
} from "electron";

import { readThreadAppActivation, ThreadAppReadyChannel } from "./activation.ts";
import {
  THREAD_CLIENT_ACTIVATION_CHANNEL,
  THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL,
  THREAD_ENROLLMENT_SUBMISSION_CHANNEL,
} from "./bridge.ts";
import {
  authorizeThreadSessionRequest,
  configureThreadProtectedStorageBeforeReady,
  createThreadEnrollmentOwner,
  isThreadEnrollmentSubmissionAllowed,
  resolveThreadEnrollmentPath,
} from "./enrollment.ts";
import {
  allocateThreadProfilePath,
  installThreadWindowGuards,
  isThreadApplicationTarget,
  resolveThreadApplicationUrl,
  resolveThreadProfileRoot,
  threadWindowOptions,
} from "./window.ts";

const preloadPath = NodePath.join(__dirname, "preload.cjs");
// oxlint-disable-next-line t3code/no-global-process-runtime -- Safe storage selection must run before Electron readiness.
const hostPlatform = NodeOS.platform();

configureThreadProtectedStorageBeforeReady({
  platform: hostPlatform,
  commandLine: app.commandLine,
  env: process.env,
});

function reveal(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

async function run(): Promise<void> {
  const readyChannel = new ThreadAppReadyChannel();
  let window: BrowserWindow | undefined;
  try {
    const activation = await readThreadAppActivation();
    const applicationUrl = resolveThreadApplicationUrl(process.env.T3_THREAD_SERVER_URL);
    const applicationOrigin = new URL(applicationUrl).origin;
    const appDataPath = app.getPath("appData");
    const profileRoot = resolveThreadProfileRoot({
      appDataPath,
      ...(process.env.T3_THREAD_PROFILE === undefined
        ? {}
        : { configuredPath: process.env.T3_THREAD_PROFILE }),
    });
    const profilePath = allocateThreadProfilePath({ profileRoot, launchId: activation.launchId });
    app.setPath("userData", profilePath);
    app.setPath("sessionData", NodePath.join(profilePath, "session"));
    app.setPath("logs", NodePath.join(profilePath, "logs"));
    app.setPath("crashDumps", NodePath.join(profilePath, "crash-dumps"));
    app.setName("T3 Thread");

    let activationCompleted = false;
    const sendActivation = () => {
      if (activationCompleted) return;
      if (!window || window.isDestroyed() || window.webContents.isLoadingMainFrame()) return;
      if (!isThreadApplicationTarget(window.webContents.getURL(), applicationOrigin)) return;
      // Pending activation survives document reload. Completion lives in this process
      // so a later document cannot stage an already acknowledged launch again.
      window.webContents.send(THREAD_CLIENT_ACTIVATION_CHANNEL, activation);
    };

    await app.whenReady();
    // Enrollment belongs to the standalone Thread application, while each Chromium session remains private to one process.
    const enrollment = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath: resolveThreadEnrollmentPath(appDataPath, applicationOrigin),
      platform: hostPlatform,
      safeStorage,
      fetch: net.fetch,
    });
    window = new BrowserWindow(threadWindowOptions({ preloadPath }));
    window.removeMenu();
    installThreadWindowGuards(window, {
      applicationOrigin,
      openExternal: (url) => void shell.openExternal(url),
    });
    // Exact-origin filtering keeps the shared enrollment out of every unrelated request made by hosted content.
    window.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      callback({
        requestHeaders: authorizeThreadSessionRequest({
          requestUrl: details.url,
          applicationOrigin,
          bearerCredential: enrollment.bearerCredential(),
          requestHeaders: details.requestHeaders,
        }),
      });
    });
    const acceptsWindowMessage = (event: IpcMainInvokeEvent): boolean =>
      !!window &&
      !window.isDestroyed() &&
      isThreadEnrollmentSubmissionAllowed({
        senderMatchesWindow: event.sender === window.webContents,
        senderIsMainFrame: event.senderFrame === window.webContents.mainFrame,
        senderFrameUrl: event.senderFrame?.url ?? null,
        applicationOrigin,
      });
    ipcMain.handle(THREAD_ENROLLMENT_SUBMISSION_CHANNEL, async (event, value: unknown) => {
      if (typeof value !== "string" || !acceptsWindowMessage(event)) {
        return { status: "rejected" } as const;
      }
      return enrollment.submitPairingCredential(value);
    });
    ipcMain.handle(THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL, (event, value: unknown) => {
      if (!acceptsWindowMessage(event)) return false;
      try {
        const completion = decodeThreadAppActivationCompletion(value);
        if (completion.launchId !== activation.launchId) return false;
        // This receipt acknowledges staging only. It has no draft or credential authority.
        activationCompleted = true;
        return true;
      } catch {
        return false;
      }
    });
    window.on("page-title-updated", (event) => {
      event.preventDefault();
      window?.setTitle("T3 Thread");
    });
    window.on("closed", () => {
      ipcMain.removeHandler(THREAD_ENROLLMENT_SUBMISSION_CHANNEL);
      ipcMain.removeHandler(THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL);
      window = undefined;
      app.quit();
    });
    window.webContents.on("did-finish-load", sendActivation);
    window.webContents.on("render-process-gone", () => app.quit());
    window.once("ready-to-show", () => {
      if (window) reveal(window);
    });

    await window.loadURL(applicationUrl);
    if (
      !window ||
      window.isDestroyed() ||
      !isThreadApplicationTarget(window.webContents.getURL(), applicationOrigin)
    ) {
      throw new Error("T3 Thread initial document was not admitted.");
    }
    sendActivation();
    readyChannel.acknowledge({
      contractVersion: 1,
      launchId: activation.launchId,
      ready: true,
    });
  } catch (error) {
    ipcMain.removeHandler(THREAD_ENROLLMENT_SUBMISSION_CHANNEL);
    ipcMain.removeHandler(THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL);
    if (window && !window.isDestroyed()) window.destroy();
    throw error;
  } finally {
    // Malformed stdin and every pre-ready failure must release the launcher pipe.
    readyChannel.closeWithoutAck();
  }
}

app.enableSandbox();
export const threadStartup = run().catch(() => app.exit(1));
