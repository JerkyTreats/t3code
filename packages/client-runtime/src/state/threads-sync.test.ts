import {
  EnvironmentId,
  EventId,
  MessageId,
  ORCHESTRATION_WS_METHODS,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type OrchestrationThreadStreamItem,
  type OrchestrationThreadStreamV2Item,
  type ServerConfig,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as TestClock from "effect/testing/TestClock";

import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import * as Persistence from "../platform/persistence.ts";
import * as RpcSession from "../rpc/session.ts";
import {
  EMPTY_ENVIRONMENT_THREAD_STATE,
  makeEnvironmentThreadState,
  type EnvironmentThreadState,
} from "./threads.ts";
import { resetThreadSyncDiagnosticsForTests } from "./threadSyncDiagnostics.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});
const THREAD_ID = ThreadId.make("thread-1");
const BASE_THREAD: OrchestrationThread = {
  id: THREAD_ID,
  projectId: ProjectId.make("project-1"),
  title: "Cached thread",
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5.4",
  },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: "main",
  worktreePath: null,
  latestTurn: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  archivedAt: null,
  deletedAt: null,
  messages: [],
  proposedPlans: [],
  activities: [],
  checkpoints: [],
  session: null,
};

type TestThreadInput = OrchestrationThreadStreamItem | Error;
type TestThreadV2Input = OrchestrationThreadStreamV2Item | Error;
type HydrateThreadActivityPayloadsInput = Parameters<
  WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.hydrateThreadActivityPayloads]
>[0];

function testSession(client: WsRpcProtocolClient, threadSyncV2 = false): RpcSession.RpcSession {
  return {
    client,
    initialConfig: Effect.succeed({
      environment: {
        environmentId: TARGET.environmentId,
        label: TARGET.label,
        platform: { os: "linux", arch: "x64" },
        serverVersion: "0.0.0-test",
        capabilities: { threadSyncV2 },
      },
    } as ServerConfig),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  } as unknown as RpcSession.RpcSession;
}

function awaitThreadState(
  observed: Queue.Queue<EnvironmentThreadState>,
  predicate: (state: EnvironmentThreadState) => boolean,
) {
  return Queue.take(observed).pipe(
    Effect.repeat({
      until: predicate,
    }),
  );
}

