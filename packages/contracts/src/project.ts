import * as Schema from "effect/Schema";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
const PROJECT_LIST_DIRECTORY_MAX_LIMIT = 500;
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;

export const ProjectSearchEntriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_ENTRIES_MAX_LIMIT)),
});
export type ProjectSearchEntriesInput = typeof ProjectSearchEntriesInput.Type;

const ProjectEntryKind = Schema.Literals(["file", "directory"]);

export const ProjectEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
  parentPath: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectEntry = typeof ProjectEntry.Type;

export const ProjectSearchEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectEntry),
  truncated: Schema.Boolean,
});
export type ProjectSearchEntriesResult = typeof ProjectSearchEntriesResult.Type;

export class ProjectSearchEntriesError extends Schema.TaggedErrorClass<ProjectSearchEntriesError>()(
  "ProjectSearchEntriesError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ProjectListDirectoryInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  directoryPath: Schema.NullOr(TrimmedNonEmptyString),
  limit: Schema.optional(
    PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_LIST_DIRECTORY_MAX_LIMIT)),
  ),
});
export type ProjectListDirectoryInput = typeof ProjectListDirectoryInput.Type;

export const ProjectTreeEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
  parentPath: Schema.NullOr(TrimmedNonEmptyString),
});
export type ProjectTreeEntry = typeof ProjectTreeEntry.Type;

export const ProjectListDirectoryResult = Schema.Struct({
  entries: Schema.Array(ProjectTreeEntry),
  truncated: Schema.Boolean,
});
export type ProjectListDirectoryResult = typeof ProjectListDirectoryResult.Type;

export class ProjectListDirectoryError extends Schema.TaggedErrorClass<ProjectListDirectoryError>()(
  "ProjectListDirectoryError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ProjectWriteFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  contents: Schema.String,
});
export type ProjectWriteFileInput = typeof ProjectWriteFileInput.Type;

export const ProjectWriteFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
});
export type ProjectWriteFileResult = typeof ProjectWriteFileResult.Type;

export class ProjectWriteFileError extends Schema.TaggedErrorClass<ProjectWriteFileError>()(
  "ProjectWriteFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ProjectReadFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
});
export type ProjectReadFileInput = typeof ProjectReadFileInput.Type;

export const ProjectReadFileResult = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("text"),
    path: TrimmedNonEmptyString,
    text: Schema.String,
    mimeType: TrimmedNonEmptyString,
    byteSize: NonNegativeInt,
    language: TrimmedNonEmptyString,
    lineEnding: Schema.Literals(["lf", "crlf", "cr", "none"]),
    isMarkdown: Schema.Boolean,
  }),
  Schema.Struct({
    kind: Schema.Literal("image"),
    path: TrimmedNonEmptyString,
    dataUrl: TrimmedNonEmptyString,
    mimeType: TrimmedNonEmptyString,
    byteSize: NonNegativeInt,
  }),
  Schema.Struct({
    kind: Schema.Literal("binary"),
    path: TrimmedNonEmptyString,
    mimeType: TrimmedNonEmptyString,
    byteSize: NonNegativeInt,
  }),
  Schema.Struct({
    kind: Schema.Literal("too-large"),
    path: TrimmedNonEmptyString,
    previewKind: Schema.Literals(["text", "image"]),
    mimeType: TrimmedNonEmptyString,
    byteSize: NonNegativeInt,
    maxPreviewBytes: PositiveInt,
  }),
  Schema.Struct({
    kind: Schema.Literal("missing"),
    path: TrimmedNonEmptyString,
    reason: Schema.Literals(["not-found", "deleted"]),
  }),
]);
export type ProjectReadFileResult = typeof ProjectReadFileResult.Type;

export class ProjectReadFileError extends Schema.TaggedErrorClass<ProjectReadFileError>()(
  "ProjectReadFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
