/** Applies per-turn speech guidance only to provider input, never the visible user message. */
export function applyResponseStyle(text: string, style?: "voice" | "text"): string {
  // Provider-native slash commands must retain their exact argument grammar.
  if (style === undefined || text.trimStart().startsWith("/")) return text;
  const instruction =
    style === "voice"
      ? "Voice mode is enabled for this turn. Your final response will be spoken verbatim. Write it as natural, concise conversational speech with complete sentences. Avoid Markdown formatting, tables, code blocks, raw URLs, and lists unless the user explicitly needs them. Do not produce a separate spoken summary or rewrite. Preserve the substance of the answer. This applies only to this turn."
      : "Text mode is enabled for this turn. Prior voice-mode formatting guidance no longer applies. Respond normally, using formatting and code when useful.";
  return `${text}\n\n<response_style>\n${instruction}\n</response_style>`;
}
