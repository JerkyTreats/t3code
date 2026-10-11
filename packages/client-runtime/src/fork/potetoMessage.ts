/** Hide a leading workflow invocation in chat while preserving the stored provider prompt. */
export function presentPotetoMessage(text: string): string {
  return text.replace(/^\$poteto-mode\r?\n(?=[\s\S]*\S)/u, "");
}
