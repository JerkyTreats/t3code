import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { createRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LegendListRef } from "@legendapp/list/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@legendapp/list/react", () => ({
  LegendList: (props: {
    readonly data: ReadonlyArray<{ readonly id: string }>;
    readonly keyExtractor: (item: { readonly id: string }) => string;
    readonly renderItem: (input: { readonly item: { readonly id: string } }) => ReactNode;
  }) => (
    <div>
      {props.data.map((item) => (
        <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
      ))}
    </div>
  ),
}));
vi.mock("@pierre/diffs/react", () => ({ FileDiff: () => null }));
vi.mock("../../components/DiffWorkerPoolProvider", () => ({
  DiffWorkerPoolProvider: ({ children }: { readonly children?: React.ReactNode }) => children,
}));
vi.mock("../../browser/useOpenLink", () => ({ useOpenLink: () => vi.fn() }));
vi.mock("../../lib/openPullRequestLink", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/openPullRequestLink")>()),
  useOpenChangeRequestLink: () => vi.fn(),
}));

import {
  MessagesTimeline,
  timelineMarkdownSurfaceId,
} from "../../components/chat/MessagesTimeline";
import { fileMarkdownSurfaceId } from "../../components/files/FileMarkdownPreview";
import { pullRequestMarkdownSurfaceId } from "../../components/pullRequest/PullRequestMarkdown";
import { composeChatPrompt, projectChatPromptForDisplay } from "../../fork/chatPromptContext";
import { buildFileReviewComment } from "../../reviewCommentContext";

describe("Mermaid semantic host identities", () => {
  it("names message and plan surfaces with environment, thread, and durable owner ids", () => {
    const threadRef = scopeThreadRef(
      EnvironmentId.make("environment-1"),
      ThreadId.make("thread-1"),
    );
    const context = {
      activeThreadEnvironmentId: threadRef.environmentId,
      routeThreadKey: "unused-route-key",
      threadRef,
    };

    expect(timelineMarkdownSurfaceId(context, "message", "message-1", "assistant")).toBe(
      "timeline:environment-1:thread-1:message:message-1:assistant",
    );
    expect(timelineMarkdownSurfaceId(context, "plan", "plan-1")).toBe(
      "timeline:environment-1:thread-1:plan:plan-1",
    );
  });

  it("keeps terminal chips beside upstream review cards without normalizing authored text", () => {
    const environmentId = EnvironmentId.make("environment-local");
    const createdAt = "2026-03-17T19:12:28.000Z";
    const authoredPrompt = "  Preserve this prompt\n\n ";
    const text = composeChatPrompt({
      prompt: authoredPrompt,
      terminalContexts: [
        {
          terminalId: "synthetic",
          terminalLabel: "Synthetic terminal",
          lineStart: 1,
          lineEnd: 1,
          text: "ready",
        },
      ],
      elementContexts: [],
      previewAnnotations: [],
      reviewComments: [
        buildFileReviewComment({
          id: "synthetic-review",
          filePath: "src/example.ts",
          startLine: 1,
          endLine: 1,
          text: "Retain review",
          contents: "export const value = 1;",
        }),
      ],
    });
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        isWorking={false}
        activeTurnStartedAt={null}
        listRef={createRef<LegendListRef | null>()}
        timelineEntries={[
          {
            id: "entry-1",
            kind: "message",
            createdAt,
            message: {
              id: MessageId.make("message-1"),
              role: "user",
              text,
              turnId: null,
              createdAt,
              updatedAt: createdAt,
              streaming: false,
            },
          },
        ]}
        latestTurn={null}
        runningTurnId={null}
        turnDiffSummaryByAssistantMessageId={new Map()}
        routeThreadKey="environment-local:thread-1"
        onOpenTurnDiff={() => undefined}
        revertTurnCountByUserMessageId={new Map()}
        onRevertUserMessage={() => undefined}
        isRevertingCheckpoint={false}
        onImageExpand={() => undefined}
        activeThreadEnvironmentId={environmentId}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot={undefined}
        anchorMessageId={null}
        onAnchorReady={() => undefined}
        contentInsetEndAdjustment={0}
        liveFollowEnabled
        onIsAtEndChange={() => undefined}
        onManualNavigation={() => undefined}
      />,
    );

    expect(projectChatPromptForDisplay(text).authoredText).toBe(authoredPrompt);
    expect(markup).toContain("Preserve this prompt");
    expect(markup).toContain("Synthetic terminal");
    expect(markup).toContain("Retain review");
    expect(markup).not.toContain("&lt;terminal_context&gt;");
    expect(markup).not.toContain("&lt;review_comment");
  });

  it("keeps file and pull request identities collision-safe across delimiter-bearing fields", () => {
    const fileOne = fileMarkdownSurfaceId(
      scopeThreadRef(EnvironmentId.make("environment:a"), ThreadId.make("thread")),
      "guide.md",
    );
    const fileTwo = fileMarkdownSurfaceId(
      scopeThreadRef(EnvironmentId.make("environment"), ThreadId.make("a:thread")),
      "guide.md",
    );
    const pullRequestOne = pullRequestMarkdownSurfaceId(
      EnvironmentId.make("environment:a"),
      {
        projectId: ProjectId.make("project"),
        repository: "repository",
        number: 42,
      },
      "comment",
      "comment-1",
    );
    const pullRequestTwo = pullRequestMarkdownSurfaceId(
      EnvironmentId.make("environment"),
      {
        projectId: ProjectId.make("a:project"),
        repository: "repository",
        number: 42,
      },
      "comment",
      "comment-1",
    );

    expect(fileOne).not.toBe(fileTwo);
    expect(pullRequestOne).not.toBe(pullRequestTwo);
    expect(pullRequestOne).toContain(":comment:comment-1");
  });
});
