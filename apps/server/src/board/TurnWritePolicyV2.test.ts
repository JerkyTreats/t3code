import { assert, it } from "@effect/vitest";
import {
  MessageId,
  ProviderInstanceId,
  ProviderSessionId,
  ProviderTurnId,
  RuntimeRequestId,
  RunId,
  ThreadId,
  type OrchestrationV2Run,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TurnWritePolicy from "./TurnWritePolicyV2.ts";

const threadId = ThreadId.make("synthetic-thread");
const instanceId = ProviderInstanceId.make("codex");
const now = DateTime.makeUnsafe("2026-09-01T00:00:00Z");
const run = (id: string, status: OrchestrationV2Run["status"]): OrchestrationV2Run => ({
  id: RunId.make(id),
  threadId,
  ordinal: 1,
  providerInstanceId: instanceId,
  modelSelection: { instanceId, model: "synthetic-model" },
  providerThreadId: null,
  userMessageId: MessageId.make(`${id}-message`),
  rootNodeId: null,
  activeAttemptId: null,
  status,
  requestedAt: now,
  startedAt: null,
  completedAt: null,
  checkpointId: null,
  contextHandoffId: null,
  interactionMode: "plan",
});

it.effect("queued and preparing Plan runs retain denial through credential replacement", () =>
  Effect.gen(function* () {
    let writable = true;
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      Effect.sync(() => {
        writable = enabled;
      }),
    );
    assert.isTrue(yield* policy.observeRun(run("queued", "queued"), "plan"));
    assert.isFalse(yield* policy.observeRun(run("queued", "queued"), "default"));
    yield* policy.observeRun(run("preparing", "preparing"), "plan");
    yield* policy.credentialChanged(threadId);
    yield* policy.refresh(threadId);
    assert.isFalse(writable);
    yield* policy.observeRun(run("queued", "cancelled"), "default");
    assert.isFalse(writable);
    yield* policy.observeRun(run("preparing", "completed"), "default");
    assert.isTrue(writable);
  }),
);

it.effect("run completion cannot release an active native Plan attempt", () =>
  Effect.gen(function* () {
    let writable = true;
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      Effect.sync(() => {
        writable = enabled;
      }),
    );
    yield* policy.observeRun(run("active", "running"), "plan");
    const attempt = yield* policy.begin(threadId, instanceId, "plan");
    yield* policy.associate(attempt, "exact-attempt");
    yield* policy.observeRun(run("active", "interrupted"), "plan");
    yield* policy.terminal(threadId, instanceId, "old-attempt");
    assert.isFalse(writable);
    yield* policy.terminal(threadId, instanceId, "exact-attempt");
    assert.isTrue(writable);
  }),
);

it.effect(
  "failed provider acceptance stays denied after durable run failure until credential revocation",
  () =>
    Effect.gen(function* () {
      let writable = true;
      const policy = yield* TurnWritePolicy.make((_, enabled) =>
        Effect.sync(() => {
          writable = enabled;
        }),
      );
      yield* policy.observeRun(run("ambiguous", "starting"), "plan");
      const attempt = yield* policy.begin(threadId, instanceId, "plan");
      yield* policy.failed(attempt);
      yield* policy.observeRun(run("ambiguous", "failed"), "plan");
      yield* policy.begin(threadId, instanceId, "default");
      assert.isFalse(writable);
      yield* policy.credentialChanged(threadId);
      yield* policy.begin(threadId, instanceId, "default");
      assert.isTrue(writable);
    }),
);

it.effect("definite rollback releases only the rejected run admission", () =>
  Effect.gen(function* () {
    let writable = true;
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      Effect.sync(() => {
        writable = enabled;
      }),
    );
    yield* policy.observeRun(run("accepted", "queued"), "plan");
    yield* policy.observeRun(run("rejected", "preparing"), "plan");
    yield* policy.forgetRejectedRun(RunId.make("rejected"));
    assert.isFalse(writable);
    yield* policy.observeRun(run("accepted", "completed"), "plan");
    assert.isTrue(writable);
  }),
);

