import type {
  BoardGetHistoryInput,
  BoardGetPageInput,
  BoardHistoryPage,
  BoardPage,
  BoardPost,
  BoardPostId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export interface BoardQueryShape {
  readonly getPage: (
    input: BoardGetPageInput,
  ) => Effect.Effect<BoardPage, ProjectionRepositoryError>;
  readonly getHeadSequence: Effect.Effect<number, ProjectionRepositoryError>;
  readonly getPostBySequence: (
    sequence: number,
  ) => Effect.Effect<Option.Option<BoardPost>, ProjectionRepositoryError>;
  readonly getPostById: (
    postId: BoardPostId,
  ) => Effect.Effect<Option.Option<BoardPost>, ProjectionRepositoryError>;
  readonly getHistory: (
    input: BoardGetHistoryInput,
  ) => Effect.Effect<Option.Option<BoardHistoryPage>, ProjectionRepositoryError>;
  readonly listAfterSequenceThroughHead: (input: {
    readonly afterSequence: number;
    readonly throughSequence: number;
  }) => Effect.Effect<ReadonlyArray<BoardPost>, ProjectionRepositoryError>;
  readonly readAfterSequenceSnapshot: (
    afterSequence: number,
    maxGap: number,
  ) => Effect.Effect<
    {
      readonly posts: ReadonlyArray<BoardPost>;
      readonly headSequence: number;
      readonly replayable: boolean;
    },
    ProjectionRepositoryError
  >;
}

export class BoardQuery extends Context.Service<BoardQuery, BoardQueryShape>()(
  "t3/orchestration/Services/BoardQuery",
) {}
