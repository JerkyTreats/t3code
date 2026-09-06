import {
  AuthAccessWriteScope,
  BoardPostId,
  type BoardHistoryPage,
  type BoardPost,
  OrchestrationBoardRevisionError,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

process.env.NODE_ENV = "development";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const React = await import("react");
const TestRenderer = await import("react-test-renderer");
const {
  BOARD_GLOBAL_COPY,
  BoardPostCard,
  boardPostsNewestFirst,
  boardSourcePrimaryLabel,
  boardSourceScopeLabel,
  boardTargetAttentionLabel,
  canEditBoardPosts,
  classifyBoardRevisionFailure,
} = await import("./BoardPanel");

const author = { kind: "agent" as const, id: "agent", providerInstanceId: "codex" };

function post(overrides: Partial<BoardPost> = {}): BoardPost {
  return {
    id: "post-1",
    author,
    body: "Original body",
    targets: ["reviewers"],
    source: { projectId: "project", threadId: "thread" },
    sequence: 3,
    createdAt: "2026-08-28T18:00:00.000Z",
    revision: 1,
    updatedSequence: 3,
    updatedAt: "2026-08-28T18:00:00.000Z",
    lastEditor: { kind: "agent" },
    lastEditorSource: { projectId: "project", threadId: "thread" },
    ...overrides,
  } as unknown as BoardPost;
}

function historyPage(): BoardHistoryPage {
  return {
    postId: "post-1",
    currentRevision: 2,
    revisions: [
      {
        postId: "post-1",
        revision: 2,
        body: "Corrected body",
        targets: ["reviewers"],
        editor: { kind: "environment-owner" },
        editorSource: null,
        editedAt: "2026-08-28T18:05:00.000Z",
        eventSequence: 7,
      },
      {
        postId: "post-1",
        revision: 1,
        body: "Original body",
        targets: ["reviewers"],
        editor: { kind: "agent" },
        editorSource: { projectId: "project", threadId: "thread" },
        editedAt: "2026-08-28T18:00:00.000Z",
        eventSequence: 3,
      },
    ],
    beforeRevision: null,
  } as unknown as BoardHistoryPage;
}

async function renderCard(input: {
  readonly value?: BoardPost;
  readonly canEdit?: boolean;
  readonly onRevise?: React.ComponentProps<typeof BoardPostCard>["onRevise"];
  readonly onGetHistory?: React.ComponentProps<typeof BoardPostCard>["onGetHistory"];
}): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await React.act(async () => {
    renderer = TestRenderer.create(
      <BoardPostCard
        post={input.value ?? post()}
        canEdit={input.canEdit ?? false}
        onRevise={input.onRevise ?? (async () => ({ kind: "success", post: post() }))}
        onGetHistory={input.onGetHistory ?? (async () => historyPage())}
      />,
    );
  });
  if (renderer === undefined) throw new Error("Board post card did not render.");
  return renderer;
}

function buttonNamed(renderer: ReactTestRenderer, name: string) {
  return renderer.root
    .findAllByType("button")
    .find((button) => button.children.some((child) => child === name));
}

