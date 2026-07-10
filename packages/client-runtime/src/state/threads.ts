import {
  type EventId,
  ORCHESTRATION_HYDRATE_THREAD_ACTIVITY_PAYLOADS_MAX_IDS,
  ORCHESTRATION_THREAD_SYNC_V2_MAX_CONTENT_CHUNK_BYTES,
  ORCHESTRATION_THREAD_SYNC_V2_MAX_ACTIVITY_ITEMS,
  ORCHESTRATION_THREAD_SYNC_V2_MAX_CHECKPOINT_ITEMS,
  ORCHESTRATION_THREAD_SYNC_V2_MAX_MESSAGE_ITEMS,
  ORCHESTRATION_THREAD_SYNC_V2_MAX_PROPOSED_PLAN_ITEMS,
  type EnvironmentId as EnvironmentIdType,
  type OrchestrationEvent,
  type OrchestrationDeferredThreadContent,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type OrchestrationThreadContentReference,
  type OrchestrationThreadDetailV2Snapshot,
  type OrchestrationThreadSyncV2Event,
  type OrchestrationThreadSyncV2Window,
  type ThreadId as ThreadIdType,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom } from "effect/unstable/reactivity";

import { EnvironmentRegistry } from "../connection/registry.ts";
import { connectionProjectionPhase } from "../connection/model.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { EnvironmentCacheStore } from "../platform/persistence.ts";
import {
  subscribeThread,
  type EnvironmentThreadContentHydrator,
  type EnvironmentThreadHistoryPager,
  type EnvironmentThreadPayloadHydrator,
  type EnvironmentThreadSubscriptionItem,
  type EnvironmentThreadSyncVersion,
} from "../rpc/client.ts";
import { parseThreadKey, threadKey } from "./entities.ts";
import { applyThreadDetailEvent } from "./threadReducer.ts";
import { THREAD_STATE_IDLE_TTL_MS } from "./threadRetention.ts";
import { followStreamInEnvironment } from "./runtime.ts";
import {
  recordThreadSyncDisposed,
  recordThreadSyncError,
  recordThreadSyncEvent,
  recordThreadSyncHydration,
  recordThreadSyncLive,
  recordThreadSyncSnapshot,
  recordThreadSyncSubscription,
  recordThreadSyncWaiting,
} from "./threadSyncDiagnostics.ts";

export type EnvironmentThreadStatus = "empty" | "cached" | "synchronizing" | "live" | "deleted";

export type EnvironmentThreadSyncPhase = "waiting" | "subscribing" | "hydrating" | "live" | "error";

export interface EnvironmentThreadSyncStatus {
  readonly phase: EnvironmentThreadSyncPhase;
  readonly version: EnvironmentThreadSyncVersion | null;
  readonly deferredPayloadCount: number;
  readonly estimatedBytes: number | null;
  readonly error: string | null;
}

export interface EnvironmentThreadState {
  readonly data: Option.Option<OrchestrationThread>;
  readonly status: EnvironmentThreadStatus;
  readonly error: Option.Option<string>;
  readonly syncStatus?: EnvironmentThreadSyncStatus;
}

export const WAITING_ENVIRONMENT_THREAD_SYNC_STATUS: EnvironmentThreadSyncStatus = {
  phase: "waiting",
  version: null,
  deferredPayloadCount: 0,
  estimatedBytes: null,
  error: null,
};

export const EMPTY_ENVIRONMENT_THREAD_STATE: EnvironmentThreadState = {
  data: Option.none(),
  status: "empty",
  error: Option.none(),
  syncStatus: WAITING_ENVIRONMENT_THREAD_SYNC_STATUS,
};

const THREAD_SYNC_V2_HYDRATE_CHUNK_SIZE = Math.min(
  50,
  ORCHESTRATION_HYDRATE_THREAD_ACTIVITY_PAYLOADS_MAX_IDS,
);
const THREAD_SYNC_V2_MAX_HISTORY_PAGE_REQUESTS = 1_000;
const THREAD_SYNC_V2_MAX_CONTENT_CHUNK_REQUESTS = 2_048;
const threadSyncV2TextEncoder = new TextEncoder();
class ThreadSyncV2FallbackError extends Error {
  readonly _tag = "ThreadSyncV2FallbackError";
}
class ThreadSyncV2PagingError extends Error {
  readonly _tag = "ThreadSyncV2PagingError";
}

function statusWithoutLiveData(data: Option.Option<OrchestrationThread>): EnvironmentThreadStatus {
  return Option.isSome(data) ? "cached" : "empty";
}

function formatThreadError(cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not synchronize the thread.";
}

function isDeferredThreadActivityPayload(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { readonly __t3Deferred?: unknown }).__t3Deferred === "thread-activity-payload"
  );
}

function isDeferredThreadContent(content: unknown): content is OrchestrationDeferredThreadContent {
  return (
    typeof content === "object" &&
    content !== null &&
    (content as { readonly __t3Deferred?: unknown }).__t3Deferred === "thread-content"
  );
}

