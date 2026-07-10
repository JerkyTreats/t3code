import { EventId, type OrchestrationEvent, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";

import { isThreadDetailEvent } from "./ThreadDetailEvents.ts";

it("includes thread deletion in detail stream events", () => {
  const threadId = ThreadId.make("thread-detail-deleted");
  const event: Extract<OrchestrationEvent, { type: "thread.deleted" }> = {
    sequence: 4,
    eventId: EventId.make("event-thread-detail-deleted"),
    aggregateKind: "thread",
    aggregateId: threadId,
    occurredAt: "2026-01-01T00:00:04.000Z",
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    type: "thread.deleted",
    payload: {
      threadId,
      deletedAt: "2026-01-01T00:00:04.000Z",
    },
  };

  assert.isTrue(isThreadDetailEvent(event));
});
