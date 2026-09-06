import type { PreviewAnnotationPayload } from "@t3tools/contracts";
import {
  appendElementContextsToPrompt,
  extractTrailingElementContexts,
  type ElementContextSelection,
} from "../lib/elementContext";
import {
  appendTerminalContextsToPrompt,
  extractTrailingTerminalContexts,
  filterTerminalContextsWithText,
  type TerminalContextSelection,
} from "../lib/terminalContext";
import {
  appendPreviewAnnotationPrompt,
  extractTrailingPreviewAnnotation,
  type ParsedPreviewAnnotation,
} from "../lib/previewAnnotation";
import {
  appendReviewCommentsToPrompt,
  parseReviewCommentMessageSegments,
  type ReviewCommentContext,
} from "../reviewCommentContext";
import { appendPromptContext, removePromptContextSeparator } from "./promptContextWhitespace";

export function composeChatPrompt(input: {
  prompt: string;
  terminalContexts: ReadonlyArray<TerminalContextSelection>;
  elementContexts: ReadonlyArray<ElementContextSelection>;
  previewAnnotations: ReadonlyArray<PreviewAnnotationPayload>;
  reviewComments: ReadonlyArray<ReviewCommentContext>;
}): string {
  const terminalContexts = filterTerminalContextsWithText(input.terminalContexts);
  const hasRetainedContext =
    terminalContexts.length > 0 ||
    input.elementContexts.length > 0 ||
    input.previewAnnotations.length > 0;
  let text = appendElementContextsToPrompt(
    appendTerminalContextsToPrompt(input.prompt, terminalContexts),
    input.elementContexts,
  );
  for (const annotation of input.previewAnnotations)
    text = appendPreviewAnnotationPrompt(text, annotation);
  if (!hasRetainedContext) return appendReviewCommentsToPrompt(text.trim(), input.reviewComments);
  // Review owns its wire formatting. Treat its output as an opaque suffix so
  // its ordinary trim cannot normalize an already composed authored prefix.
  return appendPromptContext(text, appendReviewCommentsToPrompt("", input.reviewComments));
}

export function projectChatPromptForDisplay(messageText: string) {
  const segments = parseReviewCommentMessageSegments(messageText);
  const first = segments[0];
  const hasTrailingReview = first?.kind === "text" && segments[1]?.kind === "review-comment";
  const prefix = hasTrailingReview ? removePromptContextSeparator(first.text) : messageText;
  const reviewSuffix = hasTrailingReview ? messageText.slice(first.text.length) : "";
  const previewAnnotations: ParsedPreviewAnnotation[] = [];
  let text = prefix;
  // Strip in reverse send order before asking terminal and element extractors
  // for their blocks. A later preview or review block must not hide them.
  while (true) {
    const next = extractTrailingPreviewAnnotation(text);
    if (!next.annotation) break;
    previewAnnotations.unshift(next.annotation);
    text = next.promptText;
  }
  const elements = extractTrailingElementContexts(text);
  const terminal = extractTrailingTerminalContexts(elements.promptText);
  const hasRetainedContext =
    previewAnnotations.length > 0 || elements.contextCount > 0 || terminal.contextCount > 0;
  return {
    authoredText: hasRetainedContext ? terminal.promptText : messageText,
    visibleText: hasRetainedContext
      ? appendPromptContext(terminal.promptText, reviewSuffix)
      : messageText,
    copyText: messageText,
    terminalContexts: terminal.contexts,
    elementContexts: elements.contexts,
    previewAnnotations,
    hasRetainedContext,
  };
}
