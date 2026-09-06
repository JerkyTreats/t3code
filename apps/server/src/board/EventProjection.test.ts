import {
  AuthClientId,
  BOARD_AGGREGATE_ID,
  BoardAuthorId,
  BoardPostId,
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type {
  ProjectionBoardPost,
  ReviseProjectionBoardPostInput,
  ReviseProjectionBoardPostOutcome,
} from "../persistence/Services/ProjectionBoardPosts.ts";
import { applyBoardEventProjection, projectBoardEventOntoReadModel } from "./EventProjection.ts";

const publishedAt = "2026-08-30T12:00:00.000Z";
const revisedAt = "2026-08-30T12:01:00.000Z";
const postId = BoardPostId.make("post-board-projection-owner");
const source = {
  projectId: ProjectId.make("project-board-projection-owner"),
  threadId: ThreadId.make("thread-board-projection-owner"),
};
const historicalSource = {
  kind: "collective-expedition" as const,
  expeditionId: "expedition-board-projection-owner",
  residentId: "resident-board-projection-owner",
};

const publishedEvent = {
  sequence: 41,
  eventId: EventId.make("event-board-projection-published"),
  aggregateKind: "board",
  aggregateId: BOARD_AGGREGATE_ID,
  occurredAt: publishedAt,
  commandId: CommandId.make("command-board-projection-published"),
  causationEventId: null,
  correlationId: CommandId.make("command-board-projection-published"),
  metadata: {},
  type: "board.post-published",
  payload: {
    postId,
    author: {
      kind: "agent",
      id: BoardAuthorId.make("legacy-provider-session-id"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    },
    source,
    body: "Legacy authored post",
    targets: ["collective"],
    createdAt: publishedAt,
  },
} satisfies Extract<OrchestrationEvent, { type: "board.post-published" }>;

const revisedEvent = {
  sequence: 47,
  eventId: EventId.make("event-board-projection-revised"),
  aggregateKind: "board",
  aggregateId: BOARD_AGGREGATE_ID,
  occurredAt: revisedAt,
  commandId: CommandId.make("command-board-projection-revised"),
  causationEventId: null,
  correlationId: CommandId.make("command-board-projection-revised"),
  metadata: {},
  type: "board.post-revised",
  payload: {
    postId,
    previousRevision: 1,
    revision: 2,
    editor: {
      kind: "environment-owner",
      clientId: AuthClientId.make("private-owner-client"),
    },
    editorSource: null,
    body: "Corrected post",
    targets: ["verified"],
    revisedAt,
  },
} satisfies Extract<OrchestrationEvent, { type: "board.post-revised" }>;

function makeRepository(input: {
  readonly insert?: (post: ProjectionBoardPost) => Effect.Effect<void>;
  readonly revise?: (
    revision: typeof ReviseProjectionBoardPostInput.Type,
  ) => Effect.Effect<ReviseProjectionBoardPostOutcome>;
}) {
  return {
    insert: input.insert ?? (() => Effect.void),
    revise: input.revise ?? (() => Effect.succeed({ _tag: "changed" as const })),
  };
}

it.effect("Board projection remaps legacy authors and creates revision one", () =>
  Effect.gen(function* () {
    const inserted: ProjectionBoardPost[] = [];

    yield* applyBoardEventProjection({
      event: publishedEvent,
      repository: makeRepository({
        insert: (post) => Effect.sync(() => void inserted.push(post)),
      }),
    });

    expect(inserted).toEqual([
      {
        id: postId,
        author: {
          kind: "agent",
          id: BoardAuthorId.make("legacy-post-board-projection-owner"),
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        source,
        body: "Legacy authored post",
        targets: ["collective"],
        sequence: 41,
        createdAt: publishedAt,
        revision: 1,
        updatedSequence: 41,
        updatedAt: publishedAt,
        lastEditor: { kind: "agent" },
        lastEditorSource: source,
      },
    ]);
  }),
);

it.effect("Board projection preserves historical resident provenance without its runtime", () =>
  Effect.gen(function* () {
    const inserted: ProjectionBoardPost[] = [];
    const historicalEvent = {
      ...publishedEvent,
      payload: { ...publishedEvent.payload, source: historicalSource },
    } satisfies Extract<OrchestrationEvent, { type: "board.post-published" }>;

    yield* applyBoardEventProjection({
      event: historicalEvent,
      repository: makeRepository({
        insert: (post) => Effect.sync(() => void inserted.push(post)),
      }),
    });

    expect(inserted[0]?.source).toEqual(historicalSource);
    expect(inserted[0]?.lastEditorSource).toEqual(historicalSource);
  }),
);

it.effect("Board projection strips private revision identity before compare and swap", () =>
  Effect.gen(function* () {
    const revisions: Array<typeof ReviseProjectionBoardPostInput.Type> = [];

    yield* applyBoardEventProjection({
      event: revisedEvent,
      repository: makeRepository({
        revise: (revision) =>
          Effect.sync(() => {
            revisions.push(revision);
            return { _tag: "changed" as const };
          }),
      }),
    });

    expect(revisions).toEqual([
      {
        postId,
        previousRevision: 1,
        revision: 2,
        editor: { kind: "environment-owner" },
        editorSource: null,
        body: "Corrected post",
        targets: ["verified"],
        editedAt: revisedAt,
        eventSequence: 47,
      },
    ]);
  }),
);

it.effect("Board projection fails on revision compare and swap conflict", () =>
  Effect.gen(function* () {
    const error = yield* applyBoardEventProjection({
      event: revisedEvent,
      repository: makeRepository({
        revise: () => Effect.succeed({ _tag: "conflict", actualRevision: 3 }),
      }),
    }).pipe(Effect.flip);

    expect(error._tag).toBe("PersistenceSqlError");
    if (error._tag !== "PersistenceSqlError") return;
    expect(error.operation).toBe("ProjectionBoardPostRepository.revise");
    expect(error.detail).toBe(
      "Board post 'post-board-projection-owner' expected revision 1 but is revision 3.",
    );
  }),
);

it.effect("Board projection fails when a revised post is absent", () =>
  Effect.gen(function* () {
    const error = yield* applyBoardEventProjection({
      event: revisedEvent,
      repository: makeRepository({ revise: () => Effect.succeed({ _tag: "not-found" }) }),
    }).pipe(Effect.flip);

    expect(error._tag).toBe("PersistenceSqlError");
    if (error._tag !== "PersistenceSqlError") return;
    expect(error.detail).toBe("Board post 'post-board-projection-owner' was not found.");
  }),
);

it("Board read-model projection advances only the orchestration watermark", () => {
  const model: OrchestrationReadModel = {
    snapshotSequence: 40,
    projects: [],
    threads: [],
    updatedAt: publishedAt,
  };

  expect(projectBoardEventOntoReadModel(model, revisedEvent)).toEqual({
    ...model,
    snapshotSequence: 47,
    updatedAt: revisedAt,
  });
});