const makeHarness = Effect.fn("TestEnvironmentThreads.makeHarness")(function* (options?: {
  readonly cached?: OrchestrationThread;
  readonly threadSyncV2?: boolean;
  readonly hydrate?: (
    input: HydrateThreadActivityPayloadsInput,
  ) => ReturnType<
    WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.hydrateThreadActivityPayloads]
  >;
}) {
  resetThreadSyncDiagnosticsForTests();
  const inputs = yield* Queue.unbounded<TestThreadInput>();
  const v2Inputs = yield* Queue.unbounded<TestThreadV2Input>();
  const observed = yield* Queue.unbounded<EnvironmentThreadState>();
  const latest = yield* Ref.make<EnvironmentThreadState>(EMPTY_ENVIRONMENT_THREAD_STATE);
  const retryCount = yield* Ref.make(0);
  const subscriptionCount = yield* Ref.make(0);
  const subscriptionVersions = yield* Ref.make<ReadonlyArray<"v1" | "v2">>([]);
  const hydrationActivityIdChunks = yield* Ref.make<ReadonlyArray<ReadonlyArray<EventId>>>([]);
  const savedThreads = yield* Ref.make<ReadonlyArray<OrchestrationThread>>([]);
  const removedThreads = yield* Ref.make<ReadonlyArray<ThreadId>>([]);
  const supervisorState = yield* SubscriptionRef.make<SupervisorConnectionState>(
    AVAILABLE_CONNECTION_STATE,
  );
  const streamFrom = <T>(queue: Queue.Queue<T | Error>) =>
    Stream.fromQueue(queue).pipe(
      Stream.mapEffect((input) =>
        input instanceof Error ? Effect.fail(input) : Effect.succeed(input),
      ),
    );
  const client = {
    [ORCHESTRATION_WS_METHODS.subscribeThread]: () =>
      Stream.unwrap(
        Ref.updateAndGet(subscriptionCount, (count) => count + 1).pipe(
          Effect.tap(() =>
            Ref.update(subscriptionVersions, (versions) => [...versions, "v1" as const]),
          ),
          Effect.map(() => streamFrom(inputs)),
        ),
      ),
    [ORCHESTRATION_WS_METHODS.subscribeThreadV2]: () =>
      Stream.unwrap(
        Ref.updateAndGet(subscriptionCount, (count) => count + 1).pipe(
          Effect.tap(() =>
            Ref.update(subscriptionVersions, (versions) => [...versions, "v2" as const]),
          ),
          Effect.map(() => streamFrom(v2Inputs)),
        ),
      ),
    [ORCHESTRATION_WS_METHODS.hydrateThreadActivityPayloads]: (
      input: HydrateThreadActivityPayloadsInput,
    ) =>
      Ref.update(hydrationActivityIdChunks, (chunks) => [...chunks, input.activityIds]).pipe(
        Effect.andThen(
          options?.hydrate?.(input) ??
            Effect.succeed({
              payloads: input.activityIds.map((activityId) => ({
                activityId,
                payload: { hydratedActivityId: activityId },
                byteLength: 32,
              })),
              omitted: [],
            }),
        ),
      ),
  } as unknown as WsRpcProtocolClient;
  const supervisorSession = yield* SubscriptionRef.make<Option.Option<RpcSession.RpcSession>>(
    Option.some(testSession(client, options?.threadSyncV2)),
  );
  const prepared = yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none());
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: TARGET,
    state: supervisorState,
    session: supervisorSession,
    prepared,
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Ref.update(retryCount, (count) => count + 1),
  } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  const cache = Persistence.EnvironmentCacheStore.of({
    loadShell: () => Effect.succeed(Option.none()),
    saveShell: () => Effect.void,
    loadThread: (_environmentId, threadId) =>
      Effect.succeed(
        threadId === THREAD_ID && options?.cached !== undefined
          ? Option.some(options.cached)
          : Option.none(),
      ),
    saveThread: (_environmentId, thread) =>
      Ref.update(savedThreads, (current) => [...current, thread]),
    removeThread: (_environmentId, threadId) =>
      Ref.update(removedThreads, (current) => [...current, threadId]),
    clear: () => Effect.void,
  });
  const threadState = yield* makeEnvironmentThreadState(THREAD_ID).pipe(
    Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
    Effect.provideService(Persistence.EnvironmentCacheStore, cache),
  );
  yield* SubscriptionRef.changes(threadState).pipe(
    Stream.runForEach((state) =>
      Ref.set(latest, state).pipe(Effect.andThen(Queue.offer(observed, state))),
    ),
    Effect.forkScoped,
  );

  return {
    inputs,
    v2Inputs,
    observed,
    latest,
    retryCount,
    subscriptionCount,
    subscriptionVersions,
    hydrationActivityIdChunks,
    supervisorState,
    supervisorSession,
    savedThreads,
    removedThreads,
    replaceSession: SubscriptionRef.set(
      supervisorSession,
      Option.some(testSession(client, options?.threadSyncV2)),
    ),
    replaceSessionWithCapability: (threadSyncV2: boolean) =>
      SubscriptionRef.set(supervisorSession, Option.some(testSession(client, threadSyncV2))),
  };
});

const snapshot = (thread: OrchestrationThread): OrchestrationThreadStreamItem => ({
  kind: "snapshot",
  snapshot: {
    snapshotSequence: 1,
    thread,
  },
});

const v2Snapshot = (thread: OrchestrationThread): OrchestrationThreadStreamV2Item => ({
  kind: "snapshot",
  snapshot: {
    snapshotSequence: 1,
    thread,
    windows: {
      messages: {
        returned: thread.messages.length,
        limit: Math.max(1, thread.messages.length),
        hasMoreBefore: true,
        hasMoreAfter: false,
      },
      proposedPlans: {
        returned: thread.proposedPlans.length,
        limit: Math.max(1, thread.proposedPlans.length),
        hasMoreBefore: false,
        hasMoreAfter: false,
      },
      activities: {
        returned: thread.activities.length,
        limit: Math.max(1, thread.activities.length),
        hasMoreBefore: false,
        hasMoreAfter: false,
      },
      checkpoints: {
        returned: thread.checkpoints.length,
        limit: Math.max(1, thread.checkpoints.length),
        hasMoreBefore: false,
        hasMoreAfter: false,
      },
    },
    deferredActivityPayloads: thread.activities.length,
    estimatedSerializedBytes: 4096,
  },
});

