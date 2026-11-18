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
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as PageStateStore from "./PageStateStore.ts";

const parent = ThreadId.make("thread-page-state-parent");
const child = ThreadId.make("thread-page-state-child");

// A synthetic delegation: the child is the parent's subagent.
const layerOrchestrator = Layer.mock(Orchestrator.OrchestratorV2)({
  getThreadShell: (threadId) =>
    Effect.succeed(
      threadId === child
        ? ({
            lineage: { parentThreadId: parent, relationshipToParent: "subagent" },
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
});
