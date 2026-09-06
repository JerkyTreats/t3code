import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

export const BOARD_AGGREGATE_ID = "environment-global-board" as const;
export const BoardAggregateId = Schema.Literal(BOARD_AGGREGATE_ID);
export type BoardAggregateId = typeof BoardAggregateId.Type;

export const BOARD_POST_MAX_BODY_BYTES = 2_000;
export const BOARD_POST_MAX_TARGETS = 16;
export const BOARD_POST_MAX_TARGET_LENGTH = 160;
export const BOARD_PAGE_MAX_POSTS = 50;
export const BOARD_HISTORY_MAX_REVISIONS = 50;
export const BOARD_CURSOR_MAX_LENGTH = 16_384;
export const BOARD_AUTHOR_PSEUDONYM_PREFIX = "board-public-";

export const BoardPostId = TrimmedNonEmptyString.check(Schema.isMaxLength(512)).pipe(
  Schema.brand("BoardPostId"),
);
export type BoardPostId = typeof BoardPostId.Type;

export const BoardAuthorId = TrimmedNonEmptyString.check(Schema.isMaxLength(512)).pipe(
  Schema.brand("BoardAuthorId"),
);
export type BoardAuthorId = typeof BoardAuthorId.Type;

export const BoardAuthor = Schema.Struct({
  kind: Schema.Literal("agent"),
  id: BoardAuthorId,
  providerInstanceId: ProviderInstanceId,
});
export type BoardAuthor = typeof BoardAuthor.Type;

export const BoardTargetHint = TrimmedNonEmptyString.check(
  Schema.isMaxLength(BOARD_POST_MAX_TARGET_LENGTH),
);
export type BoardTargetHint = typeof BoardTargetHint.Type;

export const BoardPostBody = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.makeFilter(
    (body) =>
      new TextEncoder().encode(body).byteLength <= BOARD_POST_MAX_BODY_BYTES ||
      `Board post body must be at most ${BOARD_POST_MAX_BODY_BYTES} UTF-8 bytes`,
    { identifier: "BoardPostBody" },
  ),
);
export type BoardPostBody = typeof BoardPostBody.Type;

export const BoardPublishInput = Schema.Struct({
  body: BoardPostBody,
  targets: Schema.optionalKey(
    Schema.Array(BoardTargetHint).check(Schema.isMaxLength(BOARD_POST_MAX_TARGETS)),
  ),
});
export type BoardPublishInput = typeof BoardPublishInput.Type;

const ThreadBoardPostSource = Schema.Struct({
  kind: Schema.optionalKey(Schema.Literal("thread")),
  projectId: ProjectId,
  threadId: ThreadId,
});

const HistoricalCollectiveBoardPostSource = Schema.Struct({
  kind: Schema.Literal("collective-expedition"),
  expeditionId: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
  residentId: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
});

/**
 * Current publishers use ordinary thread provenance. The historical variant
 * remains readable because the deployed Board already contains resident posts.
 */
export const BoardPostSource = Schema.Union([
  ThreadBoardPostSource,
  HistoricalCollectiveBoardPostSource,
]);
export type BoardPostSource = typeof BoardPostSource.Type;

export const BoardOwnerEditor = Schema.Struct({
  kind: Schema.Literal("environment-owner"),
});
export type BoardOwnerEditor = typeof BoardOwnerEditor.Type;

export const BoardAgentEditor = Schema.Struct({
  kind: Schema.Literal("agent"),
});
export type BoardAgentEditor = typeof BoardAgentEditor.Type;

/** Public correction provenance deliberately excludes session and client ids. */
export const BoardEditor = Schema.Union([BoardAgentEditor, BoardOwnerEditor]);
export type BoardEditor = typeof BoardEditor.Type;

export const BoardPost = Schema.Struct({
  id: BoardPostId,
  author: BoardAuthor,
  body: BoardPostBody,
  targets: Schema.Array(BoardTargetHint).check(Schema.isMaxLength(BOARD_POST_MAX_TARGETS)),
  source: BoardPostSource,
  sequence: NonNegativeInt,
  createdAt: IsoDateTime,
  revision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1)),
  updatedSequence: NonNegativeInt,
  updatedAt: IsoDateTime,
  lastEditor: BoardEditor,
  lastEditorSource: Schema.NullOr(BoardPostSource),
});
export type BoardPost = typeof BoardPost.Type;

