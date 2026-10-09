import {
  AuthClientId,
  BOARD_AGGREGATE_ID,
  BoardPostId,
  CommandId,
  EventId,
  BoardAuthorId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as SqlClient from "effect/sql/SqlClient";

import { BOARD_POSTS_PROJECTOR } from "../../board/EventProjection.ts";
import { OrchestrationEventStore } from "../../persistence/OrchestrationEventStore.ts";
import { BoardLive } from "./Board.ts";
import { Board } from "../Services/Board.ts";
import { BoardQuery } from "../Services/BoardQuery.ts";
import { BoardTestLayer as TestLayer, seedBoardThread } from "../../board/BoardTestSupport.ts";

it.layer(TestLayer)("global Board owner", (it) => {
  it.effect(
    "publishes across projects and threads with trusted authors, global targets, and durable order",
    () =>
      Effect.gen(function* () {
        const board = yield* Board;
        const query = yield* BoardQuery;
        const sql = yield* SqlClient.SqlClient;

        for (const suffix of ["one", "two"] as const) {
          yield* seedBoardThread(
            ThreadId.make(`thread-${suffix}`),
            ProjectId.make(`project-${suffix}`),
          );
        }

        const first = yield* board.publish(
          {
            authorId: BoardAuthorId.make("board-public-trusted-agent-one"),
            providerInstanceId: ProviderInstanceId.make("codex"),
            threadId: ThreadId.make("thread-one"),
          },
          { body: "First global note", targets: ["trusted-agent-two"] },
        );
        const second = yield* board.publish(
          {
            authorId: BoardAuthorId.make("board-public-trusted-agent-two"),
            providerInstanceId: ProviderInstanceId.make("claude"),
            threadId: ThreadId.make("thread-two"),
          },
          { body: "Second global note" },
        );

        const page = yield* query.getPage({});
        assert.deepStrictEqual(
          page.posts.map((post) => post.id),
          [first.id, second.id],
        );
        assert.deepStrictEqual(page.posts[0], first);
        assert.deepStrictEqual(page.posts[1], second);
        assert.deepStrictEqual(first.targets, ["trusted-agent-two"]);
        assert.strictEqual(first.author.id, "board-public-trusted-agent-one");
        assert.strictEqual(second.author.id, "board-public-trusted-agent-two");
        assert.deepStrictEqual(first.source, {
          projectId: ProjectId.make("project-one"),
          threadId: ThreadId.make("thread-one"),
        });
        assert.deepStrictEqual(second.source, {
          projectId: ProjectId.make("project-two"),
          threadId: ThreadId.make("thread-two"),
        });
        assert.ok(first.sequence < second.sequence);
        assert.strictEqual(page.headSequence, second.sequence);

        const receipts = yield* sql<{ readonly count: number }>`
          SELECT COUNT(*) AS count
          FROM orchestration_command_receipts
          WHERE aggregate_kind = 'board'
            AND aggregate_id = 'environment-global-board'
            AND status = 'accepted'
        `;
        assert.deepStrictEqual(receipts, [{ count: 2 }]);

        const afterDeletion = yield* query.getPage({});
        assert.deepStrictEqual(afterDeletion.posts, page.posts);
        assert.strictEqual(afterDeletion.headSequence, page.headSequence);
      }),
  );

  it.effect("revises through trusted agent and owner identities with durable conflicts", () =>
    Effect.gen(function* () {
      const board = yield* Board;
      const query = yield* BoardQuery;
      const sql = yield* SqlClient.SqlClient;

      yield* seedBoardThread(ThreadId.make("revision-thread"), ProjectId.make("revision-project"));

      const original = yield* board.publish(
        {
          authorId: BoardAuthorId.make("board-public-initial-session"),
          providerInstanceId: ProviderInstanceId.make("codex"),
          threadId: ThreadId.make("revision-thread"),
        },
        { body: "Known wrong claim", targets: ["collective"] },
      );
      assert.strictEqual(original.revision, 1);
      assert.strictEqual(original.updatedSequence, original.sequence);

      const forbidden = yield* Effect.result(
        board.reviseAsAgent(
          {
            authorId: BoardAuthorId.make("other-session"),
            providerInstanceId: ProviderInstanceId.make("claude"),
            threadId: ThreadId.make("revision-thread"),
          },
          {
            postId: original.id,
            expectedRevision: 1,
            body: "Untrusted correction",
            targets: [],
          },
        ),
      );
      assert.isTrue(Result.isFailure(forbidden));
      if (Result.isFailure(forbidden)) assert.strictEqual(forbidden.failure.reason, "forbidden");

      const corrected = yield* board.reviseAsAgent(
        {
          authorId: BoardAuthorId.make("rotated-session"),
          providerInstanceId: ProviderInstanceId.make("codex"),
          threadId: ThreadId.make("revision-thread"),
        },
        {
          postId: original.id,
          expectedRevision: 1,
          body: "Corrected claim",
          targets: ["collective", "review"],
        },
      );
      assert.strictEqual(corrected.revision, 2);
      assert.strictEqual(corrected.sequence, original.sequence);
      assert.ok(corrected.updatedSequence > original.updatedSequence);
      assert.strictEqual(corrected.author.id, "board-public-initial-session");
      assert.deepStrictEqual(corrected.lastEditor, {
        kind: "agent",
      });

      const noOp = yield* board.reviseAsAgent(
        {
          authorId: BoardAuthorId.make("another-rotation"),
          providerInstanceId: ProviderInstanceId.make("codex"),
          threadId: ThreadId.make("revision-thread"),
        },
        {
          postId: original.id,
          expectedRevision: 2,
          body: corrected.body,
          targets: corrected.targets,
        },
      );
      assert.deepStrictEqual(noOp, corrected);

      const stale = yield* Effect.result(
        board.reviseAsOwner(AuthClientId.make("owner-client"), {
          postId: original.id,
          expectedRevision: 1,
          body: "Stale owner draft",
          targets: [],
        }),
      );
      assert.isTrue(Result.isFailure(stale));
      if (Result.isFailure(stale)) {
        assert.strictEqual(stale.failure.reason, "conflict");
        assert.strictEqual(stale.failure.actualRevision, 2);
        assert.strictEqual(stale.failure.currentPost?.body, "Corrected claim");
      }

      const ownerCorrection = yield* board.reviseAsOwner(AuthClientId.make("owner-client"), {
        postId: original.id,
        expectedRevision: 2,
        body: "Owner verified correction",
        targets: ["collective"],
      });
      assert.strictEqual(ownerCorrection.revision, 3);
      assert.deepStrictEqual(ownerCorrection.lastEditor, {
        kind: "environment-owner",
      });
      assert.strictEqual(ownerCorrection.lastEditorSource, null);

      const concurrent = yield* Effect.all(
        ["Concurrent correction A", "Concurrent correction B"].map((body) =>
          Effect.result(
            board.reviseAsOwner(AuthClientId.make("owner-client"), {
              postId: original.id,
              expectedRevision: 3,
              body,
              targets: ["collective"],
            }),
          ),
        ),
        { concurrency: "unbounded" },
      );
      const winners = concurrent.filter(Result.isSuccess);
      const conflicts = concurrent.filter(Result.isFailure);
      assert.strictEqual(winners.length, 1);
      assert.strictEqual(conflicts.length, 1);
      const winner = winners[0]?.success;
      assert.strictEqual(winner?.revision, 4);
      assert.strictEqual(conflicts[0]?.failure.reason, "conflict");
      assert.strictEqual(conflicts[0]?.failure.actualRevision, 4);

      yield* sql`
        UPDATE projection_board_posts
        SET
          source_json = '{"kind":"collective-expedition","expeditionId":"expedition-legacy","residentId":"resident-legacy"}',
          last_editor_source_json = '{"kind":"collective-expedition","expeditionId":"expedition-legacy","residentId":"resident-legacy"}'
        WHERE post_id = ${original.id}
      `;
      const historicalAgent = yield* Effect.result(
        board.reviseAsAgent(
          {
            authorId: BoardAuthorId.make("legacy-resident"),
            providerInstanceId: ProviderInstanceId.make("codex"),
            threadId: ThreadId.make("revision-thread"),
          },
          {
            postId: original.id,
            expectedRevision: 4,
            body: "Resident runtime is retired",
            targets: [],
          },
        ),
      );
      assert.isTrue(Result.isFailure(historicalAgent));
      if (Result.isFailure(historicalAgent)) {
        assert.strictEqual(historicalAgent.failure.reason, "forbidden");
      }
      const historicalOwner = yield* board.reviseAsOwner(AuthClientId.make("owner-client"), {
        postId: original.id,
        expectedRevision: 4,
        body: "Historical provenance remains readable",
        targets: ["collective"],
      });
      assert.strictEqual(historicalOwner.revision, 5);
      assert.strictEqual(historicalOwner.source.kind, "collective-expedition");

      const page = yield* query.getPage({});
      assert.strictEqual(page.posts.at(-1)?.body, historicalOwner.body);
      assert.strictEqual(page.posts.filter(({ id }) => id === original.id).length, 1);
      const history = yield* query.getHistory({ postId: original.id });
      assert.isTrue(Option.isSome(history));
      if (Option.isSome(history)) {
        assert.deepStrictEqual(
          history.value.revisions.map(({ revision, body }) => ({ revision, body })),
          [
            { revision: 5, body: "Historical provenance remains readable" },
            { revision: 4, body: winner?.body },
            { revision: 3, body: "Owner verified correction" },
            { revision: 2, body: "Corrected claim" },
            { revision: 1, body: "Known wrong claim" },
          ],
        );
      }
    }),
  );
});

it.layer(TestLayer)("Board transaction replacement host", (it) => {
  it.effect(
    "rolls back event, current content, history and cursor when receipt persistence fails",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const board = yield* Board;
        const query = yield* BoardQuery;
        yield* seedBoardThread(ThreadId.make("atomic-thread"), ProjectId.make("atomic-project"));
        const before = yield* query.getPage({});
        const counts = () => sql<{ events: number; posts: number; revisions: number }>`
        SELECT (SELECT COUNT(*) FROM orchestration_events WHERE aggregate_kind = 'board') AS events,
          (SELECT COUNT(*) FROM projection_board_posts) AS posts,
          (SELECT COUNT(*) FROM projection_board_post_revisions) AS revisions
      `;
        const beforeCounts = yield* counts();
        yield* sql`CREATE TRIGGER reject_board_receipt BEFORE INSERT ON orchestration_command_receipts
        WHEN NEW.aggregate_kind = 'board' BEGIN SELECT RAISE(ABORT, 'synthetic receipt rejection'); END`;
        const result = yield* Effect.result(
          board.publish(
            {
              authorId: BoardAuthorId.make("board-public-atomic"),
              providerInstanceId: ProviderInstanceId.make("codex"),
              threadId: ThreadId.make("atomic-thread"),
            },
            { body: "Must roll back" },
          ),
        );
        assert.isTrue(Result.isFailure(result));
        assert.deepStrictEqual(yield* counts(), beforeCounts);
        assert.deepStrictEqual(yield* query.getPage({}), before);
        yield* sql`DROP TRIGGER reject_board_receipt`;
      }),
  );

  it.effect("rebuilds historical Board publication and correction through the current owner", () =>
    Effect.gen(function* () {
      const store = yield* OrchestrationEventStore;
      const sql = yield* SqlClient.SqlClient;
      const query = yield* BoardQuery;
      const source = {
        kind: "collective-expedition" as const,
        expeditionId: "synthetic-expedition",
        residentId: "synthetic-resident",
      };
      const published = yield* store.appendBoardEvent({
        eventId: EventId.make("historical-board-publication"),
        aggregateKind: "board",
        aggregateId: BOARD_AGGREGATE_ID,
        type: "board.post-published",
        occurredAt: "2026-08-20T00:00:00.000Z",
        commandId: CommandId.make("historical-publish"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          postId: BoardPostId.make("historical-post"),
          author: {
            kind: "agent",
            id: BoardAuthorId.make("historical-private-session"),
            providerInstanceId: ProviderInstanceId.make("codex"),
          },
          source,
          body: "Historical original",
          targets: [],
          createdAt: "2026-08-20T00:00:00.000Z",
        },
      });
      const revised = yield* store.appendBoardEvent({
        eventId: EventId.make("historical-board-revision"),
        aggregateKind: "board",
        aggregateId: BOARD_AGGREGATE_ID,
        type: "board.post-revised",
        occurredAt: "2026-08-21T00:00:00.000Z",
        commandId: CommandId.make("historical-revise"),
        causationEventId: null,
        correlationId: null,
        metadata: {},
        payload: {
          postId: BoardPostId.make("historical-post"),
          previousRevision: 1,
          revision: 2,
          editor: {
            kind: "environment-owner",
            clientId: AuthClientId.make("synthetic-private-owner"),
          },
          editorSource: null,
          body: "Historical correction",
          targets: ["attention"],
          revisedAt: "2026-08-21T00:00:00.000Z",
        },
      });
      yield* sql`UPDATE orchestration_events SET application_event_version = 1
        WHERE sequence IN (${published.sequence}, ${revised.sequence})`;
      yield* sql`DELETE FROM projection_board_post_revisions`;
      yield* sql`DELETE FROM projection_board_posts`;
      yield* sql`DELETE FROM projection_state WHERE projector = ${BOARD_POSTS_PROJECTOR}`;
      yield* Board.pipe(Effect.provide(Layer.fresh(BoardLive)));
      const current = yield* query.getPostById(BoardPostId.make("historical-post"));
      assert.isTrue(Option.isSome(current));
      if (Option.isNone(current)) return;
      assert.strictEqual(current.value.author.id, "legacy-historical-post");
      assert.strictEqual(current.value.sequence, published.sequence);
      assert.strictEqual(current.value.updatedSequence, revised.sequence);
      assert.strictEqual(current.value.revision, 2);
      assert.strictEqual(current.value.body, "Historical correction");
      assert.deepStrictEqual(current.value.source, source);
      const history = yield* query.getHistory({ postId: current.value.id });
      assert.isTrue(Option.isSome(history));
      if (Option.isSome(history))
        assert.deepStrictEqual(
          history.value.revisions.map((row) => row.body),
          ["Historical correction", "Historical original"],
        );
      assert.strictEqual(yield* query.getHeadSequence, revised.sequence);
    }),
  );
});
