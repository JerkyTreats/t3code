import {
  CheckpointRef,
  EnvironmentId,
  EventId,
  MessageId,
  ORCHESTRATION_WS_METHODS,
  OrchestrationGetSnapshotError,
  OrchestrationProposedPlanId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
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
type GetThreadMessagePageInput = Parameters<
  WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.getThreadMessagePage]
>[0];
type GetThreadProposedPlanPageInput = Parameters<
  WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.getThreadProposedPlanPage]
>[0];
type GetThreadActivityPageInput = Parameters<
  WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.getThreadActivityPage]
>[0];
type GetThreadCheckpointPageInput = Parameters<
  WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.getThreadCheckpointPage]
>[0];
type TestHistoryPageCall =
  | { readonly method: "messages"; readonly input: GetThreadMessagePageInput }
  | { readonly method: "proposedPlans"; readonly input: GetThreadProposedPlanPageInput }
  | { readonly method: "activities"; readonly input: GetThreadActivityPageInput }
  | { readonly method: "checkpoints"; readonly input: GetThreadCheckpointPageInput };

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
  readonly replayV2Items?: ReadonlyArray<OrchestrationThreadStreamV2Item>;
  readonly getMessagePage?: (
    input: GetThreadMessagePageInput,
  ) => ReturnType<WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.getThreadMessagePage]>;
  readonly getProposedPlanPage?: (
    input: GetThreadProposedPlanPageInput,
  ) => ReturnType<WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.getThreadProposedPlanPage]>;
  readonly getActivityPage?: (
    input: GetThreadActivityPageInput,
  ) => ReturnType<WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.getThreadActivityPage]>;
  readonly getCheckpointPage?: (
    input: GetThreadCheckpointPageInput,
  ) => ReturnType<WsRpcProtocolClient[typeof ORCHESTRATION_WS_METHODS.getThreadCheckpointPage]>;
}) {
  resetThreadSyncDiagnosticsForTests();
  const inputs = yield* Queue.unbounded<TestThreadInput>();
  const v2Inputs = yield* Queue.unbounded<TestThreadV2Input>();
  const observed = yield* Queue.unbounded<EnvironmentThreadState>();
  const latest = yield* Ref.make<EnvironmentThreadState>(EMPTY_ENVIRONMENT_THREAD_STATE);
  const retryCount = yield* Ref.make(0);
  const subscriptionCount = yield* Ref.make(0);
  const v2SubscriptionCount = yield* Ref.make(0);
  const subscriptionVersions = yield* Ref.make<ReadonlyArray<"v1" | "v2">>([]);
  const hydrationActivityIdChunks = yield* Ref.make<ReadonlyArray<ReadonlyArray<EventId>>>([]);
  const historyPageCalls = yield* Ref.make<ReadonlyArray<TestHistoryPageCall>>([]);
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
          Effect.andThen(Ref.updateAndGet(v2SubscriptionCount, (count) => count + 1)),
          Effect.map((count) => {
            const live = streamFrom(v2Inputs);
            return count > 1 && options?.replayV2Items !== undefined
              ? Stream.fromIterable(options.replayV2Items).pipe(Stream.concat(live))
              : live;
          }),
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
    [ORCHESTRATION_WS_METHODS.getThreadMessagePage]: (input: GetThreadMessagePageInput) =>
      Ref.update(historyPageCalls, (calls) => [
        ...calls,
        { method: "messages" as const, input },
      ]).pipe(
        Effect.andThen(
          options?.getMessagePage?.(input) ??
            Effect.succeed({
              items: [],
              startCursor: null,
              hasMoreBefore: false,
              estimatedSerializedBytes: 0,
            }),
        ),
      ),
    [ORCHESTRATION_WS_METHODS.getThreadProposedPlanPage]: (input: GetThreadProposedPlanPageInput) =>
      Ref.update(historyPageCalls, (calls) => [
        ...calls,
        { method: "proposedPlans" as const, input },
      ]).pipe(
        Effect.andThen(
          options?.getProposedPlanPage?.(input) ??
            Effect.succeed({
              items: [],
              startCursor: null,
              hasMoreBefore: false,
              estimatedSerializedBytes: 0,
            }),
        ),
      ),
    [ORCHESTRATION_WS_METHODS.getThreadActivityPage]: (input: GetThreadActivityPageInput) =>
      Ref.update(historyPageCalls, (calls) => [
        ...calls,
        { method: "activities" as const, input },
      ]).pipe(
        Effect.andThen(
          options?.getActivityPage?.(input) ??
            Effect.succeed({
              items: [],
              startCursor: null,
              endCursor: null,
              hasMoreBefore: false,
              hasMoreAfter: false,
              deferredActivityPayloads: 0,
              estimatedSerializedBytes: 0,
            }),
        ),
      ),
    [ORCHESTRATION_WS_METHODS.getThreadCheckpointPage]: (input: GetThreadCheckpointPageInput) =>
      Ref.update(historyPageCalls, (calls) => [
        ...calls,
        { method: "checkpoints" as const, input },
      ]).pipe(
        Effect.andThen(
          options?.getCheckpointPage?.(input) ??
            Effect.succeed({
              items: [],
              startCursor: null,
              hasMoreBefore: false,
              estimatedSerializedBytes: 0,
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
    v2SubscriptionCount,
    subscriptionVersions,
    hydrationActivityIdChunks,
    historyPageCalls,
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

const v2Snapshot = (
  thread: OrchestrationThread,
  snapshotSequence = 1,
): Extract<OrchestrationThreadStreamV2Item, { readonly kind: "snapshot" }> => ({
  kind: "snapshot",
  snapshot: {
    snapshotSequence,
    thread,
    windows: {
      messages: {
        returned: thread.messages.length,
        limit: Math.max(1, thread.messages.length),
        hasMoreBefore: false,
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

function historyMessage(index: number): OrchestrationThread["messages"][number] {
  const createdAt = `2026-04-01T0${index}:00:00.000Z`;
  return {
    id: MessageId.make(`history-message-${index}`),
    role: index % 2 === 0 ? "assistant" : "user",
    text: `History message ${index}`,
    turnId: null,
    streaming: false,
    createdAt,
    updatedAt: createdAt,
  };
}

function historyProposedPlan(index: number): OrchestrationThread["proposedPlans"][number] {
  const createdAt = `2026-04-01T0${index}:10:00.000Z`;
  return {
    id: OrchestrationProposedPlanId.make(`history-plan-${index}`),
    turnId: null,
    planMarkdown: `History plan ${index}`,
    implementedAt: null,
    implementationThreadId: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function historyActivity(index: number): OrchestrationThreadActivity {
  return {
    id: EventId.make(`history-activity-${index}`),
    tone: "tool",
    kind: "tool.call",
    summary: `History activity ${index}`,
    payload: {
      __t3Deferred: "thread-activity-payload",
      byteLength: 4097,
    },
    turnId: null,
    sequence: index,
    createdAt: `2026-04-01T0${index}:20:00.000Z`,
  };
}

function historyCheckpoint(index: number): OrchestrationThread["checkpoints"][number] {
  return {
    turnId: TurnId.make(`history-turn-${index}`),
    checkpointTurnCount: index,
    checkpointRef: CheckpointRef.make(`history-checkpoint-${index}`),
    status: "ready",
    files: [],
    assistantMessageId: null,
    completedAt: `2026-04-01T0${index}:30:00.000Z`,
  };
}

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

  it.effect("falls back to v1 when a v2 history window requires forward paging", () =>
    Effect.gen(function* () {
      const olderMessage = {
        id: MessageId.make("message-older"),
        role: "user" as const,
        text: "Older history",
        turnId: null,
        streaming: false,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      };
      const tailMessage = {
        ...olderMessage,
        id: MessageId.make("message-tail"),
        text: "Tail history",
        createdAt: "2026-04-01T01:00:00.000Z",
        updatedAt: "2026-04-01T01:00:00.000Z",
      };
      const tailSnapshot = v2Snapshot({ ...BASE_THREAD, messages: [tailMessage] });
      const truncatedSnapshot = {
        ...tailSnapshot,
        snapshot: {
          ...tailSnapshot.snapshot,
          windows: {
            ...tailSnapshot.snapshot.windows,
            messages: {
              ...tailSnapshot.snapshot.windows.messages,
              hasMoreAfter: true,
            },
          },
        },
      };
      const completeThread = {
        ...BASE_THREAD,
        title: "Complete v1 history",
        messages: [olderMessage, tailMessage],
      };
      const harness = yield* makeHarness({
        cached: BASE_THREAD,
        threadSyncV2: true,
      });

      yield* Queue.offer(harness.v2Inputs, truncatedSnapshot);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.subscriptionVersions)).length >= 2) {
          break;
        }
        yield* Effect.yieldNow;
      }
      expect(yield* Ref.get(harness.subscriptionVersions)).toEqual(["v2", "v1"]);

      yield* Queue.offer(harness.inputs, snapshot(completeThread));
      const live = yield* awaitThreadState(
        harness.observed,
        (state) =>
          state.syncStatus?.phase === "live" &&
          state.syncStatus.version === "v1" &&
          Option.isSome(state.data),
      );
      expect(Option.getOrThrow(live.data).messages.map((message) => message.id)).toEqual([
        olderMessage.id,
        tailMessage.id,
      ]);
      expect(Option.isNone(live.error)).toBe(true);
    }),
  );

  it.effect("restores complete cold-cache v2 history across every paged collection", () =>
    Effect.gen(function* () {
      const messages = [historyMessage(1), historyMessage(2), historyMessage(3)];
      const proposedPlans = [
        historyProposedPlan(1),
        historyProposedPlan(2),
        historyProposedPlan(3),
      ];
      const activities = [historyActivity(1), historyActivity(2), historyActivity(3)];
      const checkpoints = [historyCheckpoint(1), historyCheckpoint(2), historyCheckpoint(3)];
      const tailSnapshot = v2Snapshot({
        ...BASE_THREAD,
        messages: [messages[2]!],
        proposedPlans: [proposedPlans[2]!],
        activities: [activities[2]!],
        checkpoints: [checkpoints[2]!],
      });
      const pagedSnapshot = {
        ...tailSnapshot,
        snapshot: {
          ...tailSnapshot.snapshot,
          windows: {
            messages: { ...tailSnapshot.snapshot.windows.messages, hasMoreBefore: true },
            proposedPlans: {
              ...tailSnapshot.snapshot.windows.proposedPlans,
              hasMoreBefore: true,
            },
            activities: { ...tailSnapshot.snapshot.windows.activities, hasMoreBefore: true },
            checkpoints: { ...tailSnapshot.snapshot.windows.checkpoints, hasMoreBefore: true },
          },
        },
      };
      let messagePageIndex = 0;
      let proposedPlanPageIndex = 0;
      let activityPageIndex = 0;
      let checkpointPageIndex = 0;
      const harness = yield* makeHarness({
        threadSyncV2: true,
        getMessagePage: (input) => {
          const item = messages[1 - messagePageIndex]!;
          expect(input.before?.messageId).toBe(messages[2 - messagePageIndex]?.id);
          messagePageIndex += 1;
          return Effect.succeed({
            items: [item],
            startCursor: { messageId: item.id, createdAt: item.createdAt },
            hasMoreBefore: messagePageIndex < 2,
            estimatedSerializedBytes: 64,
          });
        },
        getProposedPlanPage: (input) => {
          const item = proposedPlans[1 - proposedPlanPageIndex]!;
          expect(input.before?.planId).toBe(proposedPlans[2 - proposedPlanPageIndex]?.id);
          proposedPlanPageIndex += 1;
          return Effect.succeed({
            items: [item],
            startCursor: { planId: item.id, createdAt: item.createdAt },
            hasMoreBefore: proposedPlanPageIndex < 2,
            estimatedSerializedBytes: 64,
          });
        },
        getActivityPage: (input) => {
          const item = activities[1 - activityPageIndex]!;
          expect(input.cursor?.position.activityId).toBe(activities[2 - activityPageIndex]?.id);
          activityPageIndex += 1;
          const cursor = {
            activityId: item.id,
            createdAt: item.createdAt,
            sequence: item.sequence ?? null,
          };
          return Effect.succeed({
            items: [item],
            startCursor: cursor,
            endCursor: cursor,
            hasMoreBefore: activityPageIndex < 2,
            hasMoreAfter: false,
            deferredActivityPayloads: 1,
            estimatedSerializedBytes: 64,
          });
        },
        getCheckpointPage: (input) => {
          const item = checkpoints[1 - checkpointPageIndex]!;
          expect(input.before?.checkpointTurnCount).toBe(
            checkpoints[2 - checkpointPageIndex]?.checkpointTurnCount,
          );
          checkpointPageIndex += 1;
          return Effect.succeed({
            items: [item],
            startCursor: { checkpointTurnCount: item.checkpointTurnCount },
            hasMoreBefore: checkpointPageIndex < 2,
            estimatedSerializedBytes: 64,
          });
        },
      });

      yield* Queue.offer(harness.v2Inputs, pagedSnapshot);
      const live = yield* awaitThreadState(
        harness.observed,
        (state) =>
          state.syncStatus?.phase === "live" && Option.getOrNull(state.data)?.messages.length === 3,
      );
      const thread = Option.getOrThrow(live.data);
      expect(thread.messages.map((message) => message.id)).toEqual(
        messages.map((message) => message.id),
      );
      expect(thread.proposedPlans.map((plan) => plan.id)).toEqual(
        proposedPlans.map((plan) => plan.id),
      );
      expect(thread.activities.map((activity) => activity.id)).toEqual(
        activities.map((activity) => activity.id),
      );
      expect(thread.checkpoints.map((checkpoint) => checkpoint.checkpointRef)).toEqual(
        checkpoints.map((checkpoint) => checkpoint.checkpointRef),
      );
      expect(thread.activities.map((activity) => activity.payload)).toEqual(
        activities.map((activity) => ({ hydratedActivityId: activity.id })),
      );
      expect((yield* Ref.get(harness.historyPageCalls)).map((call) => call.method)).toEqual([
        "messages",
        "messages",
        "proposedPlans",
        "proposedPlans",
        "activities",
        "activities",
        "checkpoints",
        "checkpoints",
      ]);
      expect(yield* Ref.get(harness.hydrationActivityIdChunks)).toEqual([
        activities.map((activity) => activity.id),
      ]);
      expect(live.syncStatus).toMatchObject({
        phase: "live",
        version: "v2",
        deferredPayloadCount: 3,
        estimatedBytes: 4_608,
      });
    }),
  );

  it.effect("pages backward from an empty byte-trimmed initial window", () =>
    Effect.gen(function* () {
      const olderMessage = historyMessage(1);
      const pagedSnapshot = {
        ...v2Snapshot({ ...BASE_THREAD, messages: [] }),
        snapshot: {
          ...v2Snapshot({ ...BASE_THREAD, messages: [] }).snapshot,
          windows: {
            ...v2Snapshot({ ...BASE_THREAD, messages: [] }).snapshot.windows,
            messages: {
              ...v2Snapshot({ ...BASE_THREAD, messages: [] }).snapshot.windows.messages,
              hasMoreBefore: true,
            },
          },
        },
      };
      let pageAttempt = 0;
      const harness = yield* makeHarness({
        threadSyncV2: true,
        getMessagePage: (input) => {
          pageAttempt += 1;
          if (pageAttempt === 1) {
            expect(input.before).toBeUndefined();
            return Effect.succeed({
              items: [],
              startCursor: {
                messageId: olderMessage.id,
                createdAt: olderMessage.createdAt,
              },
              hasMoreBefore: true,
              estimatedSerializedBytes: 64,
            });
          }
          expect(input.before?.messageId).toBe(olderMessage.id);
          return Effect.succeed({
            items: [olderMessage],
            startCursor: {
              messageId: olderMessage.id,
              createdAt: olderMessage.createdAt,
            },
            hasMoreBefore: false,
            estimatedSerializedBytes: 64,
          });
        },
      });

      yield* Queue.offer(harness.v2Inputs, pagedSnapshot);
      const live = yield* awaitThreadState(
        harness.observed,
        (state) =>
          state.syncStatus?.phase === "live" &&
          Option.getOrNull(state.data)?.messages[0]?.id === olderMessage.id,
      );

      expect(Option.getOrThrow(live.data).messages.map((message) => message.id)).toEqual([
        olderMessage.id,
      ]);
      expect(pageAttempt).toBe(2);
    }),
  );

  it.effect("retries a failed history page before publishing the v2 snapshot", () =>
    Effect.gen(function* () {
      const olderMessage = historyMessage(1);
      const tailMessage = historyMessage(2);
      const tailSnapshot = v2Snapshot({ ...BASE_THREAD, messages: [tailMessage] });
      const pagedSnapshot = {
        ...tailSnapshot,
        snapshot: {
          ...tailSnapshot.snapshot,
          windows: {
            ...tailSnapshot.snapshot.windows,
            messages: { ...tailSnapshot.snapshot.windows.messages, hasMoreBefore: true },
          },
        },
      };
      let pageAttempt = 0;
      const harness = yield* makeHarness({
        cached: BASE_THREAD,
        threadSyncV2: true,
        replayV2Items: [pagedSnapshot],
        getMessagePage: () => {
          pageAttempt += 1;
          return pageAttempt === 1
            ? Effect.fail(new OrchestrationGetSnapshotError({ message: "History page failed" }))
            : Effect.succeed({
                items: [olderMessage],
                startCursor: {
                  messageId: olderMessage.id,
                  createdAt: olderMessage.createdAt,
                },
                hasMoreBefore: false,
                estimatedSerializedBytes: 64,
              });
        },
      });

      yield* Queue.offer(harness.v2Inputs, pagedSnapshot);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.latest)).syncStatus?.phase === "error") {
          break;
        }
        yield* Effect.yieldNow;
      }
      const failed = yield* Ref.get(harness.latest);
      expect(failed.syncStatus?.phase).toBe("error");
      expect(Option.getOrThrow(failed.data)).toEqual(BASE_THREAD);
      expect(yield* Ref.get(harness.v2SubscriptionCount)).toBe(1);

      yield* TestClock.adjust("250 millis");
      const recovered = yield* awaitThreadState(
        harness.observed,
        (state) => state.syncStatus?.phase === "live" && Option.isSome(state.data),
      );
      expect(Option.getOrThrow(recovered.data).messages.map((message) => message.id)).toEqual([
        olderMessage.id,
        tailMessage.id,
      ]);
      expect(yield* Ref.get(harness.v2SubscriptionCount)).toBe(2);
      expect(pageAttempt).toBe(2);
    }),
  );

  it.effect("stops malformed history paging when the server cursor does not advance", () =>
    Effect.gen(function* () {
      const tailMessage = historyMessage(2);
      const tailSnapshot = v2Snapshot({ ...BASE_THREAD, messages: [tailMessage] });
      const pagedSnapshot = {
        ...tailSnapshot,
        snapshot: {
          ...tailSnapshot.snapshot,
          windows: {
            ...tailSnapshot.snapshot.windows,
            messages: { ...tailSnapshot.snapshot.windows.messages, hasMoreBefore: true },
          },
        },
      };
      const harness = yield* makeHarness({
        cached: BASE_THREAD,
        threadSyncV2: true,
        getMessagePage: (input) =>
          Effect.succeed({
            items: [],
            startCursor: input.before ?? null,
            hasMoreBefore: true,
            estimatedSerializedBytes: 0,
          }),
      });

      yield* Queue.offer(harness.v2Inputs, pagedSnapshot);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.latest)).syncStatus?.phase === "error") {
          break;
        }
        yield* Effect.yieldNow;
      }

      const failed = yield* Ref.get(harness.latest);
      expect(failed.syncStatus?.phase).toBe("error");
      expect(failed.syncStatus?.error).toContain("history paging did not advance");
      expect(Option.getOrThrow(failed.data)).toEqual(BASE_THREAD);
      expect(yield* Ref.get(harness.historyPageCalls)).toHaveLength(1);
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
        messages: [cachedMessage, liveMessage],
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

  it.effect("retries a failed snapshot hydration before consuming later events", () =>
    Effect.gen(function* () {
      const activity: OrchestrationThreadActivity = {
        id: EventId.make("activity-failed-snapshot"),
        tone: "tool",
        kind: "tool.call",
        summary: "Deferred snapshot activity",
        payload: {
          __t3Deferred: "thread-activity-payload",
          byteLength: 4097,
        },
        turnId: null,
        sequence: 1,
        createdAt: "2026-04-01T01:00:00.000Z",
      };
      const failedSnapshot = v2Snapshot({
        ...BASE_THREAD,
        title: "Failed snapshot",
        activities: [activity],
      });
      const replayedSnapshot = v2Snapshot(
        {
          ...BASE_THREAD,
          title: "Later event",
          activities: [activity],
        },
        2,
      );
      let hydrationAttempt = 0;
      const harness = yield* makeHarness({
        cached: BASE_THREAD,
        threadSyncV2: true,
        replayV2Items: [replayedSnapshot],
        hydrate: (input) => {
          hydrationAttempt += 1;
          return hydrationAttempt === 1
            ? Effect.fail(
                new OrchestrationGetSnapshotError({ message: "Snapshot hydration failed" }),
              )
            : Effect.succeed({
                payloads: input.activityIds.map((activityId) => ({
                  activityId,
                  payload: { hydratedActivityId: activityId },
                  byteLength: 32,
                })),
                omitted: [],
              });
        },
      });

      yield* Queue.offer(harness.v2Inputs, failedSnapshot);
      yield* Queue.offer(harness.v2Inputs, v2TitleUpdated("Later event"));

      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.latest)).syncStatus?.phase === "error") {
          break;
        }
        yield* Effect.yieldNow;
      }
      const failed = yield* Ref.get(harness.latest);
      expect(failed.syncStatus?.phase).toBe("error");
      expect(Option.getOrThrow(failed.data).title).toBe("Cached thread");
      expect(Option.getOrThrow(failed.data).activities).toEqual([]);
      expect(yield* Ref.get(harness.v2SubscriptionCount)).toBe(1);

      yield* Effect.yieldNow;
      yield* TestClock.adjust("249 millis");
      expect(yield* Ref.get(harness.v2SubscriptionCount)).toBe(1);
      expect(
        Option.getOrThrow(yield* Ref.get(harness.latest).pipe(Effect.map((x) => x.data))).title,
      ).toBe("Cached thread");

      yield* TestClock.adjust("1 millis");
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.v2SubscriptionCount)) >= 2) {
          break;
        }
        yield* Effect.yieldNow;
      }
      expect(yield* Ref.get(harness.v2SubscriptionCount)).toBe(2);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const state = yield* Ref.get(harness.latest);
        if (
          state.syncStatus?.phase === "live" &&
          Option.getOrNull(state.data)?.title === "Later event"
        ) {
          break;
        }
        yield* Effect.yieldNow;
      }
      const recovered = yield* Ref.get(harness.latest);
      expect(Option.getOrThrow(recovered.data).title).toBe("Later event");
      expect(yield* Ref.get(harness.v2SubscriptionCount)).toBe(2);
      expect(Option.getOrThrow(recovered.data).activities[0]?.payload).toEqual({
        hydratedActivityId: activity.id,
      });
      expect(hydrationAttempt).toBe(2);
    }),
  );

  it.effect("retries a failed event hydration before consuming the next mutation", () =>
    Effect.gen(function* () {
      const initialSnapshot = v2Snapshot({
        ...BASE_THREAD,
        title: "Initial snapshot",
      });
      const activity: OrchestrationThreadActivity = {
        id: EventId.make("activity-failed-event"),
        tone: "approval",
        kind: "approval.requested",
        summary: "Deferred event activity",
        payload: {
          __t3Deferred: "thread-activity-payload",
          byteLength: 4097,
        },
        turnId: null,
        sequence: 2,
        createdAt: "2026-04-01T02:00:00.000Z",
      };
      const replayedEvent = v2ActivityAppended(activity, 2);
      const replayedSnapshot = v2Snapshot(
        {
          ...BASE_THREAD,
          title: "Mutation after failure",
          activities: [activity],
        },
        3,
      );
      let hydrationAttempt = 0;
      const harness = yield* makeHarness({
        cached: BASE_THREAD,
        threadSyncV2: true,
        replayV2Items: [replayedSnapshot],
        hydrate: (input) => {
          hydrationAttempt += 1;
          return hydrationAttempt === 1
            ? Effect.fail(new OrchestrationGetSnapshotError({ message: "Event hydration failed" }))
            : Effect.succeed({
                payloads: input.activityIds.map((activityId) => ({
                  activityId,
                  payload: { hydratedActivityId: activityId },
                  byteLength: 32,
                })),
                omitted: [],
              });
        },
      });

      yield* Queue.offer(harness.v2Inputs, initialSnapshot);
      yield* awaitThreadState(
        harness.observed,
        (state) => Option.isSome(state.data) && state.data.value.title === "Initial snapshot",
      );
      yield* Queue.offer(harness.v2Inputs, replayedEvent);
      yield* Queue.offer(harness.v2Inputs, v2TitleUpdated("Mutation after failure", 3));

      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.latest)).syncStatus?.phase === "error") {
          break;
        }
        yield* Effect.yieldNow;
      }
      const failed = yield* Ref.get(harness.latest);
      expect(failed.syncStatus?.phase).toBe("error");
      expect(Option.getOrThrow(failed.data).title).toBe("Initial snapshot");
      expect(Option.getOrThrow(failed.data).activities).toEqual([]);

      yield* Effect.yieldNow;
      yield* TestClock.adjust("250 millis");
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((yield* Ref.get(harness.v2SubscriptionCount)) >= 2) {
          break;
        }
        yield* Effect.yieldNow;
      }
      expect(yield* Ref.get(harness.v2SubscriptionCount)).toBe(2);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (
          Option.getOrNull((yield* Ref.get(harness.latest)).data)?.title ===
          "Mutation after failure"
        ) {
          break;
        }
        yield* Effect.yieldNow;
      }
      const recovered = yield* Ref.get(harness.latest);
      const recoveredThread = Option.getOrThrow(recovered.data);
      expect(recoveredThread.title).toBe("Mutation after failure");
      expect(recoveredThread.activities).toHaveLength(1);
      expect(recoveredThread.activities[0]?.payload).toEqual({
        hydratedActivityId: activity.id,
      });
      expect(yield* Ref.get(harness.v2SubscriptionCount)).toBe(2);
      expect(hydrationAttempt).toBe(2);
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
      yield* awaitThreadState(harness.observed, (value) => value.status === "live");
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
      const retrying = yield* awaitThreadState(
        harness.observed,
        (value) =>
          value.syncStatus?.phase === "error" &&
          value.syncStatus.error === "stream failed" &&
          Option.isSome(value.data),
      );
      expect(Option.getOrThrow(retrying.data)).toEqual(BASE_THREAD);
      expect(Option.getOrThrow(retrying.error)).toBe("stream failed");
      expect(retrying.syncStatus).toMatchObject({
        phase: "error",
        version: "v1",
        error: "stream failed",
      });
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
