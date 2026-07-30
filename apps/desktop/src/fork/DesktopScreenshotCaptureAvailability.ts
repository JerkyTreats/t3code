// @effect-diagnostics nodeBuiltinImport:off
import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";

export const OMARCHY_SCREENSHOT_COMMAND_NAMES = [
  "omarchy-capture-screenshot",
  "omarchy-cmd-screenshot",
] as const;

export const LINUX_SCREENSHOT_COMMAND_NAMES = ["grimblast", "hyprshot", "grim", "import"] as const;

export interface DesktopScreenshotCaptureHost {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
  readonly pathValue: string;
  readonly isExecutable: (filePath: string) => boolean;
}

function defaultIsExecutable(filePath: string): boolean {
  try {
    FS.accessSync(filePath, FS.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultHost(): DesktopScreenshotCaptureHost {
  return {
    platform: process.platform,
    homeDirectory: OS.homedir(),
    pathValue: process.env.PATH ?? "",
    isExecutable: defaultIsExecutable,
  };
}

function omarchyExecutablePaths(homeDirectory: string): ReadonlyArray<string> {
  const binDirectory = Path.join(homeDirectory, ".local", "share", "omarchy", "bin");
  return OMARCHY_SCREENSHOT_COMMAND_NAMES.map((command) => Path.join(binDirectory, command));
}

export function findExecutableOnPath(
  command: string,
  host: Pick<DesktopScreenshotCaptureHost, "pathValue" | "isExecutable"> = defaultHost(),
): string | null {
  for (const directory of host.pathValue.split(Path.delimiter)) {
    if (directory.trim().length === 0) continue;
    const candidate = Path.join(directory, command);
    if (host.isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveOmarchyScreenshotCommand(
  host: Pick<
    DesktopScreenshotCaptureHost,
    "homeDirectory" | "pathValue" | "isExecutable"
  > = defaultHost(),
): string | null {
  for (const candidate of omarchyExecutablePaths(host.homeDirectory)) {
    if (host.isExecutable(candidate)) {
      return candidate;
    }
  }
  for (const command of OMARCHY_SCREENSHOT_COMMAND_NAMES) {
    if (findExecutableOnPath(command, host)) {
      return command;
    }
  }
  return null;
}

export function isDesktopScreenshotCaptureAvailable(
  host: DesktopScreenshotCaptureHost = defaultHost(),
): boolean {
  if (host.platform !== "linux") {
    return false;
  }
  if (resolveOmarchyScreenshotCommand(host)) {
    return true;
  }
  return LINUX_SCREENSHOT_COMMAND_NAMES.some(
    (command) => findExecutableOnPath(command, host) !== null,
  );
}
