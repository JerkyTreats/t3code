import {
  AuthClientId,
  BoardAuthorId,
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ServerConfig } from "../../config.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { Board } from "../Services/Board.ts";
import { BoardQuery } from "../Services/BoardQuery.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { OrchestrationLayerLive } from "../runtimeLayer.ts";

const TestLayer = OrchestrationLayerLive.pipe(
  Layer.provide(RepositoryIdentityResolver.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-global-board-test-" })),
  Layer.provideMerge(NodeServices.layer),
);

const createdAt = "2026-08-28T12:00:00.000Z";
const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5-codex",
} as const;

it.layer(TestLayer)("global Board owner", (it) => {
  it.effect(
    "publishes across projects and threads with trusted authors, global targets, and durable order",
    () =>
      Effect.gen(function* () {
        const engine = yield* OrchestrationEngineService;
        const board = yield* Board;
        const query = yield* BoardQuery;
        const sql = yield* SqlClient.SqlClient;

        for (const suffix of ["one", "two"] as const) {
          yield* engine.dispatch({
            type: "project.create",
            commandId: CommandId.make(`project-command-${suffix}`),
            projectId: ProjectId.make(`project-${suffix}`),
            title: `Project ${suffix}`,
            workspaceRoot: `/workspace/project-${suffix}`,
            defaultModelSelection: modelSelection,
            createdAt,
          });
          yield* engine.dispatch({
            type: "thread.create",
            commandId: CommandId.make(`thread-command-${suffix}`),
            threadId: ThreadId.make(`thread-${suffix}`),
            projectId: ProjectId.make(`project-${suffix}`),
            title: `Thread ${suffix}`,
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt,
          });
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

        yield* engine.dispatch({
          type: "thread.delete",
          commandId: CommandId.make("thread-delete-one"),
          threadId: ThreadId.make("thread-one"),
        });
        const afterDeletion = yield* query.getPage({});
        assert.deepStrictEqual(afterDeletion.posts, page.posts);
        assert.strictEqual(afterDeletion.headSequence, page.headSequence);
      }),
  );

  it.effect("revises through trusted agent and owner identities with durable conflicts", () =>
    Effect.gen(function* () {
      const engine = yield* OrchestrationEngineService;
      const board = yield* Board;
      const query = yield* BoardQuery;
      const sql = yield* SqlClient.SqlClient;

      yield* engine.dispatch({
        type: "project.create",
        commandId: CommandId.make("revision-project-command"),
        projectId: ProjectId.make("revision-project"),
        title: "Revision project",
        workspaceRoot: "/workspace/revision-project",
        defaultModelSelection: modelSelection,
        createdAt,
      });
      yield* engine.dispatch({
        type: "thread.create",
        commandId: CommandId.make("revision-thread-command"),
        threadId: ThreadId.make("revision-thread"),
        projectId: ProjectId.make("revision-project"),
        title: "Revision thread",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt,
      });

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
