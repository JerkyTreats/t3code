// @effect-diagnostics nodeBuiltinImport:off
import fsPromises from "node:fs/promises";

import Mime from "@effect/platform-node/Mime";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { ProjectReadFileResult } from "@t3tools/contracts";
import {
  buildPreviewResult,
  MAX_IMAGE_PREVIEW_BYTES,
  MAX_TEXT_PREVIEW_BYTES,
} from "../../filePreview.ts";
import {
  WorkspaceFileQuery,
  WorkspaceFileQueryError,
  type WorkspaceFileQueryShape,
} from "../Services/WorkspaceFileQuery.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";

class WorkspaceFileMissing extends Data.TaggedError("WorkspaceFileMissing")<{
  readonly relativePath: string;
}> {}

const makeWorkspaceFileQuery = Effect.gen(function* () {
  const workspacePaths = yield* WorkspacePaths;

  const readFile: WorkspaceFileQueryShape["readFile"] = Effect.fn("WorkspaceFileQuery.readFile")(
    function* (input) {
      const operation = "WorkspaceFileQuery.readFile";
      const resolvedPath = yield* workspacePaths.resolveRelativePathWithinRoot({
        workspaceRoot: input.cwd,
        relativePath: input.relativePath,
      });

      const fileStat = yield* Effect.tryPromise({
        try: () => fsPromises.stat(resolvedPath.absolutePath),
        catch: (cause) => {
          if (
            cause instanceof Error &&
            "code" in cause &&
            (cause as NodeJS.ErrnoException).code === "ENOENT"
          ) {
            return new WorkspaceFileMissing({ relativePath: resolvedPath.relativePath });
          }
          return new WorkspaceFileQueryError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation,
            detail: cause instanceof Error ? cause.message : String(cause),
            cause,
          });
        },
      }).pipe(Effect.catchTag("WorkspaceFileMissing", () => Effect.succeed(null)));

      if (!fileStat) {
        return {
          kind: "missing",
          path: resolvedPath.relativePath,
          reason: "not-found",
        } satisfies ProjectReadFileResult;
      }

      const mimeType = Mime.getType(resolvedPath.relativePath) ?? "application/octet-stream";
      const maxPreviewBytes = mimeType.startsWith("image/")
        ? MAX_IMAGE_PREVIEW_BYTES
        : MAX_TEXT_PREVIEW_BYTES;
      if (fileStat.size > maxPreviewBytes) {
        return {
          kind: "too-large",
          path: resolvedPath.relativePath,
          previewKind: mimeType.startsWith("image/") ? "image" : "text",
          mimeType,
          byteSize: fileStat.size,
          maxPreviewBytes,
        } satisfies ProjectReadFileResult;
      }

      const fileBytes = yield* Effect.tryPromise({
        try: () => fsPromises.readFile(resolvedPath.absolutePath),
        catch: (cause) => {
          if (
            cause instanceof Error &&
            "code" in cause &&
            (cause as NodeJS.ErrnoException).code === "ENOENT"
          ) {
            return new WorkspaceFileMissing({ relativePath: resolvedPath.relativePath });
          }
          return new WorkspaceFileQueryError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation,
            detail: cause instanceof Error ? cause.message : String(cause),
            cause,
          });
        },
      }).pipe(Effect.catchTag("WorkspaceFileMissing", () => Effect.succeed(null)));

      if (!fileBytes) {
        return {
          kind: "missing",
          path: resolvedPath.relativePath,
          reason: "not-found",
        } satisfies ProjectReadFileResult;
      }

      return buildPreviewResult({
        relativePath: resolvedPath.relativePath,
        mimeType,
        byteSize: fileStat.size,
        bytes: fileBytes,
      }) satisfies ProjectReadFileResult;
    },
  );

  return {
    readFile,
  } satisfies WorkspaceFileQueryShape;
});

export const WorkspaceFileQueryLive = Layer.effect(WorkspaceFileQuery, makeWorkspaceFileQuery);
