import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { OrchestrationCommandInvariantError } from "../orchestration/Errors.ts";
import { BOARD_AGGREGATE_REF, type BoardCommand, type BoardEvent } from "./Event.ts";

type PlannedBoardEvent = BoardEvent extends infer Event
  ? Event extends BoardEvent
    ? Omit<Event, "sequence">
    : never
  : never;

type PlannedEventBase = Omit<OrchestrationEvent, "sequence" | "type" | "payload">;

export interface BoardEventBaseInput {
  readonly aggregateKind: typeof BOARD_AGGREGATE_REF.aggregateKind;
  readonly aggregateId: typeof BOARD_AGGREGATE_REF.aggregateId;
  readonly occurredAt: string;
  readonly commandId: BoardCommand["commandId"];
}

/**
 * Converts one admitted Board command into its append-only event. Event identity
 * remains orchestration substrate supplied by makeEventBase. Revision commands
 * fail before identity allocation unless they advance exactly one version.
 */
export function decideBoardCommand<R, E>(input: {
  readonly command: BoardCommand;
  readonly makeEventBase: (input: BoardEventBaseInput) => Effect.Effect<PlannedEventBase, E, R>;
}): Effect.Effect<PlannedBoardEvent, E | OrchestrationCommandInvariantError, R> {
  return Effect.gen(function* () {
    const { command } = input;
    switch (command.type) {
      case "board.post.publish": {
        return {
          ...(yield* input.makeEventBase({
            ...BOARD_AGGREGATE_REF,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          })),
          type: "board.post-published" as const,
          payload: {
            postId: command.postId,
            author: command.author,
            source: command.source,
            body: command.body,
            targets: command.targets,
            createdAt: command.createdAt,
          },
        };
      }

      case "board.post.revise": {
        if (command.revision !== command.previousRevision + 1) {
          return yield* new OrchestrationCommandInvariantError({
            commandType: command.type,
            detail: "A Board revision must advance exactly one version.",
          });
        }
        return {
          ...(yield* input.makeEventBase({
            ...BOARD_AGGREGATE_REF,
            occurredAt: command.revisedAt,
            commandId: command.commandId,
          })),
          type: "board.post-revised" as const,
          payload: {
            postId: command.postId,
            previousRevision: command.previousRevision,
            revision: command.revision,
            editor: command.editor,
            editorSource: command.editorSource,
            body: command.body,
            targets: command.targets,
            revisedAt: command.revisedAt,
          },
        };
      }
    }
  });
}
