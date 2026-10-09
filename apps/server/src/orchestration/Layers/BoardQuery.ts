import { BOARD_HISTORY_MAX_REVISIONS, BOARD_PAGE_MAX_POSTS } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import { toPersistenceSqlError } from "../../persistence/Errors.ts";
import * as Option from "effect/Option";

import { BOARD_POSTS_PROJECTOR } from "../../board/EventProjection.ts";
import { ProjectionBoardPostRepositoryLive } from "../../persistence/ProjectionBoardPosts.ts";
import { ProjectionBoardPostRepository } from "../../persistence/Services/ProjectionBoardPosts.ts";
import { decodeBoardPageCursor, encodeBoardPostCursor } from "../board/Cursor.ts";
import { BoardQuery, type BoardQueryShape } from "../Services/BoardQuery.ts";

const makeBoardQuery = Effect.gen(function* () {
  const posts = yield* ProjectionBoardPostRepository;
  const sql = yield* SqlClient.SqlClient;
  const getHeadSequence: BoardQueryShape["getHeadSequence"] = sql<{ readonly sequence: number }>`
    SELECT last_applied_sequence AS sequence FROM projection_state
    WHERE projector = ${BOARD_POSTS_PROJECTOR}
  `.pipe(
    Effect.map((rows) => rows[0]?.sequence ?? 0),
    Effect.mapError(toPersistenceSqlError("BoardQuery.getHeadSequence")),
  );

  const getPage: BoardQueryShape["getPage"] = Effect.fn("BoardQuery.getPage")(function* (input) {
    const limit = input.limit ?? BOARD_PAGE_MAX_POSTS;
    const cursor =
      input.beforeCursor === undefined ? null : decodeBoardPageCursor(input.beforeCursor);
    const snapshot = yield* posts.readPageSnapshot({
      projector: BOARD_POSTS_PROJECTOR,
      ...(cursor === null ? {} : { beforeSequence: cursor.sequence, beforePostId: cursor.postId }),
      limit,
    });
    const rows = snapshot.posts;
    const oldest = rows[0];
    return {
      posts: rows,
      beforeCursor:
        oldest !== undefined && rows.length === limit ? encodeBoardPostCursor(oldest) : null,
      headSequence: snapshot.headSequence,
    };
  });

  return BoardQuery.of({
    getPage,
    getHeadSequence,
    getPostBySequence: (sequence) => posts.getBySequence({ sequence }),
    getPostById: (postId) => posts.getById({ postId }),
    getHistory: Effect.fn("BoardQuery.getHistory")(function* (input) {
      const limit = input.limit ?? BOARD_HISTORY_MAX_REVISIONS;
      const snapshot = yield* posts.readHistorySnapshot({
        postId: input.postId,
        ...(input.beforeRevision === undefined ? {} : { beforeRevision: input.beforeRevision }),
        limit: limit + 1,
      });
      if (Option.isNone(snapshot)) return Option.none();
      const rows = snapshot.value.revisions;
      const revisions = rows.slice(0, limit);
      const oldest = revisions.at(-1);
      return Option.some({
        postId: input.postId,
        currentRevision: snapshot.value.currentRevision,
        revisions,
        beforeRevision: rows.length > limit && oldest !== undefined ? oldest.revision : null,
      });
    }),
    listAfterSequenceThroughHead: posts.listAfterSequenceThroughHead,
    readAfterSequenceSnapshot: (afterSequence, maxGap) =>
      posts.readAfterSnapshot({
        projector: BOARD_POSTS_PROJECTOR,
        afterSequence,
        maxGap,
      }),
  });
});

export const BoardQueryCoreLive = Layer.effect(BoardQuery, makeBoardQuery);

export const BoardQueryLive = BoardQueryCoreLive.pipe(
  Layer.provideMerge(ProjectionBoardPostRepositoryLive),
);
