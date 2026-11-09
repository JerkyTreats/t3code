import { isHostPath } from "./path.ts";

/**
 * A right panel tab placed on a thread's canvas, stored on its Excalidraw box as
 * `customData.t3Card`. The card names the resource the tab shows, never a copy of it, and resolves
 * against the board's own environment and thread. Web renders it with the panel's own components;
 * the server describes it to agents.
 */
export type CanvasSurfaceRef =
  | {
      readonly kind: "file";
      readonly relativePath: string;
      readonly revealLine?: number;
      /** The deepest folder the breadcrumbs came up from, as in the panel's file tab. */
      readonly folderTrail?: string;
    }
  | { readonly kind: "files"; readonly folderTrail?: string }
  | { readonly kind: "preview"; readonly tabId: string; readonly url?: string }
  | {
      readonly kind: "terminal";
      /** The group's first terminal, which names the group as it names a panel tab. */
      readonly resourceId: string;
      readonly terminalIds?: ReadonlyArray<string>;
      readonly activeTerminalId?: string;
      readonly splitDirection?: "vertical";
    }
  | { readonly kind: "diff" }
  | {
      readonly kind: "pull-request";
      readonly projectId: string;
      readonly repository: string;
      readonly number: number;
      readonly host?: string;
    }
  | { readonly kind: "pull-requests" }
  | { readonly kind: "side-chat"; readonly threadId: string }
  | {
      readonly kind: "device";
      /** Absent until a device is picked, so the card shows the device picker. */
      readonly target?: {
        readonly hostId: string;
        readonly deviceId: string;
        readonly platform: "ios" | "android";
        readonly name: string;
      };
    };

