import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { PullRequestReviewGuide } from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Migrator from "effect/sql/Migrator";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import { makeMigrationLoader } from "./ForkMigrationPlan.ts";
import { runMigrations } from "./Migrations.ts";
import ReviewGuideMigration from "./Migrations/061_PullRequestReviewGuides.ts";
import * as ReviewGuides from "./PullRequestReviewGuides.ts";
import { layerFromPath } from "./Sqlite.ts";

const key = { host: "service.example.test", repository: "example/repository", number: 7 };
const guide = Schema.decodeSync(PullRequestReviewGuide)({
  headSha: "synthetic-review-head",
  generatedAt: "2026-10-11T00:00:00.000Z",
  modelSelection: { instanceId: "synthetic-provider", model: "synthetic-model" },
  stops: [],
});
const attachment = JSON.stringify([
  {
    type: "file",
    id: "synthetic-attachment",
    name: "retained.txt",
    mimeType: "text/plain",
    sizeBytes: 12,
  },
]);

const seedRetainedData = Effect.fn("seedReviewGuideRetainedData")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO projection_projects (
    project_id, title, workspace_root, scripts_json, created_at, updated_at
  ) VALUES ('synthetic-project', 'Retained project', '/workspace/project', '[]',
    '2026-01-01', '2026-01-01')`;
  yield* sql`INSERT INTO projection_threads (
    thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode,
    creation_surface, created_at, updated_at
  ) VALUES ('synthetic-thread', 'synthetic-project', 'Retained thread',
    '{"instanceId":"synthetic-provider","model":"synthetic-model"}', 'full-access', 'default',
    'thread', '2026-01-01', '2026-01-01')`;
  yield* sql`INSERT INTO projection_thread_messages (
    message_id, thread_id, role, text, attachments_json, is_streaming, created_at, updated_at
  ) VALUES ('synthetic-message', 'synthetic-thread', 'user', 'Retained message', ${attachment},
    0, '2026-01-01', '2026-01-01')`;
  yield* sql`INSERT INTO orchestration_v2_projection_threads (
    thread_id, project_id, title, default_provider, provider_instance_id,
    runtime_mode, interaction_mode, created_at, updated_at, payload_json
  ) VALUES ('synthetic-thread', 'synthetic-project', 'Retained thread', 'synthetic-provider',
    'synthetic-provider', 'full-access', 'default', '2026-01-01', '2026-01-01', '{}')`;
  yield* sql`INSERT INTO auth_clients (
    client_id, device_type, granted_scopes, management_class, created_at, revision
  ) VALUES ('synthetic-client', 'desktop', '["access:read"]', 'portal-managed-device',
    '2026-01-01', 3)`;
  yield* sql`INSERT INTO auth_sessions (
    session_id, client_id, subject, scopes, method, authority_class, issued_at, expires_at, revoked_at
  ) VALUES ('synthetic-session', 'synthetic-client', 'synthetic-subject', '["access:read"]',
    'bearer-access-token', 'device-administrator', '2026-01-01', '2027-01-01', '2026-02-01')`;
  yield* sql`INSERT INTO auth_pairing_links (
    id, credential_digest, method, scopes, subject, client_management_class,
    created_at, expires_at, revoked_at, revision
  ) VALUES ('synthetic-pairing', 'synthetic-digest', 'one-time-token', '["access:read"]',
    'synthetic-subject', 'portal-managed-device', '2026-01-01', '2027-01-01', '2026-02-01', 4)`;
});

const readRetainedData = Effect.fn("readReviewGuideRetainedData")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return {
    journal:
      yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 83 ORDER BY migration_id`,
    threads: yield* sql`SELECT * FROM projection_threads ORDER BY thread_id`,
    v2Threads: yield* sql`SELECT * FROM orchestration_v2_projection_threads ORDER BY thread_id`,
    messages: yield* sql`SELECT * FROM projection_thread_messages ORDER BY message_id`,
    clients: yield* sql`SELECT * FROM auth_clients ORDER BY client_id`,
    sessions: yield* sql`SELECT * FROM auth_sessions ORDER BY session_id`,
    pairing: yield* sql`SELECT * FROM auth_pairing_links ORDER BY id`,
  };
});

