import * as Schema from "effect/Schema";
import { EnvironmentId, MessageId, NonNegativeInt, PositiveInt, ThreadId } from "./baseSchemas.ts";

export const ASSISTANT_CITATION_MAX_TEXT_LENGTH = 8_000;
export const ASSISTANT_CITATION_MAX_COMMENT_LENGTH = 8_000;
export const ASSISTANT_CITATION_CONTEXT_LENGTH = 32;

/** Where a quote from a workspace file sits: its path and the lines the quote spans. */
export const AssistantCitationFile = Schema.Struct({
  path: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(4096)),
  startLine: PositiveInt,
  endLine: PositiveInt,
}).check(Schema.makeFilter((file) => file.endLine >= file.startLine));
export type AssistantCitationFile = typeof AssistantCitationFile.Type;

/**
 * Positions are UTF-16 offsets, not Markdown offsets. A quote with `file` comes from that file's
 * lines rather than an assistant response, and its positions are offsets within the quote.
 */
export const AssistantCitation = Schema.Struct({
  version: Schema.Literal(1),
  environmentId: EnvironmentId.check(Schema.isMaxLength(512)),
  threadId: ThreadId.check(Schema.isMaxLength(512)),
  messageId: MessageId.check(Schema.isMaxLength(512)),
  text: Schema.String.check(
    Schema.isNonEmpty(),
    Schema.isMaxLength(ASSISTANT_CITATION_MAX_TEXT_LENGTH),
  ),
  comment: Schema.optional(
    Schema.String.check(Schema.isMaxLength(ASSISTANT_CITATION_MAX_COMMENT_LENGTH)),
  ),
  start: NonNegativeInt.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)),
  end: NonNegativeInt.check(Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)),
  prefix: Schema.String.check(Schema.isMaxLength(ASSISTANT_CITATION_CONTEXT_LENGTH)),
  suffix: Schema.String.check(Schema.isMaxLength(ASSISTANT_CITATION_CONTEXT_LENGTH)),
  file: Schema.optional(AssistantCitationFile),
}).check(
  Schema.makeFilter((citation) => citation.end > citation.start && citation.text.trim().length > 0),
);
export type AssistantCitation = typeof AssistantCitation.Type;
