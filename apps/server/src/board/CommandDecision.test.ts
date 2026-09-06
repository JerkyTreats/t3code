import {
  AuthClientId,
  BoardAuthorId,
  BoardPostId,
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideBoardCommand, type BoardEventBaseInput } from "./CommandDecision.ts";
import { BOARD_AGGREGATE_REF, boardCommandAggregateRef } from "./Event.ts";

const createdAt = "2026-08-30T12:00:00.000Z";
const source = {
  projectId: ProjectId.make("project-board-owner"),
  threadId: ThreadId.make("thread-board-owner"),
};
const author = {
  kind: "agent" as const,
  id: BoardAuthorId.make("board-public-board-owner"),
  providerInstanceId: ProviderInstanceId.make("codex"),
};

function makeEventBase(input: BoardEventBaseInput) {
  return Effect.succeed({
    eventId: EventId.make(`event-${input.commandId}`),
    aggregateKind: input.aggregateKind,
    aggregateId: input.aggregateId,
    occurredAt: input.occurredAt,
    commandId: input.commandId,
    causationEventId: null,
    correlationId: input.commandId,
    metadata: {},
  });
}

it.effect("Board command decision owns publication event semantics and aggregate identity", () =>
  Effect.gen(function* () {
    const command = {
      type: "board.post.publish",
      commandId: CommandId.make("command-board-publish"),
      postId: BoardPostId.make("post-board-publish"),
      author,
      source,
      body: "The original Board claim",
      targets: ["collective"],
      createdAt,
    } satisfies Extract<OrchestrationCommand, { type: "board.post.publish" }>;

    expect(boardCommandAggregateRef(command)).toBe(BOARD_AGGREGATE_REF);
    const event = yield* decideBoardCommand({ command, makeEventBase });

    expect(event).toEqual({
      eventId: EventId.make("event-command-board-publish"),
      aggregateKind: "board",
      aggregateId: "environment-global-board",
      occurredAt: createdAt,
      commandId: CommandId.make("command-board-publish"),
      causationEventId: null,
      correlationId: CommandId.make("command-board-publish"),
      metadata: {},
      type: "board.post-published",
      payload: {
        postId: BoardPostId.make("post-board-publish"),
        author,
        source,
        body: "The original Board claim",
        targets: ["collective"],
        createdAt,
      },
    });
  }),
);

it.effect("Board command decision preserves trusted revision audit data", () =>
  Effect.gen(function* () {
    const command = {
      type: "board.post.revise",
      commandId: CommandId.make("command-board-revise"),
      postId: BoardPostId.make("post-board-revise"),
      previousRevision: 4,
      revision: 5,
      editor: {
        kind: "environment-owner",
        clientId: AuthClientId.make("owner-client"),
      },
      editorSource: null,
      body: "The corrected Board claim",
      targets: ["verified"],
      revisedAt: createdAt,
    } satisfies Extract<OrchestrationCommand, { type: "board.post.revise" }>;

    const event = yield* decideBoardCommand({ command, makeEventBase });

    expect(event.type).toBe("board.post-revised");
    if (event.type === "board.post-revised") {
      expect(event.payload).toEqual({
        postId: command.postId,
        previousRevision: 4,
        revision: 5,
        editor: command.editor,
        editorSource: null,
        body: "The corrected Board claim",
        targets: ["verified"],
        revisedAt: createdAt,
      });
    }
  }),
);

it.effect(
  "Board command decision rejects a skipped revision before allocating event identity",
  () =>
    Effect.gen(function* () {
      let eventBaseCalls = 0;
      const command = {
        type: "board.post.revise",
        commandId: CommandId.make("command-board-skipped-revision"),
        postId: BoardPostId.make("post-board-skipped-revision"),
        previousRevision: 2,
        revision: 4,
        editor: author,
        editorSource: source,
        body: "Invalid skipped revision",
        targets: [],
        revisedAt: createdAt,
      } satisfies Extract<OrchestrationCommand, { type: "board.post.revise" }>;

      const error = yield* decideBoardCommand({
        command,
        makeEventBase: (input) => {
          eventBaseCalls += 1;
          return makeEventBase(input);
        },
      }).pipe(Effect.flip);

      expect(error._tag).toBe("OrchestrationCommandInvariantError");
      expect(error.commandType).toBe("board.post.revise");
      expect(error.detail).toBe("A Board revision must advance exactly one version.");
      expect(eventBaseCalls).toBe(0);
    }),
);
