import {
  ORCHESTRATION_WS_METHODS,
  type BoardStreamItem,
  type EnvironmentId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { request, subscribeDynamic } from "../rpc/client.ts";
import {
  EMPTY_ENVIRONMENT_BOARD_STATE,
  type EnvironmentBoardState,
  applyBoardHeadRefresh,
  applyBoardStreamItem,
  applyOlderBoardPage,
} from "./boardProjection.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  followStreamInEnvironment,
} from "./runtime.ts";

export {
  BOARD_RESIDENT_PAGE_LIMIT,
  BOARD_RESIDENT_POST_LIMIT,
  EMPTY_ENVIRONMENT_BOARD_STATE,
  type EnvironmentBoardState,
  type EnvironmentBoardStatus,
  applyBoardHeadRefresh,
  applyBoardStreamItem,
  applyOlderBoardPage,
  mergeBoardPosts,
} from "./boardProjection.ts";

interface BoardOlderPageRequestRegistry {
  readonly register: (environmentId: EnvironmentId, handler: () => boolean) => () => void;
  readonly request: (environmentId: EnvironmentId) => boolean;
}

interface BoardRetryRequestRegistry {
  readonly register: (environmentId: EnvironmentId, handler: () => void) => () => void;
  readonly request: (environmentId: EnvironmentId) => boolean;
}

function makeBoardOlderPageRequestRegistry(): BoardOlderPageRequestRegistry {
  const handlers = new Map<string, () => boolean>();
  return {
    register: (environmentId, handler) => {
      handlers.set(environmentId, handler);
      return () => {
        if (handlers.get(environmentId) === handler) handlers.delete(environmentId);
      };
    },
    request: (environmentId) => handlers.get(environmentId)?.() ?? false,
  };
}

const defaultOlderPageRequests = makeBoardOlderPageRequestRegistry();
const defaultRetryRequests: BoardRetryRequestRegistry = (() => {
  const handlers = new Map<string, () => void>();
  return {
    register: (environmentId, handler) => {
      handlers.set(environmentId, handler);
      return () => {
        if (handlers.get(environmentId) === handler) handlers.delete(environmentId);
      };
    },
    request: (environmentId) => {
      const handler = handlers.get(environmentId);
      if (handler === undefined) return false;
      handler();
      return true;
    },
  };
})();

export class BoardOlderPageRequests extends Context.Reference<BoardOlderPageRequestRegistry>(
  "@t3tools/client-runtime/state/board/BoardOlderPageRequests",
  { defaultValue: () => defaultOlderPageRequests },
) {}

export class BoardRetryRequests extends Context.Reference<BoardRetryRequestRegistry>(
  "@t3tools/client-runtime/state/board/BoardRetryRequests",
  { defaultValue: () => defaultRetryRequests },
) {}

export function requestOlderBoardPage(environmentId: EnvironmentId): boolean {
  return defaultOlderPageRequests.request(environmentId);
}

export function requestBoardRetry(environmentId: EnvironmentId): boolean {
  return defaultRetryRequests.request(environmentId);
}

function formatBoardError(cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Could not synchronize the Board.";
  return message.slice(0, 240);
}

