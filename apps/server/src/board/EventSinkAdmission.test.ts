import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ProviderThreadId,
  RunAttemptId,
  RunId,
  ThreadId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2Run,
  type OrchestrationV2StoredEvent,
  type ProviderInteractionMode,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { EventSinkV2, EventSinkWriteError } from "../orchestration-v2/EventSink.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as Admission from "./EventSinkAdmission.ts";
import * as TurnPolicy from "./TurnWritePolicyV2.ts";

const threadId = ThreadId.make("synthetic-event-sink-thread");
const instanceId = ProviderInstanceId.make("codex");
const now = DateTime.makeUnsafe("2026-10-01T00:00:00Z");
const run = (
  id: string,
  status: OrchestrationV2Run["status"] = "queued",
  mode: ProviderInteractionMode | null = "plan",
): OrchestrationV2Run => ({
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
  ...(mode === null ? {} : { interactionMode: mode }),
});
const event = (value: OrchestrationV2Run): OrchestrationV2DomainEvent => ({
  id: EventId.make(`event:${value.id}:${value.status}`),
  type: value.status === "queued" ? "run.created" : "run.updated",
  threadId,
  runId: value.id,
  occurredAt: now,
  payload: value,
});
const stored = (events: ReadonlyArray<OrchestrationV2DomainEvent>) =>
  events.map((value, i): OrchestrationV2StoredEvent => ({
    sequence: i + 1,
    commandId: null,
    event: value,
  }));

type Write = (
  events: ReadonlyArray<OrchestrationV2DomainEvent>,
) => Effect.Effect<ReadonlyArray<OrchestrationV2StoredEvent>, EventSinkWriteError>;

const fixture = Effect.fn("eventSinkAdmissionFixture")(function* (
  threadMode: ProviderInteractionMode = "default",
  beforeCapabilityUpdate: (enabled: boolean) => Effect.Effect<void> = () => Effect.void,
) {
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  yield* projections.apply({
    id: EventId.make("synthetic-thread-created"),
    type: "thread.created",
    threadId,
    occurredAt: now,
    payload: {
      id: threadId,
      projectId: ProjectId.make("synthetic-project"),
      title: "Synthetic thread",
      createdBy: "user",
      creationSource: "web",
      providerInstanceId: instanceId,
      modelSelection: { instanceId, model: "synthetic-model" },
      runtimeMode: "full-access",
      interactionMode: threadMode,
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
  });
  let writable = true;
  const policy = yield* TurnPolicy.make((_, enabled) =>
    beforeCapabilityUpdate(enabled).pipe(
      Effect.andThen(
        Effect.sync(() => {
          writable = enabled;
        }),
      ),
    ),
  );
  const persist: Write = (events) =>
    Effect.gen(function* () {
      yield* Effect.forEach(events, (value) => projections.apply(value));
      return stored(events);
    }).pipe(
      Effect.mapError((cause) => new EventSinkWriteError({ eventCount: events.length, cause })),
    );
  let writer: Write = persist;
  // The replacement host owns commit outcomes and real in-memory projections;
  // it deliberately has no provider, transport, credential or database authority.
  const source = EventSinkV2.of({
    write: ({ events }) => Effect.suspend(() => writer(events)),
    writeWithEffects: ({ events }) => Effect.suspend(() => writer(events)),
    writeIfRunCurrent: ({ events }) =>
      Effect.suspend(() => writer(events)).pipe(
        Effect.map((storedEvents) => ({ committed: storedEvents.length > 0, storedEvents })),
      ),
    writeIfProviderThreadOwner: ({ events }) =>
      Effect.suspend(() => writer(events)).pipe(
        Effect.map((storedEvents) => ({ committed: storedEvents.length > 0, storedEvents })),
      ),
    commitCommand: (input) =>
      Effect.suspend(() => writer(input.events)).pipe(
        Effect.map((storedEvents) => ({
          receipt: {
            commandId: input.commandId,
            threadId,
            commandType: input.commandType,
            acceptedAt: now,
            resultSequence: storedEvents.at(-1)?.sequence ?? 0,
            status: "accepted" as const,
            error: null,
          },
          committed: storedEvents.length > 0,
          storedEvents,
          cancelledEffectCount: 0,
        })),
      ),
    commitRejectedCommand: () => Effect.die("unused rejection fixture"),
    commitProjectCommand: () => Effect.die("unused project fixture"),
    commitRejectedProjectCommand: () => Effect.die("unused project rejection fixture"),
    stream: () => Stream.empty,
    latestSequence: () => Effect.succeed(0),
    readByCommandId: () => Stream.empty,
  });
  const sink = yield* EventSinkV2.pipe(
    Effect.provide(
      Admission.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(EventSinkV2, source),
            Layer.succeed(ProjectionStore.ProjectionStoreV2, projections),
            Layer.succeed(TurnPolicy.BoardTurnWritePolicyV2, policy),
          ),
        ),
      ),
    ),
  );
  return {
    sink,
    policy,
    projections,
    persist,
    writable: () => writable,
    setWriter: (next: Write) => {
      writer = next;
    },
  };
});

