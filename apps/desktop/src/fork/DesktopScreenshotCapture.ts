// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import type { DesktopScreenshotCapture } from "@t3tools/contracts";

import {
  defaultDesktopScreenshotCaptureHost,
  listDesktopScreenshotCaptureAdapters,
  type DesktopScreenshotCaptureAdapter,
  type DesktopScreenshotCaptureHost,
} from "./DesktopScreenshotCaptureAvailability.ts";
import {
  buildDesktopScreenshotCapture,
  inspectDesktopScreenshotPng,
} from "./DesktopScreenshotPng.ts";
import {
  captureOmarchyScreenshot,
  OmarchyScreenshotTerminationError,
} from "./OmarchyScreenshotCapture.ts";

const CAPTURE_COMMAND_TIMEOUT_MS = 30_000;
const TOOL_FAILURE_SEPARATOR = " | ";

export type DesktopScreenshotCommandResult = Readonly<{
  stdout: string;
  stderr: string;
}>;

export interface DesktopScreenshotCaptureRuntime {
  readonly host: DesktopScreenshotCaptureHost;
  readonly makeTempDirectory: () => Promise<string>;
  readonly readFile: (filePath: string) => Promise<Uint8Array>;
  readonly removeFile: (filePath: string) => Promise<void>;
  readonly removeDirectory: (directoryPath: string) => Promise<void>;
  readonly execute: (
    command: string,
    args: ReadonlyArray<string>,
  ) => Promise<DesktopScreenshotCommandResult>;
  readonly captureOmarchy: (command: string) => Promise<DesktopScreenshotCapture | null>;
  readonly now: () => Date;
}

function executeCaptureCommand(
  command: string,
  args: ReadonlyArray<string>,
): Promise<DesktopScreenshotCommandResult> {
  return new Promise((resolve, reject) => {
    NodeChildProcess.execFile(
      command,
      [...args],
      {
        encoding: "utf8",
        env: { ...NodeProcess.env },
        timeout: CAPTURE_COMMAND_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function defaultRuntime(): DesktopScreenshotCaptureRuntime {
  return {
    host: defaultDesktopScreenshotCaptureHost(),
    makeTempDirectory: () => NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-screenshot-")),
    readFile: async (filePath) => new Uint8Array(await NodeFSP.readFile(filePath)),
    removeFile: async (filePath) => {
      await NodeFSP.rm(filePath, { force: true });
    },
    removeDirectory: async (directoryPath) => {
      await NodeFSP.rm(directoryPath, { recursive: true, force: true });
    },
    execute: executeCaptureCommand,
    captureOmarchy: captureOmarchyScreenshot,
    now: () => new Date(),
  };
}

function errorExitCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

function errorStderr(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const stderr = (error as { stderr?: unknown }).stderr;
  return typeof stderr === "string" ? stderr.trim() : "";
}

function isUserCancellation(error: unknown): boolean {
  if (errorExitCode(error) !== 1) return false;
  const stderr = errorStderr(error).toLowerCase();
  return stderr.length === 0 || stderr.includes("cancel");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function adapterName(adapter: DesktopScreenshotCaptureAdapter): string {
  return adapter.kind === "grim-slurp" ? "grim plus slurp" : adapter.kind;
}

async function captureAdapterToFile(
  adapter: Exclude<DesktopScreenshotCaptureAdapter, { kind: "omarchy" }>,
  filePath: string,
  execute: DesktopScreenshotCaptureRuntime["execute"],
): Promise<"captured" | "cancelled"> {
  try {
    switch (adapter.kind) {
      case "grimblast":
        await execute(adapter.command, ["--freeze", "--notify", "save", "area", filePath]);
        return "captured";
      case "hyprshot":
        await execute(adapter.command, ["-m", "region", "-f", filePath]);
        return "captured";
      case "grim-slurp": {
        const geometry = (await execute(adapter.slurpCommand, [])).stdout.trim();
        if (!geometry) return "cancelled";
        await execute(adapter.grimCommand, ["-g", geometry, filePath]);
        return "captured";
      }
      case "grim":
        await execute(adapter.command, [filePath]);
        return "captured";
      case "import":
        await execute(adapter.command, ["-window", "root", filePath]);
        return "captured";
    }
  } catch (error) {
    if (isUserCancellation(error)) return "cancelled";
    throw error;
  }
}

function captureFileName(now: Date): string {
  return `screenshot-${now.toISOString().replace(/[:.]/gu, "-")}.png`;
}

export async function captureDesktopScreenshot(
  runtime: DesktopScreenshotCaptureRuntime = defaultRuntime(),
): Promise<DesktopScreenshotCapture | null> {
  if (runtime.host.platform !== "linux") {
    throw new Error("Screenshot capture is supported on Linux desktop only.");
  }

  const adapters = listDesktopScreenshotCaptureAdapters(runtime.host);
  if (adapters.length === 0) {
    throw new Error("No supported executable screenshot adapter is available.");
  }

  const tempDirectory = await runtime.makeTempDirectory();
  const tempFilePath = NodePath.join(tempDirectory, "capture.png");
  const failures: string[] = [];
  try {
    for (const adapter of adapters) {
      try {
        if (adapter.kind === "omarchy") {
          const capture = await runtime.captureOmarchy(adapter.command);
          if (capture === null) return null;
          return capture;
        }

        await runtime.removeFile(tempFilePath);
        const outcome = await captureAdapterToFile(adapter, tempFilePath, runtime.execute);
        if (outcome === "cancelled") return null;

        const data = await runtime.readFile(tempFilePath);
        const inspection = inspectDesktopScreenshotPng(data);
        if (inspection.status !== "ready") {
          throw new Error(
            inspection.status === "invalid"
              ? inspection.reason
              : "Screenshot adapter left an incomplete PNG.",
          );
        }
        const capture = buildDesktopScreenshotCapture(
          inspection.data,
          captureFileName(runtime.now()),
        );
        if (!capture) throw new Error("Screenshot capture contract validation failed.");
        return capture;
      } catch (error) {
        if (error instanceof OmarchyScreenshotTerminationError) throw error;
        failures.push(`${adapterName(adapter)} failed: ${errorMessage(error)}`);
      }
    }

    throw new Error(`Screenshot capture failed. ${failures.join(TOOL_FAILURE_SEPARATOR)}`);
  } finally {
    await runtime.removeDirectory(tempDirectory).catch(() => undefined);
  }
}