export interface CanvasSurfaceCard {
  readonly kind: "surface";
  readonly surface: CanvasSurfaceRef;
  readonly title: string;
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;
const positiveInt = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
const optional = <Key extends string, Value>(key: Key, value: Value | undefined) =>
  (value === undefined ? {} : { [key]: value }) as { [K in Key]?: Value };

/** A path inside the workspace, relative to its root and never climbing out of it. */
function isWorkspaceRelativePath(path: string) {
  return !/^(?:[/\\~]|[A-Za-z]:)/.test(path) && !path.split(/[/\\]/).includes("..");
}

/**
 * A path a file card can show: one inside the workspace, or a host path (absolute or under `~/`),
 * which the environment's server resolves the same way for every client of that board.
 */
export function isCanvasFilePath(path: string) {
  return isWorkspaceRelativePath(path) || isHostPath(path);
}

const workspacePath = (value: unknown) => {
  const path = text(value);
  return path !== undefined && isWorkspaceRelativePath(path) ? path : undefined;
};

/** The ref a stored value names, or null when it is not one a card can resolve. */
export function canvasSurfaceRefOf(value: unknown): CanvasSurfaceRef | null {
  if (typeof value !== "object" || value === null) return null;
  const ref = value as Record<string, unknown>;
  switch (ref.kind) {
    case "file": {
      const path = text(ref.relativePath);
      const relativePath = path !== undefined && isCanvasFilePath(path) ? path : undefined;
      if (relativePath === undefined) return null;
      return {
        kind: "file",
        relativePath,
        ...optional("revealLine", positiveInt(ref.revealLine)),
        ...optional("folderTrail", workspacePath(ref.folderTrail)),
      };
    }
    case "files":
      return { kind: "files", ...optional("folderTrail", workspacePath(ref.folderTrail)) };
    case "preview": {
      const tabId = text(ref.tabId);
      return tabId === undefined
        ? null
        : { kind: "preview", tabId, ...optional("url", text(ref.url)) };
    }
    case "terminal": {
      const resourceId = text(ref.resourceId);
      if (resourceId === undefined) return null;
      const listed = Array.isArray(ref.terminalIds)
        ? ref.terminalIds.flatMap((id) => (text(id) === undefined ? [] : [id as string]))
        : [];
      const terminalIds = [...new Set(listed)];
      if (terminalIds.length === 0) return { kind: "terminal", resourceId };
      const active = text(ref.activeTerminalId);
      return {
        kind: "terminal",
        resourceId,
        terminalIds,
        activeTerminalId:
          active !== undefined && terminalIds.includes(active) ? active : terminalIds[0]!,
        ...(ref.splitDirection === "vertical" ? { splitDirection: "vertical" as const } : {}),
      };
    }
    case "diff":
      return { kind: "diff" };
    case "pull-request": {
      const projectId = text(ref.projectId);
      const repository = text(ref.repository);
      const number = positiveInt(ref.number);
      if (projectId === undefined || repository === undefined || number === undefined) return null;
      return {
        kind: "pull-request",
        projectId,
        repository,
        number,
        ...optional("host", text(ref.host)),
      };
    }
    case "pull-requests":
      return { kind: "pull-requests" };
    case "side-chat": {
      const threadId = text(ref.threadId);
      return threadId === undefined ? null : { kind: "side-chat", threadId };
    }
    case "device": {
      const target = typeof ref.target === "object" && ref.target !== null ? ref.target : null;
      if (target === null) return { kind: "device" };
      const { hostId, deviceId, platform, name } = target as Record<string, unknown>;
      return text(hostId) === undefined ||
        text(deviceId) === undefined ||
        (platform !== "ios" && platform !== "android")
        ? { kind: "device" }
        : {
            kind: "device",
            target: {
              hostId: hostId as string,
              deviceId: deviceId as string,
              platform,
              name: text(name) ?? (deviceId as string),
            },
          };
    }
    default:
      return null;
  }
}

/** What a card names its surface by: the name its panel tab would show. */
export function canvasSurfaceTitle(ref: CanvasSurfaceRef) {
  switch (ref.kind) {
    case "file":
      return ref.relativePath.split(/[/\\]/).at(-1) || ref.relativePath;
    case "files":
      return "Files";
    case "preview":
      return ref.url ?? "Browser";
    case "terminal":
      return "Terminal";
    case "diff":
      return "Diff";
    case "pull-request":
      return `${ref.repository}#${ref.number}`;
    case "pull-requests":
      return "Linked pull requests";
    case "side-chat":
      return "Side chat";
    case "device":
      return ref.target?.name ?? "Device";
  }
}

/** The surface card a `t3Card` value holds, or null when it holds another kind or a bad ref. */
export function canvasSurfaceCardOf(card: unknown): CanvasSurfaceCard | null {
  if (typeof card !== "object" || card === null) return null;
  const { kind, surface, title } = card as Record<string, unknown>;
  if (kind !== "surface") return null;
  const ref = canvasSurfaceRefOf(surface);
  if (ref === null) return null;
  return { kind, surface: ref, title: text(title) ?? canvasSurfaceTitle(ref) };
}

/**
 * What an agent asks for when it places a card: the panel kind and the resource it shows, in the
 * agent's own words. `canvasSurfaceRefOfSpec` turns it into the stored ref.
 */
export interface CanvasCardSpec {
  readonly kind:
    | "file"
    | "files"
    | "browser"
    | "terminal"
    | "diff"
    | "pull-request"
    | "pull-requests"
    | "chat"
    | "device";
  readonly path?: string | undefined;
  readonly line?: number | undefined;
  readonly tabId?: string | undefined;
  readonly terminalId?: string | undefined;
  readonly repository?: string | undefined;
  readonly number?: number | undefined;
  readonly host?: string | undefined;
  readonly projectId?: string | undefined;
  readonly threadId?: string | undefined;
  readonly device?:
    | {
        readonly hostId: string;
        readonly deviceId: string;
        readonly platform: "ios" | "android";
        readonly name?: string | undefined;
      }
    | undefined;
}

/** The ref an agent's card spec names, or null when it lacks what that kind needs. */
export function canvasSurfaceRefOfSpec(spec: CanvasCardSpec): CanvasSurfaceRef | null {
  switch (spec.kind) {
    case "file":
      return canvasSurfaceRefOf({ kind: "file", relativePath: spec.path, revealLine: spec.line });
    case "files":
      return canvasSurfaceRefOf({ kind: "files", folderTrail: spec.path });
    case "browser":
      return canvasSurfaceRefOf({ kind: "preview", tabId: spec.tabId });
    case "terminal":
      return canvasSurfaceRefOf({ kind: "terminal", resourceId: spec.terminalId });
    case "diff":
    case "pull-requests":
      return { kind: spec.kind };
    case "pull-request":
      return canvasSurfaceRefOf({
        kind: "pull-request",
        projectId: spec.projectId,
        repository: spec.repository,
        number: spec.number,
        host: spec.host,
      });
    case "chat":
      return canvasSurfaceRefOf({ kind: "side-chat", threadId: spec.threadId });
    case "device":
      return canvasSurfaceRefOf({ kind: "device", target: spec.device });
  }
}

/** The spec that places a stored ref again, as an agent would have asked for it. */
export function canvasCardSpecOf(ref: CanvasSurfaceRef): CanvasCardSpec {
  switch (ref.kind) {
    case "file":
      return {
        kind: "file",
        path: ref.relativePath,
        ...(ref.revealLine === undefined ? {} : { line: ref.revealLine }),
      };
    case "files":
      return { kind: "files", ...(ref.folderTrail === undefined ? {} : { path: ref.folderTrail }) };
    case "preview":
      return { kind: "browser", tabId: ref.tabId };
    case "terminal":
      return { kind: "terminal", terminalId: ref.resourceId };
    case "diff":
    case "pull-requests":
      return { kind: ref.kind };
    case "pull-request":
      return {
        kind: "pull-request",
        projectId: ref.projectId,
        repository: ref.repository,
        number: ref.number,
        ...(ref.host === undefined ? {} : { host: ref.host }),
      };
    case "side-chat":
      return { kind: "chat", threadId: ref.threadId };
    case "device":
      return { kind: "device", ...(ref.target === undefined ? {} : { device: ref.target }) };
  }
}

/** The size a card starts at when the agent leaves it out, by the panel it shows. */
export function canvasCardDefaultSize(ref: CanvasSurfaceRef) {
  switch (ref.kind) {
    case "file":
    case "diff":
      return { width: 720, height: 800 };
    case "preview":
      return { width: 960, height: 720 };
    case "terminal":
      return { width: 720, height: 440 };
    case "side-chat":
      return { width: 460, height: 600 };
    case "device":
      return { width: 420, height: 800 };
    default:
      return { width: 560, height: 640 };
  }
}
