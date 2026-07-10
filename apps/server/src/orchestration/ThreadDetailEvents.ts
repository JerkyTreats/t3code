import type { OrchestrationEvent } from "@t3tools/contracts";

export const isThreadDetailEvent = (
  event: OrchestrationEvent,
): event is Extract<
  OrchestrationEvent,
  {
    type:
      | "thread.message-sent"
      | "thread.archived"
      | "thread.unarchived"
      | "thread.proposed-plan-upserted"
      | "thread.activity-appended"
      | "thread.turn-diff-completed"
      | "thread.reverted"
      | "thread.session-set"
      | "thread.deleted";
  }
> =>
  event.type === "thread.message-sent" ||
  event.type === "thread.archived" ||
  event.type === "thread.unarchived" ||
  event.type === "thread.proposed-plan-upserted" ||
  event.type === "thread.activity-appended" ||
  event.type === "thread.turn-diff-completed" ||
  event.type === "thread.reverted" ||
  event.type === "thread.session-set" ||
  event.type === "thread.deleted";