function threadContentReferenceKey(content: OrchestrationThreadContentReference): string {
  return content.kind === "message-text"
    ? `${content.kind}:${content.messageId}`
    : `${content.kind}:${content.planId}`;
}

function assertThreadContentChunk(
  condition: boolean,
  message: string,
): Effect.Effect<void, ThreadSyncV2PagingError> {
  return condition ? Effect.void : Effect.fail(new ThreadSyncV2PagingError(message));
}

const hydrateDeferredThreadContent = Effect.fn(
  "EnvironmentThreadState.hydrateDeferredThreadContent",
)(function* (
  threadId: ThreadIdType,
  content: OrchestrationThreadContentReference,
  marker: OrchestrationDeferredThreadContent,
  expectedContentVersion: string,
  hydrateThreadContent: EnvironmentThreadContentHydrator,
) {
  if (content.kind !== marker.kind) {
    return yield* Effect.fail(
      new ThreadSyncV2PagingError("Thread sync v2 deferred content kind mismatched."),
    );
  }

  const chunks: string[] = [];
  let offset = 0;
  for (
    let requestCount = 0;
    requestCount < THREAD_SYNC_V2_MAX_CONTENT_CHUNK_REQUESTS;
    requestCount += 1
  ) {
    const result = yield* hydrateThreadContent({ threadId, content, offset });
    const nextOffset = offset + result.chunk.length;
    yield* assertThreadContentChunk(
      result.threadId === threadId &&
        threadContentReferenceKey(result.content) === threadContentReferenceKey(content),
      "Thread sync v2 deferred content identity mismatched.",
    );
    yield* assertThreadContentChunk(
      result.contentVersion === expectedContentVersion,
      "Thread sync v2 deferred content version mismatched.",
    );
    yield* assertThreadContentChunk(
      result.offset === offset &&
        result.totalByteLength === marker.byteLength &&
        result.totalCharacterLength === marker.characterLength,
      "Thread sync v2 deferred content progress mismatched.",
    );
    yield* assertThreadContentChunk(
      result.chunkByteLength === threadSyncV2TextEncoder.encode(result.chunk).byteLength &&
        result.chunkByteLength <= ORCHESTRATION_THREAD_SYNC_V2_MAX_CONTENT_CHUNK_BYTES,
      "Thread sync v2 deferred content chunk bounds mismatched.",
    );
    yield* assertThreadContentChunk(
      result.chunk.length > 0 || offset === marker.characterLength,
      "Thread sync v2 deferred content did not advance.",
    );

    chunks.push(result.chunk);
    if (nextOffset === marker.characterLength) {
      yield* assertThreadContentChunk(
        result.nextOffset === null,
        "Thread sync v2 deferred content completed at an unexpected offset.",
      );
      const hydrated = chunks.join("");
      yield* assertThreadContentChunk(
        hydrated.length === marker.characterLength &&
          threadSyncV2TextEncoder.encode(hydrated).byteLength === marker.byteLength,
        "Thread sync v2 deferred content length mismatched.",
      );
      return hydrated;
    }
    yield* assertThreadContentChunk(
      nextOffset < marker.characterLength && result.nextOffset === nextOffset,
      "Thread sync v2 deferred content did not advance.",
    );
    offset = nextOffset;
  }

  return yield* Effect.fail(
    new ThreadSyncV2PagingError(
      `Thread sync v2 exceeded ${THREAD_SYNC_V2_MAX_CONTENT_CHUNK_REQUESTS} content chunk requests.`,
    ),
  );
});

