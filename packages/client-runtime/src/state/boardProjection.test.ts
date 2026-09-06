import type { BoardPage, BoardPost } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  BOARD_RESIDENT_PAGE_LIMIT,
  EMPTY_ENVIRONMENT_BOARD_STATE,
  applyBoardHeadRefresh,
  applyBoardStreamItem,
  applyOlderBoardPage,
  mergeBoardPosts,
} from "./boardProjection.ts";

function post(id: string, sequence: number, overrides: Partial<BoardPost> = {}): BoardPost {
  return {
    id,
    author: { kind: "agent", id: "agent", providerInstanceId: "codex" },
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

describe("Board client projection", () => {
  it("accepts a snapshot before live posts and resumes at its mutation watermark", () => {
    const attached = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: { posts: [post("snapshot", 4)], beforeCursor: "older", headSequence: 10 },
    });
    const live = applyBoardStreamItem(attached, { kind: "post", post: post("live", 11) });

    expect(attached.headSequence).toBe(10);
    expect(live.posts.map((entry) => entry.id)).toEqual(["snapshot", "live"]);
    expect(applyBoardStreamItem(live, { kind: "synchronized" }).status).toBe("live");
  });

  it("drops stale transport data while preserving publication order", () => {
    const first = post("first", 3);
    const replay = { ...first, body: "Replayed transport body" };

    expect(mergeBoardPosts([first], [replay])).toEqual([first]);
    const snapshot = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: { posts: [first], beforeCursor: null, headSequence: 3 },
    });
    expect(applyBoardStreamItem(snapshot, { kind: "post", post: replay })).toBe(snapshot);
  });

  it("replaces a resident revision at its stable publication position", () => {
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

  it("invalidates stale older pages after a revision for an unloaded post", () => {
    const snapshot = applyBoardStreamItem(EMPTY_ENVIRONMENT_BOARD_STATE, {
      kind: "snapshot",
      page: { posts: [post("resident", 20)], beforeCursor: "older", headSequence: 20 },
    });
    const requestGeneration = snapshot.paginationGeneration;

    const next = applyBoardStreamItem(snapshot, {
      kind: "revision",
      post: post("unloaded", 2, { revision: 3, updatedSequence: 24 }),
    });

    expect(next.posts.map((entry) => entry.id)).toEqual(["resident"]);
    expect(next.headSequence).toBe(24);
    expect(next.paginationGeneration).not.toBe(requestGeneration);
  });

  it("protects a live revision from a stale head refresh without moving it", () => {
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

  it("keeps older pages bounded and chronologically ordered", () => {
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

  it("rebases a saturated live head without retaining its dropped cursor range", () => {
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

  it("keeps each requested older page reachable after substantial head growth", () => {
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

  it("invalidates older responses when a replacement snapshot arrives", () => {
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
});
