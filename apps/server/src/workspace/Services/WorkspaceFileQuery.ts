import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { ProjectReadFileInput, ProjectReadFileResult } from "@t3tools/contracts";
import { WorkspacePathOutsideRootError } from "./WorkspacePaths.ts";

export class WorkspaceFileQueryError extends Schema.TaggedErrorClass<WorkspaceFileQueryError>()(
  "WorkspaceFileQueryError",
  {
    cwd: Schema.String,
    relativePath: Schema.optional(Schema.String),
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export interface WorkspaceFileQueryShape {
  readonly readFile: (
    input: ProjectReadFileInput,
  ) => Effect.Effect<
    ProjectReadFileResult,
    WorkspaceFileQueryError | WorkspacePathOutsideRootError
  >;
}

export class WorkspaceFileQuery extends Context.Service<
  WorkspaceFileQuery,
  WorkspaceFileQueryShape
>()("t3/workspace/Services/WorkspaceFileQuery") {}
