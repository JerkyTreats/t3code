import type { BoardPage, BoardPost, BoardStreamItem } from "@t3tools/contracts";

export const BOARD_RESIDENT_PAGE_LIMIT = 4;
export const BOARD_RESIDENT_POST_LIMIT = 200;

export type EnvironmentBoardStatus = "empty" | "synchronizing" | "live" | "failed";

interface BoardSegment {
  readonly kind: "head" | "older";
  readonly loadOrder: number;
  readonly beforeCursor: string | null;
  readonly posts: ReadonlyArray<BoardPost>;
}

export interface EnvironmentBoardState {
  readonly posts: ReadonlyArray<BoardPost>;
  readonly status: EnvironmentBoardStatus;
  readonly beforeCursor: string | null;
  /** Global event watermark used only for live stream resume. */
  readonly headSequence: number;
  readonly loadingOlder: boolean;
  readonly refreshingHead: boolean;
  readonly needsHeadRefresh: boolean;
  readonly error: string | null;
  readonly segments: ReadonlyArray<BoardSegment>;
  readonly nextLoadOrder: number;
  readonly paginationGeneration: number;
}

export const EMPTY_ENVIRONMENT_BOARD_STATE: EnvironmentBoardState = {
  posts: [],
  status: "empty",
  beforeCursor: null,
  headSequence: 0,
  loadingOlder: false,
  refreshingHead: false,
  needsHeadRefresh: false,
  error: null,
  segments: [],
  nextLoadOrder: 0,
  paginationGeneration: 0,
};

function comparePosts(left: BoardPost, right: BoardPost): number {
  return left.sequence - right.sequence || left.id.localeCompare(right.id);
}

/**
 * Pure client projection for the current Board window. A post's publication
 * sequence owns its stable display order, while updatedSequence is only the
 * mutation watermark that selects its newest accepted revision and resumes the
 * live stream. A later mutation must never promote an older publication.
 */
export function mergeBoardPosts(
  existing: ReadonlyArray<BoardPost>,
  incoming: ReadonlyArray<BoardPost>,
): ReadonlyArray<BoardPost> {
  const byId = new Map<string, BoardPost>();
  for (const post of existing) {
    const known = byId.get(post.id);
    if (
      known === undefined ||
      post.updatedSequence > known.updatedSequence ||
      (post.updatedSequence === known.updatedSequence && post.revision > known.revision)
    ) {
      byId.set(post.id, post);
    }
  }
  for (const post of incoming) {
    const known = byId.get(post.id);
    if (
      known === undefined ||
      post.updatedSequence > known.updatedSequence ||
      (post.updatedSequence === known.updatedSequence && post.revision > known.revision)
    ) {
      byId.set(post.id, post);
    }
  }
  return [...byId.values()].sort(comparePosts).slice(-BOARD_RESIDENT_POST_LIMIT);
}

function oldestSegment(segments: ReadonlyArray<BoardSegment>): BoardSegment | undefined {
  return segments
    .filter((segment) => segment.posts.length > 0)
    .slice()
    .sort((left, right) => {
      const leftPost = left.posts[0];
      const rightPost = right.posts[0];
      if (leftPost === undefined) return 1;
      if (rightPost === undefined) return -1;
      return comparePosts(leftPost, rightPost);
    })[0];
}

function postsFromSegments(segments: ReadonlyArray<BoardSegment>): ReadonlyArray<BoardPost> {
  return segments
    .slice()
    .sort((left, right) => left.loadOrder - right.loadOrder)
    .reduce<ReadonlyArray<BoardPost>>(
      (posts, segment) => mergeBoardPosts(posts, segment.posts),
      [],
    );
}

function capSegments(
  segments: ReadonlyArray<BoardSegment>,
  preferHistoricalRemoval: boolean,
): ReadonlyArray<BoardSegment> {
  const retained = segments.slice();
  const postCount = () => retained.reduce((total, segment) => total + segment.posts.length, 0);
  while (retained.length > BOARD_RESIDENT_PAGE_LIMIT || postCount() > BOARD_RESIDENT_POST_LIMIT) {
    const historical = preferHistoricalRemoval
      ? oldestSegment(retained.filter((it) => it.kind === "older"))
      : undefined;
    const removal = historical ?? oldestSegment(retained);
    if (removal === undefined) break;
    retained.splice(retained.indexOf(removal), 1);
  }
  return retained;
}

function cursorFromSegments(
  segments: ReadonlyArray<BoardSegment>,
  fallback: string | null,
): string | null {
  return oldestSegment(segments)?.beforeCursor ?? fallback;
}