const methods = [
  "write",
  "writeWithEffects",
  "writeIfRunCurrent",
  "writeIfProviderThreadOwner",
  "commitCommand",
] as const;
const invoke = (
  sink: EventSinkV2["Service"],
  method: (typeof methods)[number],
  value: OrchestrationV2Run,
) => {
  const events = [event(value)];
  switch (method) {
    case "write":
      return sink.write({ events }).pipe(Effect.asVoid);
    case "writeWithEffects":
      return sink.writeWithEffects({ events, effects: [] }).pipe(Effect.asVoid);
    case "writeIfRunCurrent":
      return sink
        .writeIfRunCurrent({
          events,
          threadId,
          runId: value.id,
          activeAttemptId: RunAttemptId.make("synthetic-attempt"),
          expectedStatus: "queued",
        })
        .pipe(Effect.asVoid);
    case "writeIfProviderThreadOwner":
      return sink
        .writeIfProviderThreadOwner({
          events,
          providerThreadId: ProviderThreadId.make("synthetic-provider-thread"),
          runId: value.id,
          activeAttemptId: RunAttemptId.make("synthetic-attempt"),
          expectedLastRunOrdinal: 1,
        })
        .pipe(Effect.asVoid);
    case "commitCommand":
      return sink
        .commitCommand({
          events,
          commandId: CommandId.make("synthetic-command"),
          threadId,
          commandType: "synthetic",
          acceptedAt: now,
          effects: [],
        })
        .pipe(Effect.asVoid);
  }
};

for (const method of methods) {
  it.effect(
    `${method} denies Plan writes before the replacement host can publish committed work`,
    () =>
      Effect.gen(function* () {
        const f = yield* fixture();
        f.setWriter((events) =>
          Effect.gen(function* () {
            assert.isFalse(f.writable());
            return yield* f.persist(events);
          }),
        );
        yield* invoke(f.sink, method, run(method));
        assert.isFalse(f.writable());
        yield* f.sink.write({ events: [event(run(method, "completed"))] });
        assert.isTrue(f.writable());
      }).pipe(Effect.provide(ProjectionStore.layerMemory)),
  );
}

it.effect("uses the current thread Plan mode when a run has no explicit interaction mode", () =>
  Effect.gen(function* () {
    const f = yield* fixture("plan");
    yield* f.sink.write({ events: [event(run("legacy-mode", "queued", null))] });
    assert.isFalse(f.writable());
  }).pipe(Effect.provide(ProjectionStore.layerMemory)),
);

it.effect("duplicate receipts and conditional rejection release only an absent proposed run", () =>
  Effect.gen(function* () {
    const f = yield* fixture();
    for (const method of [
      "commitCommand",
      "writeIfRunCurrent",
      "writeIfProviderThreadOwner",
    ] as const) {
      f.setWriter(() => Effect.succeed([]));
      yield* invoke(f.sink, method, run(method));
      assert.isTrue(f.writable());
    }
  }).pipe(Effect.provide(ProjectionStore.layerMemory)),
);

it.effect(
  "a duplicate command preserves an existing queued Plan run through credential replacement",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const value = run("durable-queued");
      yield* f.projections.apply(event(value));
      f.setWriter(() => Effect.succeed([]));
      yield* invoke(f.sink, "commitCommand", value);
      yield* f.policy.credentialChanged(threadId);
      yield* f.policy.refresh(threadId);
      assert.isFalse(f.writable());
      f.setWriter(f.persist);
      yield* f.sink.write({ events: [event(run(value.id, "completed"))] });
      assert.isTrue(f.writable());
    }).pipe(Effect.provide(ProjectionStore.layerMemory)),
);

it.effect(
  "uncertain failed and interrupted writes require credential replacement to restore writes",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      f.setWriter(() => Effect.fail(new EventSinkWriteError({ eventCount: 1 })));
      const failed = yield* f.sink.write({ events: [event(run("uncertain"))] }).pipe(Effect.exit);
      assert.isTrue(Exit.isFailure(failed));
      assert.isFalse(f.writable());
      f.setWriter(f.persist);
      yield* f.sink.write({ events: [event(run("uncertain", "failed"))] });
      assert.isFalse(f.writable());
      yield* f.policy.credentialChanged(threadId);
      yield* f.policy.begin(threadId, instanceId, "default");
      assert.isTrue(f.writable());
      const entered = yield* Deferred.make<void>();
      f.setWriter(() => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)));
      const pending = yield* f.sink
        .write({ events: [event(run("interrupted"))] })
        .pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(pending);
      assert.isFalse(f.writable());
    }).pipe(Effect.provide(ProjectionStore.layerMemory)),
);