export const makeEnvironmentBoardState = Effect.fn("EnvironmentBoardState.make")(function* () {
  const supervisor = yield* EnvironmentSupervisor;
  const environmentId = supervisor.target.environmentId;
  const state = yield* SubscriptionRef.make<EnvironmentBoardState>({
    ...EMPTY_ENVIRONMENT_BOARD_STATE,
    status: "synchronizing",
  });
  const olderRequests = yield* Queue.sliding<void>(1);
  const retryRequests = yield* Queue.sliding<void>(1);
  let olderRequestPending = false;
  let canRequestOlder = false;
  let needsHeadRefresh = false;
  let requiresExplicitHeadRefresh = false;
  let automaticHeadRefreshBlocked = false;

  const update = Effect.fn("EnvironmentBoardState.update")(function* (
    transform: (current: EnvironmentBoardState) => EnvironmentBoardState,
  ) {
    const next = yield* SubscriptionRef.updateAndGet(state, transform);
    canRequestOlder =
      next.beforeCursor !== null &&
      !next.loadingOlder &&
      !next.refreshingHead &&
      !next.needsHeadRefresh;
    needsHeadRefresh = next.needsHeadRefresh;
    return next;
  });
  const headRefreshRequests = yield* Queue.sliding<void>(1);
  let headRefreshPending = false;
  const requestHeadRefresh = () => {
    if (headRefreshPending) return;
    headRefreshPending = true;
    Queue.offerUnsafe(headRefreshRequests, undefined);
  };
  const applyItem = Effect.fn("EnvironmentBoardState.applyItem")(function* (item: BoardStreamItem) {
    const next = yield* update((current) => applyBoardStreamItem(current, item));
    if (next.needsHeadRefresh && !automaticHeadRefreshBlocked) requestHeadRefresh();
  });
  const loadOlder = Effect.fn("EnvironmentBoardState.loadOlder")(function* () {
    let cursor: string | null = null;
    let generation = -1;
    yield* update((current) => {
      if (
        current.beforeCursor === null ||
        current.loadingOlder ||
        current.refreshingHead ||
        current.needsHeadRefresh
      ) {
        return current;
      }
      cursor = current.beforeCursor;
      generation = current.paginationGeneration;
      return { ...current, loadingOlder: true, error: null };
    });
    if (cursor === null) {
      olderRequestPending = false;
      return;
    }
    yield* request(ORCHESTRATION_WS_METHODS.getBoardPage, { beforeCursor: cursor, limit: 50 }).pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) =>
          update((current) =>
            current.paginationGeneration !== generation
              ? { ...current, loadingOlder: false }
              : {
                  ...current,
                  status: "failed",
                  loadingOlder: false,
                  error: formatBoardError(cause),
                },
          ),
        onSuccess: (page) =>
          update((current) =>
            current.paginationGeneration !== generation
              ? { ...current, loadingOlder: false }
              : applyOlderBoardPage(current, page),
          ),
      }),
    );
    olderRequestPending = false;
  });

  yield* Stream.fromQueue(olderRequests).pipe(
    Stream.runForEach(() => loadOlder()),
    Effect.forkScoped,
  );
  const refreshHead = Effect.fn("EnvironmentBoardState.refreshHead")(function* () {
    yield* update((current) => ({ ...current, refreshingHead: true, error: null }));
    let succeeded = false;
    yield* request(ORCHESTRATION_WS_METHODS.getBoardPage, { limit: 50 }).pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) =>
          update((current) => ({
            ...current,
            status: "failed",
            refreshingHead: false,
            needsHeadRefresh: false,
            error: formatBoardError(cause),
          })).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                automaticHeadRefreshBlocked = true;
                requiresExplicitHeadRefresh = true;
              }),
            ),
          ),
        onSuccess: (page) =>
          update((current) => applyBoardHeadRefresh(current, page)).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                succeeded = true;
                automaticHeadRefreshBlocked = false;
                requiresExplicitHeadRefresh = false;
              }),
            ),
          ),
      }),
    );
    headRefreshPending = false;
    if (succeeded && (yield* SubscriptionRef.get(state)).needsHeadRefresh) requestHeadRefresh();
  });
  yield* Stream.fromQueue(headRefreshRequests).pipe(
    Stream.runForEach(() => refreshHead()),
    Effect.forkScoped,
  );
  const registry = yield* BoardOlderPageRequests;
  const deregister = registry.register(environmentId, () => {
    if (!canRequestOlder || olderRequestPending) return false;
    // The synchronous request API only enqueues. The state machine owns the
    // cursor check so UI callers cannot accidentally couple Board paging to a thread.
    olderRequestPending = true;
    Queue.offerUnsafe(olderRequests, undefined);
    return true;
  });
  yield* Effect.addFinalizer(() => Effect.sync(deregister));
  const retryRegistry = yield* BoardRetryRequests;
  const deregisterRetry = retryRegistry.register(environmentId, () => {
    if (requiresExplicitHeadRefresh || needsHeadRefresh) {
      automaticHeadRefreshBlocked = false;
      requestHeadRefresh();
      return;
    }
    Queue.offerUnsafe(retryRequests, undefined);
  });
  yield* Effect.addFinalizer(() => Effect.sync(deregisterRetry));

  yield* Effect.forkScoped(
    subscribeDynamic(
      ORCHESTRATION_WS_METHODS.subscribeBoard,
      Effect.fn("EnvironmentBoardState.makeSubscribeInput")(function* () {
        const current = yield* SubscriptionRef.get(state);
        yield* update((value) => ({ ...value, status: "synchronizing", error: null }));
        return {
          ...(current.headSequence > 0 ? { afterSequence: current.headSequence } : {}),
          requestCompletionMarker: true,
        };
      }),
      {
        onExpectedFailure: (cause) =>
          update((current) => ({ ...current, status: "failed", error: formatBoardError(cause) })),
        resubscribe: Stream.fromQueue(retryRequests),
      },
    ).pipe(Stream.runForEach(applyItem)),
  );
  return state;
});

export function boardStateChanges(environmentId: EnvironmentId) {
  return followStreamInEnvironment(
    environmentId,
    Stream.unwrap(makeEnvironmentBoardState().pipe(Effect.map(SubscriptionRef.changes))),
  );
}

export function createEnvironmentBoardAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const commandScheduler = createAtomCommandScheduler();
  const family = Atom.family((environmentId: EnvironmentId) =>
    runtime
      .atom(boardStateChanges(environmentId), { initialValue: EMPTY_ENVIRONMENT_BOARD_STATE })
      .pipe(
        Atom.setIdleTTL(5 * 60_000),
        Atom.withLabel(`environment-board-state:${environmentId}`),
      ),
  );
  return {
    stateAtom: (environmentId: EnvironmentId) => family(environmentId),
    revisePost: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:board:revise-post",
      tag: ORCHESTRATION_WS_METHODS.reviseBoardPost,
      scheduler: commandScheduler,
      concurrency: {
        mode: "serial",
        key: ({ environmentId, input }) => `${environmentId}:${input.postId}`,
      },
    }),
    getPostHistory: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:board:get-post-history",
      tag: ORCHESTRATION_WS_METHODS.getBoardPostHistory,
      scheduler: commandScheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) => `${environmentId}:${input.postId}`,
      },
    }),
  };
}