function collectDeferredThreadActivityIds(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ReadonlyArray<EventId> {
  const seen = new Set<EventId>();
  const activityIds: EventId[] = [];
  for (const activity of activities) {
    if (!isDeferredThreadActivityPayload(activity.payload) || seen.has(activity.id)) {
      continue;
    }
    seen.add(activity.id);
    activityIds.push(activity.id);
  }
  return activityIds;
}

interface ThreadSyncV2HistoryPage<T, Cursor> {
  readonly items: ReadonlyArray<T>;
  readonly startCursor: Cursor | null;
  readonly hasMoreBefore: boolean;
  readonly estimatedSerializedBytes: number;
}

interface ThreadSyncV2HistoryPageBudget {
  requests: number;
}

function loadThreadSyncV2HistoryPages<T, Cursor, E, R>(options: {
  readonly items: ReadonlyArray<T>;
  readonly hasMoreBefore: boolean;
  readonly initialCursor: (item: T | undefined) => Cursor | null;
  readonly loadPage: (
    cursor: Cursor | null,
  ) => Effect.Effect<ThreadSyncV2HistoryPage<T, Cursor>, E, R>;
  readonly itemKey: (item: T) => string | number;
  readonly cursorKey: (cursor: Cursor) => string | number;
  readonly budget: ThreadSyncV2HistoryPageBudget;
}) {
  return Effect.gen(function* () {
    const historyPages: Array<ReadonlyArray<T>> = [];
    const existingKeys = new Set(options.items.map(options.itemKey));
    let estimatedSerializedBytes = 0;
    let hasMoreBefore = options.hasMoreBefore;
    let cursor = options.initialCursor(options.items[0]);

    while (hasMoreBefore) {
      if (options.budget.requests >= THREAD_SYNC_V2_MAX_HISTORY_PAGE_REQUESTS) {
        return yield* Effect.fail(
          new ThreadSyncV2PagingError(
            `Thread sync v2 exceeded ${THREAD_SYNC_V2_MAX_HISTORY_PAGE_REQUESTS} history page requests.`,
          ),
        );
      }

      options.budget.requests += 1;
      const page = yield* options.loadPage(cursor);
      estimatedSerializedBytes += page.estimatedSerializedBytes;
      const uniquePageItems = page.items.filter((item) => {
        const key = options.itemKey(item);
        if (existingKeys.has(key)) {
          return false;
        }
        existingKeys.add(key);
        return true;
      });
      historyPages.push(uniquePageItems);
      hasMoreBefore = page.hasMoreBefore;
      if (!hasMoreBefore) {
        continue;
      }
      if (
        page.startCursor === null ||
        (cursor !== null && options.cursorKey(page.startCursor) === options.cursorKey(cursor))
      ) {
        return yield* Effect.fail(
          new ThreadSyncV2PagingError("Thread sync v2 history paging did not advance."),
        );
      }
      cursor = page.startCursor;
    }

    historyPages.reverse();
    return {
      items: historyPages.flat().concat(options.items),
      estimatedSerializedBytes,
    };
  });
}

const hydrateThreadSyncV2History = Effect.fn("EnvironmentThreadState.hydrateThreadSyncV2History")(
  function* (
    snapshot: OrchestrationThreadDetailV2Snapshot,
    historyPager: EnvironmentThreadHistoryPager,
  ) {
    if (Object.values(snapshot.windows).some((window) => window.hasMoreAfter)) {
      return yield* Effect.fail(
        new ThreadSyncV2FallbackError(
          "Thread sync v2 returned a non-tail history window without forward paging support.",
        ),
      );
    }

    const budget: ThreadSyncV2HistoryPageBudget = { requests: 0 };
    const messages = yield* loadThreadSyncV2HistoryPages({
      items: snapshot.thread.messages,
      hasMoreBefore: snapshot.windows.messages.hasMoreBefore,
      initialCursor: (message) =>
        message === undefined ? null : { messageId: message.id, createdAt: message.createdAt },
      loadPage: (before) =>
        historyPager.getMessagePage({
          threadId: snapshot.thread.id,
          limit: ORCHESTRATION_THREAD_SYNC_V2_MAX_MESSAGE_ITEMS,
          ...(before === null ? {} : { before }),
        }),
      itemKey: (message) => message.id,
      cursorKey: (cursor) => `${cursor.createdAt}:${cursor.messageId}`,
      budget,
    });
    const proposedPlans = yield* loadThreadSyncV2HistoryPages({
      items: snapshot.thread.proposedPlans,
      hasMoreBefore: snapshot.windows.proposedPlans.hasMoreBefore,
      initialCursor: (plan) =>
        plan === undefined ? null : { planId: plan.id, createdAt: plan.createdAt },
      loadPage: (before) =>
        historyPager.getProposedPlanPage({
          threadId: snapshot.thread.id,
          limit: ORCHESTRATION_THREAD_SYNC_V2_MAX_PROPOSED_PLAN_ITEMS,
          ...(before === null ? {} : { before }),
        }),
      itemKey: (plan) => plan.id,
      cursorKey: (cursor) => `${cursor.createdAt}:${cursor.planId}`,
      budget,
    });
    const activities = yield* loadThreadSyncV2HistoryPages({
      items: snapshot.thread.activities,
      hasMoreBefore: snapshot.windows.activities.hasMoreBefore,
      initialCursor: (activity) =>
        activity === undefined
          ? null
          : {
              activityId: activity.id,
              createdAt: activity.createdAt,
              sequence: activity.sequence ?? null,
            },
      loadPage: (position) =>
        historyPager.getActivityPage({
          threadId: snapshot.thread.id,
          limit: ORCHESTRATION_THREAD_SYNC_V2_MAX_ACTIVITY_ITEMS,
          ...(position === null ? {} : { cursor: { direction: "before" as const, position } }),
        }),
      itemKey: (activity) => activity.id,
      cursorKey: (cursor) => `${cursor.createdAt}:${cursor.sequence ?? ""}:${cursor.activityId}`,
      budget,
    });
    const checkpoints = yield* loadThreadSyncV2HistoryPages({
      items: snapshot.thread.checkpoints,
      hasMoreBefore: snapshot.windows.checkpoints.hasMoreBefore,
      initialCursor: (checkpoint) =>
        checkpoint === undefined ? null : { checkpointTurnCount: checkpoint.checkpointTurnCount },
      loadPage: (before) =>
        historyPager.getCheckpointPage({
          threadId: snapshot.thread.id,
          limit: ORCHESTRATION_THREAD_SYNC_V2_MAX_CHECKPOINT_ITEMS,
          ...(before === null ? {} : { before }),
        }),
      itemKey: (checkpoint) => checkpoint.checkpointRef,
      cursorKey: (cursor) => cursor.checkpointTurnCount,
      budget,
    });
    const thread = {
      ...snapshot.thread,
      messages: messages.items,
      proposedPlans: proposedPlans.items,
      activities: activities.items,
      checkpoints: checkpoints.items,
    };

    return {
      ...snapshot,
      thread,
      windows: {
        messages: {
          ...snapshot.windows.messages,
          returned: thread.messages.length,
          hasMoreBefore: false,
        },
        proposedPlans: {
          ...snapshot.windows.proposedPlans,
          returned: thread.proposedPlans.length,
          hasMoreBefore: false,
        },
        activities: {
          ...snapshot.windows.activities,
          returned: thread.activities.length,
          hasMoreBefore: false,
        },
        checkpoints: {
          ...snapshot.windows.checkpoints,
          returned: thread.checkpoints.length,
          hasMoreBefore: false,
        },
      },
      deferredActivityPayloads: collectDeferredThreadActivityIds(thread.activities).length,
      estimatedSerializedBytes:
        snapshot.estimatedSerializedBytes +
        messages.estimatedSerializedBytes +
        proposedPlans.estimatedSerializedBytes +
        activities.estimatedSerializedBytes +
        checkpoints.estimatedSerializedBytes,
    };
  },
);

const hydrateDeferredThreadContents = Effect.fn(
  "EnvironmentThreadState.hydrateDeferredThreadContents",
)(function* (
  thread: OrchestrationThreadDetailV2Snapshot["thread"],
  hydrateThreadContent: EnvironmentThreadContentHydrator,
) {
  const messages: OrchestrationThread["messages"][number][] = [];
  for (const message of thread.messages) {
    const text = isDeferredThreadContent(message.text)
      ? yield* hydrateDeferredThreadContent(
          thread.id,
          { kind: "message-text", messageId: message.id },
          message.text,
          message.updatedAt,
          hydrateThreadContent,
        )
      : message.text;
    messages.push({ ...message, text });
  }

  const proposedPlans: OrchestrationThread["proposedPlans"][number][] = [];
  for (const proposedPlan of thread.proposedPlans) {
    const planMarkdown = isDeferredThreadContent(proposedPlan.planMarkdown)
      ? yield* hydrateDeferredThreadContent(
          thread.id,
          { kind: "proposed-plan-markdown", planId: proposedPlan.id },
          proposedPlan.planMarkdown,
          proposedPlan.updatedAt,
          hydrateThreadContent,
        )
      : proposedPlan.planMarkdown;
    proposedPlans.push({ ...proposedPlan, planMarkdown });
  }

  return {
    ...thread,
    messages,
    proposedPlans,
  } satisfies OrchestrationThread;
});

const hydrateDeferredThreadActivityPayloads = Effect.fn(
  "EnvironmentThreadState.hydrateDeferredThreadActivityPayloads",
)(function* (
  environmentId: EnvironmentIdType,
  threadId: ThreadIdType,
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  hydrateActivityPayloads: EnvironmentThreadPayloadHydrator,
) {
  const activityIds = collectDeferredThreadActivityIds(activities);
  const requestCount = Math.ceil(activityIds.length / THREAD_SYNC_V2_HYDRATE_CHUNK_SIZE);
  if (requestCount > 0) {
    yield* Effect.sync(() =>
      recordThreadSyncHydration({
        environmentId,
        threadId,
        version: "v2",
        requestCount,
      }),
    );
  }

  const payloadByActivityId = new Map<EventId, unknown>();
  for (let index = 0; index < activityIds.length; index += THREAD_SYNC_V2_HYDRATE_CHUNK_SIZE) {
    const activityIdChunk = activityIds.slice(index, index + THREAD_SYNC_V2_HYDRATE_CHUNK_SIZE);
    const result = yield* hydrateActivityPayloads({
      threadId,
      activityIds: activityIdChunk,
    });
    for (const payload of result.payloads) {
      payloadByActivityId.set(payload.activityId, payload.payload);
    }
    for (const omitted of result.omitted) {
      payloadByActivityId.set(omitted.activityId, null);
    }
    if (result.omitted.length > 0) {
      yield* Effect.logWarning("Thread sync v2 omitted deferred activity payloads.").pipe(
        Effect.annotateLogs({
          environmentId,
          threadId,
          omittedCount: result.omitted.length,
          omittedReasons: [...new Set(result.omitted.map((omitted) => omitted.reason))].join(","),
        }),
      );
    }
  }
  return payloadByActivityId;
});

function applyHydratedThreadActivityPayloads(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  payloadByActivityId: ReadonlyMap<EventId, unknown>,
): ReadonlyArray<OrchestrationThreadActivity> {
  if (payloadByActivityId.size === 0) {
    return activities;
  }
  return activities.map((activity) =>
    payloadByActivityId.has(activity.id)
      ? { ...activity, payload: payloadByActivityId.get(activity.id) }
      : activity,
  );
}

const hydrateThreadSyncV2Snapshot = Effect.fn("EnvironmentThreadState.hydrateThreadSyncV2Snapshot")(
  function* (
    environmentId: EnvironmentIdType,
    snapshot: OrchestrationThreadDetailV2Snapshot,
    hydrateActivityPayloads: EnvironmentThreadPayloadHydrator,
    hydrateThreadContent: EnvironmentThreadContentHydrator,
    historyPager: EnvironmentThreadHistoryPager,
  ) {
    const completeSnapshot = yield* hydrateThreadSyncV2History(snapshot, historyPager);
    const completeThread = yield* hydrateDeferredThreadContents(
      completeSnapshot.thread,
      hydrateThreadContent,
    );
    const payloadByActivityId = yield* hydrateDeferredThreadActivityPayloads(
      environmentId,
      completeThread.id,
      completeThread.activities,
      hydrateActivityPayloads,
    );
    if (payloadByActivityId.size === 0) {
      return { ...completeSnapshot, thread: completeThread };
    }
    return {
      ...completeSnapshot,
      thread: {
        ...completeThread,
        activities: applyHydratedThreadActivityPayloads(
          completeThread.activities,
          payloadByActivityId,
        ),
      },
    };
  },
);

const hydrateThreadSyncV2Event = Effect.fn("EnvironmentThreadState.hydrateThreadSyncV2Event")(
  function* (
    environmentId: EnvironmentIdType,
    threadId: ThreadIdType,
    event: OrchestrationThreadSyncV2Event,
    hydrateActivityPayloads: EnvironmentThreadPayloadHydrator,
    hydrateThreadContent: EnvironmentThreadContentHydrator,
  ) {
    let hydratedEvent: OrchestrationEvent;
    if (event.type === "thread.message-sent" && isDeferredThreadContent(event.payload.text)) {
      hydratedEvent = {
        ...event,
        payload: {
          ...event.payload,
          text: yield* hydrateDeferredThreadContent(
            threadId,
            { kind: "message-text", messageId: event.payload.messageId },
            event.payload.text,
            event.payload.updatedAt,
            hydrateThreadContent,
          ),
        },
      };
    } else if (
      event.type === "thread.proposed-plan-upserted" &&
      isDeferredThreadContent(event.payload.proposedPlan.planMarkdown)
    ) {
      hydratedEvent = {
        ...event,
        payload: {
          ...event.payload,
          proposedPlan: {
            ...event.payload.proposedPlan,
            planMarkdown: yield* hydrateDeferredThreadContent(
              threadId,
              { kind: "proposed-plan-markdown", planId: event.payload.proposedPlan.id },
              event.payload.proposedPlan.planMarkdown,
              event.payload.proposedPlan.updatedAt,
              hydrateThreadContent,
            ),
          },
        },
      };
    } else {
      hydratedEvent = event as OrchestrationEvent;
    }

    if (hydratedEvent.type !== "thread.activity-appended") {
      return hydratedEvent;
    }
    const payloadByActivityId = yield* hydrateDeferredThreadActivityPayloads(
      environmentId,
      threadId,
      [hydratedEvent.payload.activity],
      hydrateActivityPayloads,
    );
    if (!payloadByActivityId.has(hydratedEvent.payload.activity.id)) {
      return hydratedEvent;
    }
    return {
      ...hydratedEvent,
      payload: {
        ...hydratedEvent.payload,
        activity: {
          ...hydratedEvent.payload.activity,
          payload: payloadByActivityId.get(hydratedEvent.payload.activity.id),
        },
      },
    };
  },
);

function mergeWindowedHistory<T>(
  cached: ReadonlyArray<T>,
  snapshot: ReadonlyArray<T>,
  window: OrchestrationThreadSyncV2Window,
  keyOf: (item: T) => string | number,
): ReadonlyArray<T> {
  if (!window.hasMoreBefore && !window.hasMoreAfter) {
    return snapshot;
  }

  const snapshotKeys = new Set(snapshot.map(keyOf));
  const retained = cached.filter((item) => !snapshotKeys.has(keyOf(item)));
  if (window.hasMoreBefore && !window.hasMoreAfter) {
    return [...retained, ...snapshot];
  }
  if (!window.hasMoreBefore && window.hasMoreAfter) {
    return [...snapshot, ...retained];
  }

  const snapshotByKey = new Map(snapshot.map((item) => [keyOf(item), item] as const));
  const cachedKeys = new Set(cached.map(keyOf));
  return [
    ...cached.map((item) => snapshotByKey.get(keyOf(item)) ?? item),
    ...snapshot.filter((item) => !cachedKeys.has(keyOf(item))),
  ];
}

function preserveCachedThreadHistory(
  cached: OrchestrationThread,
  snapshot: Pick<OrchestrationThreadDetailV2Snapshot, "windows"> & {
    readonly thread: OrchestrationThread;
  },
): OrchestrationThread {
  return {
    ...snapshot.thread,
    messages: mergeWindowedHistory(
      cached.messages,
      snapshot.thread.messages,
      snapshot.windows.messages,
      (message) => message.id,
    ),
    proposedPlans: mergeWindowedHistory(
      cached.proposedPlans,
      snapshot.thread.proposedPlans,
      snapshot.windows.proposedPlans,
      (plan) => plan.id,
    ),
    activities: mergeWindowedHistory(
      cached.activities,
      snapshot.thread.activities,
      snapshot.windows.activities,
      (activity) => activity.id,
    ),
    checkpoints: mergeWindowedHistory(
      cached.checkpoints,
      snapshot.thread.checkpoints,
      snapshot.windows.checkpoints,
      (checkpoint) => checkpoint.checkpointRef,
    ),
  };
}

export const makeEnvironmentThreadState = Effect.fn("EnvironmentThreadState.make")(function* (
  threadId: ThreadIdType,
) {
  const supervisor = yield* EnvironmentSupervisor;
  const cache = yield* EnvironmentCacheStore;
  const environmentId = supervisor.target.environmentId;
  const cached = yield* cache.loadThread(environmentId, threadId).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Could not load cached thread.").pipe(
        Effect.annotateLogs({
          environmentId,
          threadId,
          error: error.message,
        }),
        Effect.as(Option.none<OrchestrationThread>()),
      ),
    ),
  );
  const state = yield* SubscriptionRef.make<EnvironmentThreadState>({
    data: cached,
    status: statusWithoutLiveData(cached),
    error: Option.none(),
    syncStatus: WAITING_ENVIRONMENT_THREAD_SYNC_STATUS,
  });
  const lastSequence = yield* SubscriptionRef.make(0);
  const lastSyncError = yield* Ref.make<Option.Option<string>>(Option.none());
  const useThreadSyncV2 = yield* Ref.make(true);
  const persistence = yield* Queue.sliding<OrchestrationThread>(1);

  const persist = Effect.fn("EnvironmentThreadState.persist")(function* (
    thread: OrchestrationThread,
  ) {
    yield* cache.saveThread(environmentId, thread).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Could not persist the thread cache.").pipe(
          Effect.annotateLogs({
            environmentId,
            threadId,
            error: error.message,
          }),
        ),
      ),
    );
  });

  yield* Stream.fromQueue(persistence).pipe(
    Stream.debounce("500 millis"),
    Stream.runForEach(persist),
    Effect.forkScoped,
  );

  const setSynchronizing = SubscriptionRef.update(state, (current) => ({
    ...current,
    status: "synchronizing" as const,
    error: current.error,
    syncStatus:
      current.syncStatus?.phase === "live"
        ? current.syncStatus
        : WAITING_ENVIRONMENT_THREAD_SYNC_STATUS,
  }));
  const setReady = SubscriptionRef.update(state, (current) =>
    current.status === "live" || current.status === "deleted"
      ? current
      : {
          ...current,
          status: "synchronizing" as const,
          error: current.error,
        },
  );
  const setDisconnected = SubscriptionRef.update(state, (current) => ({
    ...current,
    status: current.status === "deleted" ? current.status : statusWithoutLiveData(current.data),
    syncStatus:
      current.status === "deleted"
        ? (current.syncStatus ?? WAITING_ENVIRONMENT_THREAD_SYNC_STATUS)
        : WAITING_ENVIRONMENT_THREAD_SYNC_STATUS,
  }));
  const setStreamError = Effect.fn("EnvironmentThreadState.setStreamError")(function* (
    cause: Cause.Cause<unknown>,
  ) {
    const message = formatThreadError(cause);
    const current = yield* SubscriptionRef.get(state);
    yield* Effect.sync(() =>
      recordThreadSyncError({
        environmentId,
        threadId,
        version: current.syncStatus?.version ?? null,
        error: new Error(message),
      }),
    );
    yield* Ref.set(lastSyncError, Option.some(message));
    yield* SubscriptionRef.set(state, {
      ...current,
      status: current.status === "deleted" ? current.status : statusWithoutLiveData(current.data),
      error: Option.some(message),
      syncStatus: {
        ...(current.syncStatus ?? WAITING_ENVIRONMENT_THREAD_SYNC_STATUS),
        phase: "error",
        error: message,
      },
    });
  });

  const setSubscribing = Effect.fn("EnvironmentThreadState.setSubscribing")(function* (
    version: EnvironmentThreadSyncVersion,
  ) {
    const syncError = yield* Ref.get(lastSyncError);
    yield* Effect.sync(() => recordThreadSyncSubscription({ environmentId, threadId, version }));
    yield* SubscriptionRef.update(state, (current): EnvironmentThreadState => {
      const syncStatus: EnvironmentThreadSyncStatus = Option.match(syncError, {
        onNone: () => ({
          phase: "subscribing" as const,
          version,
          deferredPayloadCount: 0,
          estimatedBytes: null,
          error: null,
        }),
        onSome: (error) => ({
          ...(current.syncStatus ?? WAITING_ENVIRONMENT_THREAD_SYNC_STATUS),
          phase: "error" as const,
          version,
          error,
        }),
      });
      return {
        ...current,
        status: current.status === "deleted" ? current.status : "synchronizing",
        error: syncError,
        syncStatus,
      };
    });
  });

  const setHydrating = Effect.fn("EnvironmentThreadState.setHydrating")(function* (
    deferredPayloadCount: number,
    estimatedBytes: number | null,
  ) {
    yield* SubscriptionRef.update(
      state,
      (current): EnvironmentThreadState => ({
        ...current,
        syncStatus: {
          phase: "hydrating",
          version: "v2",
          deferredPayloadCount,
          estimatedBytes,
          error: null,
        },
      }),
    );
  });

  const setThread = Effect.fn("EnvironmentThreadState.setThread")(function* (
    thread: OrchestrationThread,
    syncStatus: EnvironmentThreadSyncStatus,
  ) {
    yield* Ref.set(lastSyncError, Option.none());
    yield* SubscriptionRef.set(state, {
      data: Option.some(thread),
      status: "live",
      error: Option.none(),
      syncStatus,
    });
    yield* Queue.offer(persistence, thread);
  });

  const setDeleted = Effect.fn("EnvironmentThreadState.setDeleted")(function* () {
    yield* Ref.set(lastSyncError, Option.none());
    yield* SubscriptionRef.set(state, {
      data: Option.none(),
      status: "deleted",
      error: Option.none(),
      syncStatus: {
        phase: "live",
        version: null,
        deferredPayloadCount: 0,
        estimatedBytes: null,
        error: null,
      },
    });
    yield* cache.removeThread(environmentId, threadId).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Could not remove the cached thread.").pipe(
          Effect.annotateLogs({
            environmentId,
            threadId,
            error: error.message,
          }),
        ),
      ),
    );
  });

  const applyItem = Effect.fn("EnvironmentThreadState.applyItem")(function* (
    subscriptionItem: EnvironmentThreadSubscriptionItem,
  ) {
    const { item, version } = subscriptionItem;
    if (item.kind === "snapshot") {
      if (version === "v2") {
        yield* Effect.sync(() =>
          recordThreadSyncSnapshot({
            environmentId,
            threadId,
            version,
            estimatedSerializedBytes: item.snapshot.estimatedSerializedBytes,
            deferredActivityPayloads: item.snapshot.deferredActivityPayloads,
            windows: item.snapshot.windows,
          }),
        );
        if (
          item.snapshot.deferredActivityPayloads + item.snapshot.deferredThreadContents > 0 ||
          Object.values(item.snapshot.windows).some((window) => window.hasMoreBefore)
        ) {
          yield* setHydrating(
            item.snapshot.deferredActivityPayloads + item.snapshot.deferredThreadContents,
            item.snapshot.estimatedSerializedBytes,
          );
        }
        const hydrated = yield* hydrateThreadSyncV2Snapshot(
          environmentId,
          item.snapshot,
          subscriptionItem.hydrateActivityPayloads,
          subscriptionItem.hydrateThreadContent,
          subscriptionItem.historyPager,
        );
        const current = yield* SubscriptionRef.get(state);
        const thread = Option.match(current.data, {
          onNone: () => hydrated.thread,
          onSome: (cachedThread) => preserveCachedThreadHistory(cachedThread, hydrated),
        });
        yield* SubscriptionRef.set(lastSequence, hydrated.snapshotSequence);
        const syncStatus: EnvironmentThreadSyncStatus = {
          phase: "live",
          version,
          deferredPayloadCount: hydrated.deferredActivityPayloads + hydrated.deferredThreadContents,
          estimatedBytes: hydrated.estimatedSerializedBytes,
          error: null,
        };
        yield* setThread(thread, syncStatus);
        yield* Effect.sync(() => recordThreadSyncLive({ environmentId, threadId, version }));
        return;
      }

      yield* Effect.sync(() => recordThreadSyncSnapshot({ environmentId, threadId, version }));
      yield* SubscriptionRef.set(lastSequence, item.snapshot.snapshotSequence);
      yield* setThread(item.snapshot.thread, {
        phase: "live",
        version,
        deferredPayloadCount: 0,
        estimatedBytes: null,
        error: null,
      });
      return;
    }

    const sequence = yield* SubscriptionRef.get(lastSequence);
    if (item.event.sequence <= sequence) {
      return;
    }

    let event: OrchestrationEvent = item.event as OrchestrationEvent;
    let deferredPayloadCount = 0;
    let estimatedBytes: number | null = null;
    if (version === "v2") {
      deferredPayloadCount = item.deferredActivityPayloads + item.deferredThreadContents;
      estimatedBytes = item.estimatedSerializedBytes;
      yield* Effect.sync(() =>
        recordThreadSyncEvent({
          environmentId,
          threadId,
          version,
          deferredActivityPayloads: item.deferredActivityPayloads,
          estimatedSerializedBytes: estimatedBytes,
        }),
      );
      if (deferredPayloadCount > 0) {
        yield* setHydrating(deferredPayloadCount, estimatedBytes);
        event = yield* hydrateThreadSyncV2Event(
          environmentId,
          threadId,
          event,
          subscriptionItem.hydrateActivityPayloads,
          subscriptionItem.hydrateThreadContent,
        );
      }
    } else {
      yield* Effect.sync(() => recordThreadSyncEvent({ environmentId, threadId, version }));
    }
    yield* SubscriptionRef.set(lastSequence, event.sequence);

    const current = yield* SubscriptionRef.get(state);
    if (Option.isNone(current.data)) {
      if (event.type === "thread.deleted") {
        yield* setDeleted();
      }
      return;
    }
    const result = applyThreadDetailEvent(current.data.value, event);
    if (result.kind === "updated") {
      yield* setThread(result.thread, {
        phase: "live",
        version,
        deferredPayloadCount,
        estimatedBytes,
        error: null,
      });
      yield* Effect.sync(() => recordThreadSyncLive({ environmentId, threadId, version }));
    } else if (result.kind === "deleted") {
      yield* setDeleted();
    }
  });

  yield* SubscriptionRef.changes(supervisor.state).pipe(
    Stream.runForEach((connectionState) => {
      switch (connectionProjectionPhase(connectionState)) {
        case "synchronizing":
          return setSynchronizing;
        case "disconnected":
          return setDisconnected;
        case "ready":
          return setReady;
      }
    }),
    Effect.forkScoped,
  );

  yield* Effect.sync(() => recordThreadSyncWaiting({ environmentId, threadId }));
  yield* setSynchronizing;
  const runSubscription = Effect.fn("EnvironmentThreadState.runSubscription")(
    function* (): Effect.fn.Return<void, never, EnvironmentSupervisor> {
      const exit = yield* subscribeThread(
        { threadId },
        {
          onSubscribe: setSubscribing,
          onExpectedFailure: setStreamError,
          retryExpectedFailureAfter: "250 millis",
          useV2: Ref.get(useThreadSyncV2),
        },
      ).pipe(Stream.runForEach(applyItem), Effect.exit);
      if (Exit.isSuccess(exit)) {
        return;
      }

      const hasOnlyExpectedFailures =
        exit.cause.reasons.length > 0 &&
        exit.cause.reasons.every((reason) => reason._tag === "Fail");
      const requestsV1Fallback =
        hasOnlyExpectedFailures &&
        exit.cause.reasons.every(
          (reason) => reason._tag === "Fail" && reason.error instanceof ThreadSyncV2FallbackError,
        );
      if (requestsV1Fallback) {
        yield* Ref.set(useThreadSyncV2, false);
        return yield* runSubscription();
      }
      if (!hasOnlyExpectedFailures) {
        return yield* Effect.die(Cause.squash(exit.cause));
      }

      yield* setStreamError(exit.cause);
      yield* Effect.sleep("250 millis");
      return yield* runSubscription();
    },
  );
  yield* runSubscription().pipe(Effect.forkScoped);

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      recordThreadSyncDisposed({ environmentId, threadId });
      const current = yield* SubscriptionRef.get(state);
      yield* Option.match(current.data, {
        onNone: () => Effect.void,
        onSome: persist,
      });
    }),
  );

  return state;
});

