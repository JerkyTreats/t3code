/** Mermaid fence languages that render as a diagram rather than highlighted source. */
export function isMermaidFenceLanguage(language: string): boolean {
  const normalized = language.toLowerCase();
  return normalized === "mermaid" || normalized === "mmd";
}
