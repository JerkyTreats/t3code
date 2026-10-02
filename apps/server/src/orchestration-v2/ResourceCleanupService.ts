import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { resolveAttachmentPathById } from "../attachmentStore.ts";
import * as ServerConfig from "../config.ts";
import * as TerminalManager from "../terminal/Manager.ts";

export class ResourceCleanupError extends Schema.TaggedError<ResourceCleanupError>()(
  "ResourceCleanupError",
  {
    operation: Schema.Literals(["terminal", "attachment"]),
    threadId: Schema.optional(Schema.String),
    attachmentId: Schema.optional(Schema.String),
    cause: Schema.Defect(),
  },
) {}

export class ResourceCleanupService extends Context.Reference<{
  readonly cleanupTerminals: (threadId: string) => Effect.Effect<void, ResourceCleanupError>;
  readonly cleanupAttachments: (
    attachmentIds: ReadonlyArray<string>,
  ) => Effect.Effect<void, ResourceCleanupError>;
}>("t3/orchestration-v2/ResourceCleanupService", {
  defaultValue: () => ({
    cleanupTerminals: () => Effect.void,
    cleanupAttachments: () => Effect.void,
  }),
}) {}

export const live = Layer.effect(
  ResourceCleanupService,
  Effect.gen(function* () {
    const terminals = yield* TerminalManager.TerminalManager;
    const sql = yield* SqlClient.SqlClient;
    const fileSystem = yield* FileSystem.FileSystem;
    const config = yield* ServerConfig.ServerConfig;
    return {
      cleanupTerminals: (threadId: string) =>
        terminals
          .close({ threadId, deleteHistory: true })
          .pipe(
            Effect.mapError(
              (cause) => new ResourceCleanupError({ operation: "terminal", threadId, cause }),
            ),
          ),
      cleanupAttachments: (attachmentIds: ReadonlyArray<string>) =>
        cleanupUnretainedAttachments(config.attachmentsDir, attachmentIds).pipe(
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        ),
    };
  }),
);

/** Retain files referenced by the immutable legacy recovery transcript. */
export const cleanupUnretainedAttachments = Effect.fn("cleanupUnretainedAttachments")(function* (
  attachmentsDir: string,
  attachmentIds: ReadonlyArray<string>,
) {
  const sql = yield* SqlClient.SqlClient;
  const fileSystem = yield* FileSystem.FileSystem;
  yield* Effect.forEach(
    attachmentIds,
    (attachmentId) =>
      Effect.gen(function* () {
        const path = resolveAttachmentPathById({
          attachmentsDir,
          attachmentId,
        });
        if (path === null) return;
        // V1 and V2 share attachment files. The immutable legacy projection
        // remains a recovery source even after its V2 thread is deleted.
        const retained = yield* sql`
              SELECT 1 FROM projection_thread_messages AS message
              WHERE EXISTS (
                SELECT 1 FROM json_each(message.attachments_json) AS attachment
                WHERE json_extract(attachment.value, '$.id') = ${attachmentId}
              )
              LIMIT 1
            `;
        if (retained.length > 0) return;
        yield* fileSystem.remove(path, { force: true });
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ResourceCleanupError({
              operation: "attachment",
              attachmentId,
              cause,
            }),
        ),
      ),
    { discard: true, concurrency: 4 },
  );
});
