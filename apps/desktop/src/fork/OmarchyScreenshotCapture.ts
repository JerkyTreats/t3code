// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off
// @effect-diagnostics globalTimers:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import {
  DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES,
  type DesktopScreenshotCapture,
} from "@t3tools/contracts";
import { clipboard } from "electron";

import {
  buildDesktopScreenshotCapture,
  inspectDesktopScreenshotPng,
  type DesktopScreenshotPngInspection,
} from "./DesktopScreenshotPng.ts";

const DEFAULT_CAPTURE_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 25;
const DEFAULT_CLOSE_SETTLE_MS = 500;
const DEFAULT_TERMINATION_GRACE_MS = 250;
const DEFAULT_FORCE_KILL_TIMEOUT_MS = 1_000;
const CANCELLATION_EXIT_CODE = 1;
const OUTPUT_TEXT_MAX_CHARS = 16 * 1024;

type ScreenshotFileStat = Readonly<{
  filePath: string;
  mtimeMs: number;
  sizeBytes: number;
}>;

type ArtifactResult =
  | Readonly<{ status: "ready"; capture: DesktopScreenshotCapture }>
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "invalid"; reason: string }>;

export type OmarchyScreenshotCaptureOptions = Readonly<{
  timeoutMs?: number;
  pollIntervalMs?: number;
  closeSettleMs?: number;
  terminationGraceMs?: number;
  forceKillTimeoutMs?: number;
}>;

export class OmarchyScreenshotTerminationError extends Error {
  readonly _tag = "OmarchyScreenshotTerminationError";

  constructor() {
    super("Omarchy screenshot process did not exit after bounded termination.");
    this.name = "OmarchyScreenshotTerminationError";
  }
}

function screenshotFileName(): string {
  return `screenshot-${new Date().toISOString().replace(/[:.]/gu, "-")}.png`;
}

function expandHomePath(value: string, homeDirectory: string): string {
  return value.replace(/^~(?=\/|$)/u, homeDirectory).replace(/\$HOME|\$\{HOME\}/gu, homeDirectory);
}

async function resolveOmarchyScreenshotOutputDirectory(): Promise<string> {
  const homeDirectory = NodeOS.homedir();
  const explicitDirectory = NodeProcess.env.OMARCHY_SCREENSHOT_DIR?.trim();
  if (explicitDirectory) {
    return NodePath.resolve(expandHomePath(explicitDirectory, homeDirectory));
  }

  const environmentPicturesDirectory = NodeProcess.env.XDG_PICTURES_DIR?.trim();
  if (environmentPicturesDirectory) {
    return NodePath.resolve(expandHomePath(environmentPicturesDirectory, homeDirectory));
  }

  try {
    const userDirectories = await NodeFSP.readFile(
      NodePath.join(homeDirectory, ".config", "user-dirs.dirs"),
      "utf8",
    );
    const match = /^XDG_PICTURES_DIR=(?:"([^"]+)"|'([^']+)'|([^\n#]+))/mu.exec(userDirectories);
    const configuredDirectory = match?.[1] ?? match?.[2] ?? match?.[3];
    if (configuredDirectory) {
      return NodePath.resolve(expandHomePath(configuredDirectory.trim(), homeDirectory));
    }
  } catch {
    // The standard Pictures directory is the bounded fallback.
  }

  return NodePath.join(homeDirectory, "Pictures");
}

async function listScreenshotFiles(
  directoryPath: string,
): Promise<ReadonlyArray<ScreenshotFileStat>> {
  try {
    const entries = await NodeFSP.readdir(directoryPath, { withFileTypes: true });
    const stats = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
        .map(async (entry) => {
          const filePath = NodePath.join(directoryPath, entry.name);
          const stat = await NodeFSP.stat(filePath);
          return { filePath, mtimeMs: stat.mtimeMs, sizeBytes: stat.size };
        }),
    );
    return stats.toSorted((left, right) => right.mtimeMs - left.mtimeMs);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function changedScreenshotFile(
  before: ReadonlyArray<ScreenshotFileStat>,
  after: ReadonlyArray<ScreenshotFileStat>,
): ScreenshotFileStat | null {
  const prior = new Map(before.map((entry) => [entry.filePath, entry] as const));
  return (
    after.find((entry) => {
      const previous = prior.get(entry.filePath);
      return (
        !previous || previous.mtimeMs !== entry.mtimeMs || previous.sizeBytes !== entry.sizeBytes
      );
    }) ?? null
  );
}

function readClipboardPng(): Uint8Array | null {
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) return null;
    const data = image.toPNG();
    return data.byteLength === 0 ? null : new Uint8Array(data);
  } catch {
    return null;
  }
}

