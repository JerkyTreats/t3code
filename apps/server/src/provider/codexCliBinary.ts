// @effect-diagnostics nodeBuiltinImport:off
import { spawnSync } from "node:child_process";

import {
  compareCodexCliVersions,
  formatCodexCliUpgradeMessage,
  isCodexCliVersionSupported,
  parseCodexCliVersion,
} from "./codexCliVersion.ts";

const CODEX_VERSION_CHECK_TIMEOUT_MS = 4_000;

export interface CodexCliBinaryCandidate {
  readonly binaryPath: string;
  readonly version: string | null;
}

export type CodexCliBinaryResolutionResult =
  | {
      readonly _tag: "success";
      readonly candidate: CodexCliBinaryCandidate;
    }
  | {
      readonly _tag: "error";
      readonly error: Error;
    };

export interface CodexCliBinaryResolutionInput {
  readonly preferredBinaryPath?: string;
  readonly respectPreferredBinaryPath?: boolean;
  readonly cwd: string;
  readonly homePath?: string;
  readonly environment?: NodeJS.ProcessEnv;
}

function collectCodexCliBinaryCandidates(
  input: Pick<CodexCliBinaryResolutionInput, "preferredBinaryPath" | "respectPreferredBinaryPath">,
  environment: NodeJS.ProcessEnv,
): ReadonlyArray<string> {
  const preferred = input.preferredBinaryPath?.trim();
  if (preferred && preferred !== "codex" && input.respectPreferredBinaryPath) {
    return [preferred];
  }

  return [input.preferredBinaryPath, environment.CODEX_BINARY_PATH, "codex"].filter(
    (value, index, values): value is string => {
      if (!value || value.trim().length === 0) {
        return false;
      }
      return values.indexOf(value) === index;
    },
  );
}

export function assertSupportedCodexCliVersion(
  input: Omit<
    CodexCliBinaryResolutionInput,
    "preferredBinaryPath" | "respectPreferredBinaryPath"
  > & {
    readonly binaryPath: string;
  },
): CodexCliBinaryCandidate {
  const environment = input.environment ?? process.env;
  const result = spawnSync(input.binaryPath, ["--version"], {
    cwd: input.cwd,
    env: {
      ...environment,
      ...(input.homePath ? { CODEX_HOME: input.homePath } : {}),
    },
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: CODEX_VERSION_CHECK_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });

  if (result.error) {
    const lower = result.error.message.toLowerCase();
    if (
      lower.includes("enoent") ||
      lower.includes("command not found") ||
      lower.includes("not found")
    ) {
      throw new Error(`spawn ${input.binaryPath} ENOENT`);
    }
    throw new Error(
      `Failed to execute Codex CLI version check: ${result.error.message || String(result.error)}`,
    );
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const detail = stderr.trim() || stdout.trim() || `Command exited with code ${result.status}.`;
    throw new Error(`Codex CLI version check failed. ${detail}`);
  }

  const parsedVersion = parseCodexCliVersion(`${stdout}\n${stderr}`);
  if (parsedVersion && !isCodexCliVersionSupported(parsedVersion)) {
    throw new Error(formatCodexCliUpgradeMessage(parsedVersion));
  }

  return {
    binaryPath: input.binaryPath,
    version: parsedVersion,
  };
}

export function resolveSupportedCodexCliBinaries(
  input: CodexCliBinaryResolutionInput,
): ReadonlyArray<CodexCliBinaryCandidate> {
  const environment = input.environment ?? process.env;
  const candidates = collectCodexCliBinaryCandidates(input, environment);
  const supported: CodexCliBinaryCandidate[] = [];
  let firstError: Error | undefined;

  for (const candidate of candidates) {
    try {
      supported.push(
        assertSupportedCodexCliVersion({
          binaryPath: candidate,
          cwd: input.cwd,
          environment,
          ...(input.homePath ? { homePath: input.homePath } : {}),
        }),
      );
    } catch (error) {
      if (!firstError) {
        firstError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  if (supported.length === 0) {
    throw firstError ?? new Error("Codex CLI is not installed or not executable.");
  }

  return supported;
}

function choosePreferredBinary(
  candidates: ReadonlyArray<CodexCliBinaryCandidate>,
): CodexCliBinaryCandidate {
  let best = candidates[0];
  if (!best) {
    throw new Error("Codex CLI is not installed or not executable.");
  }

  for (const candidate of candidates.slice(1)) {
    if (!candidate.version) {
      continue;
    }
    if (!best.version || compareCodexCliVersions(candidate.version, best.version) > 0) {
      best = candidate;
    }
  }

  return best;
}

export function resolveSupportedCodexCliBinary(
  input: CodexCliBinaryResolutionInput,
): CodexCliBinaryCandidate {
  return choosePreferredBinary(resolveSupportedCodexCliBinaries(input));
}

export function resolveSupportedCodexCliBinaryResult(
  input: CodexCliBinaryResolutionInput,
): CodexCliBinaryResolutionResult {
  try {
    return {
      _tag: "success",
      candidate: resolveSupportedCodexCliBinary(input),
    };
  } catch (error) {
    return {
      _tag: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