const titleUpdated = (title: string, sequence = 2): OrchestrationThreadStreamItem => ({
  kind: "event",
  event: {
    eventId: EventId.make("event-title"),
    sequence,
    occurredAt: "2026-04-01T01:00:00.000Z",
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    aggregateKind: "thread",
    aggregateId: THREAD_ID,
    type: "thread.meta-updated",
    payload: {
      threadId: THREAD_ID,
      title,
      updatedAt: "2026-04-01T01:00:00.000Z",
    },
  },
});

const v2TitleUpdated = (title: string, sequence = 2): OrchestrationThreadStreamV2Item => {
  const item = titleUpdated(title, sequence);
  if (item.kind !== "event") {
    throw new Error("Expected a thread event.");
  }
  return {
    ...item,
    deferredActivityPayloads: 0,
    estimatedSerializedBytes: 128,
  };
};

const v2ActivityAppended = (
  activity: OrchestrationThreadActivity,
  sequence = 3,
): OrchestrationThreadStreamV2Item => ({
  kind: "event",
  event: {
    eventId: EventId.make(`event-${activity.id}`),
    sequence,
    occurredAt: activity.createdAt,
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    aggregateKind: "thread",
    aggregateId: THREAD_ID,
    type: "thread.activity-appended",
    payload: {
      threadId: THREAD_ID,
      activity,
    },
  },
  deferredActivityPayloads: 1,
  estimatedSerializedBytes: 192,
});

const deleted = (): OrchestrationThreadStreamItem => ({
  kind: "event",
  event: {
    eventId: EventId.make("event-deleted"),
    sequence: 3,
    occurredAt: "2026-04-01T02:00:00.000Z",
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    aggregateKind: "thread",
    aggregateId: THREAD_ID,
    type: "thread.deleted",
    payload: {
      threadId: THREAD_ID,
      deletedAt: "2026-04-01T02:00:00.000Z",
    },
  },
});