it.effect(
  "only committed terminal events release admission, and native Plan overlap stays denied",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      yield* f.sink.write({ events: [event(run("terminal"))] });
      const native = yield* f.policy.begin(threadId, instanceId, "plan");
      yield* f.policy.associate(native, "exact-native-turn");
      f.setWriter(() => Effect.succeed([]));
      yield* invoke(f.sink, "writeIfRunCurrent", run("terminal", "completed"));
      assert.isFalse(f.writable());
      f.setWriter(f.persist);
      yield* f.sink.write({ events: [event(run("terminal", "completed"))] });
      assert.isFalse(f.writable());
      yield* f.policy.terminal(threadId, instanceId, "unrelated-native-turn");
      assert.isFalse(f.writable());
      yield* f.policy.terminal(threadId, instanceId, "exact-native-turn");
      assert.isTrue(f.writable());
    }).pipe(Effect.provide(ProjectionStore.layerMemory)),
);

it.effect(
  "one rejected concurrent proposal cannot release another uncommitted Plan proposal for the same run",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      const firstEntered = yield* Deferred.make<void>();
      const secondEntered = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const releaseSecond = yield* Deferred.make<void>();
      let calls = 0;
      f.setWriter((events) =>
        Effect.gen(function* () {
          const call = ++calls;
          if (call === 1) {
            yield* Deferred.succeed(firstEntered, undefined);
            yield* Deferred.await(releaseFirst);
            return [];
          }
          yield* Deferred.succeed(secondEntered, undefined);
          yield* Deferred.await(releaseSecond);
          return yield* f.persist(events);
        }),
      );
      const value = run("overlapping-proposals");
      const first = yield* invoke(f.sink, "writeIfRunCurrent", value).pipe(Effect.forkChild);
      yield* Deferred.await(firstEntered);
      const second = yield* invoke(f.sink, "write", value).pipe(Effect.forkChild);
      yield* Deferred.await(secondEntered);
      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Fiber.join(first);
      assert.isFalse(f.writable());
      yield* Deferred.succeed(releaseSecond, undefined);
      yield* Fiber.join(second);
      assert.isFalse(f.writable());
    }).pipe(Effect.provide(ProjectionStore.layerMemory)),
);

it.effect(
  "a concurrent duplicate waits until initial Plan capability denial completes before storage",
  () =>
    Effect.gen(function* () {
      const denyEntered = yield* Deferred.make<void>();
      const releaseDeny = yield* Deferred.make<void>();
      const secondStarted = yield* Deferred.make<void>();
      const f = yield* fixture("default", (enabled) =>
        enabled
          ? Effect.void
          : Deferred.succeed(denyEntered, undefined).pipe(
              Effect.andThen(Deferred.await(releaseDeny)),
            ),
      );
      f.setWriter((events) =>
        Effect.gen(function* () {
          assert.isFalse(f.writable());
          return yield* f.persist(events);
        }),
      );
      const value = run("pending-capability");
      const first = yield* invoke(f.sink, "write", value).pipe(Effect.forkChild);
      yield* Deferred.await(denyEntered);
      const second = yield* Deferred.succeed(secondStarted, undefined).pipe(
        Effect.andThen(invoke(f.sink, "write", value)),
        Effect.forkChild,
      );
      yield* Deferred.await(secondStarted);
      // Give a runnable duplicate its turn while the capability owner is still blocked.
      yield* Effect.yieldNow;
      yield* Deferred.succeed(releaseDeny, undefined);
      yield* Fiber.join(first);
      yield* Fiber.join(second);
      assert.isFalse(f.writable());
    }).pipe(Effect.provide(ProjectionStore.layerMemory)),
);

it.effect("distinct Plan runs can reach their replacement persistence hosts concurrently", () =>
  Effect.gen(function* () {
    const f = yield* fixture();
    const entered = [yield* Deferred.make<void>(), yield* Deferred.make<void>()];
    const release = yield* Deferred.make<void>();
    let calls = 0;
    f.setWriter((events) =>
      Effect.gen(function* () {
        const signal = entered[calls++];
        assert.isDefined(signal);
        yield* Deferred.succeed(signal!, undefined);
        yield* Deferred.await(release);
        return yield* f.persist(events);
      }),
    );
    const first = yield* invoke(f.sink, "write", run("independent-first")).pipe(Effect.forkChild);
    const second = yield* invoke(f.sink, "write", run("independent-second")).pipe(Effect.forkChild);
    yield* Deferred.await(entered[0]!);
    yield* Deferred.await(entered[1]!);
    assert.isFalse(f.writable());
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(first);
    yield* Fiber.join(second);
    f.setWriter(f.persist);
    yield* f.sink.write({ events: [event(run("independent-first", "completed"))] });
    assert.isFalse(f.writable());
    yield* f.sink.write({ events: [event(run("independent-second", "completed"))] });
    assert.isTrue(f.writable());
  }).pipe(Effect.provide(ProjectionStore.layerMemory)),
);
