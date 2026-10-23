/** Join a generated context block without normalizing the authored prefix. */
export function appendPromptContext(prompt: string, block: string): string {
  if (!block) return prompt;
  return prompt.length > 0 ? `${prompt}\n\n${block}` : block;
}

/** Remove only the separator inserted at one generated-context boundary. */
export function removePromptContextSeparator(prompt: string): string {
  return prompt.endsWith("\n\n") ? prompt.slice(0, -2) : prompt;
}
