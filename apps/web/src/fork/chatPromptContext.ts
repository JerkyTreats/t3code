import type { OrchestrationMessageContext } from "@t3tools/contracts";
import { applyClaudePromptEffortPrefix } from "@t3tools/shared/model";
import { resolvePlanFollowUpSubmission } from "../proposedPlan";

/** Keep authored bytes when structured terminal or preview context travels beside the message. */
export function normalizeReferencedChatPrompt(prompt: string, hasRetainedContext: boolean): string {
  return hasRetainedContext ? prompt : prompt.trim();
}

/** Keep upstream effort selection and its generated prefix around exact authored bytes. */
export function formatReferencedChatPrompt(
  prompt: string,
  effort: string | null | undefined,
  hasRetainedContext: boolean,
): string {
  const formatted = applyClaudePromptEffortPrefix(prompt, effort);
  if (!hasRetainedContext) return formatted;
  const generatedPrefix = formatted.slice(0, formatted.length - prompt.trim().length);
  return `${generatedPrefix}${prompt}`;
}

/** Structured V2 context keeps the same authored-byte boundary on sends and queued edits. */
export function hasRetainedChatPromptContext(
  context: OrchestrationMessageContext | null | undefined,
): boolean {
  return (
    context?.records.some(
      (record) =>
        record.kind === "terminal" ||
        record.kind === "element" ||
        record.kind === "preview-annotation",
    ) === true
  );
}

/** Preserve contextual authored bytes before upstream refinement or generated plan approval. */
export function resolveReferencedPlanFollowUpSubmission(input: {
  draftText: string;
  planMarkdown: string;
  hasRetainedContext: boolean;
}) {
  const submission = resolvePlanFollowUpSubmission(input);
  if (!input.hasRetainedContext) return submission;
  return {
    ...submission,
    text:
      submission.interactionMode === "plan"
        ? input.draftText
        : `${input.draftText}${submission.text}`,
  };
}