function equalBytes(left: Uint8Array | null, right: Uint8Array | null): boolean {
  if (left === null || right === null) return left === right;
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

function artifactResult(
  inspection: DesktopScreenshotPngInspection,
  fileName: string,
): ArtifactResult {
  if (inspection.status !== "ready") return inspection;
  const capture = buildDesktopScreenshotCapture(inspection.data, fileName);
  return capture
    ? { status: "ready", capture }
    : { status: "invalid", reason: "PNG capture contract validation failed." };
}

async function readChangedArtifact(
  outputDirectory: string,
  filesBeforeCapture: ReadonlyArray<ScreenshotFileStat>,
  clipboardBeforeCapture: Uint8Array | null,
): Promise<ArtifactResult> {
  const changedFile = changedScreenshotFile(
    filesBeforeCapture,
    await listScreenshotFiles(outputDirectory),
  );
  if (changedFile) {
    if (changedFile.sizeBytes > DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES) {
      return { status: "invalid", reason: "Captured PNG exceeds the byte limit." };
    }
    const data = await NodeFSP.readFile(changedFile.filePath);
    const afterRead = await NodeFSP.stat(changedFile.filePath).catch(() => null);
    if (
      !afterRead ||
      afterRead.size !== changedFile.sizeBytes ||
      afterRead.mtimeMs !== changedFile.mtimeMs
    ) {
      return { status: "pending" };
    }
    return artifactResult(
      inspectDesktopScreenshotPng(data),
      NodePath.basename(changedFile.filePath) || screenshotFileName(),
    );
  }

  const clipboardAfterCapture = readClipboardPng();
  if (clipboardAfterCapture && !equalBytes(clipboardAfterCapture, clipboardBeforeCapture)) {
    return artifactResult(inspectDesktopScreenshotPng(clipboardAfterCapture), screenshotFileName());
  }

  return { status: "pending" };
}

function cancellationMessage(stderr: string): boolean {
  const normalized = stderr.trim().toLowerCase();
  return normalized.length === 0 || normalized.includes("cancel");
}

function appendBounded(current: string, chunk: unknown): string {
  return `${current}${String(chunk)}`.slice(-OUTPUT_TEXT_MAX_CHARS);
}

export async function captureOmarchyScreenshot(
  command: string,
  options: OmarchyScreenshotCaptureOptions = {},
): Promise<DesktopScreenshotCapture | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const closeSettleMs = options.closeSettleMs ?? DEFAULT_CLOSE_SETTLE_MS;
  const terminationGraceMs = options.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS;
  const forceKillTimeoutMs = options.forceKillTimeoutMs ?? DEFAULT_FORCE_KILL_TIMEOUT_MS;
  const outputDirectory = await resolveOmarchyScreenshotOutputDirectory();
  const filesBeforeCapture = await listScreenshotFiles(outputDirectory);
  const clipboardBeforeCapture = readClipboardPng();
  const child = NodeChildProcess.spawn(command, [], {
    env: { ...NodeProcess.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let activeCheck: Promise<void> | null = null;
    let checkAgain = false;
    let childTerminated = false;
    let terminating = false;
    let lastInvalidReason: string | null = null;
    let stdout = "";
    let stderr = "";
    let directoryWatcher: NodeFS.FSWatcher | null = null;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    let terminationTimer: ReturnType<typeof setTimeout> | null = null;
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
    let forceKillRequested = false;
    let pendingSettlement:
      | Readonly<{ status: "resolve"; capture: DesktopScreenshotCapture | null }>
      | Readonly<{ status: "reject"; error: unknown }>
      | null = null;

    const cleanup = (): void => {
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = null;
      if (terminationTimer) clearTimeout(terminationTimer);
      terminationTimer = null;
      if (forceKillTimer) clearTimeout(forceKillTimer);
      forceKillTimer = null;
      try {
        directoryWatcher?.close();
      } catch {
        // A watcher may already be closed by the platform.
      }
      directoryWatcher = null;
      child.removeListener("error", onChildError);
      child.removeListener("exit", onChildExit);
      child.removeListener("close", onChildClose);
      child.stdout?.removeListener("data", onStdoutData);
      child.stderr?.removeListener("data", onStderrData);
      child.stdout?.destroy();
      child.stderr?.destroy();
      if (!childTerminated) child.unref();
    };

    const settlePending = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      const settlement = pendingSettlement;
      pendingSettlement = null;
      if (settlement?.status === "reject") {
        reject(settlement.error);
      } else {
        resolve(settlement?.capture ?? null);
      }
    };

    const observeTerminatedChild = (): boolean => {
      if (childTerminated) return true;
      if (child.exitCode === null && child.signalCode === null) return false;
      childTerminated = true;
      settlePending();
      return true;
    };

    const requestSignal = (signal: NodeJS.Signals): boolean => {
      try {
        return child.kill(signal);
      } catch {
        return false;
      }
    };

    const rejectUnterminatedChild = (): void => {
      if (observeTerminatedChild() || settled) return;
      pendingSettlement = {
        status: "reject",
        error: new OmarchyScreenshotTerminationError(),
      };
      settlePending();
    };

    const forceTerminate = (): void => {
      if (observeTerminatedChild() || settled || forceKillRequested) return;
      forceKillRequested = true;
      if (terminationTimer) clearTimeout(terminationTimer);
      terminationTimer = null;
      requestSignal("SIGKILL");
      if (observeTerminatedChild() || settled) return;
      forceKillTimer = setTimeout(rejectUnterminatedChild, forceKillTimeoutMs);
    };

    const terminateThenSettle = (
      settlement:
        | Readonly<{ status: "resolve"; capture: DesktopScreenshotCapture | null }>
        | Readonly<{ status: "reject"; error: unknown }>,
    ): void => {
      if (settled || pendingSettlement) return;
      pendingSettlement = settlement;
      if (observeTerminatedChild()) {
        settlePending();
        return;
      }
      terminating = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = null;
      // A validated artifact does not transfer ownership until this child is
      // confirmed dead. This keeps every successful and cancelled capture
      // within the lifetime of the native adapter it started.
      if (requestSignal("SIGTERM")) {
        if (observeTerminatedChild() || settled) return;
        terminationTimer = setTimeout(forceTerminate, terminationGraceMs);
      } else {
        forceTerminate();
      }
    };

    const finish = (capture: DesktopScreenshotCapture | null): void => {
      terminateThenSettle({ status: "resolve", capture });
    };

    const fail = (error: unknown): void => {
      terminateThenSettle({ status: "reject", error });
    };

    const checkForArtifact = (): Promise<void> => {
      if (settled || terminating) return Promise.resolve();
      if (activeCheck) {
        checkAgain = true;
        return activeCheck.then(() => {
          if (!checkAgain || settled) return;
          checkAgain = false;
          return checkForArtifact();
        });
      }
      activeCheck = (async () => {
        try {
          const result = await readChangedArtifact(
            outputDirectory,
            filesBeforeCapture,
            clipboardBeforeCapture,
          );
          if (result.status === "ready") {
            finish(result.capture);
          } else if (result.status === "invalid") {
            lastInvalidReason = result.reason;
          }
        } catch (error) {
          if (childTerminated) fail(error);
        } finally {
          activeCheck = null;
        }
      })();
      return activeCheck;
    };

    const finalizeClosedCapture = (): void => {
      closeTimer = setTimeout(() => {
        closeTimer = null;
        void checkForArtifact().finally(() => {
          if (settled) return;
          fail(
            new Error(
              lastInvalidReason
                ? `Omarchy produced an invalid PNG: ${lastInvalidReason}`
                : "Omarchy completed without producing a changed PNG artifact.",
            ),
          );
        });
      }, closeSettleMs);
    };

    function onStdoutData(chunk: unknown): void {
      stdout = appendBounded(stdout, chunk);
    }

    function onStderrData(chunk: unknown): void {
      stderr = appendBounded(stderr, chunk);
    }

    function handleChildTermination(code: number | null, signal: NodeJS.Signals | null): void {
      if (childTerminated) return;
      childTerminated = true;
      if (pendingSettlement) {
        settlePending();
        return;
      }
      if (code !== 0) {
        if (code === CANCELLATION_EXIT_CODE && cancellationMessage(stderr)) {
          finish(null);
          return;
        }
        const detail = stderr.trim() || stdout.trim() || `signal ${signal ?? "unknown"}`;
        fail(
          new Error(
            `${NodePath.basename(command)} failed with code ${code ?? "unknown"}: ${detail}`,
          ),
        );
        return;
      }
      void checkForArtifact();
      finalizeClosedCapture();
    }

    function onChildError(error: Error): void {
      if (terminating) return;
      childTerminated = child.pid === undefined;
      if (childTerminated) {
        pendingSettlement = { status: "reject", error };
        settlePending();
      } else {
        terminateThenSettle({ status: "reject", error });
      }
    }

    function onChildExit(code: number | null, signal: NodeJS.Signals | null): void {
      handleChildTermination(code, signal);
    }

    function onChildClose(code: number | null, signal: NodeJS.Signals | null): void {
      handleChildTermination(code, signal);
    }

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", onStdoutData);
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", onStderrData);
    child.on("error", onChildError);
    // `exit` confirms process death without waiting for inherited stdio pipes.
    // `close` remains a defensive confirmation for unusual ChildProcess fakes
    // and platform behavior where only the terminal lifecycle event arrives.
    child.once("exit", onChildExit);
    child.once("close", onChildClose);

    try {
      directoryWatcher = NodeFS.watch(outputDirectory, { persistent: false }, () => {
        void checkForArtifact();
      });
      directoryWatcher.on("error", () => {
        try {
          directoryWatcher?.close();
        } catch {
          // Polling remains active after a watcher error.
        }
        directoryWatcher = null;
      });
    } catch {
      directoryWatcher = null;
    }

    const pollTimer = setInterval(() => {
      void checkForArtifact();
    }, pollIntervalMs);
    const timeoutTimer = setTimeout(() => {
      fail(new Error(`Omarchy screenshot capture timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    void checkForArtifact();
  });
}