export function applyBoardStreamItem(
  state: EnvironmentBoardState,
  item: BoardStreamItem,
): EnvironmentBoardState {
  switch (item.kind) {
    case "snapshot": {
      const head: BoardSegment = {
        kind: "head",
        loadOrder: state.nextLoadOrder,
        beforeCursor: item.page.beforeCursor,
        posts: mergeBoardPosts([], item.page.posts),
      };
      return {
        posts: head.posts,
        status: "synchronizing",
        beforeCursor: head.beforeCursor,
        headSequence: item.page.headSequence,
        loadingOlder: false,
        refreshingHead: false,
        needsHeadRefresh: false,
        error: null,
        segments: [head],
        nextLoadOrder: state.nextLoadOrder + 1,
        paginationGeneration: state.paginationGeneration + 1,
      };
    }
    case "synchronized":
      return { ...state, status: "live", error: null };
    case "post": {
      if (item.post.updatedSequence <= state.headSequence) return state;
      const existingHead = state.segments.find((segment) => segment.kind === "head");
      const trimsSaturatedHead =
        existingHead !== undefined &&
        existingHead.posts.length >= BOARD_RESIDENT_POST_LIMIT &&
        !existingHead.posts.some((post) => post.id === item.post.id);
      const head: BoardSegment = existingHead
        ? { ...existingHead, posts: mergeBoardPosts(existingHead.posts, [item.post]) }
        : {
            kind: "head",
            loadOrder: state.nextLoadOrder,
            beforeCursor: null,
            posts: [item.post],
          };
      const segments = capSegments(
        [...state.segments.filter((segment) => segment !== existingHead), head],
        true,
      );
      return {
        ...state,
        posts: postsFromSegments(segments),
        beforeCursor: cursorFromSegments(segments, null),
        headSequence: item.post.updatedSequence,
        needsHeadRefresh: state.needsHeadRefresh || trimsSaturatedHead,
        segments,
        nextLoadOrder: existingHead ? state.nextLoadOrder : state.nextLoadOrder + 1,
      };
    }
    case "revision": {
      if (item.post.updatedSequence <= state.headSequence) return state;
      const resident = state.posts.some((post) => post.id === item.post.id);
      if (!resident) {
        // Revision events must advance stream resume even when the original
        // historical post is outside the bounded resident window. Inserting it
        // here would make ordinary live rendering fetch old Board content.
        return {
          ...state,
          headSequence: item.post.updatedSequence,
          paginationGeneration: state.paginationGeneration + 1,
        };
      }
      const segments = state.segments.map((segment) => ({
        ...segment,
        posts: segment.posts.some((post) => post.id === item.post.id)
          ? mergeBoardPosts(segment.posts, [item.post])
          : segment.posts,
      }));
      return {
        ...state,
        posts: postsFromSegments(segments),
        headSequence: item.post.updatedSequence,
        segments,
      };
    }
  }
}

export function applyOlderBoardPage(
  state: EnvironmentBoardState,
  page: BoardPage,
): EnvironmentBoardState {
  const known = new Set(state.posts.map((post) => post.id));
  const segment: BoardSegment = {
    kind: "older",
    loadOrder: state.nextLoadOrder,
    beforeCursor: page.beforeCursor,
    posts: mergeBoardPosts(
      [],
      page.posts.filter((post) => !known.has(post.id)),
    ),
  };
  const nextResidentPostCount =
    state.segments.reduce((count, existing) => count + existing.posts.length, 0) +
    segment.posts.length;
  if (
    state.segments.length >= BOARD_RESIDENT_PAGE_LIMIT ||
    nextResidentPostCount > BOARD_RESIDENT_POST_LIMIT
  ) {
    // Paging advances through a bounded resident window. Start the next
    // window at the page just read so its cursor cannot repeat an evicted page.
    return {
      ...state,
      posts: segment.posts,
      beforeCursor: page.beforeCursor,
      loadingOlder: false,
      error: null,
      segments: [segment],
      nextLoadOrder: state.nextLoadOrder + 1,
    };
  }
  const segments =
    segment.posts.length === 0
      ? state.segments.map((existing) =>
          existing === oldestSegment(state.segments)
            ? { ...existing, beforeCursor: page.beforeCursor }
            : existing,
        )
      : [...state.segments, segment];
  return {
    ...state,
    posts: postsFromSegments(segments),
    beforeCursor: cursorFromSegments(segments, page.beforeCursor),
    loadingOlder: false,
    error: null,
    segments,
    nextLoadOrder: state.nextLoadOrder + 1,
  };
}

export function applyBoardHeadRefresh(
  state: EnvironmentBoardState,
  page: BoardPage,
): EnvironmentBoardState {
  const laterLivePosts = state.posts.filter((post) => post.updatedSequence > page.headSequence);
  const combinedCount = new Set([...page.posts, ...laterLivePosts].map((post) => post.id)).size;
  const posts = mergeBoardPosts(page.posts, laterLivePosts);
  const head: BoardSegment = {
    kind: "head",
    loadOrder: state.nextLoadOrder,
    beforeCursor: page.beforeCursor,
    posts,
  };
  return {
    ...state,
    posts,
    status: state.status === "failed" ? "live" : state.status,
    beforeCursor: page.beforeCursor,
    headSequence: Math.max(state.headSequence, page.headSequence),
    refreshingHead: false,
    needsHeadRefresh: combinedCount > BOARD_RESIDENT_POST_LIMIT,
    error: null,
    segments: [head],
    nextLoadOrder: state.nextLoadOrder + 1,
    paginationGeneration: state.paginationGeneration + 1,
  };
}
