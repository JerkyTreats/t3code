/**
 * A right panel surface placed on a thread's canvas, stored on its Excalidraw box as
 * `customData.t3Card`. The card is a reference: the panel still owns the resource, and the ref
 * resolves against the board's own environment and thread. Web renders it; the server describes it
 * to agents.
 */
export type CanvasSurfaceRef =
  | { readonly kind: "file"; readonly relativePath: string; readonly revealLine?: number }
  | { readonly kind: "preview"; readonly tabId: string; readonly url: string }
  | { readonly kind: "terminal"; readonly resourceId: string }
  | {
      readonly kind: "pull-request";
      readonly projectId: string;
      readonly repository: string;
      readonly number: number;
      readonly host?: string;
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

/** A host path names a file outside the workspace, which a card cannot resolve on another client. */
export function isWorkspaceRelativePath(path: string) {
  return !/^(?:[/\\~]|[A-Za-z]:)/.test(path) && !path.split(/[/\\]/).includes("..");
}

/** The ref a stored value names, or null when it is not one a card can resolve. */
export function canvasSurfaceRefOf(value: unknown): CanvasSurfaceRef | null {
  if (typeof value !== "object" || value === null) return null;
  const ref = value as Record<string, unknown>;
  switch (ref.kind) {
    case "file": {
      const relativePath = text(ref.relativePath);
      if (relativePath === undefined || !isWorkspaceRelativePath(relativePath)) return null;
      const revealLine = positiveInt(ref.revealLine);
      return { kind: "file", relativePath, ...(revealLine === undefined ? {} : { revealLine }) };
    }
    case "preview": {
      const tabId = text(ref.tabId);
      const url = text(ref.url);
      return tabId === undefined || url === undefined ? null : { kind: "preview", tabId, url };
    }
    case "terminal": {
      const resourceId = text(ref.resourceId);
      return resourceId === undefined ? null : { kind: "terminal", resourceId };
    }
    case "pull-request": {
      const projectId = text(ref.projectId);
      const repository = text(ref.repository);
      const number = positiveInt(ref.number);
      const host = text(ref.host);
      if (projectId === undefined || repository === undefined || number === undefined) return null;
      return {
        kind: "pull-request",
        projectId,
        repository,
        number,
        ...(host === undefined ? {} : { host }),
      };
    }
    default:
      return null;
  }
}

/** What the card names its surface by when no title was stored. */
function canvasSurfaceFallbackTitle(ref: CanvasSurfaceRef) {
  switch (ref.kind) {
    case "file":
      return ref.relativePath.split(/[/\\]/).at(-1) || ref.relativePath;
    case "preview":
      return ref.url;
    case "terminal":
      return "Terminal";
    case "pull-request":
      return `${ref.repository}#${ref.number}`;
  }
}

/** The surface card a `t3Card` value holds, or null when it holds another kind or a bad ref. */
export function canvasSurfaceCardOf(card: unknown): CanvasSurfaceCard | null {
  if (typeof card !== "object" || card === null) return null;
  const { kind, surface, title } = card as Record<string, unknown>;
  if (kind !== "surface") return null;
  const ref = canvasSurfaceRefOf(surface);
  if (ref === null) return null;
  return { kind, surface: ref, title: text(title) ?? canvasSurfaceFallbackTitle(ref) };
}
