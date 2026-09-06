import {
  BoardPostId,
  CommandId,
  OrchestrationBoardRevisionError,
  type OrchestrationBoardAuditEditor,
  type BoardPost,
  type BoardPostSource,
  type BoardReviseInput,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Board, BoardPublicationError, type BoardShape } from "../Services/Board.ts";
import { BoardQuery } from "../Services/BoardQuery.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";

const isBoardPublicationError = Schema.is(BoardPublicationError);

const makeBoard = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const engine = yield* OrchestrationEngineService;
  const query = yield* BoardQuery;
  const snapshotQuery = yield* ProjectionSnapshotQuery;

  const publish: BoardShape["publish"] = Effect.fn("Board.publish")(
    function* (publisher, input) {
      const thread = yield* snapshotQuery.getThreadShellById(publisher.threadId);
      if (Option.isNone(thread)) {
        return yield* new BoardPublicationError({
          message: "The trusted Board publisher thread is unavailable.",
        });
      }
      const identifier = yield* crypto.randomUUIDv4;
      const createdAt = DateTime.formatIso(yield* DateTime.now);
      const result = yield* engine.dispatch({
        type: "board.post.publish",
        commandId: CommandId.make(`provider:board:${identifier}`),
        postId: BoardPostId.make(identifier),
        author: {
          kind: "agent",
          id: publisher.authorId,
          providerInstanceId: publisher.providerInstanceId,
        },
        source: {
          projectId: thread.value.projectId,
          threadId: publisher.threadId,
        },
        body: input.body,
        targets: input.targets ?? [],
        createdAt,
      });
      const post = yield* query.getPostBySequence(result.sequence);
      if (Option.isNone(post)) {
        return yield* new BoardPublicationError({
          message: "The accepted Board post is missing from the global projection.",
        });
      }
      return post.value satisfies BoardPost;
    },
    Effect.mapError((cause) =>
      isBoardPublicationError(cause)
        ? cause
        : new BoardPublicationError({
            message: "Failed to publish the Board post.",
            cause,
          }),
    ),
  );

  const conflict = (input: BoardReviseInput, currentPost: BoardPost) =>
    new OrchestrationBoardRevisionError({
      reason: "conflict",
      message: `Board post '${input.postId}' changed after revision ${input.expectedRevision}.`,
      expectedRevision: input.expectedRevision,
      actualRevision: currentPost.revision,
      currentPost,
    });

  const revise = Effect.fn("Board.revise")(function* (
    input: BoardReviseInput,
    editor: OrchestrationBoardAuditEditor,
    editorSource: BoardPostSource | null,
    authorize: (current: BoardPost) => boolean,
  ) {
    const current = yield* query.getPostById(input.postId).pipe(
      Effect.mapError(
        (cause) =>
          new OrchestrationBoardRevisionError({
            reason: "unavailable",
            message: "Failed to load the current Board post.",
            cause,
          }),
      ),
    );
    if (Option.isNone(current)) {
      return yield* new OrchestrationBoardRevisionError({
        reason: "not-found",
        message: `Board post '${input.postId}' was not found.`,
      });
    }
    if (!authorize(current.value)) {
      return yield* new OrchestrationBoardRevisionError({
        reason: "forbidden",
        message: "The trusted Board identity cannot revise this post.",
      });
    }
    if (current.value.revision !== input.expectedRevision) {
      return yield* conflict(input, current.value);
    }
    if (
      current.value.body === input.body &&
      current.value.targets.length === input.targets.length &&
      current.value.targets.every((target, index) => target === input.targets[index])
    ) {
      return current.value;
    }

    const identifier = yield* crypto.randomUUIDv4.pipe(
      Effect.mapError(
        (cause) =>
          new OrchestrationBoardRevisionError({
            reason: "unavailable",
            message: "Failed to create a trusted Board revision identity.",
            cause,
          }),
      ),
    );
    const revisedAt = DateTime.formatIso(yield* DateTime.now);
    const dispatched = yield* Effect.result(
      engine.dispatch({
        type: "board.post.revise",
        commandId: CommandId.make(`board:revise:${identifier}`),
        postId: input.postId,
        previousRevision: input.expectedRevision,
        revision: input.expectedRevision + 1,
        editor,
        editorSource,
        body: input.body,
        targets: input.targets,
        revisedAt,
      }),
    );

    if (dispatched._tag === "Failure") {
      const latest = yield* query.getPostById(input.postId).pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationBoardRevisionError({
              reason: "unavailable",
              message: "Failed to reconcile a rejected Board revision.",
              cause,
            }),
        ),
      );
      if (Option.isSome(latest) && latest.value.revision !== input.expectedRevision) {
        return yield* conflict(input, latest.value);
      }
      return yield* new OrchestrationBoardRevisionError({
        reason: "unavailable",
        message: "Failed to revise the Board post.",
        cause: dispatched.failure,
      });
    }

    const updated = yield* query.getPostById(input.postId).pipe(
      Effect.mapError(
        (cause) =>
          new OrchestrationBoardRevisionError({
            reason: "unavailable",
            message: "The accepted Board revision could not be loaded.",
            cause,
          }),
      ),
    );
    if (Option.isNone(updated)) {
      return yield* new OrchestrationBoardRevisionError({
        reason: "unavailable",
        message: "The accepted Board revision is missing from the global projection.",
      });
    }
    return updated.value;
  });

  const reviseAsAgent: BoardShape["reviseAsAgent"] = Effect.fn("Board.reviseAsAgent")(
    function* (publisher, input) {
      const thread = yield* snapshotQuery.getThreadShellById(publisher.threadId).pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationBoardRevisionError({
              reason: "unavailable",
              message: "Failed to authenticate the Board editor thread.",
              cause,
            }),
        ),
      );
      if (Option.isNone(thread)) {
        return yield* new OrchestrationBoardRevisionError({
          reason: "forbidden",
          message: "The trusted Board editor thread is unavailable.",
        });
      }
      const editor = {
        kind: "agent" as const,
        id: publisher.authorId,
        providerInstanceId: publisher.providerInstanceId,
      };
      const editorSource = {
        projectId: thread.value.projectId,
        threadId: publisher.threadId,
      };
      return yield* revise(
        input,
        editor,
        editorSource,
        (current) =>
          current.source.kind !== "collective-expedition" &&
          current.source.threadId === publisher.threadId &&
          current.author.providerInstanceId === publisher.providerInstanceId,
      );
    },
  );

  const reviseAsOwner: BoardShape["reviseAsOwner"] = Effect.fn("Board.reviseAsOwner")(
    function* (clientId, input) {
      return yield* revise(input, { kind: "environment-owner", clientId }, null, () => true);
    },
  );

  return Board.of({ publish, reviseAsAgent, reviseAsOwner });
});

export const BoardLive = Layer.effect(Board, makeBoard);
