import {
  EnvironmentId,
  MessageId,
  ThreadId,
  TurnItemId,
  type ElementContextRecord,
  type OrchestrationMessageContext,
} from "@t3tools/contracts";
import { toKindScopedComposerContextId } from "@t3tools/shared/composerContextReferences";
import * as DateTime from "effect/DateTime";
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
import { deriveTimelineEntriesFromVisibleTurnItems } from "../session-logic";
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

// Exposes the exact bytes the copy action would write without driving the clipboard.
vi.mock(import("../components/chat/MessageCopyButton"), () => ({
  MessageCopyButton: (({ text, label = "Copy message" }: { text: string; label?: string }) => (
    <button type="button" aria-label={label} data-copy-text={text} />
  )) as never,
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

function copiedText(container: HTMLElement): string {
  return (
    container.querySelector('[aria-label="Copy message"]')?.getAttribute("data-copy-text") ?? ""
  );
}

function chipKinds(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll("[data-markdown-copy]"),
    (chip) =>
      /t3-context:\/\/v1\/([^/]+)\//.exec(chip.getAttribute("data-markdown-copy") ?? "")?.[1],
  )
    .filter((kind) => kind !== undefined)
    .toSorted();
}

const MIXED_CHIP_KINDS = ["element", "preview-annotation", "review-comment", "terminal"];

function mixedContextMessage(): {
  authoredPrompt: string;
  text: string;
  context: OrchestrationMessageContext;
} {
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
  const element: ElementContextRecord = {
    version: 1,
    kind: "element",
    contextId: toKindScopedComposerContextId("element", "synthetic-element"),
    label: "SaveButton",
    pageUrl: "https://example.test",
    pageTitle: "Synthetic preview",
    tagName: "button",
    selector: "button.save",
    htmlPreview: "<button>Save</button>",
    componentName: "SaveButton",
    source: null,
    styles: "",
  };
  const authoredPrompt = "  Preserve this prompt\n\n ";
  const text = normalizeReferencedChatPrompt(
    `${authoredPrompt}${[
      terminalContextReference(terminal),
      { kind: "element" as const, contextId: element.contextId, label: element.label },
      previewAnnotationContextReference(annotation),
      reviewCommentContextReference(review),
    ]
      .map(formatInlineContextReference)
      .join(" ")}\n `,
    true,
  );
  const structured = buildMessageContext({
    terminalContexts: [terminal],
    previewAnnotations: [annotation],
    reviewComments: [review],
  });
  return {
    authoredPrompt,
    text,
    context: { version: 1, records: [...(structured?.records ?? []), element] },
  };
}

describe("fork timeline message presentation", () => {
  it("renders retained context chips beside upstream review without generated blocks", async () => {
    const { authoredPrompt, text, context } = mixedContextMessage();

    await using screen = await renderTimeline([userEntry(text, { context })]);
    const rendered = screen.container.textContent ?? "";

    expect(rendered).toContain("Preserve this prompt");
    expect(rendered).toContain("Synthetic terminal");
    expect(rendered).toContain("Adjust spacing");
    expect(rendered).toContain("SaveButton");
    expect(rendered).toContain("example.ts L1");
    for (const tag of ["terminal_context", "element_context", "preview_annotation"]) {
      expect(rendered).not.toContain(`<${tag}>`);
    }
    expect(rendered).not.toContain("<review_comment");
    expect(chipKinds(screen.container)).toEqual(MIXED_CHIP_KINDS);
    expect(copiedText(screen.container)).toBe(text);
    expect(copiedText(screen.container).startsWith(authoredPrompt)).toBe(true);
  });

  it("projects a v2 user message item with its retained context into the timeline", async () => {
    const { authoredPrompt, text, context } = mixedContextMessage();
    const createdAt = DateTime.makeUnsafe(CREATED_AT);
    const itemId = TurnItemId.make("item-1");
    const entries = deriveTimelineEntriesFromVisibleTurnItems({
      optimisticMessages: [],
      visibleTurnItems: [
        {
          position: 0,
          visibility: "local",
          sourceThreadId: ThreadId.make("thread-1"),
          sourceItemId: itemId,
          item: {
            id: itemId,
            threadId: ThreadId.make("thread-1"),
            runId: null,
            nodeId: null,
            providerThreadId: null,
            providerTurnId: null,
            nativeItemRef: null,
            parentItemId: null,
            ordinal: 0,
            status: "completed",
            title: null,
            startedAt: createdAt,
            completedAt: createdAt,
            updatedAt: createdAt,
            createdBy: "user",
            creationSource: "web",
            type: "user_message",
            messageId: MessageId.make("message-1"),
            inputIntent: "turn_start",
            text,
            context,
            attachments: [],
          },
        },
      ],
    });

    expect(entries[0]).toMatchObject({
      kind: "message",
      message: { text, context },
      projectedItem: { item: { id: itemId } },
    });

    await using screen = await renderTimeline(entries);
    const rendered = screen.container.textContent ?? "";

    expect(rendered).toContain("Synthetic terminal");
    expect(rendered).toContain("Adjust spacing");
    expect(rendered).toContain("SaveButton");
    expect(rendered).not.toContain("<element_context>");
    expect(chipKinds(screen.container)).toEqual(MIXED_CHIP_KINDS);
    expect(copiedText(screen.container).startsWith(authoredPrompt)).toBe(true);
    expect(copiedText(screen.container).endsWith(text.slice(authoredPrompt.length))).toBe(true);
  });

  it("upgrades a retained legacy selected element block into a chip", async () => {
    const authoredPrompt = "\n  Older element prompt\t";
    await using screen = await renderTimeline([
      userEntry(
        `${authoredPrompt}\n\n<element_context>\n- <LegacyCard>:\n  url: https://example.test/\n</element_context>`,
      ),
    ]);
    const rendered = screen.container.textContent ?? "";

    expect(rendered).toContain("Older element prompt");
    expect(rendered).toContain("LegacyCard");
    expect(chipKinds(screen.container)).toEqual(["element"]);
    expect(rendered).not.toContain("<element_context>");
    expect(copiedText(screen.container).startsWith(authoredPrompt)).toBe(true);
  });

  it("hides a leading Poteto invocation line while keeping the authored body", async () => {
    await using screen = await renderTimeline([userEntry("$poteto-mode\nShip the fix")]);
    const rendered = screen.container.textContent ?? "";

    expect(rendered).toContain("Ship the fix");
    expect(rendered).not.toContain("$poteto-mode");
  });

  it("spaces the conversation top independently of the titlebar fade depth", async () => {
    await using screen = await renderTimeline([userEntry("Hello")], { topFadeEnabled: true });

    expect(
      screen.container.querySelector(
        `.${chatTimelinePresentation.fadeHeaderClassName.split(" ")[0]}`,
      ),
    ).not.toBeNull();
  });
});
