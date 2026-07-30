import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "./lib/terminalContext";

export function promptTextForStash(prompt: string): string {
  return prompt.split(INLINE_TERMINAL_CONTEXT_PLACEHOLDER).join("");
}

export function mergeStashedPrompt(currentPrompt: string, stashedPrompt: string): string {
  if (stashedPrompt.length === 0) return currentPrompt;
  if (currentPrompt.length === 0) return stashedPrompt;
  return `${currentPrompt}\n\n${stashedPrompt}`;
}
