import { applyClaudePromptEffortPrefix } from "@t3tools/shared/model";

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
