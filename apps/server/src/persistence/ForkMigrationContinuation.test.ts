import { ProjectId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { ProjectionProjectRepositoryLive } from "./Layers/ProjectionProjects.ts";
import { ProjectionThreadRepositoryLive } from "./Layers/ProjectionThreads.ts";
import { runMigrations } from "./Migrations.ts";
import { ProjectionProjectRepository } from "./Services/ProjectionProjects.ts";
import { ProjectionThreadRepository } from "./Services/ProjectionThreads.ts";

const sqliteLayer = NodeSqliteClient.layerMemory();
const layer = it.layer(
  Layer.mergeAll(ProjectionProjectRepositoryLive, ProjectionThreadRepositoryLive).pipe(
    Layer.provideMerge(sqliteLayer),
  ),
);

const MODEL_SELECTION = '{"instanceId":"codex","model":"gpt-5.6-sol"}';
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const LINKED_PULL_REQUEST = {
  projectId: ProjectId.make("project-reset"),
  repository: "example/t3code-fixture",
  number: 57,
  url: "https://example.test/pulls/57",
};

layer("fork migration continuation", (it) => {
  it.effect("applies repairs and exposes the continued fields through repositories", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const projects = yield* ProjectionProjectRepository;
      const threads = yield* ProjectionThreadRepository;

      yield* runMigrations({ toMigrationInclusive: 53 });

      yield* sql`
        INSERT INTO projection_projects (
          project_id,
          title,
          workspace_root,
          default_model_selection_json,
          default_thread_env_mode,
          favicon_path,
          scripts_json,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES
          (
            'project-automatic',
            'Automatic fixture',
            '/tmp/synthetic-project-automatic',
            ${MODEL_SELECTION},
            NULL,
            NULL,
            '[]',
            '2026-06-01T00:00:00.000Z',
            '2026-06-01T00:00:00.000Z',
            NULL
          ),
          (
            'project-reset',
            'Reset fixture',
            '/tmp/synthetic-project-reset',
            NULL,
            'local',
            NULL,
            '[]',
            '2026-06-02T00:00:00.000Z',
            '2026-06-03T00:00:00.000Z',
            NULL
          )
      `;

      // The explicit null metadata value records a user reset and excludes the
      // earlier creation selection from the automatic-default repair.
      yield* sql`
        INSERT INTO orchestration_events (
          event_id,
          aggregate_kind,
          stream_id,
          stream_version,
          event_type,
          occurred_at,
          command_id,
          causation_event_id,
          correlation_id,
          actor_kind,
          payload_json,
          metadata_json
        )
        VALUES
          (
            'event-automatic-created',
            'project',
            'project-automatic',
            0,
            'project.created',
            '2026-06-01T00:00:00.000Z',
            'command-automatic-created',
            NULL,
            'command-automatic-created',
            'client',
            ${encodeJson({
              projectId: "project-automatic",
              defaultModelSelection: {
                instanceId: "codex",
                model: "gpt-5.6-sol",
              },
              preservedMarker: "automatic-fixture",
            })},
            '{}'
          ),
          (
            'event-reset-created',
            'project',
            'project-reset',
            0,
            'project.created',
            '2026-06-02T00:00:00.000Z',
            'command-reset-created',
            NULL,
            'command-reset-created',
            'client',
            ${encodeJson({
              projectId: "project-reset",
              defaultModelSelection: {
                instanceId: "codex",
                model: "gpt-5.6-sol",
              },
            })},
            '{}'
          ),
          (
            'event-reset-updated',
            'project',
            'project-reset',
            1,
            'project.meta-updated',
            '2026-06-03T00:00:00.000Z',
            'command-reset-updated',
            NULL,
            'command-reset-updated',
            'client',
            ${encodeJson({
              projectId: "project-reset",
              defaultModelSelection: null,
            })},
            '{}'
          )
      `;

      yield* sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model_selection_json,
          runtime_mode,
          interaction_mode,
          linked_pull_request_json,
          latest_turn_id,
          created_at,
          updated_at,
          settled_override,
          settled_at,
          unsettled_at,
          latest_user_message_at,
          deleted_at
        )
        VALUES
          (
            'thread-automatic',
            'project-reset',
            'Automatic settlement fixture',
            ${MODEL_SELECTION},
            'full-access',
            'default',
            ${encodeJson(LINKED_PULL_REQUEST)},
            NULL,
            '2026-06-02T00:00:00.000Z',
            '2026-10-01T00:00:00.000Z',
            'settled',
            '2026-09-01T00:00:00.000Z',
            '2026-07-01T00:00:00.000Z',
            '2026-10-01T00:00:00.000Z',
            NULL
          ),
          (
            'thread-manual',
            'project-reset',
            'Manual settlement fixture',
            ${MODEL_SELECTION},
            'full-access',
            'default',
            NULL,
            NULL,
            '2026-06-02T00:00:00.000Z',
            '2026-08-15T00:00:00.000Z',
            'settled',
            '2026-08-15T00:00:00.000Z',
            NULL,
            '2026-07-15T00:00:00.000Z',
            NULL
          ),
          (
            'thread-mismatched-stamp',
            'project-reset',
            'Mismatched automatic stamp fixture',
            ${MODEL_SELECTION},
            'full-access',
            'default',
            NULL,
            NULL,
            '2026-06-02T00:00:00.000Z',
            '2026-09-02T00:00:00.000Z',
            'settled',
            '2026-09-02T00:00:00.000Z',
            NULL,
            '2026-07-20T00:00:00.000Z',
            NULL
          )
      `;

      // Assistant messages and user activity after the sweep are not eligible
      // timestamps, leaving the earlier user message as the repair boundary.
      yield* sql`
        INSERT INTO projection_thread_messages (
          message_id,
          thread_id,
          turn_id,
          role,
          text,
          is_streaming,
          created_at,
          updated_at
        )
        VALUES
          (
            'message-eligible-user',
            'thread-automatic',
            NULL,
            'user',
            'Eligible prompt',
            0,
            '2026-07-01T00:00:00.000Z',
            '2026-07-01T00:00:00.000Z'
          ),
          (
            'message-assistant',
            'thread-automatic',
            NULL,
            'assistant',
            'Excluded response',
            0,
            '2026-08-01T00:00:00.000Z',
            '2026-08-01T00:00:00.000Z'
          ),
          (
            'message-late-user',
            'thread-automatic',
            NULL,
            'user',
            'Excluded later prompt',
            0,
            '2026-10-01T00:00:00.000Z',
            '2026-10-01T00:00:00.000Z'
          )
      `;

      yield* sql`
        INSERT INTO orchestration_events (
          event_id,
          aggregate_kind,
          stream_id,
          stream_version,
          event_type,
          occurred_at,
          command_id,
          causation_event_id,
          correlation_id,
          actor_kind,
          payload_json,
          metadata_json
        )
        VALUES
          (
            'event-thread-automatic',
            'thread',
            'thread-automatic',
            0,
            'thread.settled',
            '2026-09-01T00:00:00.000Z',
            'server:auto-settle:thread-automatic:synthetic',
            NULL,
            'server:auto-settle:thread-automatic:synthetic',
            'server',
            ${encodeJson({
              threadId: "thread-automatic",
              settledAt: "2026-09-01T00:00:00.000Z",
              updatedAt: "2026-09-01T00:00:00.000Z",
            })},
            '{}'
          ),
          (
            'event-thread-manual',
            'thread',
            'thread-manual',
            0,
            'thread.settled',
            '2026-08-15T00:00:00.000Z',
            'command-manual-settlement',
            NULL,
            'command-manual-settlement',
            'client',
            ${encodeJson({
              threadId: "thread-manual",
              settledAt: "2026-08-15T00:00:00.000Z",
              updatedAt: "2026-08-15T00:00:00.000Z",
            })},
            '{}'
          ),
          (
            'event-thread-mismatched-stamp',
            'thread',
            'thread-mismatched-stamp',
            0,
            'thread.settled',
            '2026-09-01T00:00:00.000Z',
            'server:auto-settle:thread-mismatched-stamp:synthetic',
            NULL,
            'server:auto-settle:thread-mismatched-stamp:synthetic',
            'server',
            ${encodeJson({
              threadId: "thread-mismatched-stamp",
              settledAt: "2026-09-02T00:00:00.000Z",
              updatedAt: "2026-09-02T00:00:00.000Z",
            })},
            '{}'
          )
      `;

      const preservedEventsBefore = yield* sql<{
        readonly eventId: string;
        readonly payloadJson: string;
      }>`
        SELECT event_id AS "eventId", payload_json AS "payloadJson"
        FROM orchestration_events
        WHERE event_id <> 'event-automatic-created'
        ORDER BY event_id
      `;

      const executed = yield* runMigrations();
      assert.deepStrictEqual(
        executed.map(([id, name]) => [id, name]),
        [
          [54, "ClearAutomaticProjectModelDefaults"],
          [55, "ProjectionProjectsAutoPull"],
          [56, "RepairAutomaticSettlementTimestamps"],
          [57, "ProjectionProjectIcon"],
          [58, "PairingEnrollmentClass"],
        ],
      );

      yield* sql`
        UPDATE projection_projects
        SET
          auto_pull = 1,
          project_icon_json = ${encodeJson({ kind: "emoji", emoji: "🧪" })}
        WHERE project_id = 'project-reset'
      `;

      const automaticProject = Option.getOrNull(
        yield* projects.getById({ projectId: ProjectId.make("project-automatic") }),
      );
      assert.strictEqual(automaticProject?.defaultModelSelection, null);
      assert.strictEqual(automaticProject?.autoPull, false);
      assert.strictEqual(automaticProject?.projectIcon, null);

      const resetProject = Option.getOrNull(
        yield* projects.getById({ projectId: ProjectId.make("project-reset") }),
      );
      assert.strictEqual(resetProject?.defaultModelSelection, null);
      assert.strictEqual(resetProject?.autoPull, true);
      assert.deepStrictEqual(resetProject?.projectIcon, { kind: "emoji", emoji: "🧪" });

      const automaticThread = Option.getOrNull(
        yield* threads.getById({ threadId: ThreadId.make("thread-automatic") }),
      );
      assert.deepStrictEqual(automaticThread?.linkedPullRequest, LINKED_PULL_REQUEST);
      assert.strictEqual(automaticThread?.unsettledAt, "2026-07-01T00:00:00.000Z");
      assert.strictEqual(automaticThread?.settledAt, "2026-07-01T00:00:00.000Z");

      const manualThread = Option.getOrNull(
        yield* threads.getById({ threadId: ThreadId.make("thread-manual") }),
      );
      assert.strictEqual(manualThread?.settledAt, "2026-08-15T00:00:00.000Z");

      const mismatchedThread = Option.getOrNull(
        yield* threads.getById({ threadId: ThreadId.make("thread-mismatched-stamp") }),
      );
      assert.strictEqual(mismatchedThread?.settledAt, "2026-09-02T00:00:00.000Z");

      const automaticCreation = yield* sql<{ readonly payloadJson: string }>`
        SELECT payload_json AS "payloadJson"
        FROM orchestration_events
        WHERE event_id = 'event-automatic-created'
      `;
      assert.deepStrictEqual(decodeJson(automaticCreation[0]!.payloadJson), {
        projectId: "project-automatic",
        defaultModelSelection: null,
        preservedMarker: "automatic-fixture",
      });

      const preservedEventsAfter = yield* sql<{
        readonly eventId: string;
        readonly payloadJson: string;
      }>`
        SELECT event_id AS "eventId", payload_json AS "payloadJson"
        FROM orchestration_events
        WHERE event_id <> 'event-automatic-created'
        ORDER BY event_id
      `;
      assert.deepStrictEqual(preservedEventsAfter, preservedEventsBefore);
    }),
  );
});
