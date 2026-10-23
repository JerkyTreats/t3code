export type CliRunner = "npx" | "pnpm dlx" | "bunx";

/**
 * Detect public package-runner cache entries so follow-up guidance can reuse
 * the already-running bytes without asking the runner to resolve T3 again.
 */
export function detectCliRunner(entryPath: string): CliRunner | null {
  const path = entryPath.replaceAll("\\", "/");
  if (path.includes("/_npx/")) {
    return "npx";
  }
  if (
    path.includes("/pnpm/dlx/") ||
    path.includes("/.pnpm/dlx/") ||
    path.includes("/pnpm-cache/dlx/")
  ) {
    return "pnpm dlx";
  }
  if (path.includes("/.bun/install/cache/") || path.includes("/bunx-")) {
    return "bunx";
  }
  return null;
}

/** Quote one copyable argument for the host's ordinary interactive shell. */
function quoteShellWord(word: string, platform: NodeJS.Platform): string {
  const safeWord = platform === "win32" ? /^[\w./:\\@=-]+$/u : /^[\w./:@=-]+$/u;
  if (safeWord.test(word)) return word;
  return platform === "win32"
    ? `'${word.replaceAll("'", "''")}'`
    : `'${word.replaceAll("'", "'\\''")}'`;
}

function formatExplicitNodeInvocation(input: {
  readonly executablePath: string;
  readonly entryPath: string;
  readonly subcommand: string;
  readonly platform: NodeJS.Platform;
}): string {
  const executable = quoteShellWord(input.executablePath, input.platform);
  const executableCommand =
    input.platform === "win32" && executable !== input.executablePath
      ? `& ${executable}`
      : executable;
  return [
    executableCommand,
    quoteShellWord(input.entryPath, input.platform),
    quoteShellWord(input.subcommand, input.platform),
  ].join(" ");
}

/**
 * Render a follow-up command without creating a new public-registry T3
 * resolution. Installed runtimes keep the normal `t3` command. A process that
 * came from a transient package runner instead names its current executable
 * and entry script exactly, with host-shell quoting.
 */
export function formatCliCommand(input: {
  readonly subcommand: string;
  readonly executablePath: string;
  readonly entryPath: string;
  readonly platform: NodeJS.Platform;
}): string {
  if (
    detectCliRunner(input.entryPath) === null ||
    input.executablePath.length === 0 ||
    input.entryPath.length === 0
  ) {
    return `t3 ${quoteShellWord(input.subcommand, input.platform)}`;
  }
  return formatExplicitNodeInvocation(input);
}