describe("BoardPanel", () => {
  it("makes its environment-global ownership and public target semantics explicit", () => {
    expect(BOARD_GLOBAL_COPY).toBe("Spans every project and thread in this environment.");
    expect(boardTargetAttentionLabel("release-team")).toBe("Attention release-team");
    const threadSource = {
      projectId: ProjectId.make("project"),
      threadId: ThreadId.make("thread"),
    };
    expect(boardSourcePrimaryLabel(threadSource)).toBe("thread");
    expect(boardSourceScopeLabel(threadSource)).toBe("Project project");
    expect(
      boardSourcePrimaryLabel({
        kind: "collective-expedition",
        expeditionId: "expedition",
        residentId: "resident",
      }),
    ).toBe("resident");
    expect(
      boardSourceScopeLabel({
        kind: "collective-expedition",
        expeditionId: "expedition",
        residentId: "resident",
      }),
    ).toBe("Expedition expedition");
  });

  it("gates owner controls on the exact access write scope", () => {
    expect(canEditBoardPosts(null)).toBe(false);
    expect(canEditBoardPosts({ authenticated: false, scopes: [AuthAccessWriteScope] })).toBe(false);
    expect(canEditBoardPosts({ authenticated: true, scopes: ["orchestration:read"] })).toBe(false);
    expect(canEditBoardPosts({ authenticated: true, scopes: [AuthAccessWriteScope] })).toBe(true);
  });

  it("shows the newest post first as live posts arrive", () => {
    const first = post({ id: BoardPostId.make("first"), sequence: 1, updatedSequence: 1 });
    const second = post({ id: BoardPostId.make("second"), sequence: 2, updatedSequence: 2 });
    const live = post({ id: BoardPostId.make("live"), sequence: 3, updatedSequence: 3 });
    const initial = [first, second];

    expect(boardPostsNewestFirst(initial).map((entry) => entry.id)).toEqual(["second", "first"]);
    expect(boardPostsNewestFirst([...initial, live]).map((entry) => entry.id)).toEqual([
      "live",
      "second",
      "first",
    ]);
    expect(initial.map((entry) => entry.id)).toEqual(["first", "second"]);
  });

  it("does not render edit controls for a read-only participant", async () => {
    const renderer = await renderCard({ canEdit: false });
    expect(buttonNamed(renderer, "Edit")).toBeUndefined();

    const ownerRenderer = await renderCard({ canEdit: true });
    expect(buttonNamed(ownerRenderer, "Edit")).toBeDefined();
  });

  it("classifies typed revision conflicts separately from ordinary failures", () => {
    const currentPost = post({ revision: 2, updatedSequence: 7 });
    expect(
      classifyBoardRevisionFailure(
        new OrchestrationBoardRevisionError({
          reason: "conflict",
          message: "The post changed.",
          expectedRevision: 1,
          actualRevision: 2,
          currentPost,
        }),
      ),
    ).toMatchObject({ kind: "conflict", actualRevision: 2, currentPost });
    expect(classifyBoardRevisionFailure(new Error("Network unavailable"))).toEqual({
      kind: "error",
      message: "Network unavailable",
    });
  });

  it("preserves a dirty draft across a newer post and a typed conflict", async () => {
    const currentPost = post({
      body: "Concurrent correction",
      revision: 2,
      updatedSequence: 7,
    });
    const onRevise = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "conflict",
        message: "The post changed.",
        actualRevision: 2,
        currentPost,
      })
      .mockResolvedValueOnce({ kind: "success", post: currentPost });
    const renderer = await renderCard({ canEdit: true, onRevise });

    await React.act(async () => buttonNamed(renderer, "Edit")?.props.onClick());
    const textarea = renderer.root.findByType("textarea");
    await React.act(async () =>
      textarea.props.onChange({
        target: { value: "My preserved draft" },
        currentTarget: { value: "My preserved draft" },
      }),
    );
    await React.act(async () => {
      renderer.update(
        <BoardPostCard
          post={currentPost}
          canEdit
          onRevise={onRevise}
          onGetHistory={async () => historyPage()}
        />,
      );
    });
    expect(renderer.root.findByType("textarea").props.value).toBe("My preserved draft");

    await React.act(async () => buttonNamed(renderer, "Save correction")?.props.onClick());
    expect(onRevise.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: 1,
      body: "My preserved draft",
    });
    expect(renderer.root.findByType("textarea").props.value).toBe("My preserved draft");
    expect(
      renderer.root
        .findByProps({ role: "alert" })
        .findAllByType("p")
        .some((node) => node.children.includes("Your draft is preserved.")),
    ).toBe(true);

    await React.act(async () =>
      buttonNamed(renderer, "Keep draft against latest")?.props.onClick(),
    );
    await React.act(async () => buttonNamed(renderer, "Save correction")?.props.onClick());
    expect(onRevise.mock.calls[1]?.[0]).toMatchObject({
      expectedRevision: 2,
      body: "My preserved draft",
    });
  });

  it("round-trips comma-containing and duplicate targets without rewriting them", async () => {
    const original = post({ targets: ["release,team", "duplicate", "duplicate"] });
    const corrected = post({
      ...original,
      body: "Corrected body",
      revision: 2,
      updatedSequence: 8,
      lastEditor: { kind: "environment-owner" },
    });
    const onRevise = vi.fn(async () => ({ kind: "success" as const, post: corrected }));
    const renderer = await renderCard({ value: original, canEdit: true, onRevise });

    await React.act(async () => buttonNamed(renderer, "Edit")?.props.onClick());
    await React.act(async () => {
      renderer.root.findByType("textarea").props.onChange({
        target: { value: "Corrected body" },
        currentTarget: { value: "Corrected body" },
      });
    });
    await React.act(async () => buttonNamed(renderer, "Save correction")?.props.onClick());

    expect(onRevise).toHaveBeenCalledExactlyOnceWith({
      postId: "post-1",
      expectedRevision: 1,
      body: "Corrected body",
      targets: ["release,team", "duplicate", "duplicate"],
    });
    expect(
      renderer.root.findAllByType("p").some((node) => node.children.includes("Corrected body")),
    ).toBe(true);
  });

  it("loads bounded history only after a participant opens it", async () => {
    const onGetHistory = vi.fn(async () => historyPage());
    const renderer = await renderCard({
      value: post({ body: "Corrected body", revision: 2, updatedSequence: 7 }),
      onGetHistory,
    });

    expect(onGetHistory).not.toHaveBeenCalled();
    expect(buttonNamed(renderer, "History")).toBeDefined();
    await React.act(async () => buttonNamed(renderer, "History")?.props.onClick());
    expect(onGetHistory).toHaveBeenCalledExactlyOnceWith({ postId: "post-1", limit: 50 });
    expect(
      renderer.root.findByProps({ "aria-label": "Board post revision history" }),
    ).toBeDefined();
    expect(
      renderer.root.findAllByType("p").some((node) => node.children.includes("Original body")),
    ).toBe(true);
  });
});
