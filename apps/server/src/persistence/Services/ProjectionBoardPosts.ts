import {
  BOARD_HISTORY_MAX_REVISIONS,
  BOARD_PAGE_MAX_POSTS,
  BoardEditor,
  BoardPost,
  BoardPostBody,
  BoardPostId,
  BoardPostSource,
  BoardRevision,
  BoardTargetHint,
  IsoDateTime,
  NonNegativeInt,
  BOARD_POST_MAX_TARGETS,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionBoardPost = BoardPost;
export type ProjectionBoardPost = typeof ProjectionBoardPost.Type;

export const GetProjectionBoardPostBySequenceInput = Schema.Struct({
  sequence: NonNegativeInt,
});

export const GetProjectionBoardPostByIdInput = Schema.Struct({
  postId: BoardPostId,
});

export const ReviseProjectionBoardPostInput = Schema.Struct({
  postId: BoardPostId,
  previousRevision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1)),
  revision: NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(2)),
  body: BoardPostBody,
  targets: Schema.Array(BoardTargetHint).check(Schema.isMaxLength(BOARD_POST_MAX_TARGETS)),
  editor: BoardEditor,
  editorSource: Schema.NullOr(BoardPostSource),
  editedAt: IsoDateTime,
  eventSequence: NonNegativeInt,
});

export type ReviseProjectionBoardPostOutcome =
  | { readonly _tag: "changed" }
  | { readonly _tag: "not-found" }
  | { readonly _tag: "conflict"; readonly actualRevision: number };

export const ListProjectionBoardPostHistoryInput = Schema.Struct({
  postId: BoardPostId,
  beforeRevision: Schema.optionalKey(NonNegativeInt.check(Schema.isGreaterThanOrEqualTo(1))),
  limit: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: BOARD_HISTORY_MAX_REVISIONS + 1 }),
  ),
});

export const ListNewestProjectionBoardPostsInput = Schema.Struct({
  throughSequence: NonNegativeInt,
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: BOARD_PAGE_MAX_POSTS })),
});

export const ListProjectionBoardPostsBeforeInput = Schema.Struct({
  throughSequence: NonNegativeInt,
  beforeSequence: NonNegativeInt,
  beforePostId: BoardPostId,
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: BOARD_PAGE_MAX_POSTS })),
});

export const ListProjectionBoardPostsAfterInput = Schema.Struct({
  afterSequence: NonNegativeInt,
  throughSequence: NonNegativeInt,
});

export const ReadProjectionBoardPageInput = Schema.Struct({
  projector: Schema.String,
  beforeSequence: Schema.optionalKey(NonNegativeInt),
  beforePostId: Schema.optionalKey(BoardPostId),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: BOARD_PAGE_MAX_POSTS })),
});

export const ReadProjectionBoardAfterInput = Schema.Struct({
  projector: Schema.String,
  afterSequence: NonNegativeInt,
  maxGap: NonNegativeInt,
});

export interface ProjectionBoardPageSnapshot {
  readonly posts: ReadonlyArray<ProjectionBoardPost>;
  readonly headSequence: number;
}

export interface ProjectionBoardAfterSnapshot {
  readonly posts: ReadonlyArray<ProjectionBoardPost>;
  readonly headSequence: number;
  readonly replayable: boolean;
}

export interface ProjectionBoardHistorySnapshot {
  readonly currentRevision: number;
  readonly revisions: ReadonlyArray<BoardRevision>;
}

export interface ProjectionBoardPostRepositoryShape {
  readonly insert: (post: ProjectionBoardPost) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getBySequence: (
    input: typeof GetProjectionBoardPostBySequenceInput.Type,
  ) => Effect.Effect<Option.Option<ProjectionBoardPost>, ProjectionRepositoryError>;
  readonly getById: (
    input: typeof GetProjectionBoardPostByIdInput.Type,
  ) => Effect.Effect<Option.Option<ProjectionBoardPost>, ProjectionRepositoryError>;
  readonly revise: (
    input: typeof ReviseProjectionBoardPostInput.Type,
  ) => Effect.Effect<ReviseProjectionBoardPostOutcome, ProjectionRepositoryError>;
  readonly listHistory: (
    input: typeof ListProjectionBoardPostHistoryInput.Type,
  ) => Effect.Effect<ReadonlyArray<BoardRevision>, ProjectionRepositoryError>;
  readonly listNewestPage: (
    input: typeof ListNewestProjectionBoardPostsInput.Type,
  ) => Effect.Effect<ReadonlyArray<ProjectionBoardPost>, ProjectionRepositoryError>;
  readonly listBeforeCursor: (
    input: typeof ListProjectionBoardPostsBeforeInput.Type,
  ) => Effect.Effect<ReadonlyArray<ProjectionBoardPost>, ProjectionRepositoryError>;
  readonly listAfterSequenceThroughHead: (
    input: typeof ListProjectionBoardPostsAfterInput.Type,
  ) => Effect.Effect<ReadonlyArray<ProjectionBoardPost>, ProjectionRepositoryError>;
  readonly readPageSnapshot: (
    input: typeof ReadProjectionBoardPageInput.Type,
  ) => Effect.Effect<ProjectionBoardPageSnapshot, ProjectionRepositoryError>;
  readonly readAfterSnapshot: (
    input: typeof ReadProjectionBoardAfterInput.Type,
  ) => Effect.Effect<ProjectionBoardAfterSnapshot, ProjectionRepositoryError>;
  readonly readHistorySnapshot: (
    input: typeof ListProjectionBoardPostHistoryInput.Type,
  ) => Effect.Effect<Option.Option<ProjectionBoardHistorySnapshot>, ProjectionRepositoryError>;
}

export class ProjectionBoardPostRepository extends Context.Service<
  ProjectionBoardPostRepository,
  ProjectionBoardPostRepositoryShape
>()("t3/persistence/Services/ProjectionBoardPosts/ProjectionBoardPostRepository") {}
