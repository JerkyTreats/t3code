/** Keep authored bytes when structured terminal or preview context travels beside the message. */
export function normalizeReferencedChatPrompt(prompt: string, hasRetainedContext: boolean): string {
  return hasRetainedContext ? prompt : prompt.trim();
}
