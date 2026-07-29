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

it("includes thread archive transitions in detail stream events", () => {
  const base = {
    sequence: 5,
    eventId: EventId.make("event-thread-detail-archive"),
    aggregateKind: "thread" as const,
    aggregateId: ThreadId.make("thread-detail-archive"),
    occurredAt: "2026-01-01T00:00:05.000Z",
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
  };
  const archived: OrchestrationEvent = {
    ...base,
    type: "thread.archived",
    payload: {
      threadId: base.aggregateId,
      archivedAt: "2026-01-01T00:00:05.000Z",
      updatedAt: "2026-01-01T00:00:05.000Z",
    },
  };
  const unarchived: OrchestrationEvent = {
    ...base,
    sequence: 6,
    eventId: EventId.make("event-thread-detail-unarchive"),
    type: "thread.unarchived",
    payload: {
      threadId: base.aggregateId,
      updatedAt: "2026-01-01T00:00:06.000Z",
    },
  };

  assert.isTrue(isThreadDetailEvent(archived));
  assert.isTrue(isThreadDetailEvent(unarchived));
});

it("includes settled lifecycle events", () => {
  const base = {
    sequence: 7,
    aggregateKind: "thread" as const,
    aggregateId: ThreadId.make("thread-1"),
    occurredAt: "2026-07-29T00:00:00.000Z",
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
  };
  const settled: OrchestrationEvent = {
    ...base,
    eventId: EventId.make("event-thread-settled"),
    type: "thread.settled",
    payload: {
      threadId: ThreadId.make("thread-1"),
      settledAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
  };
  const unsettled: OrchestrationEvent = {
    ...base,
    sequence: 8,
    eventId: EventId.make("event-thread-unsettled"),
    type: "thread.unsettled",
    payload: {
      threadId: ThreadId.make("thread-1"),
      reason: "activity",
      updatedAt: "2026-07-29T00:01:00.000Z",
    },
  };

  assert.isTrue(isThreadDetailEvent(settled));
  assert.isTrue(isThreadDetailEvent(unsettled));
});
