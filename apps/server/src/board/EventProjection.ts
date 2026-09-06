import {
  BOARD_AUTHOR_PSEUDONYM_PREFIX,
  BoardAuthorId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { PersistenceSqlError, type ProjectionRepositoryError } from "../persistence/Errors.ts";
import type { ProjectionBoardPostRepositoryShape } from "../persistence/Services/ProjectionBoardPosts.ts";
import { isBoardEvent, type BoardEvent } from "./Event.ts";

type BoardProjectionRepository = Pick<ProjectionBoardPostRepositoryShape, "insert" | "revise">;

/** Durable projection cursor identity shared by Board projection and query owners. */
export const BOARD_POSTS_PROJECTOR = "projection.board-posts";

/**
 * Board events do not add Board rows to the orchestration command read model.
 * They advance its global watermark so later commands observe the durable head.
 */
export function projectBoardEventOntoReadModel(
  model: OrchestrationReadModel,
  event: BoardEvent,
): OrchestrationReadModel {
  return {
    ...model,
    snapshotSequence: event.sequence,
    updatedAt: event.occurredAt,
  };
}

/**
 * Applies one Board event to the current-post and append-only history
 * projection. Revision mismatch or absence is a projection failure so the
 * enclosing orchestration transaction cannot advance its projector cursor.
 * Unmatched orchestration events are ignored for mechanical host delegation.
 */
export function applyBoardEventProjection(input: {
  readonly event: OrchestrationEvent;
  readonly repository: BoardProjectionRepository;
}): Effect.Effect<void, ProjectionRepositoryError> {
  const { event, repository } = input;
  if (!isBoardEvent(event)) return Effect.void;

  return Effect.gen(function* () {
    switch (event.type) {
      case "board.post-published": {
        const author = event.payload.author.id.startsWith(BOARD_AUTHOR_PSEUDONYM_PREFIX)
          ? event.payload.author
          : {
              ...event.payload.author,
              id: BoardAuthorId.make(`legacy-${event.payload.postId.slice(0, 505)}`),
            };
        yield* repository.insert({
          id: event.payload.postId,
          author,
          source: event.payload.source,
          body: event.payload.body,
          targets: event.payload.targets,
          sequence: event.sequence,
          createdAt: event.payload.createdAt,
          revision: 1,
          updatedSequence: event.sequence,
          updatedAt: event.payload.createdAt,
          lastEditor: { kind: "agent" },
          lastEditorSource: event.payload.source,
        });
        return;
      }

      case "board.post-revised": {
        const outcome = yield* repository.revise({
          postId: event.payload.postId,
          previousRevision: event.payload.previousRevision,
          revision: event.payload.revision,
          editor: { kind: event.payload.editor.kind },
          editorSource: event.payload.editorSource,
          body: event.payload.body,
          targets: event.payload.targets,
          editedAt: event.payload.revisedAt,
          eventSequence: event.sequence,
        });
        if (outcome._tag !== "changed") {
          return yield* new PersistenceSqlError({
            operation: "ProjectionBoardPostRepository.revise",
            detail:
              outcome._tag === "not-found"
                ? `Board post '${event.payload.postId}' was not found.`
                : `Board post '${event.payload.postId}' expected revision ${event.payload.previousRevision} but is revision ${outcome.actualRevision}.`,
          });
        }
      }
    }
  });
}
