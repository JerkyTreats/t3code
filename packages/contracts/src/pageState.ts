import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";

/**
 * A document goes whole to every open page that reads it on each write, so it stays a page's data,
 * not its assets: half of the 512 KB an html page may be.
 */
export const PAGE_STATE_MAX_DOCUMENT_BYTES = 256 * 1024;
/** Bounds one thread's page state at 16 MB on disk. */
export const PAGE_STATE_MAX_DOCUMENTS = 64;

/** Lowercase so two keys never share a file on a case-insensitive disk. */
export const PageStateKey = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9._-]{0,63}$/),
).annotate({
  description: "The document's name: lowercase letters, digits, '.', '_' or '-', such as workflow.",
});

/** One named JSON document of a thread's page state. Revision 0 means it was never written. */
export const PageStateDocument = Schema.Struct({
  key: Schema.String,
  value: Schema.Json,
  revision: Schema.Int,
  updatedBy: Schema.optional(Schema.Literals(["agent", "user"])),
});
export type PageStateDocument = typeof PageStateDocument.Type;

export const PageStateSubscribeInput = Schema.Struct({ threadId: ThreadId, key: PageStateKey });

export const PageStateWriteInput = Schema.Struct({
  threadId: ThreadId,
  key: PageStateKey,
  set: Schema.optional(Schema.Json),
  /** An RFC 7386 JSON merge patch applied to the current value. */
  merge: Schema.optional(Schema.Json),
  /** Fails with a conflict unless the document is at this revision; 0 means not yet written. */
  expectedRevision: Schema.optional(Schema.Int),
});

export type PageStateWriteInput = typeof PageStateWriteInput.Type;

export const PageStateWriteResult = Schema.Struct({ key: Schema.String, revision: Schema.Int });

export class PageStateError extends Schema.TaggedError<PageStateError>()("PageStateError", {
  reason: Schema.Literals(["conflict", "too_large", "full", "invalid", "storage"]),
  message: Schema.String,
  /** The document's current revision, on a conflict. */
  revision: Schema.optional(Schema.Int),
}) {}
