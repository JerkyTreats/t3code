import * as Schema from "effect/Schema";

import {
  AuthClientId,
  CommandId,
  IsoDateTime,
  NonNegativeInt,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import {
  BOARD_POST_MAX_TARGETS,
  BoardAuthor,
  BoardPost,
  BoardPostBody,
  BoardPostId,
  BoardPostSource,
  BoardTargetHint,
} from "./coordinationBoard.ts";

/** Trusted server-only command used to publish through the orchestration event store. */
export const BoardPostPublishCommand = Schema.Struct({
  type: Schema.Literal("board.post.publish"),
  commandId: CommandId,
  postId: BoardPostId,
  author: BoardAuthor,
  source: BoardPostSource,
  body: BoardPostBody,
  targets: Schema.Array(BoardTargetHint).check(Schema.isMaxLength(BOARD_POST_MAX_TARGETS)),
  createdAt: IsoDateTime,
});
export type BoardPostPublishCommand = typeof BoardPostPublishCommand.Type;

/** Private audit identity. Public Board projections expose only its editor class. */
export const OrchestrationBoardAuditEditor = Schema.Union([
  BoardAuthor,
  Schema.Struct({
    kind: Schema.Literal("environment-owner"),
    clientId: AuthClientId,
  }),
]);
export type OrchestrationBoardAuditEditor = typeof OrchestrationBoardAuditEditor.Type;

/** Trusted server-only command used to append one optimistic Board correction. */
export const BoardPostReviseCommand = Schema.Struct({
  type: Schema.Literal("board.post.revise"),
  commandId: CommandId,
  postId: BoardPostId,
  previousRevision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1)),
  revision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(2)),
  editor: OrchestrationBoardAuditEditor,
  editorSource: Schema.NullOr(BoardPostSource),
  body: BoardPostBody,
  targets: Schema.Array(BoardTargetHint).check(Schema.isMaxLength(BOARD_POST_MAX_TARGETS)),
  revisedAt: IsoDateTime,
});
export type BoardPostReviseCommand = typeof BoardPostReviseCommand.Type;

export const BoardOrchestrationCommand = Schema.Union([
  BoardPostPublishCommand,
  BoardPostReviseCommand,
]);
export type BoardOrchestrationCommand = typeof BoardOrchestrationCommand.Type;

export const BoardPostPublishedPayload = Schema.Struct({
  postId: BoardPostId,
  author: BoardAuthor,
  source: BoardPostSource,
  body: BoardPostBody,
  targets: Schema.Array(BoardTargetHint).check(Schema.isMaxLength(BOARD_POST_MAX_TARGETS)),
  createdAt: IsoDateTime,
});

export const BoardPostRevisedPayload = Schema.Struct({
  postId: BoardPostId,
  previousRevision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1)),
  revision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(2)),
  editor: OrchestrationBoardAuditEditor,
  editorSource: Schema.NullOr(BoardPostSource),
  body: BoardPostBody,
  targets: Schema.Array(BoardTargetHint).check(Schema.isMaxLength(BOARD_POST_MAX_TARGETS)),
  revisedAt: IsoDateTime,
});

export class OrchestrationBoardRevisionError extends Schema.TaggedErrorClass<OrchestrationBoardRevisionError>()(
  "OrchestrationBoardRevisionError",
  {
    reason: Schema.Literals(["not-found", "forbidden", "conflict", "unavailable"]),
    message: TrimmedNonEmptyString,
    expectedRevision: Schema.optional(NonNegativeInt),
    actualRevision: Schema.optional(NonNegativeInt),
    currentPost: Schema.optional(BoardPost),
    cause: Schema.optional(Schema.Defect()),
  },
) {}