export function threadStateChanges(environmentId: EnvironmentIdType, threadId: ThreadIdType) {
  return followStreamInEnvironment(
    environmentId,
    Stream.unwrap(makeEnvironmentThreadState(threadId).pipe(Effect.map(SubscriptionRef.changes))),
  );
}

export function createEnvironmentThreadStateAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | EnvironmentCacheStore | R, E>,
) {
  const family = Atom.family((key: string) => {
    const { environmentId, threadId } = parseThreadKey(key);
    return runtime
      .atom(threadStateChanges(environmentId, threadId), {
        initialValue: EMPTY_ENVIRONMENT_THREAD_STATE,
      })
      .pipe(
        Atom.setIdleTTL(THREAD_STATE_IDLE_TTL_MS),
        Atom.withLabel(`environment-thread-state:${key}`),
      );
  });

  return {
    stateAtom: (environmentId: EnvironmentIdType, threadId: ThreadIdType) =>
      family(threadKey({ environmentId, threadId })),
  };
}

export * from "./archivedThreads.ts";
export * from "./checkpointDiff.ts";
export * from "./composerPathSearch.ts";
export * from "./threadCommands.ts";
export * from "./threadDetail.ts";
export * from "./threadReducer.ts";
export * from "./threadShell.ts";
export * from "./threadSyncDiagnostics.ts";
