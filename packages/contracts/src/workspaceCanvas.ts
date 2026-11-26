import * as Schema from "effect/Schema";

import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Prefix distinguishing a project-scoped Workspace Canvas id from ordinary thread ids. */
export const WORKSPACE_CANVAS_ID_PREFIX = "canvas:";

export const WORKSPACE_CANVAS_TITLE_MAX_CHARS = 120;

const isWorkspaceCanvasIdString = (value: string) => /^canvas:[A-Za-z0-9_-]{1,128}$/.test(value);

export const WorkspaceCanvasId = Schema.String.check(
  Schema.makeFilter(isWorkspaceCanvasIdString, {
    expected: "a workspace canvas id starting with canvas:",
    toJsonSchema: () => [{ pattern: "^canvas:[A-Za-z0-9_-]{1,128}$" }, true],
  }),
).pipe(Schema.brand("WorkspaceCanvasId"));
export type WorkspaceCanvasId = typeof WorkspaceCanvasId.Type;

export function isWorkspaceCanvasId(id: string): id is WorkspaceCanvasId {
  return isWorkspaceCanvasIdString(id);
}

/** A Workspace Canvas shares ThreadCanvasStore's scene persistence under its own id. */
export function workspaceCanvasThreadId(canvasId: WorkspaceCanvasId): ThreadId {
  return ThreadId.make(canvasId);
}

export const WorkspaceCanvasTitle = TrimmedNonEmptyString.check(
  Schema.isMaxLength(WORKSPACE_CANVAS_TITLE_MAX_CHARS),
);

export const WorkspaceCanvasRecord = Schema.Struct({
  id: WorkspaceCanvasId,
  projectId: ProjectId,
  title: WorkspaceCanvasTitle,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type WorkspaceCanvasRecord = typeof WorkspaceCanvasRecord.Type;

export const WorkspaceCanvasList = Schema.Struct({
  canvases: Schema.Array(WorkspaceCanvasRecord),
});
export type WorkspaceCanvasList = typeof WorkspaceCanvasList.Type;

export const WorkspaceCanvasSubscribeInput = Schema.Struct({});

export const WorkspaceCanvasCreateInput = Schema.Struct({
  projectId: ProjectId,
  title: Schema.optional(WorkspaceCanvasTitle),
});
export type WorkspaceCanvasCreateInput = typeof WorkspaceCanvasCreateInput.Type;

export const WorkspaceCanvasRenameInput = Schema.Struct({
  canvasId: WorkspaceCanvasId,
  title: WorkspaceCanvasTitle,
});
export type WorkspaceCanvasRenameInput = typeof WorkspaceCanvasRenameInput.Type;

export const WorkspaceCanvasDeleteInput = Schema.Struct({
  canvasId: WorkspaceCanvasId,
});
export type WorkspaceCanvasDeleteInput = typeof WorkspaceCanvasDeleteInput.Type;

export class WorkspaceCanvasError extends Schema.TaggedError<WorkspaceCanvasError>()(
  "WorkspaceCanvasError",
  { message: Schema.String },
) {}
