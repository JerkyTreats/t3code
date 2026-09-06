import {
  BOARD_AGGREGATE_ID,
  type OrchestrationCommand,
  type OrchestrationEvent,
} from "@t3tools/contracts";

export type BoardCommand = Extract<
  OrchestrationCommand,
  { type: "board.post.publish" | "board.post.revise" }
>;

export type BoardEvent = Extract<
  OrchestrationEvent,
  { type: "board.post-published" | "board.post-revised" }
>;

export const BOARD_AGGREGATE_REF = {
  aggregateKind: "board",
  aggregateId: BOARD_AGGREGATE_ID,
} as const;

export function isBoardCommand(command: OrchestrationCommand): command is BoardCommand {
  return command.type === "board.post.publish" || command.type === "board.post.revise";
}

export function isBoardEvent(event: OrchestrationEvent): event is BoardEvent {
  return event.type === "board.post-published" || event.type === "board.post-revised";
}

export function boardCommandAggregateRef(_command: BoardCommand): typeof BOARD_AGGREGATE_REF {
  return BOARD_AGGREGATE_REF;
}
