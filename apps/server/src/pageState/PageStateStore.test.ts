import { NodeServices } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import {
  type OrchestrationV2ThreadShell,
  PAGE_STATE_MAX_DOCUMENT_BYTES,
  ThreadId,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as PageStateStore from "./PageStateStore.ts";

const parent = ThreadId.make("thread-page-state-parent");
const child = ThreadId.make("thread-page-state-child");

// Synthetic threads: every "thread-page-state-" id exists, and the child is the parent's subagent.
const layerOrchestrator = Layer.mock(Orchestrator.OrchestratorV2)({
  getThreadShell: (threadId) =>
    Effect.succeed(
      threadId.startsWith("thread-page-state-")
        ? ({
            lineage:
              threadId === child
                ? { parentThreadId: parent, relationshipToParent: "subagent" }
                : { parentThreadId: null, relationshipToParent: null },
          } as unknown as OrchestrationV2ThreadShell)
        : null,
    ),
});

const layer = it.layer(
  PageStateStore.layer.pipe(
    Layer.provideMerge(layerOrchestrator),
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-page-state-test-" })),
    Layer.provideMerge(NodeServices.layer),
  ),
);

layer("PageStateStore", (it) => {
  it.effect("merges patches, guards revisions and keeps documents across a restart", () =>
    Effect.gen(function* () {
      const store = yield* PageStateStore.PageStateStore;
      const threadId = ThreadId.make("thread-page-state-merge");
      assert.deepStrictEqual(yield* store.get(threadId, "workflow"), {
        key: "workflow",
        value: null,
        revision: 0,
      });
      yield* store.write({
        threadId,
        key: "workflow",
        set: { api: { stage: "Research", confidence: 0.4 }, web: { stage: "Design" } },
        expectedRevision: 0,
        by: "agent",
      });
      const merged = yield* store.write({
        threadId,
        key: "workflow",
        merge: { api: { stage: "Verification", confidence: null }, db: { stage: "Research" } },
        by: "user",
      });
      assert.deepStrictEqual(merged.value, {
        api: { stage: "Verification" },
        web: { stage: "Design" },
        db: { stage: "Research" },
      });
      assert.strictEqual(merged.revision, 2);

      const stale = yield* store
        .write({ threadId, key: "workflow", set: {}, expectedRevision: 1, by: "agent" })
        .pipe(Effect.flip);
      assert.strictEqual(stale.reason, "conflict");
      assert.strictEqual(stale.revision, 2);

      const huge = yield* store
        .write({
          threadId,
          key: "workflow",
          set: "x".repeat(PAGE_STATE_MAX_DOCUMENT_BYTES),
          by: "agent",
        })
        .pipe(Effect.flip);
      assert.strictEqual(huge.reason, "too_large");

      // A fresh store over the same state directory, as after a server restart.
      const restarted = yield* PageStateStore.PageStateStore.pipe(
        Effect.provide(PageStateStore.layer),
      );
      assert.deepStrictEqual(yield* restarted.get(threadId, "workflow"), merged);
      assert.deepStrictEqual(
        (yield* restarted.list(threadId)).map((document) => document.key),
        ["workflow"],
      );
    }),
  );

  it.effect("gives a subagent its delegator's state, and follows only the written key", () =>
    Effect.gen(function* () {
      const store = yield* PageStateStore.PageStateStore;
      const following = yield* Deferred.make<void>();
      const follower = yield* store.follow(parent, "progress").pipe(
        // The first value comes after the subscription, so later writes reach the follow.
        Stream.tap(() => Deferred.succeed(following, undefined)),
        Stream.take(2),
        Stream.runCollect,
        Effect.forkScoped,
      );
      yield* Deferred.await(following);
      yield* store.write({ threadId: child, key: "other", set: 1, by: "agent" });
      yield* store.write({ threadId: child, key: "progress", merge: { api: "done" }, by: "agent" });
      const documents = yield* Fiber.join(follower);
      assert.deepStrictEqual(documents.at(-1), {
        key: "progress",
        value: { api: "done" },
        revision: 1,
        updatedBy: "agent",
      });
      assert.isTrue(documents.every((document) => document.key === "progress"));
      assert.deepStrictEqual((yield* store.get(parent, "other")).value, 1);
    }).pipe(Effect.scoped),
  );
  it.effect("keeps own __proto__ keys through merge and restart", () =>
    Effect.gen(function* () {
      const store = yield* PageStateStore.PageStateStore;
      const threadId = ThreadId.make("thread-page-state-proto");
      yield* store.write({
        threadId,
        key: "doc",
        set: { b: 2 },
        by: "agent",
      });
      yield* store.write({
        threadId,
        key: "doc",
        merge: JSON.parse('{"__proto__":{"a":1}}'),
        by: "user",
      });
      const merged = yield* store.write({
        threadId,
        key: "doc",
        merge: JSON.parse('{"__proto__":{"c":3}}'),
        by: "user",
      });
      const expected = '{"b":2,"__proto__":{"a":1,"c":3}}';
      assert.strictEqual(JSON.stringify(merged.value), expected);
      const restarted = yield* PageStateStore.PageStateStore.pipe(
        Effect.provide(PageStateStore.layer),
      );
      assert.strictEqual(JSON.stringify((yield* restarted.get(threadId, "doc")).value), expected);
    }),
  );

  it.effect("refuses threads that do not exist, so no id names a path outside its store", () =>
    Effect.gen(function* () {
      const store = yield* PageStateStore.PageStateStore;
      for (const id of ["..", "../outside", "."]) {
        const refused = yield* store
          .write({ threadId: ThreadId.make(id), key: "doc", set: 1, by: "user" })
          .pipe(Effect.flip);
        assert.strictEqual(refused.reason, "invalid");
      }
      const config = yield* ServerConfig.ServerConfig;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      for (const name of yield* fileSystem.readDirectory(
        path.join(config.stateDir, "page-state"),
      )) {
        assert.match(name, /^[0-9a-f]{64}$/);
      }
    }),
  );
});
