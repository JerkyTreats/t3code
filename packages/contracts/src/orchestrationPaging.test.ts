import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  ORCHESTRATION_WS_METHODS,
  OrchestrationRpcSchemas,
  OrchestrationThreadCheckpointPageInput,
  OrchestrationThreadCheckpointPageResult,
  OrchestrationThreadMessagePageInput,
  OrchestrationThreadMessagePageResult,
  OrchestrationThreadProposedPlanPageInput,
  OrchestrationThreadProposedPlanPageResult,
} from "./orchestration.ts";
import {
  WsOrchestrationGetThreadCheckpointPageRpc,
  WsOrchestrationGetThreadMessagePageRpc,
  WsOrchestrationGetThreadProposedPlanPageRpc,
  WsRpcGroup,
} from "./rpc.ts";

const decodeMessagePageInput = Schema.decodeUnknownEffect(OrchestrationThreadMessagePageInput);
const decodeProposedPlanPageInput = Schema.decodeUnknownEffect(
  OrchestrationThreadProposedPlanPageInput,
);
const decodeCheckpointPageInput = Schema.decodeUnknownEffect(
  OrchestrationThreadCheckpointPageInput,
);
const decodeMessagePageResult = Schema.decodeUnknownEffect(OrchestrationThreadMessagePageResult);
const decodeProposedPlanPageResult = Schema.decodeUnknownEffect(
  OrchestrationThreadProposedPlanPageResult,
);
const decodeCheckpointPageResult = Schema.decodeUnknownEffect(
  OrchestrationThreadCheckpointPageResult,
);

it.effect("decodes backward history cursors for every non-activity collection", () =>
  Effect.gen(function* () {
    const messages = yield* decodeMessagePageInput({
      threadId: "thread-1",
      limit: 200,
      before: {
        messageId: "message-10",
        createdAt: "2026-07-10T10:00:00.000Z",
      },
    });
    const plans = yield* decodeProposedPlanPageInput({
      threadId: "thread-1",
      limit: 100,
      before: {
        planId: "plan-10",
        createdAt: "2026-07-10T10:00:00.000Z",
      },
    });
    const checkpoints = yield* decodeCheckpointPageInput({
      threadId: "thread-1",
      limit: 200,
      before: {
        checkpointTurnCount: 10,
      },
    });

    assert.strictEqual(messages.before?.messageId, "message-10");
    assert.strictEqual(plans.before?.planId, "plan-10");
    assert.strictEqual(checkpoints.before?.checkpointTurnCount, 10);
  }),
);

it.effect("rejects history page limits above each thread sync window maximum", () =>
  Effect.gen(function* () {
    const messageExit = yield* Effect.exit(
      decodeMessagePageInput({ threadId: "thread-1", limit: 201 }),
    );
    const proposedPlanExit = yield* Effect.exit(
      decodeProposedPlanPageInput({ threadId: "thread-1", limit: 101 }),
    );
    const checkpointExit = yield* Effect.exit(
      decodeCheckpointPageInput({ threadId: "thread-1", limit: 201 }),
    );

    assert.strictEqual(messageExit._tag, "Failure");
    assert.strictEqual(proposedPlanExit._tag, "Failure");
    assert.strictEqual(checkpointExit._tag, "Failure");
  }),
);

it.effect("decodes ordered history page results with resumable start cursors", () =>
  Effect.gen(function* () {
    const messages = yield* decodeMessagePageResult({
      items: [
        {
          id: "message-1",
          role: "user",
          text: "First",
          turnId: "turn-1",
          streaming: false,
          createdAt: "2026-07-10T10:00:00.000Z",
          updatedAt: "2026-07-10T10:00:00.000Z",
        },
        {
          id: "message-2",
          role: "assistant",
          text: "Second",
          turnId: "turn-1",
          streaming: false,
          createdAt: "2026-07-10T10:00:01.000Z",
          updatedAt: "2026-07-10T10:00:01.000Z",
        },
      ],
      startCursor: {
        messageId: "message-1",
        createdAt: "2026-07-10T10:00:00.000Z",
      },
      hasMoreBefore: true,
      estimatedSerializedBytes: 512,
    });
    const plans = yield* decodeProposedPlanPageResult({
      items: [
        {
          id: "plan-1",
          turnId: "turn-1",
          planMarkdown: "First plan",
          createdAt: "2026-07-10T10:00:00.000Z",
          updatedAt: "2026-07-10T10:00:00.000Z",
        },
      ],
      startCursor: {
        planId: "plan-1",
        createdAt: "2026-07-10T10:00:00.000Z",
      },
      hasMoreBefore: false,
      estimatedSerializedBytes: 256,
    });
    const checkpoints = yield* decodeCheckpointPageResult({
      items: [
        {
          turnId: "turn-1",
          checkpointTurnCount: 1,
          checkpointRef: "checkpoint-1",
          status: "ready",
          files: [],
          assistantMessageId: "message-2",
          completedAt: "2026-07-10T10:00:02.000Z",
        },
      ],
      startCursor: {
        checkpointTurnCount: 1,
      },
      hasMoreBefore: false,
      estimatedSerializedBytes: 192,
    });

    assert.deepStrictEqual(
      messages.items.map((item) => item.id),
      ["message-1", "message-2"],
    );
    assert.strictEqual(plans.items[0]?.implementedAt, null);
    assert.strictEqual(plans.items[0]?.implementationThreadId, null);
    assert.strictEqual(checkpoints.items[0]?.checkpointRef, "checkpoint-1");
  }),
);

it("registers all non-activity history page RPCs", () => {
  const registrations = [
    [
      "getThreadMessagePage",
      "orchestration.getThreadMessagePage",
      WsOrchestrationGetThreadMessagePageRpc,
    ],
    [
      "getThreadProposedPlanPage",
      "orchestration.getThreadProposedPlanPage",
      WsOrchestrationGetThreadProposedPlanPageRpc,
    ],
    [
      "getThreadCheckpointPage",
      "orchestration.getThreadCheckpointPage",
      WsOrchestrationGetThreadCheckpointPageRpc,
    ],
  ] as const;

  for (const [methodKey, methodName, rpc] of registrations) {
    assert.strictEqual(ORCHESTRATION_WS_METHODS[methodKey], methodName);
    assert.strictEqual(rpc._tag, methodName);
    assert.strictEqual(WsRpcGroup.requests.get(methodName), rpc);
    assert.isDefined(OrchestrationRpcSchemas[methodKey]);
  }
});