it.effect("duplicate run observations wait until the first credential denial is ready", () =>
  Effect.gen(function* () {
    const writing = yield* Deferred.make<void>();
    const ready = yield* Deferred.make<void>();
    const returned = yield* Deferred.make<void>();
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      enabled
        ? Effect.void
        : Deferred.succeed(writing, undefined).pipe(Effect.andThen(Deferred.await(ready))),
    );
    const first = yield* Effect.forkChild(policy.observeRun(run("shared", "queued"), "plan"));
    yield* Deferred.await(writing);
    const duplicate = yield* Effect.forkChild(
      policy
        .observeRun(run("shared", "queued"), "default")
        .pipe(Effect.tap(() => Deferred.succeed(returned, undefined))),
    );
    yield* Effect.yieldNow;
    assert.isFalse(yield* Deferred.isDone(returned));
    yield* Deferred.succeed(ready, undefined);
    assert.isTrue(yield* Fiber.join(first));
    assert.isFalse(yield* Fiber.join(duplicate));
  }),
);

it.effect("an early exact request terminal settles only its correlated Plan admission", () =>
  Effect.gen(function* () {
    let writable = true;
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      Effect.sync(() => {
        writable = enabled;
      }),
    );
    const providerSessionId = ProviderSessionId.make("synthetic-session");
    const providerTurnId = ProviderTurnId.make("synthetic-turn");
    const admission = yield* policy.begin(threadId, instanceId, "plan");
    const key = yield* policy.registerRequest({
      threadId,
      instanceId,
      providerSessionId,
      providerTurnId,
      requestId: RuntimeRequestId.make("synthetic-request"),
    });
    yield* policy.terminalRequests(providerSessionId, ProviderTurnId.make("unrelated-turn"));
    assert.isFalse(writable);
    yield* policy.terminalRequests(providerSessionId, providerTurnId);
    assert.isFalse(writable);
    yield* policy.associate(admission, key);
    assert.isTrue(writable);
  }),
);

it.effect(
  "credential replacement drops an absent failed proposal without inventing a terminal",
  () =>
    Effect.gen(function* () {
      let writable = true;
      const policy = yield* TurnWritePolicy.make((_, enabled) =>
        Effect.sync(() => {
          writable = enabled;
        }),
      );
      const proposed = run("absent-failed", "queued");
      yield* policy.beginRunProposal(proposed.id);
      const pending = yield* policy.begin(threadId, instanceId, "plan");
      yield* policy.observeRun(proposed, "plan");
      yield* policy.failed(pending);
      yield* policy.endRunProposal(proposed.id);
      assert.isFalse(writable);
      yield* policy.credentialChanged(threadId, Effect.succeed([]));
      yield* policy.begin(threadId, instanceId, "default");
      assert.isTrue(writable);
    }),
);

it.effect("replacement preserves absent in-flight and committed Plan runs", () =>
  Effect.gen(function* () {
    let writable = true;
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      Effect.sync(() => {
        writable = enabled;
      }),
    );
    const proposed = run("still-in-flight", "queued");
    const persisted = run("durable-plan", "preparing");
    yield* policy.beginRunProposal(proposed.id);
    yield* policy.observeRun(proposed, "plan");
    yield* policy.credentialChanged(
      threadId,
      Effect.succeed([{ run: persisted, mode: "plan" as const }]),
    );
    yield* policy.refresh(threadId);
    assert.isFalse(writable);
    yield* policy.observeRun({ ...persisted, status: "completed" }, "plan");
    assert.isFalse(writable);
    yield* policy.endRunProposal(proposed.id);
    assert.isFalse(writable);
    yield* policy.credentialChanged(threadId, Effect.succeed([]));
    yield* policy.begin(threadId, instanceId, "default");
    assert.isTrue(writable);
  }),
);

it.effect("a failed authoritative read keeps uncertainty until a successful replacement", () =>
  Effect.gen(function* () {
    let writable = true;
    const policy = yield* TurnWritePolicy.make((_, enabled) =>
      Effect.sync(() => {
        writable = enabled;
      }),
    );
    const pending = yield* policy.begin(threadId, instanceId, "plan");
    yield* policy.failed(pending);
    yield* policy
      .credentialChanged(threadId, Effect.fail("synthetic projection read failure"))
      .pipe(Effect.result);
    yield* policy.begin(threadId, instanceId, "default");
    assert.isFalse(writable);
    yield* policy.credentialChanged(threadId, Effect.succeed([]));
    yield* policy.begin(threadId, instanceId, "default");
    assert.isTrue(writable);
  }),
);
