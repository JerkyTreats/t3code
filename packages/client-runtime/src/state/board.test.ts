import { EnvironmentId, ORCHESTRATION_WS_METHODS } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as TestClock from "effect/testing/TestClock";
import { Atom } from "effect/unstable/reactivity";

import type { BoardPage, BoardPost } from "@t3tools/contracts";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
} from "../connection/model.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";
import {
  BOARD_RESIDENT_PAGE_LIMIT,
  EMPTY_ENVIRONMENT_BOARD_STATE,
  type EnvironmentBoardState,
  applyBoardHeadRefresh,
  applyBoardStreamItem,
  applyOlderBoardPage,
  createEnvironmentBoardAtoms,
  makeEnvironmentBoardState,
  mergeBoardPosts,
  requestBoardRetry,
} from "./board.ts";

const environmentA = EnvironmentId.make("environment-a");
const environmentB = EnvironmentId.make("environment-b");
const target = new PrimaryConnectionTarget({
  environmentId: environmentA,
  label: "Synthetic environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});

function post(id: string, sequence: number, overrides: Partial<BoardPost> = {}): BoardPost {
  const author = { kind: "agent" as const, id: "agent", providerInstanceId: "codex" };
  return {
    id,
    author,
    body: `Post ${id}`,
    targets: ["reviewers"],
    source: { projectId: "project", threadId: "thread" },
    sequence,
    createdAt: "2026-08-28T18:00:00.000Z",
    revision: 1,
    updatedSequence: sequence,
    updatedAt: "2026-08-28T18:00:00.000Z",
    lastEditor: { kind: "agent" },
    lastEditorSource: { projectId: "project", threadId: "thread" },
    ...overrides,
  } as unknown as BoardPost;
}

function page(posts: ReadonlyArray<BoardPost>, beforeCursor: string | null): BoardPage {
  return { posts, beforeCursor, headSequence: 1000 } as unknown as BoardPage;
}

describe("environment Board state", () => {
  it("keys the owner only by environment so projects and threads reuse the same atom", () => {
    const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<
      EnvironmentRegistry,
      never
    >;
    const board = createEnvironmentBoardAtoms(runtime);
    const first = board.stateAtom(environmentA);
    expect(board.stateAtom(environmentA)).toBe(first);
    expect(board.stateAtom(environmentB)).not.toBe(first);
  });

  it("accepts the stream snapshot before live posts and resumes at its global watermark", () => {
    const attached = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: { posts: [post("snapshot", 4)], beforeCursor: "older", headSequence: 10 },
    });
    const live = applyBoardStreamItem(attached, { kind: "post", post: post("live", 11) });
    expect(attached.headSequence).toBe(10);
    expect(live.posts.map((entry) => entry.id)).toEqual(["snapshot", "live"]);
    expect(applyBoardStreamItem(live, { kind: "synchronized" }).status).toBe("live");
  });

  it("drops replayed transport data and stale revisions without filtering source context", () => {
    const first = post("first", 3);
    const replay = { ...first, body: "Replayed transport body" };
    expect(mergeBoardPosts([first], [replay])).toEqual([first]);
    const snapshot = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: { posts: [first], beforeCursor: null, headSequence: 3 },
    });
    expect(applyBoardStreamItem(snapshot, { kind: "post", post: replay })).toBe(snapshot);
  });

  it("replaces a resident post at its stable publication position using the revision watermark", () => {
    const original = post("original", 3);
    const later = post("later", 7);
    const snapshot = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: { posts: [original, later], beforeCursor: null, headSequence: 7 },
    });
    const revised = post("original", 3, {
      body: "Corrected body",
      revision: 2,
      updatedSequence: 12,
      updatedAt: "2026-08-28T18:05:00.000Z",
    });
    const next = applyBoardStreamItem(snapshot, { kind: "revision", post: revised });

    expect(next.posts.map((entry) => entry.id)).toEqual(["original", "later"]);
    expect(next.posts[0]?.body).toBe("Corrected body");
    expect(next.headSequence).toBe(12);
  });

  it("advances resume state for a revision whose historical post is not resident", () => {
    const snapshot = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: { posts: [post("resident", 20)], beforeCursor: "older", headSequence: 20 },
    });
    const next = applyBoardStreamItem(snapshot, {
      kind: "revision",
      post: post("unloaded", 2, { revision: 3, updatedSequence: 24 }),
    });

    expect(next.posts.map((entry) => entry.id)).toEqual(["resident"]);
    expect(next.headSequence).toBe(24);
    expect(next.paginationGeneration).toBe(snapshot.paginationGeneration + 1);
  });

  it("protects a live revision from a stale head refresh without moving the post", () => {
    const original = post("original", 3);
    const snapshot = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: { posts: [original, post("later", 7)], beforeCursor: null, headSequence: 7 },
    });
    const revised = post("original", 3, {
      body: "Live correction",
      revision: 2,
      updatedSequence: 12,
    });
    const live = applyBoardStreamItem(snapshot, { kind: "revision", post: revised });
    const refreshed = applyBoardHeadRefresh(live, {
      posts: [original, post("later", 7)],
      beforeCursor: null,
      headSequence: 10,
    });

    expect(refreshed.posts.map((entry) => entry.id)).toEqual(["original", "later"]);
    expect(refreshed.posts[0]?.body).toBe("Live correction");
    expect(refreshed.headSequence).toBe(12);
  });

  it("keeps older pages bounded while preserving chronological order", () => {
    let state = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: page(
        Array.from({ length: 50 }, (_, index) => post(`head-${index}`, index + 401)),
        "c1",
      ),
    });
    for (let index = 0; index < BOARD_RESIDENT_PAGE_LIMIT - 1; index += 1) {
      state = applyOlderBoardPage(
        state,
        page(
          Array.from({ length: 50 }, (_, row) =>
            post(`older-${index}-${row}`, index * 50 + row + 1),
          ),
          `c${index + 2}`,
        ),
      );
    }
    expect(state.segments).toHaveLength(BOARD_RESIDENT_PAGE_LIMIT);
    expect(state.posts).toHaveLength(200);
    expect(
      state.posts.every(
        (entry, index, all) => index === 0 || all[index - 1]!.sequence <= entry.sequence,
      ),
    ).toBe(true);
    const deeper = applyOlderBoardPage(state, page([post("deeper", 0)], "c5"));
    expect(deeper.posts.map((entry) => entry.id)).toEqual(["deeper"]);
    expect(deeper.beforeCursor).toBe("c5");
  });

  it("rebases a saturated live head without leaving its dropped range behind its cursor", () => {
    let state = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: {
        posts: Array.from({ length: 50 }, (_, index) => post(`head-${index}`, index + 1)),
        beforeCursor: "c50",
        headSequence: 50,
      },
    });
    for (let sequence = 51; sequence <= 251; sequence += 1) {
      state = applyBoardStreamItem(state, {
        kind: "post",
        post: post(`live-${sequence}`, sequence),
      });
    }
    expect(state.needsHeadRefresh).toBe(true);
    const rebased = applyBoardHeadRefresh(state, {
      posts: Array.from({ length: 50 }, (_, index) => post(`refresh-${index}`, index + 202)),
      beforeCursor: "c202",
      headSequence: 251,
    });
    expect(rebased.beforeCursor).toBe("c202");
    expect(rebased.posts.at(-1)?.sequence).toBe(251);
    expect(rebased.needsHeadRefresh).toBe(false);
  });

  it("keeps each requested older page reachable after substantial live head growth", () => {
    let state = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: {
        posts: Array.from({ length: 50 }, (_, index) => post(`head-${index}`, index + 1)),
        beforeCursor: "c50",
        headSequence: 50,
      },
    });
    for (let sequence = 51; sequence <= 251; sequence += 1) {
      state = applyBoardStreamItem(state, {
        kind: "post",
        post: post(`live-${sequence}`, sequence),
      });
    }
    state = applyOlderBoardPage(
      state,
      page(
        Array.from({ length: 50 }, (_, index) => post(`older-a-${index}`, index + 1)),
        "c0",
      ),
    );
    expect(state.posts.map((entry) => entry.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `older-a-${index}`),
    );
    expect(state.beforeCursor).toBe("c0");
    state = applyOlderBoardPage(state, page([post("older-b", 0)], null));
    expect(state.posts[0]?.id).toBe("older-b");
    expect(state.posts[1]?.id).toBe("older-a-0");
    expect(state.beforeCursor).toBeNull();
  });

  it.effect("waits for explicit retry after a persistent subscription failure", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const subscriptionInputs = yield* Queue.unbounded<Record<string, unknown>>();
        const expectedFailure = new Error("Board subscription unavailable");
        const client = {
          [ORCHESTRATION_WS_METHODS.subscribeBoard]: (input: Record<string, unknown>) =>
            Stream.unwrap(
              Queue.offer(subscriptionInputs, input).pipe(
                Effect.as(
                  Stream.concat(
                    Stream.succeed({
                      kind: "snapshot" as const,
                      page: page([post("snapshot", 1000)], null),
                    }),
                    Stream.fail(expectedFailure),
                  ),
                ),
              ),
            ),
        } as unknown as WsRpcProtocolClient;
        const session = {
          client,
          initialConfig: Effect.succeed({} as never),
          ready: Effect.void,
          probe: Effect.void,
          closed: Effect.never,
        } as unknown as RpcSession;
        const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
          target,
          state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
          session: yield* SubscriptionRef.make<Option.Option<RpcSession>>(Option.some(session)),
          prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none()),
          connect: Effect.void,
          disconnect: Effect.void,
          retryNow: Effect.void,
        } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
        const state = yield* makeEnvironmentBoardState().pipe(
          Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        );
        const observed = yield* Queue.unbounded<EnvironmentBoardState>();
        yield* SubscriptionRef.changes(state).pipe(
          Stream.runForEach((value) => Queue.offer(observed, value)),
          Effect.forkScoped,
        );

        expect(yield* Queue.take(subscriptionInputs)).toEqual({ requestCompletionMarker: true });
        yield* Queue.take(observed).pipe(
          Effect.repeat({ until: (value) => value.status === "failed" }),
        );
        yield* TestClock.adjust("1 second");
        yield* Effect.yieldNow;
        expect(yield* Queue.poll(subscriptionInputs)).toEqual(Option.none());

        expect(requestBoardRetry(environmentA)).toBe(true);
        expect(yield* Queue.take(subscriptionInputs)).toEqual({
          afterSequence: 1000,
          requestCompletionMarker: true,
        });
        yield* Queue.take(observed).pipe(
          Effect.repeat({ until: (value) => value.status === "failed" }),
        );
        yield* TestClock.adjust("1 second");
        yield* Effect.yieldNow;
        expect(yield* Queue.poll(subscriptionInputs)).toEqual(Option.none());
      }),
    ),
  );

  it.effect("resumes a replacement connection from the last accepted Board watermark", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstEvents = yield* Queue.unbounded<Parameters<typeof applyBoardStreamItem>[1]>();
        const secondEvents = yield* Queue.unbounded<Parameters<typeof applyBoardStreamItem>[1]>();
        const subscriptionInputs = yield* Queue.unbounded<{
          readonly connection: string;
          readonly input: Record<string, unknown>;
        }>();
        const makeSession = (
          connection: string,
          events: Queue.Queue<Parameters<typeof applyBoardStreamItem>[1]>,
        ) =>
          ({
            client: {
              [ORCHESTRATION_WS_METHODS.subscribeBoard]: (input: Record<string, unknown>) =>
                Stream.unwrap(
                  Queue.offer(subscriptionInputs, { connection, input }).pipe(
                    Effect.as(Stream.fromQueue(events)),
                  ),
                ),
            } as unknown as WsRpcProtocolClient,
            initialConfig: Effect.succeed({} as never),
            ready: Effect.void,
            probe: Effect.void,
            closed: Effect.never,
          }) as unknown as RpcSession;
        const firstSession = makeSession("first", firstEvents);
        const secondSession = makeSession("second", secondEvents);
        const session = yield* SubscriptionRef.make<Option.Option<RpcSession>>(
          Option.some(firstSession),
        );
        const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
          target,
          state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
          session,
          prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none()),
          connect: Effect.void,
          disconnect: Effect.void,
          retryNow: Effect.void,
        } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
        const state = yield* makeEnvironmentBoardState().pipe(
          Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        );
        const observed = yield* Queue.unbounded<EnvironmentBoardState>();
        yield* SubscriptionRef.changes(state).pipe(
          Stream.runForEach((value) => Queue.offer(observed, value)),
          Effect.forkScoped,
        );

        expect(yield* Queue.take(subscriptionInputs)).toEqual({
          connection: "first",
          input: { requestCompletionMarker: true },
        });
        yield* Queue.offer(firstEvents, {
          kind: "snapshot",
          page: { posts: [post("first", 10)], beforeCursor: null, headSequence: 10 },
        });
        yield* Queue.take(observed).pipe(
          Effect.repeat({ until: (value) => value.headSequence === 10 }),
        );

        yield* SubscriptionRef.set(session, Option.some(secondSession));
        expect(yield* Queue.take(subscriptionInputs)).toEqual({
          connection: "second",
          input: { afterSequence: 10, requestCompletionMarker: true },
        });
        yield* Queue.offer(secondEvents, { kind: "post", post: post("second", 11) });
        const resumed = yield* Queue.take(observed).pipe(
          Effect.repeat({ until: (value) => value.headSequence === 11 }),
        );
        expect(resumed.posts.map((entry) => entry.id)).toEqual(["first", "second"]);
      }),
    ),
  );

  it.effect("waits for explicit retry after a persistent overflow refresh failure", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const events = yield* Queue.unbounded<Parameters<typeof applyBoardStreamItem>[1]>();
        const pageRequests = yield* Queue.unbounded<Record<string, unknown>>();
        const client = {
          [ORCHESTRATION_WS_METHODS.subscribeBoard]: () => Stream.fromQueue(events),
          [ORCHESTRATION_WS_METHODS.getBoardPage]: (input: Record<string, unknown>) =>
            Queue.offer(pageRequests, input).pipe(
              Effect.andThen(Effect.die("Board page unavailable")),
            ),
        } as unknown as WsRpcProtocolClient;
        const session = {
          client,
          initialConfig: Effect.succeed({} as never),
          ready: Effect.void,
          probe: Effect.void,
          closed: Effect.never,
        } as unknown as RpcSession;
        const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
          target,
          state: yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE),
          session: yield* SubscriptionRef.make<Option.Option<RpcSession>>(Option.some(session)),
          prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none()),
          connect: Effect.void,
          disconnect: Effect.void,
          retryNow: Effect.void,
        } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
        const state = yield* makeEnvironmentBoardState().pipe(
          Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        );
        const observed = yield* Queue.unbounded<EnvironmentBoardState>();
        yield* SubscriptionRef.changes(state).pipe(
          Stream.runForEach((value) => Queue.offer(observed, value)),
          Effect.forkScoped,
        );
        yield* Queue.offer(events, {
          kind: "snapshot",
          page: {
            posts: Array.from({ length: 50 }, (_, index) => post(`head-${index}`, index + 1)),
            beforeCursor: "c50",
            headSequence: 50,
          },
        });
        for (let sequence = 51; sequence <= 251; sequence += 1) {
          yield* Queue.offer(events, { kind: "post", post: post(`live-${sequence}`, sequence) });
        }
        expect(yield* Queue.take(pageRequests)).toEqual({ limit: 50 });
        yield* Queue.take(observed).pipe(
          Effect.repeat({ until: (value) => value.status === "failed" }),
        );
        expect(yield* Queue.poll(pageRequests)).toEqual(Option.none());
        expect(requestBoardRetry(environmentA)).toBe(true);
        expect(yield* Queue.take(pageRequests)).toEqual({ limit: 50 });
        yield* Queue.take(observed).pipe(
          Effect.repeat({ until: (value) => value.status === "failed" }),
        );
        expect(yield* Queue.poll(pageRequests)).toEqual(Option.none());
      }),
    ),
  );

  it("discards an older response after a replacement snapshot and leaves the replacement cursor", () => {
    const initial = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: page([post("initial", 10)], "old-cursor"),
    });
    const replacement = applyBoardStreamItem(initial, {
      kind: "snapshot",
      page: page([post("replacement", 20)], "replacement-cursor"),
    });
    expect(replacement.paginationGeneration).toBeGreaterThan(initial.paginationGeneration);
    expect(replacement.beforeCursor).toBe("replacement-cursor");
  });

  it("exposes no human publication command through the Board read state", () => {
    expect(Object.values(ORCHESTRATION_WS_METHODS)).not.toContain("board.post.publish");
  });
});
