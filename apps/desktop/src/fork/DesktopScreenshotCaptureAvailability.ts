// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

export const OMARCHY_SCREENSHOT_COMMAND_NAMES = [
  "omarchy-capture-screenshot",
  "omarchy-cmd-screenshot",
] as const;

export type DesktopScreenshotCaptureAdapter =
  | Readonly<{ kind: "omarchy"; command: string }>
  | Readonly<{ kind: "grimblast"; command: string }>
  | Readonly<{ kind: "hyprshot"; command: string }>
  | Readonly<{ kind: "grim-slurp"; grimCommand: string; slurpCommand: string }>
  | Readonly<{ kind: "grim"; command: string }>
  | Readonly<{ kind: "import"; command: string }>;

export interface DesktopScreenshotCaptureHost {
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
  readonly pathValue: string;
  readonly isExecutable: (filePath: string) => boolean;
}

function defaultIsExecutable(filePath: string): boolean {
  try {
    NodeFS.accessSync(filePath, NodeFS.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function defaultDesktopScreenshotCaptureHost(): DesktopScreenshotCaptureHost {
  return {
    platform: NodeProcess.platform,
    homeDirectory: NodeOS.homedir(),
    pathValue: NodeProcess.env.PATH ?? "",
    isExecutable: defaultIsExecutable,
  };
}

export function findExecutableOnPath(
  command: string,
  host: Pick<DesktopScreenshotCaptureHost, "pathValue" | "isExecutable">,
): string | null {
  for (const entry of host.pathValue.split(NodePath.delimiter)) {
    const directory = entry.trim();
    if (!directory) continue;
    const candidate = NodePath.resolve(directory, command);
    if (host.isExecutable(candidate)) return candidate;
  }
  return null;
}

function findLocalOmarchyExecutable(
  host: Pick<DesktopScreenshotCaptureHost, "homeDirectory" | "isExecutable">,
): string | null {
  const binDirectory = NodePath.join(host.homeDirectory, ".local", "share", "omarchy", "bin");
  for (const command of OMARCHY_SCREENSHOT_COMMAND_NAMES) {
    const candidate = NodePath.join(binDirectory, command);
    if (host.isExecutable(candidate)) return candidate;
  }
  return null;
}

function findPathOmarchyExecutable(
  host: Pick<DesktopScreenshotCaptureHost, "pathValue" | "isExecutable">,
): string | null {
  for (const command of OMARCHY_SCREENSHOT_COMMAND_NAMES) {
    const candidate = findExecutableOnPath(command, host);
    if (candidate) return candidate;
  }
  return null;
}

export function listDesktopScreenshotCaptureAdapters(
  host: DesktopScreenshotCaptureHost = defaultDesktopScreenshotCaptureHost(),
): ReadonlyArray<DesktopScreenshotCaptureAdapter> {
  if (host.platform !== "linux") return [];

  const adapters: DesktopScreenshotCaptureAdapter[] = [];
  const localOmarchy = findLocalOmarchyExecutable(host);
  const pathOmarchy = localOmarchy ? null : findPathOmarchyExecutable(host);
  const omarchy = localOmarchy ?? pathOmarchy;
  if (omarchy) adapters.push({ kind: "omarchy", command: omarchy });

  const grimblast = findExecutableOnPath("grimblast", host);
  if (grimblast) adapters.push({ kind: "grimblast", command: grimblast });

  const hyprshot = findExecutableOnPath("hyprshot", host);
  if (hyprshot) adapters.push({ kind: "hyprshot", command: hyprshot });

  const grim = findExecutableOnPath("grim", host);
  const slurp = findExecutableOnPath("slurp", host);
  if (grim && slurp) {
    adapters.push({ kind: "grim-slurp", grimCommand: grim, slurpCommand: slurp });
  }
  if (grim) adapters.push({ kind: "grim", command: grim });

  const imagemagickImport = findExecutableOnPath("import", host);
  if (imagemagickImport) adapters.push({ kind: "import", command: imagemagickImport });

  return adapters;
}

export function resolveDesktopScreenshotCaptureAdapter(
  host: DesktopScreenshotCaptureHost = defaultDesktopScreenshotCaptureHost(),
): DesktopScreenshotCaptureAdapter | null {
  return listDesktopScreenshotCaptureAdapters(host)[0] ?? null;
}

export function isDesktopScreenshotCaptureAvailable(
  host: DesktopScreenshotCaptureHost = defaultDesktopScreenshotCaptureHost(),
): boolean {
  return resolveDesktopScreenshotCaptureAdapter(host) !== null;
}