it.effect("upgrades fork 83, retains data and review guides through production reopen", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-review-guide-migration-" });
    const filename = path.join(directory, "statev2.sqlite");
    const rawLayer = NodeSqliteClient.layer({ filename });
    const before = yield* Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 83 });
      yield* seedRetainedData();
      return yield* readRetainedData();
    }).pipe(Effect.provide(rawLayer));
    const upgraded = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const repository = yield* ReviewGuides.PullRequestReviewGuideRepository;
      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 84 }), [
        [84, "PullRequestReviewGuides"],
      ]);
      assert.deepStrictEqual(yield* readRetainedData(), before);
      assert.deepStrictEqual(
        yield* sql`SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id IN (61, 84) ORDER BY migration_id`,
        [
          { migration_id: 61, name: "ProjectionThreadsActiveOrderKey" },
          { migration_id: 84, name: "PullRequestReviewGuides" },
        ],
      );
      assert.deepStrictEqual(yield* repository.get(key), Option.none());
      yield* repository.put(key, guide);
      const updatedGuide = { ...guide, headSha: "synthetic-new-head" };
      yield* repository.put(key, updatedGuide);
      const foreignKey = { ...key, host: "other.example.test" };
      assert.deepStrictEqual(yield* repository.get(foreignKey), Option.none());
      yield* repository.put(foreignKey, guide);
      assert.deepStrictEqual(yield* repository.get(key), Option.some(updatedGuide));
      assert.deepStrictEqual(yield* repository.get(foreignKey), Option.some(guide));
      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 84 }), []);
      return updatedGuide;
    }).pipe(Effect.provide(Layer.provideMerge(ReviewGuides.layer, rawLayer)));
    yield* Effect.gen(function* () {
      const repository = yield* ReviewGuides.PullRequestReviewGuideRepository;
      assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 84 }), []);
      assert.deepStrictEqual(yield* readRetainedData(), before);
      assert.deepStrictEqual(yield* repository.get(key), Option.some(upgraded));
      assert.deepStrictEqual(
        yield* repository.get({ ...key, host: "other.example.test" }),
        Option.some(guide),
      );
    }).pipe(Effect.provide(Layer.provideMerge(ReviewGuides.layer, layerFromPath(filename))));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("carries stable review-guide identity through a replacement migration runner", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const independentRunner = Migrator.make({});
    yield* independentRunner({ loader: makeMigrationLoader(83) });
    const journal = yield* sql`SELECT * FROM effect_sql_migrations ORDER BY migration_id`;
    assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader(84) }), [
      [84, "PullRequestReviewGuides"],
    ]);
    assert.deepStrictEqual(
      yield* sql`SELECT * FROM effect_sql_migrations WHERE migration_id <= 83 ORDER BY migration_id`,
      journal,
    );
    const repository = yield* ReviewGuides.PullRequestReviewGuideRepository;
    yield* repository.put(key, guide);
    assert.deepStrictEqual(yield* repository.get(key), Option.some(guide));
    assert.deepStrictEqual(yield* independentRunner({ loader: makeMigrationLoader(84) }), []);
  }).pipe(
    Effect.provide(
      Layer.provideMerge(ReviewGuides.layer, NodeSqliteClient.layer({ filename: ":memory:" })),
    ),
  ),
);

it.effect("rolls back the review-guide table and journal together before retrying 84", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 83 });
    yield* seedRetainedData();
    const before = yield* readRetainedData();
    const schema = yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`;
    // Fail after the real body and journal row exist inside the upstream transaction.
    const failAfterCreation = Effect.gen(function* () {
      yield* ReviewGuideMigration;
      assert.deepStrictEqual(
        yield* sql`SELECT name FROM sqlite_master WHERE name = 'pull_request_review_guides'`,
        [{ name: "pull_request_review_guides" }],
      );
      assert.deepStrictEqual(
        yield* sql`SELECT migration_id FROM effect_sql_migrations WHERE migration_id = 84`,
        [{ migration_id: 84 }],
      );
      return yield* Effect.die(new Error("Synthetic post-DDL migration failure"));
    });
    const failedLoader = makeMigrationLoader(84).pipe(
      Effect.map((entries) =>
        entries.map((entry) =>
          entry[0] === 84
            ? ([entry[0], entry[1], Effect.succeed(failAfterCreation)] as const)
            : entry,
        ),
      ),
    );
    assert.isTrue(Exit.isFailure(yield* Effect.exit(Migrator.make({})({ loader: failedLoader }))));
    assert.deepStrictEqual(yield* readRetainedData(), before);
    assert.deepStrictEqual(yield* sql`SELECT * FROM sqlite_master ORDER BY type, name`, schema);
    assert.deepStrictEqual(
      yield* sql`SELECT migration_id FROM effect_sql_migrations WHERE migration_id = 84`,
      [],
    );
    assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 84 }), [
      [84, "PullRequestReviewGuides"],
    ]);
    const repository = yield* ReviewGuides.PullRequestReviewGuideRepository;
    yield* repository.put(key, guide);
    assert.deepStrictEqual(yield* repository.get(key), Option.some(guide));
    assert.deepStrictEqual(yield* readRetainedData(), before);
    assert.deepStrictEqual(yield* runMigrations({ toMigrationInclusive: 84 }), []);
  }).pipe(
    Effect.provide(
      Layer.provideMerge(ReviewGuides.layer, NodeSqliteClient.layer({ filename: ":memory:" })),
    ),
  ),
);