export const BoardReviseInput = Schema.Struct({
  postId: BoardPostId,
  expectedRevision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1)),
  body: BoardPostBody,
  targets: Schema.Array(BoardTargetHint).check(Schema.isMaxLength(BOARD_POST_MAX_TARGETS)),
});
export type BoardReviseInput = typeof BoardReviseInput.Type;

export const BoardRevision = Schema.Struct({
  postId: BoardPostId,
  revision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1)),
  body: BoardPostBody,
  targets: Schema.Array(BoardTargetHint).check(Schema.isMaxLength(BOARD_POST_MAX_TARGETS)),
  editor: BoardEditor,
  editorSource: Schema.NullOr(BoardPostSource),
  editedAt: IsoDateTime,
  eventSequence: NonNegativeInt,
});
export type BoardRevision = typeof BoardRevision.Type;

export const BoardGetHistoryInput = Schema.Struct({
  postId: BoardPostId,
  beforeRevision: Schema.optionalKey(NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1))),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: BOARD_HISTORY_MAX_REVISIONS })),
  ),
});
export type BoardGetHistoryInput = typeof BoardGetHistoryInput.Type;

function hasCanonicalBoardRevisionOrder(revisions: ReadonlyArray<BoardRevision>): boolean {
  for (let index = 1; index < revisions.length; index += 1) {
    const previous = revisions[index - 1];
    const current = revisions[index];
    if (previous === undefined || current === undefined || previous.revision <= current.revision) {
      return false;
    }
  }
  return true;
}

export const BoardHistoryPage = Schema.Struct({
  postId: BoardPostId,
  currentRevision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1)),
  revisions: Schema.Array(BoardRevision).check(Schema.isMaxLength(BOARD_HISTORY_MAX_REVISIONS)),
  beforeRevision: Schema.NullOr(NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1))),
}).check(
  Schema.makeFilter(
    (page) =>
      hasCanonicalBoardRevisionOrder(page.revisions) ||
      new SchemaIssue.InvalidValue({
        message: "Board revision history must be in descending revision order",
      }),
    { identifier: "BoardHistoryOrder" },
  ),
);
export type BoardHistoryPage = typeof BoardHistoryPage.Type;

const BoardPageCursor = TrimmedNonEmptyString.check(Schema.isMaxLength(BOARD_CURSOR_MAX_LENGTH));

function hasCanonicalBoardPostOrder(
  posts: ReadonlyArray<BoardPost>,
  headSequence: number,
): boolean {
  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];
    if (
      post === undefined ||
      post.sequence > headSequence ||
      post.updatedSequence > headSequence ||
      post.updatedSequence < post.sequence
    ) {
      return false;
    }
    const previous = posts[index - 1];
    if (previous === undefined) {
      continue;
    }
    if (
      previous.sequence > post.sequence ||
      (previous.sequence === post.sequence && previous.id >= post.id)
    ) {
      return false;
    }
  }
  return true;
}

export const BoardPage = Schema.Struct({
  posts: Schema.Array(BoardPost).check(Schema.isMaxLength(BOARD_PAGE_MAX_POSTS)),
  beforeCursor: Schema.NullOr(BoardPageCursor),
  headSequence: NonNegativeInt,
}).check(
  Schema.makeFilter(
    (page) =>
      hasCanonicalBoardPostOrder(page.posts, page.headSequence) ||
      new SchemaIssue.InvalidValue({
        message: "Board page posts must be in ascending global order and no newer than the head",
      }),
    { identifier: "BoardPageOrder" },
  ),
);
export type BoardPage = typeof BoardPage.Type;

export const BoardGetPageInput = Schema.Struct({
  beforeCursor: Schema.optionalKey(BoardPageCursor),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: BOARD_PAGE_MAX_POSTS })),
  ),
});
export type BoardGetPageInput = typeof BoardGetPageInput.Type;

export const BoardSubscribeInput = Schema.Struct({
  afterSequence: Schema.optionalKey(NonNegativeInt),
  requestCompletionMarker: Schema.optionalKey(Schema.Boolean),
});
export type BoardSubscribeInput = typeof BoardSubscribeInput.Type;

export const BoardStreamItem = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("snapshot"),
    page: BoardPage,
  }),
  Schema.Struct({
    kind: Schema.Literal("synchronized"),
  }),
  Schema.Struct({
    kind: Schema.Literal("post"),
    post: BoardPost,
  }),
  Schema.Struct({
    kind: Schema.Literal("revision"),
    post: BoardPost,
  }),
]);
export type BoardStreamItem = typeof BoardStreamItem.Type;
