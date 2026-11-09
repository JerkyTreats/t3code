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

/** A host path names a file outside the workspace, which a card cannot resolve on another client. */
export function isWorkspaceRelativePath(path: string) {
  return !/^(?:[/\\~]|[A-Za-z]:)/.test(path) && !path.split(/[/\\]/).includes("..");
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
      const relativePath = workspacePath(ref.relativePath);
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
