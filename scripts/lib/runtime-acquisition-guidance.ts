/** User guidance may launch installed T3 bytes, but cannot acquire them from a public registry. */
export function assertNoPublicT3Acquisition(source: string, label: string): void {
  const runner =
    /\b(?:npx|bunx|pnpm\s+dlx|npm\s+exec)(?:\s+--?[\w=-]+)*\s+(?:--\s+)?t3(?:@[^\s"'<>`]+)?(?=[\s"'<>`]|$)/iu;
  const install =
    /\b(?:npm\s+(?:install|i)|pnpm\s+add|yarn\s+(?:global\s+)?add|bun\s+add)(?:\s+--?[\w=-]+)*\s+t3(?:@[^\s"'<>`]+)?(?=[\s"'<>`]|$)/iu;
  if (runner.test(source) || install.test(source)) {
    throw new Error(`${label} directs users to acquire T3 from a public package registry.`);
  }
}
