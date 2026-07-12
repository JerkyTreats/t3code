import {
  CommandId,
  EventId,
  IsoDateTime,
  NonNegativeInt,
  OrchestrationEvent,
  OrchestrationEventMetadata,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  PersistenceDecodeError,
  toPersistenceDecodeError,
  toPersistenceSqlError,
  type ProjectionRepositoryError,
} from "../../persistence/Errors.ts";
import {
  PendingProviderTurnStartQuery,
  type PendingProviderTurnStart,
  type PendingProviderTurnStartQueryShape,
} from "../Services/PendingProviderTurnStartQuery.ts";

const PendingProviderTurnStartDbRow = Schema.Struct({
  sequence: NonNegativeInt,
  eventId: EventId,
  threadId: ThreadId,
  occurredAt: IsoDateTime,
  commandId: Schema.NullOr(CommandId),
  causationEventId: Schema.NullOr(EventId),
  correlationId: Schema.NullOr(CommandId),
  payload: Schema.fromJsonString(Schema.Unknown),
  metadata: Schema.fromJsonString(OrchestrationEventMetadata),
});

const PendingProviderTurnStartPageInput = Schema.Struct({
  sequenceExclusive: NonNegativeInt,
  limit: NonNegativeInt,
});

const decodeEvent = Schema.decodeUnknownEffect(OrchestrationEvent);
const MAX_PAGE_SIZE = 100;

function toPersistenceSqlOrDecodeError(cause: unknown): ProjectionRepositoryError {
  return Schema.isSchemaError(cause)
    ? toPersistenceDecodeError("PendingProviderTurnStartQuery.list:decodeRows")(cause)
    : toPersistenceSqlError("PendingProviderTurnStartQuery.list:query")(cause);
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const listRows = SqlSchema.findAll({
    Request: PendingProviderTurnStartPageInput,
    Result: PendingProviderTurnStartDbRow,
    execute: ({ sequenceExclusive, limit }) =>
      sql`
        SELECT
          event.sequence,
          event.event_id AS "eventId",
          event.stream_id AS "threadId",
          event.occurred_at AS "occurredAt",
          event.command_id AS "commandId",
          event.causation_event_id AS "causationEventId",
          event.correlation_id AS "correlationId",
          event.payload_json AS "payload",
          event.metadata_json AS "metadata"
        FROM projection_turns AS pending
        INNER JOIN projection_threads AS thread
          ON thread.thread_id = pending.thread_id
          AND thread.deleted_at IS NULL
        INNER JOIN orchestration_events AS event
          ON event.aggregate_kind = 'thread'
          AND event.stream_id = pending.thread_id
          AND event.event_type = 'thread.turn-start-requested'
          AND json_extract(event.payload_json, '$.messageId') = pending.pending_message_id
          AND json_extract(event.payload_json, '$.createdAt') = pending.requested_at
        WHERE pending.turn_id IS NULL
          AND pending.state = 'pending'
          AND pending.pending_message_id IS NOT NULL
          AND pending.checkpoint_turn_count IS NULL
          AND event.sequence > ${sequenceExclusive}
          AND NOT EXISTS (
            SELECT 1
            FROM projection_turns AS concrete
            WHERE concrete.thread_id = pending.thread_id
              AND concrete.turn_id IS NOT NULL
              AND concrete.pending_message_id = pending.pending_message_id
          )
        ORDER BY event.sequence ASC
        LIMIT ${limit}
      `,
  });

  const list: PendingProviderTurnStartQueryShape["list"] = Effect.fn(
    "PendingProviderTurnStartQuery.list",
  )(function* (sequenceExclusive, limit) {
    const normalizedSequence = Math.max(0, Math.floor(sequenceExclusive));
    const normalizedLimit = Math.min(MAX_PAGE_SIZE, Math.max(0, Math.floor(limit)));
    if (normalizedLimit === 0) {
      return [];
    }
    const rows = yield* listRows({
      sequenceExclusive: normalizedSequence,
      limit: normalizedLimit,
    }).pipe(Effect.mapError(toPersistenceSqlOrDecodeError));
    return yield* Effect.forEach(rows, (row) =>
      decodeEvent({
        sequence: row.sequence,
        eventId: row.eventId,
        type: "thread.turn-start-requested",
        aggregateKind: "thread",
        aggregateId: row.threadId,
        occurredAt: row.occurredAt,
        commandId: row.commandId,
        causationEventId: row.causationEventId,
        correlationId: row.correlationId,
        payload: row.payload,
        metadata: row.metadata,
      }).pipe(
        Effect.mapError(toPersistenceDecodeError("PendingProviderTurnStartQuery.list:decodeEvent")),
        Effect.flatMap((event) =>
          event.type === "thread.turn-start-requested"
            ? Effect.succeed(event satisfies PendingProviderTurnStart)
            : Effect.fail(
                new PersistenceDecodeError({
                  operation: "PendingProviderTurnStartQuery.list:eventType",
                  issue: `Expected thread.turn-start-requested, received ${event.type}.`,
                }),
              ),
        ),
      ),
    );
  });

  return PendingProviderTurnStartQuery.of({ list });
});

export const PendingProviderTurnStartQueryLive = Layer.effect(PendingProviderTurnStartQuery, make);