describe("EnvironmentThreads", () => {
  it.effect("publishes cached data before a live snapshot arrives", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ cached: BASE_THREAD });
      const state = yield* awaitThreadState(
        harness.observed,
        (value) => value.status === "cached" && Option.isSome(value.data),
      );

      expect(Option.getOrThrow(state.data)).toEqual(BASE_THREAD);
      expect(Option.isNone(state.error)).toBe(true);
    }),
  );

  it.effect("reduces live events and persists the latest thread", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ cached: BASE_THREAD });
      yield* Queue.offer(harness.inputs, snapshot(BASE_THREAD));
      yield* Queue.offer(harness.inputs, titleUpdated("Live title"));

      const state = yield* awaitThreadState(
        harness.observed,
        (value) =>
          value.status === "live" &&
          Option.isSome(value.data) &&
          value.data.value.title === "Live title",
      );
      yield* TestClock.adjust("500 millis");
      yield* Effect.yieldNow;

      expect(Option.getOrThrow(state.data).title).toBe("Live title");
      expect((yield* Ref.get(harness.savedThreads)).at(-1)?.title).toBe("Live title");
    }),
  );

  it.effect("ignores replayed thread events at or below the snapshot sequence", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ cached: BASE_THREAD });
      yield* Queue.offer(harness.inputs, snapshot(BASE_THREAD));
      yield* Queue.offer(harness.inputs, titleUpdated("Replayed title", 1));
      yield* Queue.offer(harness.inputs, titleUpdated("Live title", 2));

      const state = yield* awaitThreadState(
        harness.observed,
        (value) =>
          value.status === "live" &&
          Option.isSome(value.data) &&
          value.data.value.title === "Live title",
      );

      expect(Option.getOrThrow(state.data).title).toBe("Live title");
    }),
  );

  it.effect("selects sync versions from each replacement session capability", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.subscriptionVersions)).length >= 1) {
          break;
        }
        yield* Effect.yieldNow;
      }

      expect(yield* Ref.get(harness.subscriptionVersions)).toEqual(["v1"]);

      yield* harness.replaceSessionWithCapability(true);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.subscriptionVersions)).length >= 2) {
          break;
        }
        yield* Effect.yieldNow;
      }

      expect(yield* Ref.get(harness.subscriptionVersions)).toEqual(["v1", "v2"]);
      expect((yield* Ref.get(harness.latest)).syncStatus).toMatchObject({
        phase: "subscribing",
        version: "v2",
      });
    }),
  );

  it.effect("hydrates v2 payloads serially in chunks while preserving cached history", () =>
    Effect.gen(function* () {
      const firstHydration = yield* Deferred.make<void>();
      let hydrationRequestCount = 0;
      const cachedMessage = {
        id: MessageId.make("message-cached"),
        role: "user" as const,
        text: "Cached history",
        turnId: null,
        streaming: false,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      };
      const liveMessage = {
        ...cachedMessage,
        id: MessageId.make("message-live"),
        text: "Live window",
        createdAt: "2026-04-01T01:00:00.000Z",
        updatedAt: "2026-04-01T01:00:00.000Z",
      };
      const deferredActivities = Array.from({ length: 51 }, (_, index) => ({
        id: EventId.make(`activity-${index}`),
        tone: "tool" as const,
        kind: "tool.call",
        summary: `Activity ${index}`,
        payload: {
          __t3Deferred: "thread-activity-payload" as const,
          byteLength: 4097,
        },
        turnId: null,
        sequence: index + 1,
        createdAt: `2026-04-01T01:${String(index).padStart(2, "0")}:00.000Z`,
      }));
      const cachedThread = { ...BASE_THREAD, messages: [cachedMessage] };
      const liveThread = {
        ...BASE_THREAD,
        title: "V2 snapshot",
        messages: [liveMessage],
        activities: deferredActivities,
      };
      const harness = yield* makeHarness({
        cached: cachedThread,
        threadSyncV2: true,
        hydrate: (input) =>
          Effect.gen(function* () {
            hydrationRequestCount += 1;
            if (hydrationRequestCount === 1) {
              yield* Deferred.await(firstHydration);
            }
            return {
              payloads: input.activityIds.map((activityId) => ({
                activityId,
                payload: { hydratedActivityId: activityId },
                byteLength: 32,
              })),
              omitted: [],
            };
          }),
      });

      yield* Queue.offer(harness.v2Inputs, v2Snapshot(liveThread));
      const hydrating = yield* awaitThreadState(
        harness.observed,
        (value) => value.syncStatus?.phase === "hydrating",
      );
      expect(hydrating.syncStatus).toMatchObject({
        version: "v2",
        deferredPayloadCount: 51,
      });

      yield* Queue.offer(harness.v2Inputs, v2TitleUpdated("After hydration"));
      for (let attempt = 0; attempt < 20; attempt += 1) {
        yield* Effect.yieldNow;
      }
      expect(
        Option.getOrThrow(yield* Ref.get(harness.latest).pipe(Effect.map((state) => state.data)))
          .title,
      ).toBe("Cached thread");
      expect(
        (yield* Ref.get(harness.hydrationActivityIdChunks)).map((chunk) => chunk.length),
      ).toEqual([50]);

      yield* Deferred.succeed(firstHydration, undefined);
      const live = yield* awaitThreadState(
        harness.observed,
        (value) =>
          value.syncStatus?.phase === "live" &&
          Option.isSome(value.data) &&
          value.data.value.title === "After hydration",
      );
      const liveValue = Option.getOrThrow(live.data);
      expect(liveValue.messages.map((message) => message.id)).toEqual([
        cachedMessage.id,
        liveMessage.id,
      ]);
      expect(liveValue.activities).toHaveLength(51);
      expect(liveValue.activities[0]?.payload).toEqual({
        hydratedActivityId: deferredActivities[0]?.id,
      });
      expect(
        (yield* Ref.get(harness.hydrationActivityIdChunks)).map((chunk) => chunk.length),
      ).toEqual([50, 1]);

      const deferredEventActivity: OrchestrationThreadActivity = {
        ...deferredActivities[0]!,
        id: EventId.make("activity-event"),
        sequence: 52,
        summary: "Deferred event",
      };
      yield* Queue.offer(harness.v2Inputs, v2ActivityAppended(deferredEventActivity));
      const eventHydrated = yield* awaitThreadState(
        harness.observed,
        (value) =>
          Option.isSome(value.data) &&
          value.data.value.activities.some(
            (activity) =>
              activity.id === deferredEventActivity.id &&
              (activity.payload as { hydratedActivityId?: EventId }).hydratedActivityId ===
                deferredEventActivity.id,
          ),
      );
      expect(Option.getOrThrow(eventHydrated.data).activities.at(-1)?.payload).toEqual({
        hydratedActivityId: deferredEventActivity.id,
      });
      expect(
        (yield* Ref.get(harness.hydrationActivityIdChunks)).map((chunk) => chunk.length),
      ).toEqual([50, 1, 1]);
    }),
  );

  it.effect("removes cached data when the thread is deleted", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ cached: BASE_THREAD });
      yield* Queue.offer(harness.inputs, snapshot(BASE_THREAD));
      yield* Queue.offer(harness.inputs, deleted());

      const state = yield* awaitThreadState(
        harness.observed,
        (value) => value.status === "deleted",
      );

      expect(Option.isNone(state.data)).toBe(true);
      expect(yield* Ref.get(harness.removedThreads)).toEqual([THREAD_ID]);
    }),
  );

  it.effect("preserves data after a domain failure and resumes on a replacement session", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ cached: BASE_THREAD });
      yield* Queue.offer(harness.inputs, snapshot(BASE_THREAD));
      yield* Queue.offer(harness.inputs, new Error("stream failed"));

      const state = yield* awaitThreadState(harness.observed, (value) =>
        Option.isSome(value.error),
      );

      expect(Option.getOrThrow(state.data)).toEqual(BASE_THREAD);
      expect(Option.getOrThrow(state.error)).toBe("stream failed");
      expect(state.syncStatus).toMatchObject({
        phase: "error",
        version: "v1",
        error: "stream failed",
      });
      expect(yield* Ref.get(harness.retryCount)).toBe(0);

      yield* harness.replaceSession;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.subscriptionCount)) >= 2) {
          break;
        }
        yield* Effect.yieldNow;
      }
      yield* Queue.offer(
        harness.inputs,
        snapshot({
          ...BASE_THREAD,
          title: "Recovered thread",
        }),
      );
      const recovered = yield* awaitThreadState(
        harness.observed,
        (value) =>
          value.status === "live" &&
          Option.isSome(value.data) &&
          value.data.value.title === "Recovered thread",
      );

      expect(Option.isNone(recovered.error)).toBe(true);
      expect(yield* Ref.get(harness.subscriptionCount)).toBe(2);
    }),
  );

  it.effect("recovers from a transient domain failure without replacing the session", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* Queue.offer(harness.inputs, new Error("thread not found yet"));

      const failed = yield* awaitThreadState(harness.observed, (value) =>
        Option.isSome(value.error),
      );
      expect(Option.getOrThrow(failed.error)).toBe("thread not found yet");
      expect(yield* Ref.get(harness.subscriptionCount)).toBe(1);

      yield* TestClock.adjust("250 millis");
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.subscriptionCount)) >= 2) {
          break;
        }
        yield* Effect.yieldNow;
      }
      yield* Queue.offer(
        harness.inputs,
        snapshot({
          ...BASE_THREAD,
          title: "Materialized thread",
        }),
      );

      const recovered = yield* awaitThreadState(
        harness.observed,
        (value) =>
          value.status === "live" &&
          Option.isSome(value.data) &&
          value.data.value.title === "Materialized thread",
      );

      expect(Option.isNone(recovered.error)).toBe(true);
      expect(yield* Ref.get(harness.subscriptionCount)).toBe(2);
      expect(yield* Ref.get(harness.retryCount)).toBe(0);
    }),
  );

  it.effect("does not overwrite a live snapshot when the supervisor becomes ready", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ cached: BASE_THREAD });
      yield* SubscriptionRef.set(harness.supervisorState, {
        desired: true,
        network: "online",
        phase: "connecting",
        stage: "synchronizing",
        attempt: 1,
        generation: 0,
        lastFailure: null,
        retryAt: null,
      });
      yield* Queue.offer(harness.inputs, snapshot(BASE_THREAD));
      yield* awaitThreadState(harness.observed, (value) => value.status === "live");

      yield* SubscriptionRef.set(harness.supervisorState, {
        desired: true,
        network: "online",
        phase: "connected",
        stage: null,
        attempt: 1,
        generation: 1,
        lastFailure: null,
        retryAt: null,
      });
      for (let index = 0; index < 10; index += 1) {
        yield* Effect.yieldNow;
      }

      expect((yield* Ref.get(harness.latest)).status).toBe("live");
    }),
  );
});
