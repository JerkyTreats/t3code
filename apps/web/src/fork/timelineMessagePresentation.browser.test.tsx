import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import type { LegendListRef } from "@legendapp/list/react";
import { createRef, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { render } from "../../test/render";
import { MessagesTimeline } from "../components/chat/MessagesTimeline";
import {
  buildMessageContext,
  previewAnnotationContextReference,
  reviewCommentContextReference,
  terminalContextReference,
} from "../lib/composerContextRecords";
import { formatInlineContextReference } from "../lib/composerContextReferences";
import { buildFileReviewComment } from "../reviewCommentContext";
import { chatTimelinePresentation } from "./chatPresentation";
import { normalizeReferencedChatPrompt } from "./chatPromptContext";

vi.mock(import("~/state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => ({
    data: null,
    dataUpdatedAt: 0,
    error: null,
    failure: null,
    isPending: false,
    isSuccess: false,
    refresh: () => {},
  })) as never,
}));

const ENVIRONMENT_ID = EnvironmentId.make("environment-local");
const CREATED_AT = "2026-03-17T19:12:28.000Z";

type TimelineProps = ComponentProps<typeof MessagesTimeline>;
type Entry = TimelineProps["timelineEntries"][number];

function baseProps(): Omit<TimelineProps, "timelineEntries"> {
  return {
    isWorking: false,
    activeTurnInProgress: false,
    listRef: createRef<LegendListRef | null>(),
    latestRun: null,
    turnDiffSummaries: [],
    runs: [],
    routeThreadKey: `environment-local:thread-${Math.random().toString(36).slice(2)}`,
    onOpenTurnDiff: () => {},
    onOpenThread: () => {},
    onForkFromRun: async () => {},
    onRollbackCheckpoint: () => {},
    supportsConversationRollback: false,
    onRevertToTurnCount: () => {},
    isRevertingCheckpoint: false,
    onImageExpand: () => {},
    activeThreadEnvironmentId: ENVIRONMENT_ID,
    markdownCwd: undefined,
    resolvedTheme: "light",
    timestampFormat: "locale",
    workspaceRoot: undefined,
    anchorMessageId: null,
    onAnchorReady: () => {},
    onAnchorSizeChanged: () => {},
    contentInsetEndAdjustment: 0,
    emptyPlaceholderInset: 0,
    liveFollowEnabled: true,
    onIsAtEndChange: () => {},
    onManualNavigation: () => {},
  };
}

function userEntry(
  text: string,
  overrides: Partial<Extract<Entry, { kind: "message" }>["message"]> = {},
): Entry {
  return {
    id: "entry-message-1",
    kind: "message",
    createdAt: CREATED_AT,
    message: {
      id: MessageId.make("message-1"),
      role: "user",
      text,
      runId: null,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      streaming: false,
      ...overrides,
    },
  };
}

function renderTimeline(entries: ReadonlyArray<Entry>, props: Partial<TimelineProps> = {}) {
  const container = document.createElement("div");
  container.style.cssText = "height: 1200px; width: 900px; display: flex; flex-direction: column;";
  return render(
    <MessagesTimeline {...baseProps()} timelineEntries={entries as Entry[]} {...props} />,
    { container },
  );
}

describe("fork timeline message presentation", () => {
  it("renders retained context chips beside upstream review without generated blocks", async () => {
    const terminal = {
      id: "synthetic-terminal",
      threadId: ThreadId.make("thread-1"),
      createdAt: CREATED_AT,
      terminalId: "synthetic",
      terminalLabel: "Synthetic terminal",
      lineStart: 1,
      lineEnd: 1,
      text: "ready",
    };
    const annotation = {
      id: "synthetic-preview",
      pageUrl: "https://example.test",
      pageTitle: "Synthetic preview",
      comment: "Adjust spacing",
      elements: [],
      regions: [],
      strokes: [],
      styleChanges: [],
      screenshot: null,
      createdAt: CREATED_AT,
    };
    const review = buildFileReviewComment({
      id: "synthetic-review",
      filePath: "src/example.ts",
      startLine: 1,
      endLine: 1,
      text: "Retain review",
      contents: "export const value = 1;",
    });
    const authoredPrompt = "  Preserve this prompt\n\n ";
    const text = normalizeReferencedChatPrompt(
      `${authoredPrompt}${[
        terminalContextReference(terminal),
        previewAnnotationContextReference(annotation),
        reviewCommentContextReference(review),
      ]
        .map(formatInlineContextReference)
        .join(" ")}`,
      true,
    );
    const context = buildMessageContext({
      terminalContexts: [terminal],
      previewAnnotations: [annotation],
      reviewComments: [review],
    });

    await using screen = await renderTimeline([userEntry(text, { context })]);
    const rendered = screen.container.textContent ?? "";

    expect(text.startsWith(authoredPrompt)).toBe(true);
    expect(rendered).toContain("Preserve this prompt");
    expect(rendered).toContain("Synthetic terminal");
    expect(rendered).toContain("example.ts L1");
    expect(rendered).not.toContain("<terminal_context>");
    expect(rendered).not.toContain("<preview_annotation>");
    expect(rendered).not.toContain("<review_comment");
  });

  it("hides a leading Poteto invocation line while keeping the authored body", async () => {
    await using screen = await renderTimeline([userEntry("$poteto-mode\nShip the fix")]);
    const rendered = screen.container.textContent ?? "";

    expect(rendered).toContain("Ship the fix");
    expect(rendered).not.toContain("$poteto-mode");
  });

  it("spaces the conversation top independently of the titlebar fade depth", async () => {
    const byClass = (root: HTMLElement, className: string) =>
      [...root.querySelectorAll("div")].filter((node) => node.className === className);
    {
      await using screen = await renderTimeline([userEntry("Hello")], { topFadeEnabled: true });
      expect(byClass(screen.container, chatTimelinePresentation.fadeHeaderClassName)).toHaveLength(
        1,
      );
      // Only the bottom spacer keeps the compact height.
      expect(byClass(screen.container, "h-3 sm:h-4")).toHaveLength(1);
    }
    {
      await using screen = await renderTimeline([userEntry("Hello")]);
      expect(byClass(screen.container, chatTimelinePresentation.fadeHeaderClassName)).toHaveLength(
        0,
      );
      // Without the fade the leading header and bottom spacer both use the compact height.
      expect(byClass(screen.container, "h-3 sm:h-4")).toHaveLength(2);
    }
  });
});
