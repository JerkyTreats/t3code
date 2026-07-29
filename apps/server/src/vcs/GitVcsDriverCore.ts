import * as Arr from "effect/Array";
import * as Cache from "effect/Cache";
import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  GitCommandError,
  type ReviewDiffPreviewInput,
  type ReviewDiffPreviewSource,
  type VcsRef,
} from "@t3tools/contracts";
import { dedupeRemoteBranchesWithLocalMatches, normalizeGitRemoteUrl } from "@t3tools/shared/git";
import { compactTraceAttributes } from "@t3tools/shared/observability";
import { decodeJsonResult } from "@t3tools/shared/schemaJson";
import { gitCommandDuration, gitCommandsTotal, withMetrics } from "../observability/Metrics.ts";
import * as GitVcsDriver from "./GitVcsDriver.ts";
import {
  parseRemoteNames,
  parseRemoteNamesInGitOrder,
  parseRemoteRefWithRemoteNames,
} from "../git/remoteRefs.ts";
import { ServerConfig } from "../config.ts";
import { isOriginRemoteName, ORIGIN_REMOTE_NAME } from "../fork/originOnlySourceControlPolicy.ts";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;
const OUTPUT_TRUNCATED_MARKER = "\n\n[truncated]";
const PREPARED_COMMIT_PATCH_MAX_OUTPUT_BYTES = 49_000;
const RANGE_COMMIT_SUMMARY_MAX_OUTPUT_BYTES = 19_000;
const RANGE_DIFF_SUMMARY_MAX_OUTPUT_BYTES = 19_000;
const RANGE_DIFF_PATCH_MAX_OUTPUT_BYTES = 59_000;
const REVIEW_DIFF_PATCH_MAX_OUTPUT_BYTES = 120_000;
const REVIEW_UNTRACKED_DIFF_MAX_OUTPUT_BYTES = 80_000;
const WORKSPACE_FILES_MAX_OUTPUT_BYTES = 120_000;
const STATUS_UPSTREAM_REFRESH_INTERVAL = Duration.seconds(15);
const STATUS_UPSTREAM_REFRESH_TIMEOUT = Duration.seconds(5);

const STATUS_UPSTREAM_REFRESH_FAILURE_COOLDOWN = Duration.seconds(5);
const STATUS_UPSTREAM_REFRESH_CACHE_CAPACITY = 2_048;
const LIST_REFS_SNAPSHOT_CACHE_CAPACITY = 64;
const LIST_REFS_SNAPSHOT_CACHE_TTL = Duration.minutes(2);
const LIST_REFS_REFRESH_COALESCE_MS = 5_000;
const STATUS_UPSTREAM_REFRESH_ENV = Object.freeze({
  GCM_INTERACTIVE: "never",
  GIT_ASKPASS: "",
  GIT_TERMINAL_PROMPT: "0",
  SSH_ASKPASS: "",
  SSH_ASKPASS_REQUIRE: "never",
} satisfies NodeJS.ProcessEnv);
const DEFAULT_BASE_BRANCH_CANDIDATES = ["main", "master"] as const;
const GIT_LIST_BRANCHES_DEFAULT_LIMIT = 100;
const NON_REPOSITORY_STATUS_DETAILS = Object.freeze<GitVcsDriver.GitStatusDetails>({
  isRepo: false,
  hasOriginRemote: false,
  isDefaultBranch: false,
  branch: null,
  upstreamRef: null,
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
  hasUpstream: false,
  aheadCount: 0,
  behindCount: 0,
  aheadOfDefaultCount: 0,
});
const NON_REPOSITORY_REMOTE_STATUS_DETAILS = Object.freeze<GitVcsDriver.GitRemoteStatusDetails>({
  isRepo: false,
  isDefaultBranch: false,
  branch: null,
  upstreamRef: null,
  hasUpstream: false,
  aheadCount: 0,
  behindCount: 0,
  aheadOfDefaultCount: 0,
});

type TraceTailState = {
  processedChars: number;
  remainder: string;
};

class StatusRemoteRefreshCacheKey extends Data.Class<{
  gitCommonDir: string;
  remoteName: string;
}> {}

class GitRefsSnapshotCacheKey extends Data.Class<{
  gitCommonDir: string;
  generation: number;
}> {}

interface GitRefsGenerationState {
  readonly generation: number;
  readonly refreshedAtMs: number;
}

interface GitRefsSnapshotEntry {
  readonly ref: VcsRef;
  readonly lastCommit: number;
}

interface GitRefsSnapshot {
  readonly localBranches: ReadonlyArray<GitRefsSnapshotEntry>;
  readonly remoteBranches: ReadonlyArray<GitRefsSnapshotEntry>;
  readonly hasPrimaryRemote: boolean;
}

interface ExecuteGitOptions {
  stdin?: string | undefined;
  timeoutMs?: number | undefined;
  allowNonZeroExit?: boolean | undefined;
  fallbackErrorDetail?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  maxOutputBytes?: number | undefined;
  appendTruncationMarker?: boolean | undefined;
  progress?: GitVcsDriver.ExecuteGitProgress | undefined;
}

function parseBranchAb(value: string): { ahead: number; behind: number } {
  const match = value.match(/^\+(\d+)\s+-(\d+)$/);
  if (!match) return { ahead: 0, behind: 0 };
  return {
    ahead: Number(match[1] ?? "0"),
    behind: Number(match[2] ?? "0"),
  };
}

function parseNumstatEntries(
  stdout: string,
): Array<{ path: string; insertions: number; deletions: number }> {
  const entries: Array<{ path: string; insertions: number; deletions: number }> = [];
  for (const line of stdout.split(/\r?\n/g)) {
    if (line.trim().length === 0) continue;
    const [addedRaw, deletedRaw, ...pathParts] = line.split("\t");
    const rawPath =
      pathParts.length > 1 ? (pathParts.at(-1) ?? "").trim() : pathParts.join("\t").trim();
    if (rawPath.length === 0) continue;
    const added = Number.parseInt(addedRaw ?? "0", 10);
    const deleted = Number.parseInt(deletedRaw ?? "0", 10);
    const renameArrowIndex = rawPath.indexOf(" => ");
    const normalizedPath =
      renameArrowIndex >= 0 ? rawPath.slice(renameArrowIndex + " => ".length).trim() : rawPath;
    entries.push({
      path: normalizedPath.length > 0 ? normalizedPath : rawPath,
      insertions: Number.isFinite(added) ? added : 0,
      deletions: Number.isFinite(deleted) ? deleted : 0,
    });
  }
  return entries;
}

function parsePorcelainPath(line: string): string | null {
  if (line.startsWith("? ") || line.startsWith("! ")) {
    const simple = line.slice(2).trim();
    return simple.length > 0 ? simple : null;
  }

  if (!(line.startsWith("1 ") || line.startsWith("2 ") || line.startsWith("u "))) {
    return null;
  }

  const tabIndex = line.indexOf("\t");
  if (tabIndex >= 0) {
    const fromTab = line.slice(tabIndex + 1);
    const [filePath] = fromTab.split("\t");
    return filePath?.trim().length ? filePath.trim() : null;
  }

  const parts = line.trim().split(/\s+/g);
  const filePath = parts.at(-1) ?? "";
  return filePath.length > 0 ? filePath : null;
}

function parseWorktreeBranchPaths(stdout: string): ReadonlyMap<string, string> {
  const worktreePaths = new Map<string, string>();
  let currentPath: string | null = null;
  let currentBranch: string | null = null;
  let prunable = false;

  const flush = () => {
    if (currentPath !== null && currentBranch !== null && !prunable) {
      worktreePaths.set(currentBranch, currentPath);
    }
    currentPath = null;
    currentBranch = null;
    prunable = false;
  };

  for (const field of stdout.split("\0")) {
    if (field === "") {
      flush();
    } else if (field.startsWith("worktree ")) {
      currentPath = field.slice("worktree ".length);
    } else if (field.startsWith("branch refs/heads/")) {
      currentBranch = field.slice("branch refs/heads/".length);
    } else if (field === "prunable" || field.startsWith("prunable ")) {
      prunable = true;
    }
  }
  flush();
  return worktreePaths;
}

function filterBranchesForListQuery(
  refs: ReadonlyArray<VcsRef>,
  query?: string,
): ReadonlyArray<VcsRef> {
  if (!query) {
    return refs;
  }

  const normalizedQuery = query.toLowerCase();
  return refs.filter((refName) => refName.name.toLowerCase().includes(normalizedQuery));
}

function paginateBranches(input: {
  refs: ReadonlyArray<VcsRef>;
  cursor?: number | undefined;
  limit?: number | undefined;
}): {
  refs: ReadonlyArray<VcsRef>;
  nextCursor: number | null;
  totalCount: number;
} {
  const cursor = input.cursor ?? 0;
  const limit = input.limit ?? GIT_LIST_BRANCHES_DEFAULT_LIMIT;
  const totalCount = input.refs.length;
  const refs = input.refs.slice(cursor, cursor + limit);
  const nextCursor = cursor + refs.length < totalCount ? cursor + refs.length : null;

  return {
    refs,
    nextCursor,
    totalCount,
  };
}

function splitNullSeparatedPaths(input: string, truncated: boolean): string[] {
  const parts = input.split("\0");
  if (parts.length === 0) return [];

  if (truncated && parts[parts.length - 1]?.length) {
    parts.pop();
  }

  return parts.filter((value) => value.length > 0);
}

export function splitNullSeparatedGitStdoutPaths(
  result: Pick<GitVcsDriver.ExecuteGitResult, "stdout" | "stdoutTruncated">,
): string[] {
  return splitNullSeparatedPaths(result.stdout, result.stdoutTruncated);
}

function sanitizeRemoteName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "fork";
}

function parseRemoteFetchUrls(stdout: string): Map<string, string> {
  const remotes = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(trimmed);
    if (!match) continue;
    const [, remoteName = "", remoteUrl = "", direction = ""] = match;
    if (direction !== "fetch" || remoteName.length === 0 || remoteUrl.length === 0) {
      continue;
    }
    remotes.set(remoteName, remoteUrl);
  }
  return remotes;
}

function parseUpstreamRefWithRemoteNames(
  upstreamRef: string,
  remoteNames: ReadonlyArray<string>,
): { upstreamRef: string; remoteName: string; branchName: string } | null {
  const parsed = parseRemoteRefWithRemoteNames(upstreamRef, remoteNames);
  if (!parsed) {
    return null;
  }

  return {
    upstreamRef,
    remoteName: parsed.remoteName,
    branchName: parsed.branchName,
  };
}

function parseUpstreamRefByFirstSeparator(
  upstreamRef: string,
): { upstreamRef: string; remoteName: string; branchName: string } | null {
  const separatorIndex = upstreamRef.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === upstreamRef.length - 1) {
    return null;
  }

  const remoteName = upstreamRef.slice(0, separatorIndex).trim();
  const branchName = upstreamRef.slice(separatorIndex + 1).trim();
  if (remoteName.length === 0 || branchName.length === 0) {
    return null;
  }

  return {
    upstreamRef,
    remoteName,
    branchName,
  };
}

function parseTrackingBranchByUpstreamRef(stdout: string, upstreamRef: string): string | null {
  for (const line of stdout.split("\n")) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      continue;
    }
    const [branchNameRaw, upstreamBranchRaw = ""] = trimmedLine.split("\t");
    const branchName = branchNameRaw?.trim() ?? "";
    const candidateUpstreamRef = upstreamBranchRaw.trim();
    if (branchName.length === 0 || candidateUpstreamRef.length === 0) {
      continue;
    }
    if (candidateUpstreamRef === upstreamRef) {
      return branchName;
    }
  }

  return null;
}

function deriveLocalBranchNameFromRemoteRef(branchName: string): string | null {
  const separatorIndex = branchName.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === branchName.length - 1) {
    return null;
  }
  const localBranch = branchName.slice(separatorIndex + 1).trim();
  return localBranch.length > 0 ? localBranch : null;
}

function gitCommandContext(
  input: Pick<GitVcsDriver.ExecuteGitInput, "operation" | "cwd" | "args">,
) {
  return {
    operation: input.operation,
    command: "git",
    cwd: input.cwd,
    argumentCount: input.args.length,
  } as const;
}

function parseDefaultBranchFromRemoteHeadRef(value: string, remoteName: string): string | null {
  const trimmed = value.trim();
  const prefix = `refs/remotes/${remoteName}/`;
  if (!trimmed.startsWith(prefix)) {
    return null;
  }
  const refName = trimmed.slice(prefix.length).trim();
  return refName.length > 0 ? refName : null;
}

function isMissingGitCwdError(error: GitCommandError): boolean {
  if (!(error.cause instanceof PlatformError.PlatformError)) {
    return false;
  }

  const reason = error.cause.reason;
  if (reason._tag === "NotFound") {
    return reason.pathOrDescriptor === error.cwd;
  }

  return (
    reason._tag === "BadResource" &&
    reason.pathOrDescriptor === error.cwd &&
    typeof reason.cause === "object" &&
    reason.cause !== null &&
    "code" in reason.cause &&
    reason.cause.code === "ENOTDIR"
  );
}

function isNonRepositoryGitStderr(stderr: string): boolean {
  return stderr.toLowerCase().includes("not a git repository");
}

interface Trace2Monitor {
  readonly env: NodeJS.ProcessEnv;
  readonly flush: Effect.Effect<void, never>;
}

const nowUnixNano = DateTime.now.pipe(
  Effect.map((now) => BigInt(DateTime.toEpochMillis(now)) * 1_000_000n),
);

const addCurrentSpanEvent = (name: string, attributes: Record<string, unknown>) =>
  Effect.gen(function* () {
    const span = yield* Effect.currentSpan;
    const timestamp = yield* nowUnixNano;
    yield* Effect.sync(() => {
      span.event(name, timestamp, compactTraceAttributes(attributes));
    });
  }).pipe(
    Effect.catchTags({
      NoSuchElementError: () => Effect.void,
    }),
  );

function trace2ChildKey(record: Record<string, unknown>): string | null {
  const childId = record.child_id;
  if (typeof childId === "number" || typeof childId === "string") {
    return String(childId);
  }
  const hookName = record.hook_name;
  return typeof hookName === "string" && hookName.trim().length > 0 ? hookName.trim() : null;
}

const Trace2Record = Schema.Record(Schema.String, Schema.Unknown);

const createTrace2Monitor = Effect.fn("createTrace2Monitor")(function* (
  input: Pick<GitVcsDriver.ExecuteGitInput, "operation" | "cwd" | "args">,
  progress: GitVcsDriver.ExecuteGitProgress | undefined,
): Effect.fn.Return<
  Trace2Monitor,
  PlatformError.PlatformError,
  Scope.Scope | FileSystem.FileSystem | Path.Path
> {
  if (!progress?.onHookStarted && !progress?.onHookFinished) {
    return {
      env: {},
      flush: Effect.void,
    };
  }

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const traceFilePath = yield* fs.makeTempFileScoped({
    prefix: `t3code-git-trace2-${process.pid}-`,
    suffix: ".json",
  });
  const hookStartByChildKey = new Map<string, { hookName: string; startedAtMs: number }>();
  const traceTailState = yield* Ref.make<TraceTailState>({
    processedChars: 0,
    remainder: "",
  });

  const handleTraceLine = Effect.fn("handleTraceLine")(function* (line: string) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      return;
    }

    const traceRecord = decodeJsonResult(Trace2Record)(trimmedLine);
    if (Result.isFailure(traceRecord)) {
      yield* Effect.logDebug(
        `GitVcsDriver.trace2: failed to parse trace line for ${input.operation} in ${input.cwd} (${input.args.length} arguments)`,
        traceRecord.failure,
      );
      return;
    }

    if (traceRecord.success.child_class !== "hook") {
      return;
    }

    const event = traceRecord.success.event;
    const childKey = trace2ChildKey(traceRecord.success);
    if (childKey === null) {
      return;
    }
    const started = hookStartByChildKey.get(childKey);
    const hookNameFromEvent =
      typeof traceRecord.success.hook_name === "string" ? traceRecord.success.hook_name.trim() : "";
    const hookName = hookNameFromEvent.length > 0 ? hookNameFromEvent : (started?.hookName ?? "");
    if (hookName.length === 0) {
      return;
    }

    if (event === "child_start") {
      const now = yield* DateTime.now;
      hookStartByChildKey.set(childKey, { hookName, startedAtMs: DateTime.toEpochMillis(now) });
      yield* addCurrentSpanEvent("git.hook.started", {
        hookName,
      });
      if (progress.onHookStarted) {
        yield* progress.onHookStarted(hookName);
      }
      return;
    }

    if (event === "child_exit") {
      hookStartByChildKey.delete(childKey);
      const code = traceRecord.success.exitCode;
      const exitCode = typeof code === "number" && Number.isInteger(code) ? code : null;
      const now = yield* DateTime.now;
      const durationMs = started
        ? Math.max(0, DateTime.toEpochMillis(now) - started.startedAtMs)
        : null;
      yield* addCurrentSpanEvent("git.hook.finished", {
        hookName: started?.hookName ?? hookName,
        exitCode,
        durationMs,
      });
      if (progress.onHookFinished) {
        yield* progress.onHookFinished({
          hookName: started?.hookName ?? hookName,
          exitCode,
          durationMs,
        });
      }
    }
  });

  const deltaMutex = yield* Semaphore.make(1);
  const readTraceDelta = deltaMutex.withPermit(
    fs.readFileString(traceFilePath).pipe(
      Effect.flatMap((contents) =>
        Effect.uninterruptible(
          Ref.modify(traceTailState, ({ processedChars, remainder }) => {
            if (contents.length <= processedChars) {
              return [[], { processedChars, remainder }];
            }

            const appended = contents.slice(processedChars);
            const combined = remainder + appended;
            const lines = combined.split("\n");
            const nextRemainder = lines.pop() ?? "";

            return [
              lines.map((line) => line.replace(/\r$/, "")),
              {
                processedChars: contents.length,
                remainder: nextRemainder,
              },
            ];
          }).pipe(
            Effect.flatMap((lines) => Effect.forEach(lines, handleTraceLine, { discard: true })),
          ),
        ),
      ),
      Effect.ignore({ log: true }),
    ),
  );
  const traceFileName = path.basename(traceFilePath);
  yield* Stream.runForEach(fs.watch(traceFilePath), (event) => {
    const eventPath = event.path;
    const isTargetTraceEvent =
      eventPath === traceFilePath ||
      eventPath === traceFileName ||
      path.basename(eventPath) === traceFileName;
    if (!isTargetTraceEvent) return Effect.void;
    return readTraceDelta;
  }).pipe(Effect.ignoreCause({ log: true }), Effect.forkScoped);

  const finalizeTrace2Monitor = Effect.fn("finalizeTrace2Monitor")(function* () {
    yield* readTraceDelta;
    const finalLine = yield* Ref.modify(traceTailState, ({ processedChars, remainder }) => [
      remainder.trim(),
      {
        processedChars,
        remainder: "",
      },
    ]);
    if (finalLine.length > 0) {
      yield* handleTraceLine(finalLine);
    }
  });

  yield* Effect.addFinalizer(finalizeTrace2Monitor);

  return {
    env: {
      GIT_TRACE2_EVENT: traceFilePath,
    },
    flush: readTraceDelta,
  };
});

const collectOutput = Effect.fnUntraced(function* (
  input: Pick<GitVcsDriver.ExecuteGitInput, "operation" | "cwd" | "args">,
  stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>,
  maxOutputBytes: number,
  appendTruncationMarker: boolean,
  onLine: ((line: string) => Effect.Effect<void, never>) | undefined,
): Effect.fn.Return<{ readonly text: string; readonly truncated: boolean }, GitCommandError> {
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  let lineBuffer = "";
  let truncated = false;

  const emitCompleteLines = Effect.fnUntraced(function* (flush: boolean) {
    let newlineIndex = lineBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = lineBuffer.slice(0, newlineIndex).replace(/\r$/, "");
      lineBuffer = lineBuffer.slice(newlineIndex + 1);
      if (line.length > 0 && onLine) {
        yield* onLine(line);
      }
      newlineIndex = lineBuffer.indexOf("\n");
    }

    if (flush) {
      const trailing = lineBuffer.replace(/\r$/, "");
      lineBuffer = "";
      if (trailing.length > 0 && onLine) {
        yield* onLine(trailing);
      }
    }
  });

  const processChunk = Effect.fnUntraced(function* (chunk: Uint8Array) {
    if (appendTruncationMarker && truncated) {
      return;
    }
    const nextBytes = bytes + chunk.byteLength;
    if (!appendTruncationMarker && nextBytes > maxOutputBytes) {
      return yield* new GitCommandError({
        ...gitCommandContext(input),
        detail: `Git output exceeded ${maxOutputBytes} bytes and was truncated.`,
        outputLength: nextBytes,
      });
    }

    const chunkToDecode =
      appendTruncationMarker && nextBytes > maxOutputBytes
        ? chunk.subarray(0, Math.max(0, maxOutputBytes - bytes))
        : chunk;
    bytes += chunkToDecode.byteLength;
    truncated = appendTruncationMarker && nextBytes > maxOutputBytes;

    const decoded = decoder.decode(chunkToDecode, { stream: !truncated });
    text += decoded;
    lineBuffer += decoded;
    yield* emitCompleteLines(false);
  });

  yield* Stream.runForEach(stream, processChunk).pipe(
    Effect.catchTags({
      PlatformError: (cause) =>
        new GitCommandError({
          ...gitCommandContext(input),
          detail: "Failed to read Git process output.",
          cause,
        }),
    }),
  );

  const remainder = truncated ? "" : decoder.decode();
  text += remainder;
  lineBuffer += remainder;
  yield* emitCompleteLines(true);
  return {
    text,
    truncated,
  };
});

export const makeGitVcsDriverCore = Effect.fn("makeGitVcsDriverCore")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const commandSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const { worktreesDir } = yield* ServerConfig;
  const crypto = yield* Crypto.Crypto;

  const executeRaw: GitVcsDriver.GitVcsDriver["Service"]["execute"] = Effect.fnUntraced(
    function* (input) {
      const commandInput = {
        ...input,
        args: [...input.args],
      } as const;
      const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const maxOutputBytes = input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
      const appendTruncationMarker = input.appendTruncationMarker ?? false;

      const runGitCommand = Effect.fn("runGitCommand")(function* () {
        const trace2Monitor = yield* createTrace2Monitor(commandInput, input.progress).pipe(
          Effect.provideService(Path.Path, path),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.mapError(
            (cause) =>
              new GitCommandError({
                ...gitCommandContext(commandInput),
                detail: "Failed to create Git trace monitor.",
                cause,
              }),
          ),
        );
        const child = yield* commandSpawner
          .spawn(
            ChildProcess.make("git", commandInput.args, {
              cwd: commandInput.cwd,
              env: {
                ...process.env,
                ...input.env,
                ...trace2Monitor.env,
              },
            }),
          )
          .pipe(
            Effect.mapError(
              (cause) =>
                new GitCommandError({
                  ...gitCommandContext(commandInput),
                  detail: "Failed to spawn Git process.",
                  cause,
                }),
            ),
          );

        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            collectOutput(
              commandInput,
              child.stdout,
              maxOutputBytes,
              appendTruncationMarker,
              input.progress?.onStdoutLine,
            ),
            collectOutput(
              commandInput,
              child.stderr,
              maxOutputBytes,
              appendTruncationMarker,
              input.progress?.onStderrLine,
            ),
            child.exitCode.pipe(
              Effect.mapError(
                (cause) =>
                  new GitCommandError({
                    ...gitCommandContext(commandInput),
                    detail: "Failed to read Git process exit code.",
                    cause,
                  }),
              ),
            ),
            input.stdin === undefined
              ? Effect.void
              : Stream.run(Stream.encodeText(Stream.make(input.stdin)), child.stdin).pipe(
                  Effect.mapError(
                    (cause) =>
                      new GitCommandError({
                        ...gitCommandContext(commandInput),
                        detail: "Failed to write Git process input.",
                        cause,
                      }),
                  ),
                ),
          ],
          { concurrency: "unbounded" },
        ).pipe(Effect.map(([stdout, stderr, exitCode]) => [stdout, stderr, exitCode] as const));
        yield* trace2Monitor.flush;

        if (!input.allowNonZeroExit && exitCode !== 0) {
          return yield* new GitCommandError({
            ...gitCommandContext(commandInput),
            detail: "Git command exited with a non-zero status.",
            exitCode,
            stdoutLength: stdout.text.length,
            stderrLength: stderr.text.length,
          });
        }

        return {
          exitCode,
          stdout: stdout.text,
          stderr: stderr.text,
          stdoutTruncated: stdout.truncated,
          stderrTruncated: stderr.truncated,
        } satisfies GitVcsDriver.ExecuteGitResult;
      });

      return yield* runGitCommand().pipe(
        Effect.scoped,
        Effect.timeoutOption(timeoutMs),
        Effect.flatMap((result) =>
          Option.match(result, {
            onNone: () =>
              Effect.fail(
                new GitCommandError({
                  ...gitCommandContext(commandInput),
                  detail: "Git command timed out.",
                }),
              ),
            onSome: Effect.succeed,
          }),
        ),
      );
    },
  );

  const execute: GitVcsDriver.GitVcsDriver["Service"]["execute"] = (input) =>
    executeRaw(input).pipe(
      withMetrics({
        counter: gitCommandsTotal,
        timer: gitCommandDuration,
        attributes: {
          operation: input.operation,
        },
      }),
      Effect.withSpan(input.operation, {
        kind: "client",
        attributes: {
          "git.operation": input.operation,
          "git.cwd": input.cwd,
          "git.args_count": input.args.length,
        },
      }),
    );

  const executeGit = (
    operation: string,
    cwd: string,
    args: readonly string[],
    options: ExecuteGitOptions = {},
  ): Effect.Effect<GitVcsDriver.ExecuteGitResult, GitCommandError> =>
    execute({
      operation,
      cwd,
      args,
      ...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
      ...(options.env !== undefined ? { env: options.env } : {}),
      allowNonZeroExit: true,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.maxOutputBytes !== undefined ? { maxOutputBytes: options.maxOutputBytes } : {}),
      ...(options.appendTruncationMarker !== undefined
        ? { appendTruncationMarker: options.appendTruncationMarker }
        : {}),
      ...(options.progress ? { progress: options.progress } : {}),
    }).pipe(
      Effect.flatMap((result) => {
        if (options.allowNonZeroExit || result.exitCode === 0) {
          return Effect.succeed(result);
        }
        return Effect.fail(
          new GitCommandError({
            ...gitCommandContext({ operation, cwd, args }),
            detail: options.fallbackErrorDetail ?? "Git command exited with a non-zero status.",
            ...(result.exitCode === null ? {} : { exitCode: result.exitCode }),
            stdoutLength: result.stdout.length,
            stderrLength: result.stderr.length,
          }),
        );
      }),
    );

  const runGit = (
    operation: string,
    cwd: string,
    args: readonly string[],
    allowNonZeroExit = false,
  ): Effect.Effect<void, GitCommandError> =>
    executeGit(operation, cwd, args, { allowNonZeroExit }).pipe(Effect.asVoid);

  const runGitStdout = (
    operation: string,
    cwd: string,
    args: readonly string[],
    allowNonZeroExit = false,
  ): Effect.Effect<string, GitCommandError> =>
    executeGit(operation, cwd, args, { allowNonZeroExit }).pipe(
      Effect.map((result) => result.stdout),
    );

  const runGitStdoutWithOptions = (
    operation: string,
    cwd: string,
    args: readonly string[],
    options: ExecuteGitOptions = {},
  ): Effect.Effect<string, GitCommandError> =>
    executeGit(operation, cwd, args, options).pipe(
      Effect.map((result) =>
        result.stdoutTruncated ? `${result.stdout}${OUTPUT_TRUNCATED_MARKER}` : result.stdout,
      ),
    );

  const branchExists = (cwd: string, refName: string): Effect.Effect<boolean, GitCommandError> =>
    executeGit(
      "GitVcsDriver.branchExists",
      cwd,
      ["show-ref", "--verify", "--quiet", `refs/heads/${refName}`],
      {
        allowNonZeroExit: true,
        timeoutMs: 5_000,
      },
    ).pipe(Effect.map((result) => result.exitCode === 0));

  const resolveAvailableBranchName = Effect.fn("resolveAvailableBranchName")(function* (
    cwd: string,
    desiredBranch: string,
  ) {
    const isDesiredTaken = yield* branchExists(cwd, desiredBranch);
    if (!isDesiredTaken) {
      return desiredBranch;
    }

    for (let suffix = 1; suffix <= 100; suffix += 1) {
      const candidate = `${desiredBranch}-${suffix}`;
      const isCandidateTaken = yield* branchExists(cwd, candidate);
      if (!isCandidateTaken) {
        return candidate;
      }
    }

    return yield* new GitCommandError({
      ...gitCommandContext({
        operation: "GitVcsDriver.renameBranch",
        cwd,
        args: ["branch", "-m", "--", desiredBranch],
      }),
      detail: `Could not find an available branch name for '${desiredBranch}'.`,
    });
  });

  const resolveCurrentUpstream = Effect.fn("resolveCurrentUpstream")(function* (cwd: string) {
    const upstreamRef = yield* runGitStdout(
      "GitVcsDriver.resolveCurrentUpstream",
      cwd,
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      true,
    ).pipe(Effect.map((stdout) => stdout.trim()));

    if (upstreamRef.length === 0 || upstreamRef === "@{upstream}") {
      return null;
    }

    const remoteNames = yield* runGitStdout("GitVcsDriver.listRemoteNames", cwd, ["remote"]).pipe(
      Effect.map(parseRemoteNames),
      Effect.orElseSucceed((): ReadonlyArray<string> => []),
    );
    return (
      parseUpstreamRefWithRemoteNames(upstreamRef, remoteNames) ??
      parseUpstreamRefByFirstSeparator(upstreamRef)
    );
  });

  const fetchRemoteForStatus = (
    gitCommonDir: string,
    remoteName: string,
  ): Effect.Effect<void, GitCommandError> => {
    const fetchCwd =
      path.basename(gitCommonDir) === ".git" ? path.dirname(gitCommonDir) : gitCommonDir;
    return executeGit(
      "GitVcsDriver.fetchRemoteForStatus",
      fetchCwd,
      ["--git-dir", gitCommonDir, "fetch", "--quiet", "--no-tags", remoteName],
      {
        allowNonZeroExit: true,
        env: STATUS_UPSTREAM_REFRESH_ENV,
        timeoutMs: Duration.toMillis(STATUS_UPSTREAM_REFRESH_TIMEOUT),
      },
    ).pipe(Effect.asVoid);
  };

  const resolveGitCommonDir = Effect.fn("resolveGitCommonDir")(function* (cwd: string) {
    const gitCommonDir = yield* runGitStdout("GitVcsDriver.resolveGitCommonDir", cwd, [
      "rev-parse",
      "--git-common-dir",
    ]).pipe(Effect.map((stdout) => stdout.trim()));
    return path.isAbsolute(gitCommonDir) ? gitCommonDir : path.resolve(cwd, gitCommonDir);
  });

  const resolveGitCommonDirForRefs = Effect.fn("resolveGitCommonDirForRefs")(function* (
    cwd: string,
  ) {
    const result = yield* executeGit(
      "GitVcsDriver.listRefs.resolveGitCommonDir",
      cwd,
      ["rev-parse", "--git-common-dir"],
      {
        allowNonZeroExit: true,
        timeoutMs: 5_000,
      },
    ).pipe(
      Effect.catchTags({
        GitCommandError: (error) =>
          isMissingGitCwdError(error) ? Effect.succeed(null) : Effect.fail(error),
      }),
    );
    if (result === null || result.exitCode !== 0) {
      if (result === null || isNonRepositoryGitStderr(result.stderr.trim())) {
        return null;
      }
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: "GitVcsDriver.listRefs.resolveGitCommonDir",
          cwd,
          args: ["rev-parse", "--git-common-dir"],
        }),
        detail: "Failed to resolve the Git common directory.",
        exitCode: result.exitCode,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
      });
    }
    const output = result.stdout.trim();
    const candidate = path.isAbsolute(output) ? path.normalize(output) : path.resolve(cwd, output);
    return yield* fileSystem.realPath(candidate).pipe(Effect.orElseSucceed(() => candidate));
  });

  const readGitRefsSnapshot = Effect.fn("readGitRefsSnapshot")(function* (gitCommonDir: string) {
    const commandCwd =
      path.basename(gitCommonDir) === ".git" ? path.dirname(gitCommonDir) : gitCommonDir;
    const gitDirArgs = ["--git-dir", gitCommonDir] as const;
    const [refsResult, defaultRefResult, worktreeListResult, remoteNamesResult] = yield* Effect.all(
      [
        executeGit(
          "GitVcsDriver.listRefs.snapshot",
          commandCwd,
          [
            ...gitDirArgs,
            "for-each-ref",
            "--format=%(refname)%09%(committerdate:unix)%09%(symref)",
            "refs/heads",
            "refs/remotes",
          ],
          {
            timeoutMs: 30_000,
            maxOutputBytes: 16 * 1024 * 1024,
            fallbackErrorDetail: "Git ref snapshot enumeration failed.",
          },
        ),
        executeGit(
          "GitVcsDriver.listRefs.defaultRef",
          commandCwd,
          [...gitDirArgs, "symbolic-ref", "refs/remotes/origin/HEAD"],
          {
            timeoutMs: 5_000,
            allowNonZeroExit: true,
          },
        ),
        executeGit(
          "GitVcsDriver.listRefs.worktrees",
          commandCwd,
          [...gitDirArgs, "worktree", "list", "--porcelain", "-z"],
          {
            timeoutMs: 30_000,
            allowNonZeroExit: true,
            maxOutputBytes: 16 * 1024 * 1024,
          },
        ),
        executeGit("GitVcsDriver.listRefs.remoteNames", commandCwd, [...gitDirArgs, "remote"], {
          timeoutMs: 5_000,
          allowNonZeroExit: true,
        }),
      ],
      { concurrency: 2 },
    );

    const remoteNames =
      remoteNamesResult.exitCode === 0 ? parseRemoteNames(remoteNamesResult.stdout) : [];
    const defaultBranch =
      defaultRefResult.exitCode === 0
        ? defaultRefResult.stdout.trim().replace(/^refs\/remotes\/origin\//, "")
        : null;
    const discoveredWorktrees =
      worktreeListResult.exitCode === 0
        ? [...parseWorktreeBranchPaths(worktreeListResult.stdout)]
        : [];
    const existingWorktrees = yield* Effect.filter(
      discoveredWorktrees,
      ([, worktreePath]) =>
        fileSystem.stat(worktreePath).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        ),
      { concurrency: 16 },
    );
    const worktreePaths = new Map(existingWorktrees);
    const localBranches: GitRefsSnapshotEntry[] = [];
    const remoteBranches: GitRefsSnapshotEntry[] = [];

    for (const line of refsResult.stdout.split("\n")) {
      if (line.length === 0) continue;
      const [fullRefName, lastCommitRaw, symbolicTarget] = line.split("\t");
      if (!fullRefName || symbolicTarget) continue;
      const parsedLastCommit = Number.parseInt(lastCommitRaw ?? "0", 10);
      const lastCommit = Number.isFinite(parsedLastCommit) ? parsedLastCommit : 0;

      if (fullRefName.startsWith("refs/heads/")) {
        const name = fullRefName.slice("refs/heads/".length);
        localBranches.push({
          ref: {
            name,
            current: false,
            isRemote: false,
            isDefault: name === defaultBranch,
            worktreePath: worktreePaths.get(name) ?? null,
          },
          lastCommit,
        });
        continue;
      }
      if (!fullRefName.startsWith("refs/remotes/")) continue;
      const name = fullRefName.slice("refs/remotes/".length);
      const parsedRemoteRef = parseRemoteRefWithRemoteNames(name, remoteNames);
      remoteBranches.push({
        ref: {
          name,
          current: false,
          isRemote: true,
          isDefault:
            defaultBranch !== null &&
            parsedRemoteRef?.remoteName === ORIGIN_REMOTE_NAME &&
            parsedRemoteRef.branchName === defaultBranch,
          worktreePath: null,
          ...(parsedRemoteRef ? { remoteName: parsedRemoteRef.remoteName } : {}),
        },
        lastCommit,
      });
    }

    return {
      localBranches,
      remoteBranches,
      hasPrimaryRemote: remoteNames.includes(ORIGIN_REMOTE_NAME),
    } satisfies GitRefsSnapshot;
  });

  const gitRefsGenerations = yield* Ref.make<ReadonlyMap<string, GitRefsGenerationState>>(
    new Map(),
  );
  const gitRefsGenerationCounter = yield* Ref.make(1);
  const nextGitRefsGeneration = Ref.getAndUpdate(
    gitRefsGenerationCounter,
    (current) => current + 1,
  );
  const prepareGitRefsGeneration = Effect.fn("prepareGitRefsGeneration")(function* (
    gitCommonDir: string,
    refresh: boolean,
  ) {
    const nowMs = yield* Clock.currentTimeMillis;
    const candidateGeneration = yield* nextGitRefsGeneration;
    return yield* Ref.modify(gitRefsGenerations, (current) => {
      const previous = current.get(gitCommonDir);
      const shouldRefresh =
        refresh &&
        previous !== undefined &&
        nowMs - previous.refreshedAtMs >= LIST_REFS_REFRESH_COALESCE_MS;
      const nextState =
        previous === undefined
          ? {
              generation: candidateGeneration,
              refreshedAtMs: refresh ? nowMs : Number.NEGATIVE_INFINITY,
            }
          : shouldRefresh
            ? { generation: candidateGeneration, refreshedAtMs: nowMs }
            : previous;
      if (!shouldRefresh && current.has(gitCommonDir)) {
        return [nextState.generation, current] as const;
      }
      const next = new Map(current);
      next.delete(gitCommonDir);
      next.set(gitCommonDir, nextState);
      if (next.size > LIST_REFS_SNAPSHOT_CACHE_CAPACITY) {
        const oldest = next.keys().next().value;
        if (oldest !== undefined) next.delete(oldest);
      }
      return [nextState.generation, next] as const;
    });
  });
  const currentGitRefsGeneration = (gitCommonDir: string) =>
    Ref.get(gitRefsGenerations).pipe(
      Effect.map((generations) => generations.get(gitCommonDir)?.generation ?? 0),
    );
  const invalidateGitRefsCommonDir = Effect.fn("invalidateGitRefsCommonDir")(function* (
    gitCommonDir: string,
  ) {
    const nowMs = yield* Clock.currentTimeMillis;
    const generation = yield* nextGitRefsGeneration;
    yield* Ref.update(gitRefsGenerations, (current) => {
      const next = new Map(current);
      next.delete(gitCommonDir);
      next.set(gitCommonDir, {
        generation,
        refreshedAtMs: nowMs,
      });
      if (next.size > LIST_REFS_SNAPSHOT_CACHE_CAPACITY) {
        const oldest = next.keys().next().value;
        if (oldest !== undefined) next.delete(oldest);
      }
      return next;
    });
  });
  const invalidateGitRefsForCwd = Effect.fn("invalidateGitRefsForCwd")(function* (
    cwd: string,
    knownCommonDir?: string | null,
  ) {
    const gitCommonDir =
      knownCommonDir ??
      (yield* resolveGitCommonDirForRefs(cwd).pipe(Effect.orElseSucceed(() => null)));
    if (gitCommonDir !== null) yield* invalidateGitRefsCommonDir(gitCommonDir);
  });
  const withGitRefsInvalidation = <A, E, R>(
    cwd: string,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    Effect.flatMap(
      resolveGitCommonDirForRefs(cwd).pipe(Effect.orElseSucceed(() => null)),
      (knownCommonDir) =>
        effect.pipe(
          Effect.ensuring(
            invalidateGitRefsForCwd(cwd, knownCommonDir).pipe(Effect.ignore({ log: true })),
          ),
        ),
    );

  const gitRefsSnapshotCache = yield* Cache.makeWith(
    (key: GitRefsSnapshotCacheKey) => readGitRefsSnapshot(key.gitCommonDir),
    {
      capacity: LIST_REFS_SNAPSHOT_CACHE_CAPACITY,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? LIST_REFS_SNAPSHOT_CACHE_TTL : Duration.zero),
    },
  );
  const loadCurrentGitRefsSnapshot = Effect.fn("loadCurrentGitRefsSnapshot")(function* (
    gitCommonDir: string,
    refresh: boolean,
  ): Effect.fn.Return<GitRefsSnapshot, GitCommandError> {
    let requestRefresh = refresh;
    while (true) {
      const generation = yield* prepareGitRefsGeneration(gitCommonDir, requestRefresh);
      requestRefresh = false;
      const snapshot = yield* Cache.get(
        gitRefsSnapshotCache,
        new GitRefsSnapshotCacheKey({ gitCommonDir, generation }),
      );
      if ((yield* currentGitRefsGeneration(gitCommonDir)) === generation) {
        return snapshot;
      }
    }
  });

  const refreshStatusRemoteCacheEntry = Effect.fn("refreshStatusRemoteCacheEntry")(function* (
    cacheKey: StatusRemoteRefreshCacheKey,
  ) {
    yield* fetchRemoteForStatus(cacheKey.gitCommonDir, cacheKey.remoteName).pipe(
      Effect.ensuring(invalidateGitRefsCommonDir(cacheKey.gitCommonDir)),
    );
    return true as const;
  });

  const statusRemoteRefreshCache = yield* Cache.makeWith(refreshStatusRemoteCacheEntry, {
    capacity: STATUS_UPSTREAM_REFRESH_CACHE_CAPACITY,
    // Keep successful refreshes warm and briefly back off failed refreshes to avoid retry storms.
    timeToLive: (exit) =>
      Exit.isSuccess(exit)
        ? STATUS_UPSTREAM_REFRESH_INTERVAL
        : STATUS_UPSTREAM_REFRESH_FAILURE_COOLDOWN,
  });

  const refreshStatusUpstreamIfStale = Effect.fn("refreshStatusUpstreamIfStale")(function* (
    cwd: string,
  ) {
    const upstream = yield* resolveCurrentUpstream(cwd);
    if (!upstream) return;
    const gitCommonDir = yield* resolveGitCommonDir(cwd);
    yield* Cache.get(
      statusRemoteRefreshCache,
      new StatusRemoteRefreshCacheKey({
        gitCommonDir,
        remoteName: upstream.remoteName,
      }),
    );
  });

  const resolveDefaultBranchName = (
    cwd: string,
    remoteName: string,
  ): Effect.Effect<string | null, GitCommandError> =>
    executeGit(
      "GitVcsDriver.resolveDefaultBranchName",
      cwd,
      ["symbolic-ref", `refs/remotes/${remoteName}/HEAD`],
      { allowNonZeroExit: true },
    ).pipe(
      Effect.map((result) => {
        if (result.exitCode !== 0) {
          return null;
        }
        return parseDefaultBranchFromRemoteHeadRef(result.stdout, remoteName);
      }),
    );

  const remoteBranchExists = (
    cwd: string,
    remoteName: string,
    refName: string,
  ): Effect.Effect<boolean, GitCommandError> =>
    executeGit(
      "GitVcsDriver.remoteBranchExists",
      cwd,
      ["show-ref", "--verify", "--quiet", `refs/remotes/${remoteName}/${refName}`],
      {
        allowNonZeroExit: true,
      },
    ).pipe(Effect.map((result) => result.exitCode === 0));

  const originRemoteExists = (cwd: string): Effect.Effect<boolean, GitCommandError> =>
    executeGit("GitVcsDriver.originRemoteExists", cwd, ["remote", "get-url", "origin"], {
      allowNonZeroExit: true,
    }).pipe(Effect.map((result) => result.exitCode === 0));

  const requireOriginWriteRemote = Effect.fn("requireOriginWriteRemote")(function* (
    cwd: string,
    operation: string,
    args: readonly string[],
  ) {
    if (!(yield* originRemoteExists(cwd))) {
      return yield* new GitCommandError({
        ...gitCommandContext({ operation, cwd, args }),
        detail: "Origin-only policy requires an origin remote before Git can publish changes.",
      });
    }

    const [fetchUrl, pushUrls] = yield* Effect.all([
      runGitStdout("GitVcsDriver.requireOriginWriteRemote.fetchUrl", cwd, [
        "remote",
        "get-url",
        ORIGIN_REMOTE_NAME,
      ]),
      runGitStdout("GitVcsDriver.requireOriginWriteRemote.pushUrl", cwd, [
        "remote",
        "get-url",
        "--push",
        "--all",
        ORIGIN_REMOTE_NAME,
      ]),
    ]);
    const normalizedFetchUrl = normalizeGitRemoteUrl(fetchUrl);
    const hasNonOriginPushUrl = pushUrls
      .split(/\r?\n/u)
      .map((url) => url.trim())
      .filter((url) => url.length > 0)
      .some((pushUrl) => normalizeGitRemoteUrl(pushUrl) !== normalizedFetchUrl);
    if (hasNonOriginPushUrl) {
      return yield* new GitCommandError({
        ...gitCommandContext({ operation, cwd, args }),
        detail:
          "Origin-only policy rejected origin because its push URL differs from its fetch URL.",
      });
    }

    return ORIGIN_REMOTE_NAME;
  });

  const listRemoteNames = (cwd: string): Effect.Effect<ReadonlyArray<string>, GitCommandError> =>
    runGitStdout("GitVcsDriver.listRemoteNames", cwd, ["remote"]).pipe(
      Effect.map(parseRemoteNamesInGitOrder),
    );

  const requireOriginOrLocalRef = Effect.fn("requireOriginOrLocalRef")(function* (input: {
    readonly cwd: string;
    readonly refName: string;
    readonly operation: string;
    readonly args: readonly string[];
  }) {
    const remoteNames = yield* listRemoteNames(input.cwd).pipe(Effect.orElseSucceed(() => []));
    const remoteRef = parseRemoteRefWithRemoteNames(
      input.refName,
      remoteNames.toSorted((left, right) => right.length - left.length),
    );
    if (remoteRef && !isOriginRemoteName(remoteRef.remoteName)) {
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: input.operation,
          cwd: input.cwd,
          args: input.args,
        }),
        detail: "Origin-only policy permits accepting a remote ref only from origin.",
      });
    }
  });

  const resolvePublishBranchName = Effect.fn("resolvePublishBranchName")(function* (
    cwd: string,
    branchName: string,
  ) {
    const remoteNames = yield* listRemoteNames(cwd).pipe(Effect.orElseSucceed(() => []));
    const parsedRemoteRef = parseRemoteRefWithRemoteNames(branchName, remoteNames);
    return parsedRemoteRef?.branchName ?? branchName;
  });

  const resolvePrimaryRemoteName = Effect.fn("resolvePrimaryRemoteName")(function* (cwd: string) {
    if (yield* originRemoteExists(cwd)) {
      return "origin";
    }
    const remotes = yield* listRemoteNames(cwd);
    const [firstRemote] = remotes;
    if (firstRemote) {
      return firstRemote;
    }
    return yield* new GitCommandError({
      ...gitCommandContext({
        operation: "GitVcsDriver.resolvePrimaryRemoteName",
        cwd,
        args: ["remote"],
      }),
      detail: "No git remote is configured for this repository.",
    });
  });

  const resolvePushRemoteName = Effect.fn("resolvePushRemoteName")(function* (
    cwd: string,
    refName: string,
  ) {
    return yield* requireOriginWriteRemote(cwd, "GitVcsDriver.resolvePushRemoteName", [
      "push",
      refName,
    ]);
  });

  const ensureRemote: GitVcsDriver.GitVcsDriver["Service"]["ensureRemote"] = Effect.fn(
    "ensureRemote",
  )(function* (input) {
    const preferredName = sanitizeRemoteName(input.preferredName);
    const normalizedTargetUrl = normalizeGitRemoteUrl(input.url);
    const remoteFetchUrls = yield* runGitStdout(
      "GitVcsDriver.ensureRemote.listRemoteUrls",
      input.cwd,
      ["remote", "-v"],
    ).pipe(Effect.map((stdout) => parseRemoteFetchUrls(stdout)));

    for (const [remoteName, remoteUrl] of remoteFetchUrls.entries()) {
      if (normalizeGitRemoteUrl(remoteUrl) === normalizedTargetUrl) {
        return remoteName;
      }
    }

    let remoteName = preferredName;
    let suffix = 1;
    while (remoteFetchUrls.has(remoteName)) {
      remoteName = `${preferredName}-${suffix}`;
      suffix += 1;
    }

    yield* runGit("GitVcsDriver.ensureRemote.add", input.cwd, [
      "remote",
      "add",
      remoteName,
      input.url,
    ]);
    return remoteName;
  });

  const resolveBaseBranchForNoUpstream = Effect.fn("resolveBaseBranchForNoUpstream")(function* (
    cwd: string,
    refName: string,
  ) {
    const configuredBaseBranch = yield* runGitStdout(
      "GitVcsDriver.resolveBaseBranchForNoUpstream.config",
      cwd,
      ["config", "--get", `branch.${refName}.gh-merge-base`],
      true,
    ).pipe(Effect.map((stdout) => stdout.trim()));

    const primaryRemoteName = yield* resolvePrimaryRemoteName(cwd).pipe(
      Effect.orElseSucceed(() => null),
    );
    const defaultBranch =
      primaryRemoteName === null ? null : yield* resolveDefaultBranchName(cwd, primaryRemoteName);
    const candidates = [
      configuredBaseBranch.length > 0 ? configuredBaseBranch : null,
      defaultBranch,
      ...DEFAULT_BASE_BRANCH_CANDIDATES,
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      const remotePrefix =
        primaryRemoteName && primaryRemoteName !== "origin" ? `${primaryRemoteName}/` : null;
      const normalizedCandidate = candidate.startsWith("origin/")
        ? candidate.slice("origin/".length)
        : remotePrefix && candidate.startsWith(remotePrefix)
          ? candidate.slice(remotePrefix.length)
          : candidate;
      if (normalizedCandidate.length === 0 || normalizedCandidate === refName) {
        continue;
      }

      if (
        primaryRemoteName &&
        (yield* remoteBranchExists(cwd, primaryRemoteName, normalizedCandidate))
      ) {
        return `${primaryRemoteName}/${normalizedCandidate}`;
      }

      if (yield* branchExists(cwd, normalizedCandidate)) {
        return normalizedCandidate;
      }
    }

    return null;
  });

  const computeAheadCountAgainstBase = Effect.fn("computeAheadCountAgainstBase")(function* (
    cwd: string,
    refName: string,
  ) {
    const baseRef = yield* resolveBaseBranchForNoUpstream(cwd, refName);
    if (!baseRef) {
      return 0;
    }

    const result = yield* executeGit(
      "GitVcsDriver.computeAheadCountAgainstBase",
      cwd,
      ["rev-list", "--count", `${baseRef}..HEAD`],
      { allowNonZeroExit: true },
    );
    if (result.exitCode !== 0) {
      return 0;
    }

    const parsed = Number.parseInt(result.stdout.trim(), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  });

  const readStatusDetailsRemote = Effect.fn("readStatusDetailsRemote")(function* (cwd: string) {
    const branchResult = yield* executeGit(
      "GitVcsDriver.statusDetailsRemote.branch",
      cwd,
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { allowNonZeroExit: true },
    ).pipe(
      Effect.catchTags({
        GitCommandError: (error) =>
          isMissingGitCwdError(error) ? Effect.succeed(null) : Effect.fail(error),
      }),
    );

    if (branchResult === null) {
      return NON_REPOSITORY_REMOTE_STATUS_DETAILS;
    }
    if (branchResult.exitCode !== 0) {
      if (isNonRepositoryGitStderr(branchResult.stderr)) {
        return NON_REPOSITORY_REMOTE_STATUS_DETAILS;
      }
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: "GitVcsDriver.statusDetailsRemote.branch",
          cwd,
          args: ["rev-parse", "--abbrev-ref", "HEAD"],
        }),
        detail: "Git branch lookup failed.",
        exitCode: branchResult.exitCode,
        stdoutLength: branchResult.stdout.length,
        stderrLength: branchResult.stderr.length,
      });
    }

    const branchValue = branchResult.stdout.trim();
    const branch = branchValue.length > 0 && branchValue !== "HEAD" ? branchValue : null;
    const upstream = yield* resolveCurrentUpstream(cwd);
    const upstreamRef = upstream?.upstreamRef ?? null;
    let aheadCount = 0;
    let behindCount = 0;

    if (upstreamRef) {
      const divergence = yield* executeGit(
        "GitVcsDriver.statusDetailsRemote.divergence",
        cwd,
        ["rev-list", "--left-right", "--count", `HEAD...${upstreamRef}`],
        { allowNonZeroExit: true },
      );
      if (divergence.exitCode === 0) {
        const [aheadRaw, behindRaw] = divergence.stdout.trim().split(/\s+/);
        const parsedAhead = Number.parseInt(aheadRaw ?? "0", 10);
        const parsedBehind = Number.parseInt(behindRaw ?? "0", 10);
        aheadCount = Number.isFinite(parsedAhead) ? Math.max(0, parsedAhead) : 0;
        behindCount = Number.isFinite(parsedBehind) ? Math.max(0, parsedBehind) : 0;
      }
    } else if (branch) {
      aheadCount = yield* computeAheadCountAgainstBase(cwd, branch).pipe(
        Effect.orElseSucceed(() => 0),
      );
    }

    const defaultBranch = yield* resolveDefaultBranchName(cwd, "origin");
    const isDefaultBranch =
      branch !== null &&
      (branch === defaultBranch ||
        (defaultBranch === null && (branch === "main" || branch === "master")));
    const aheadOfDefaultCount =
      branch && !isDefaultBranch
        ? upstreamRef === null
          ? aheadCount
          : yield* computeAheadCountAgainstBase(cwd, branch).pipe(Effect.orElseSucceed(() => 0))
        : 0;

    return {
      isRepo: true,
      isDefaultBranch,
      branch,
      upstreamRef,
      hasUpstream: upstreamRef !== null,
      aheadCount,
      behindCount,
      aheadOfDefaultCount,
    };
  });

  const readStatusDetailsLocal = Effect.fn("readStatusDetailsLocal")(function* (cwd: string) {
    const statusResult = yield* executeGit(
      "GitVcsDriver.statusDetails.status",
      cwd,
      ["status", "--porcelain=2", "--branch"],
      {
        allowNonZeroExit: true,
      },
    ).pipe(
      Effect.catchTags({
        GitCommandError: (error) =>
          isMissingGitCwdError(error) ? Effect.succeed(null) : Effect.fail(error),
      }),
    );

    if (statusResult === null) {
      return NON_REPOSITORY_STATUS_DETAILS;
    }

    if (statusResult.exitCode !== 0) {
      if (isNonRepositoryGitStderr(statusResult.stderr)) {
        return NON_REPOSITORY_STATUS_DETAILS;
      }
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: "GitVcsDriver.statusDetails.status",
          cwd,
          args: ["status", "--porcelain=2", "--branch"],
        }),
        detail: "Git status failed.",
        exitCode: statusResult.exitCode,
        stdoutLength: statusResult.stdout.length,
        stderrLength: statusResult.stderr.length,
      });
    }

    const [unstagedNumstatStdout, stagedNumstatStdout, defaultRefResult, hasPrimaryRemote] =
      yield* Effect.all(
        [
          runGitStdout("GitVcsDriver.statusDetails.unstagedNumstat", cwd, ["diff", "--numstat"]),
          runGitStdout("GitVcsDriver.statusDetails.stagedNumstat", cwd, [
            "diff",
            "--cached",
            "--numstat",
          ]),
          executeGit(
            "GitVcsDriver.statusDetails.defaultRef",
            cwd,
            ["symbolic-ref", "refs/remotes/origin/HEAD"],
            {
              allowNonZeroExit: true,
            },
          ),
          originRemoteExists(cwd).pipe(Effect.orElseSucceed(() => false)),
        ],
        { concurrency: "unbounded" },
      );
    const statusStdout = statusResult.stdout;
    const defaultBranch =
      defaultRefResult.exitCode === 0
        ? defaultRefResult.stdout.trim().replace(/^refs\/remotes\/origin\//, "")
        : null;

    let refName: string | null = null;
    let upstreamRef: string | null = null;
    let aheadCount = 0;
    let behindCount = 0;
    let aheadOfDefaultCount = 0;
    let hasWorkingTreeChanges = false;
    const changedFilesWithoutNumstat = new Set<string>();

    for (const line of statusStdout.split(/\r?\n/g)) {
      if (line.startsWith("# branch.head ")) {
        const value = line.slice("# branch.head ".length).trim();
        refName = value.startsWith("(") ? null : value;
        continue;
      }
      if (line.startsWith("# branch.upstream ")) {
        const value = line.slice("# branch.upstream ".length).trim();
        upstreamRef = value.length > 0 ? value : null;
        continue;
      }
      if (line.startsWith("# branch.ab ")) {
        const value = line.slice("# branch.ab ".length).trim();
        const parsed = parseBranchAb(value);
        aheadCount = parsed.ahead;
        behindCount = parsed.behind;
        continue;
      }
      if (line.trim().length > 0 && !line.startsWith("#")) {
        hasWorkingTreeChanges = true;
        const pathValue = parsePorcelainPath(line);
        if (pathValue) changedFilesWithoutNumstat.add(pathValue);
      }
    }

    const fallbackAheadCount =
      !upstreamRef && refName
        ? yield* computeAheadCountAgainstBase(cwd, refName).pipe(Effect.orElseSucceed(() => 0))
        : null;

    if (fallbackAheadCount !== null) {
      aheadCount = fallbackAheadCount;
      behindCount = 0;
    }

    const isDefaultBranch =
      refName !== null &&
      (refName === defaultBranch ||
        (defaultBranch === null && (refName === "main" || refName === "master")));
    if (refName && !isDefaultBranch) {
      aheadOfDefaultCount =
        fallbackAheadCount !== null
          ? fallbackAheadCount
          : yield* computeAheadCountAgainstBase(cwd, refName).pipe(Effect.orElseSucceed(() => 0));
    }

    const stagedEntries = parseNumstatEntries(stagedNumstatStdout);
    const unstagedEntries = parseNumstatEntries(unstagedNumstatStdout);
    const fileStatMap = new Map<string, { insertions: number; deletions: number }>();
    for (const entry of [...stagedEntries, ...unstagedEntries]) {
      const existing = fileStatMap.get(entry.path) ?? { insertions: 0, deletions: 0 };
      existing.insertions += entry.insertions;
      existing.deletions += entry.deletions;
      fileStatMap.set(entry.path, existing);
    }

    let insertions = 0;
    let deletions = 0;
    const files = Array.from(fileStatMap.entries())
      .map(([filePath, stat]) => {
        insertions += stat.insertions;
        deletions += stat.deletions;
        return { path: filePath, insertions: stat.insertions, deletions: stat.deletions };
      })
      .toSorted((a, b) => a.path.localeCompare(b.path));

    for (const filePath of changedFilesWithoutNumstat) {
      if (fileStatMap.has(filePath)) continue;
      files.push({ path: filePath, insertions: 0, deletions: 0 });
    }
    files.sort((a, b) => a.path.localeCompare(b.path));

    return {
      isRepo: true,
      hasOriginRemote: hasPrimaryRemote,
      isDefaultBranch,
      branch: refName,
      upstreamRef,
      hasWorkingTreeChanges,
      workingTree: {
        files,
        insertions,
        deletions,
      },
      hasUpstream: upstreamRef !== null,
      aheadCount,
      behindCount,
      aheadOfDefaultCount,
    };
  });

  const statusDetailsLocal: GitVcsDriver.GitVcsDriver["Service"]["statusDetailsLocal"] = Effect.fn(
    "statusDetailsLocal",
  )(function* (cwd) {
    return yield* readStatusDetailsLocal(cwd);
  });

  const statusDetails: GitVcsDriver.GitVcsDriver["Service"]["statusDetails"] = Effect.fn(
    "statusDetails",
  )(function* (cwd) {
    yield* refreshStatusUpstreamIfStale(cwd).pipe(
      Effect.catchTags({
        GitCommandError: (error) =>
          isMissingGitCwdError(error) ? Effect.void : Effect.fail(error),
      }),
      Effect.ignoreCause({ log: true }),
    );
    return yield* readStatusDetailsLocal(cwd);
  });

  const statusDetailsRemote: GitVcsDriver.GitVcsDriver["Service"]["statusDetailsRemote"] =
    Effect.fn("statusDetailsRemote")(function* (cwd, options) {
      if (options?.refreshUpstream !== false) {
        yield* refreshStatusUpstreamIfStale(cwd).pipe(
          Effect.catchTags({
            GitCommandError: (error) =>
              isMissingGitCwdError(error) ? Effect.void : Effect.fail(error),
          }),
          Effect.ignoreCause({ log: true }),
        );
      }
      return yield* readStatusDetailsRemote(cwd);
    });

  const status: GitVcsDriver.GitVcsDriver["Service"]["status"] = (input) =>
    statusDetails(input.cwd).pipe(
      Effect.map((details) => ({
        isRepo: details.isRepo,
        hasPrimaryRemote: details.hasOriginRemote,
        isDefaultRef: details.isDefaultBranch,
        refName: details.branch,
        hasWorkingTreeChanges: details.hasWorkingTreeChanges,
        workingTree: details.workingTree,
        hasUpstream: details.hasUpstream,
        aheadCount: details.aheadCount,
        behindCount: details.behindCount,
        aheadOfDefaultCount: details.aheadOfDefaultCount,
        pr: null,
      })),
    );

  const prepareCommitContext: GitVcsDriver.GitVcsDriver["Service"]["prepareCommitContext"] =
    Effect.fn("prepareCommitContext")(function* (cwd, filePaths) {
      if (filePaths && filePaths.length > 0) {
        yield* runGit("GitVcsDriver.prepareCommitContext.reset", cwd, ["reset"]).pipe(
          Effect.catchTags({
            GitCommandError: () => Effect.void,
          }),
        );
        yield* runGit("GitVcsDriver.prepareCommitContext.addSelected", cwd, [
          "add",
          "-A",
          "--",
          ...filePaths,
        ]);
      } else {
        yield* runGit("GitVcsDriver.prepareCommitContext.addAll", cwd, ["add", "-A"]);
      }

      const stagedSummary = yield* runGitStdout(
        "GitVcsDriver.prepareCommitContext.stagedSummary",
        cwd,
        ["diff", "--cached", "--name-status"],
      ).pipe(Effect.map((stdout) => stdout.trim()));
      if (stagedSummary.length === 0) {
        return null;
      }

      const stagedPatch = yield* runGitStdoutWithOptions(
        "GitVcsDriver.prepareCommitContext.stagedPatch",
        cwd,
        ["diff", "--no-ext-diff", "--cached", "--patch", "--minimal"],
        {
          maxOutputBytes: PREPARED_COMMIT_PATCH_MAX_OUTPUT_BYTES,
          appendTruncationMarker: true,
        },
      );

      return {
        stagedSummary,
        stagedPatch,
      };
    });

  const commit: GitVcsDriver.GitVcsDriver["Service"]["commit"] = Effect.fn("commit")(function* (
    cwd,
    subject,
    body,
    options?: GitVcsDriver.GitCommitOptions,
  ) {
    const args = ["commit", "-m", subject];
    const trimmedBody = body.trim();
    if (trimmedBody.length > 0) {
      args.push("-m", trimmedBody);
    }
    const progress =
      options?.progress?.onOutputLine === undefined
        ? options?.progress
        : {
            ...options.progress,
            onStdoutLine: (line: string) =>
              options.progress?.onOutputLine?.({ stream: "stdout", text: line }) ?? Effect.void,
            onStderrLine: (line: string) =>
              options.progress?.onOutputLine?.({ stream: "stderr", text: line }) ?? Effect.void,
          };
    yield* executeGit("GitVcsDriver.commit.commit", cwd, args, {
      ...(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(progress ? { progress } : {}),
    }).pipe(Effect.asVoid);
    const commitSha = yield* runGitStdout("GitVcsDriver.commit.revParseHead", cwd, [
      "rev-parse",
      "HEAD",
    ]).pipe(Effect.map((stdout) => stdout.trim()));

    return { commitSha };
  });

  const pushCurrentBranch: GitVcsDriver.GitVcsDriver["Service"]["pushCurrentBranch"] = Effect.fn(
    "pushCurrentBranch",
  )(function* (cwd, fallbackBranch, options) {
    const details = yield* statusDetails(cwd);
    const branch = details.branch ?? fallbackBranch;
    if (!branch) {
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: "GitVcsDriver.pushCurrentBranch",
          cwd,
          args: ["push"],
        }),
        detail: "Cannot push from detached HEAD.",
      });
    }

    const requestedRemoteName = options?.remoteName?.trim() || null;
    if (requestedRemoteName && !isOriginRemoteName(requestedRemoteName)) {
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: "GitVcsDriver.pushCurrentBranch",
          cwd,
          args: ["push", "-u", requestedRemoteName],
        }),
        detail: "Origin-only policy permits publishing only through the origin remote.",
      });
    }
    if (requestedRemoteName) {
      const originRemoteName = yield* requireOriginWriteRemote(
        cwd,
        "GitVcsDriver.pushCurrentBranch",
        ["push", "-u", ORIGIN_REMOTE_NAME],
      );
      const currentUpstream = yield* resolveCurrentUpstream(cwd).pipe(
        Effect.orElseSucceed(() => null),
      );
      const publishBranch =
        currentUpstream && !isOriginRemoteName(currentUpstream.remoteName)
          ? currentUpstream.branchName
          : yield* resolvePublishBranchName(cwd, branch);
      yield* runGit("GitVcsDriver.pushCurrentBranch.pushWithRequestedRemote", cwd, [
        "push",
        "-u",
        originRemoteName,
        `HEAD:refs/heads/${publishBranch}`,
      ]);
      return {
        status: "pushed" as const,
        branch,
        upstreamBranch: `${originRemoteName}/${publishBranch}`,
        setUpstream: true,
      };
    }

    const hasNoLocalDelta = details.aheadCount === 0 && details.behindCount === 0;
    if (hasNoLocalDelta) {
      if (details.hasUpstream) {
        return {
          status: "skipped_up_to_date" as const,
          branch,
          ...(details.upstreamRef ? { upstreamBranch: details.upstreamRef } : {}),
        };
      }

      const comparableBaseBranch = yield* resolveBaseBranchForNoUpstream(cwd, branch).pipe(
        Effect.orElseSucceed(() => null),
      );
      if (comparableBaseBranch) {
        const publishRemoteName = yield* resolvePushRemoteName(cwd, branch).pipe(
          Effect.orElseSucceed(() => null),
        );
        if (!publishRemoteName) {
          return {
            status: "skipped_up_to_date" as const,
            branch,
          };
        }

        const hasRemoteBranch = yield* remoteBranchExists(cwd, publishRemoteName, branch).pipe(
          Effect.orElseSucceed(() => false),
        );
        if (hasRemoteBranch) {
          return {
            status: "skipped_up_to_date" as const,
            branch,
          };
        }
      }
    }

    if (!details.hasUpstream) {
      const publishRemoteName = yield* resolvePushRemoteName(cwd, branch);
      const publishBranch = yield* resolvePublishBranchName(cwd, branch);
      yield* runGit("GitVcsDriver.pushCurrentBranch.pushWithUpstream", cwd, [
        "push",
        "-u",
        publishRemoteName,
        `HEAD:refs/heads/${publishBranch}`,
      ]);
      return {
        status: "pushed" as const,
        branch,
        upstreamBranch: `${publishRemoteName}/${publishBranch}`,
        setUpstream: true,
      };
    }

    const currentUpstream = yield* resolveCurrentUpstream(cwd).pipe(
      Effect.orElseSucceed(() => null),
    );
    if (currentUpstream) {
      if (!isOriginRemoteName(currentUpstream.remoteName)) {
        return yield* new GitCommandError({
          ...gitCommandContext({
            operation: "GitVcsDriver.pushCurrentBranch",
            cwd,
            args: ["push", currentUpstream.remoteName],
          }),
          detail: "Origin-only policy rejected the configured upstream because it is not origin.",
        });
      }
      const originRemoteName = yield* requireOriginWriteRemote(
        cwd,
        "GitVcsDriver.pushCurrentBranch",
        ["push", ORIGIN_REMOTE_NAME],
      );
      yield* runGit("GitVcsDriver.pushCurrentBranch.pushUpstream", cwd, [
        "push",
        originRemoteName,
        `HEAD:refs/heads/${currentUpstream.branchName}`,
      ]);
      return {
        status: "pushed" as const,
        branch,
        upstreamBranch: currentUpstream.upstreamRef,
        setUpstream: false,
      };
    }

    return yield* new GitCommandError({
      ...gitCommandContext({
        operation: "GitVcsDriver.pushCurrentBranch",
        cwd,
        args: ["push"],
      }),
      detail: "Origin-only policy requires an origin tracking branch before pushing.",
    });
  });

  const pullCurrentBranch: GitVcsDriver.GitVcsDriver["Service"]["pullCurrentBranch"] = Effect.fn(
    "pullCurrentBranch",
  )(function* (cwd) {
    const details = yield* statusDetails(cwd);
    const refName = details.branch;
    if (!refName) {
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: "GitVcsDriver.pullCurrentBranch",
          cwd,
          args: ["pull", "--ff-only"],
        }),
        detail: "Cannot pull from detached HEAD.",
      });
    }
    if (!details.hasUpstream) {
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: "GitVcsDriver.pullCurrentBranch",
          cwd,
          args: ["pull", "--ff-only"],
        }),
        detail: "Current branch has no upstream configured. Push with upstream first.",
      });
    }
    const currentUpstream = yield* resolveCurrentUpstream(cwd).pipe(
      Effect.orElseSucceed(() => null),
    );
    if (!currentUpstream || !isOriginRemoteName(currentUpstream.remoteName)) {
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: "GitVcsDriver.pullCurrentBranch",
          cwd,
          args: ["pull", "--ff-only"],
        }),
        detail: "Origin-only policy permits accepting remote changes only from origin.",
      });
    }
    const beforeSha = yield* runGitStdout(
      "GitVcsDriver.pullCurrentBranch.beforeSha",
      cwd,
      ["rev-parse", "HEAD"],
      true,
    ).pipe(Effect.map((stdout) => stdout.trim()));
    yield* executeGit(
      "GitVcsDriver.pullCurrentBranch.pull",
      cwd,
      ["pull", "--ff-only", ORIGIN_REMOTE_NAME, currentUpstream.branchName],
      {
        timeoutMs: 30_000,
        fallbackErrorDetail: "git pull failed",
      },
    );
    const afterSha = yield* runGitStdout(
      "GitVcsDriver.pullCurrentBranch.afterSha",
      cwd,
      ["rev-parse", "HEAD"],
      true,
    ).pipe(Effect.map((stdout) => stdout.trim()));

    const refreshed = yield* statusDetails(cwd);
    return {
      status: beforeSha.length > 0 && beforeSha === afterSha ? "skipped_up_to_date" : "pulled",
      refName,
      upstreamRef: refreshed.upstreamRef,
    };
  });

  const readRangeContext: GitVcsDriver.GitVcsDriver["Service"]["readRangeContext"] = Effect.fn(
    "readRangeContext",
  )(function* (cwd, baseRef) {
    const range = `${baseRef}..HEAD`;
    const [commitSummary, diffSummary, diffPatch] = yield* Effect.all(
      [
        runGitStdoutWithOptions(
          "GitVcsDriver.readRangeContext.log",
          cwd,
          ["log", "--oneline", range],
          {
            maxOutputBytes: RANGE_COMMIT_SUMMARY_MAX_OUTPUT_BYTES,
            appendTruncationMarker: true,
          },
        ),
        runGitStdoutWithOptions(
          "GitVcsDriver.readRangeContext.diffStat",
          cwd,
          ["diff", "--stat", range],
          {
            maxOutputBytes: RANGE_DIFF_SUMMARY_MAX_OUTPUT_BYTES,
            appendTruncationMarker: true,
          },
        ),
        runGitStdoutWithOptions(
          "GitVcsDriver.readRangeContext.diffPatch",
          cwd,
          ["diff", "--no-ext-diff", "--patch", "--minimal", range],
          {
            maxOutputBytes: RANGE_DIFF_PATCH_MAX_OUTPUT_BYTES,
            appendTruncationMarker: true,
          },
        ),
      ],
      { concurrency: "unbounded" },
    );

    return {
      commitSummary,
      diffSummary,
      diffPatch,
    };
  });

  const readUntrackedReviewDiffs = Effect.fn("readUntrackedReviewDiffs")(function* (cwd: string) {
    const untrackedResult = yield* executeGit(
      "GitVcsDriver.readUntrackedReviewDiffs.list",
      cwd,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      {
        maxOutputBytes: WORKSPACE_FILES_MAX_OUTPUT_BYTES,
        appendTruncationMarker: true,
      },
    );
    const untrackedPaths = splitNullSeparatedGitStdoutPaths(untrackedResult);
    if (untrackedPaths.length === 0) {
      return { diff: "", truncated: untrackedResult.stdoutTruncated };
    }

    const diffs = yield* Effect.forEach(
      untrackedPaths,
      (relativePath) =>
        executeGit(
          "GitVcsDriver.readUntrackedReviewDiffs.diff",
          cwd,
          ["diff", "--no-index", "--patch", "--minimal", "--", "/dev/null", relativePath],
          {
            allowNonZeroExit: true,
            maxOutputBytes: REVIEW_UNTRACKED_DIFF_MAX_OUTPUT_BYTES,
            appendTruncationMarker: true,
          },
        ),
      { concurrency: 4 },
    );

    return {
      diff: Arr.filterMap(diffs, (result) =>
        result.stdout.trim().length > 0 ? Result.succeed(result.stdout) : Result.failVoid,
      ).join("\n"),
      truncated: untrackedResult.stdoutTruncated || diffs.some((result) => result.stdoutTruncated),
    };
  });

  const getReviewDiffPreview = Effect.fn("getReviewDiffPreview")(function* (
    input: ReviewDiffPreviewInput,
  ) {
    const details = yield* statusDetailsLocal(input.cwd);
    if (!details.isRepo) {
      return {
        cwd: input.cwd,
        generatedAt: yield* DateTime.now,
        sources: [],
      };
    }

    const branch = details.branch;
    const baseRef =
      input.baseRef ??
      (branch
        ? yield* resolveBaseBranchForNoUpstream(input.cwd, branch).pipe(
            Effect.orElseSucceed(() => null),
          )
        : null);

    const dirtyTrackedResult = yield* executeGit(
      "GitVcsDriver.getReviewDiffPreview.dirtyTracked",
      input.cwd,
      [
        "diff",
        "--patch",
        "--minimal",
        ...(input.ignoreWhitespace ? ["--ignore-all-space"] : []),
        "HEAD",
        "--",
      ],
      {
        maxOutputBytes: REVIEW_DIFF_PATCH_MAX_OUTPUT_BYTES,
        appendTruncationMarker: true,
      },
    ).pipe(
      Effect.orElseSucceed(() => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      })),
    );
    const dirtyUntracked = yield* readUntrackedReviewDiffs(input.cwd).pipe(
      Effect.orElseSucceed(() => ({ diff: "", truncated: false })),
    );
    const dirtyDiff = [dirtyTrackedResult.stdout.trimEnd(), dirtyUntracked.diff.trimEnd()]
      .filter((diff) => diff.length > 0)
      .join("\n");

    const baseResult =
      baseRef && branch
        ? yield* executeGit(
            "GitVcsDriver.getReviewDiffPreview.base",
            input.cwd,
            [
              "diff",
              "--patch",
              "--minimal",
              ...(input.ignoreWhitespace ? ["--ignore-all-space"] : []),
              `${baseRef}...HEAD`,
            ],
            {
              maxOutputBytes: REVIEW_DIFF_PATCH_MAX_OUTPUT_BYTES,
              appendTruncationMarker: true,
            },
          ).pipe(
            Effect.orElseSucceed(() => ({
              exitCode: 0,
              stdout: "",
              stderr: "",
              stdoutTruncated: false,
              stderrTruncated: false,
            })),
          )
        : null;
    const baseDiff = baseResult?.stdout ?? "";
    const hashDiff = (diff: string) =>
      crypto.digest("SHA-256", new TextEncoder().encode(diff)).pipe(
        Effect.map(Encoding.encodeHex),
        Effect.mapError(
          (cause) =>
            new GitCommandError({
              operation: "GitVcsDriver.getReviewDiffPreview.hash",
              command: "crypto.digest SHA-256",
              cwd: input.cwd,
              detail: "Failed to hash review diff.",
              cause,
            }),
        ),
      );
    const [dirtyDiffHash, baseDiffHash] = yield* Effect.all([
      hashDiff(dirtyDiff),
      hashDiff(baseDiff),
    ]);

    const sources: ReviewDiffPreviewSource[] = [
      {
        id: "working-tree",
        kind: "working-tree",
        title: "Dirty worktree",
        baseRef: "HEAD",
        headRef: null,
        diff: dirtyDiff,
        diffHash: dirtyDiffHash,
        truncated: dirtyTrackedResult.stdoutTruncated || dirtyUntracked.truncated,
      },
      {
        id: "branch-range",
        kind: "branch-range",
        title: baseRef ? `Against ${baseRef}` : "Against base branch",
        baseRef,
        headRef: branch ?? "HEAD",
        diff: baseDiff,
        diffHash: baseDiffHash,
        truncated: baseResult?.stdoutTruncated ?? false,
      },
    ];

    return {
      cwd: input.cwd,
      generatedAt: yield* DateTime.now,
      sources,
    };
  });

  const readConfigValue: GitVcsDriver.GitVcsDriver["Service"]["readConfigValue"] = (cwd, key) =>
    runGitStdout("GitVcsDriver.readConfigValue", cwd, ["config", "--get", key], true).pipe(
      Effect.map((stdout) => stdout.trim()),
      Effect.map((trimmed) => (trimmed.length > 0 ? trimmed : null)),
    );

  const listRefs: GitVcsDriver.GitVcsDriver["Service"]["listRefs"] = Effect.fn("listRefs")(
    function* (input) {
      const gitCommonDir = yield* resolveGitCommonDirForRefs(input.cwd);
      if (gitCommonDir === null) {
        return {
          refs: [],
          isRepo: false,
          hasPrimaryRemote: false,
          nextCursor: null,
          totalCount: 0,
        };
      }

      const snapshot = yield* loadCurrentGitRefsSnapshot(gitCommonDir, input.refresh === true);
      const currentBranchResult = yield* executeGit(
        "GitVcsDriver.listRefs.currentBranch",
        input.cwd,
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        {
          timeoutMs: 5_000,
          allowNonZeroExit: true,
        },
      );
      const currentBranch =
        currentBranchResult.exitCode === 0 ? currentBranchResult.stdout.trim() : null;
      const localBranches = snapshot.localBranches
        .map(({ ref, lastCommit }) => ({
          ref: {
            ...ref,
            current: currentBranch !== null && ref.name === currentBranch,
          },
          lastCommit,
        }))
        .toSorted((left, right) => {
          const leftPriority = left.ref.current ? 0 : left.ref.isDefault ? 1 : 2;
          const rightPriority = right.ref.current ? 0 : right.ref.isDefault ? 1 : 2;
          if (leftPriority !== rightPriority) return leftPriority - rightPriority;
          if (left.lastCommit !== right.lastCommit) return right.lastCommit - left.lastCommit;
          return left.ref.name.localeCompare(right.ref.name);
        })
        .map(({ ref }) => ref);
      const remoteBranches = snapshot.remoteBranches
        .toSorted((left, right) => {
          if (left.lastCommit !== right.lastCommit) return right.lastCommit - left.lastCommit;
          return left.ref.name.localeCompare(right.ref.name);
        })
        .map(({ ref }) => ref);
      const allBranches = input.includeMatchingRemoteRefs
        ? [...localBranches, ...remoteBranches]
        : dedupeRemoteBranchesWithLocalMatches([...localBranches, ...remoteBranches]);
      const branchesForKind =
        input.refKind === "local"
          ? allBranches.filter((ref) => !ref.isRemote)
          : input.refKind === "remote"
            ? allBranches.filter((ref) => ref.isRemote)
            : allBranches;
      const refs = paginateBranches({
        refs: filterBranchesForListQuery(branchesForKind, input.query),
        cursor: input.cursor,
        limit: input.limit,
      });
      return {
        refs: [...refs.refs],
        isRepo: true,
        hasPrimaryRemote: snapshot.hasPrimaryRemote,
        repositoryIdentity: gitCommonDir,
        nextCursor: refs.nextCursor,
        totalCount: refs.totalCount,
      };
    },
  );

  const createWorktree: GitVcsDriver.GitVcsDriver["Service"]["createWorktree"] = Effect.fn(
    "createWorktree",
  )(function* (input) {
    yield* requireOriginOrLocalRef({
      cwd: input.cwd,
      refName: input.refName,
      operation: "GitVcsDriver.createWorktree",
      args: ["worktree", "add", input.refName],
    });
    if (input.baseRefName) {
      yield* requireOriginOrLocalRef({
        cwd: input.cwd,
        refName: input.baseRefName,
        operation: "GitVcsDriver.createWorktree",
        args: ["worktree", "add", input.baseRefName],
      });
    }
    const targetBranch = input.newRefName ?? input.refName;
    const sanitizedBranch = targetBranch.replace(/\//g, "-");
    const repoName = path.basename(input.cwd);
    const worktreePath = input.path ?? path.join(worktreesDir, repoName, sanitizedBranch);
    const args = input.newRefName
      ? ["worktree", "add", "-b", input.newRefName, worktreePath, input.refName]
      : ["worktree", "add", worktreePath, input.refName];

    yield* executeGit("GitVcsDriver.createWorktree", input.cwd, args, {
      fallbackErrorDetail: "git worktree add failed",
    });

    if (input.newRefName && input.baseRefName) {
      const remoteNames = yield* listRemoteNames(input.cwd).pipe(Effect.orElseSucceed(() => []));
      const parsedBaseRef = parseRemoteRefWithRemoteNames(
        input.baseRefName,
        remoteNames.toSorted((left, right) => right.length - left.length),
      );
      const baseBranch = parsedBaseRef?.branchName ?? input.baseRefName;
      yield* runGit("GitVcsDriver.createWorktree.configureBaseRef", input.cwd, [
        "config",
        `branch.${input.newRefName}.gh-merge-base`,
        baseBranch,
      ]);
    }

    return {
      worktree: {
        path: worktreePath,
        refName: targetBranch,
      },
    };
  });

  const fetchPullRequestBranch: GitVcsDriver.GitVcsDriver["Service"]["fetchPullRequestBranch"] =
    Effect.fn("fetchPullRequestBranch")(function* (input) {
      if (!(yield* originRemoteExists(input.cwd))) {
        return yield* new GitCommandError({
          ...gitCommandContext({
            operation: "GitVcsDriver.fetchPullRequestBranch",
            cwd: input.cwd,
            args: ["fetch", "origin"],
          }),
          detail:
            "Origin-only policy requires an origin remote before materializing a pull request branch.",
        });
      }
      yield* executeGit(
        "GitVcsDriver.fetchPullRequestBranch",
        input.cwd,
        [
          "fetch",
          "--quiet",
          "--no-tags",
          ORIGIN_REMOTE_NAME,
          `+refs/pull/${input.prNumber}/head:refs/heads/${input.branch}`,
        ],
        {
          fallbackErrorDetail: "git fetch pull request branch failed",
        },
      );
    });

  const fetchRemote: GitVcsDriver.GitVcsDriver["Service"]["fetchRemote"] = Effect.fn("fetchRemote")(
    function* (input) {
      yield* executeGit(
        "GitVcsDriver.fetchRemote",
        input.cwd,
        ["fetch", "--quiet", input.remoteName],
        {
          env: STATUS_UPSTREAM_REFRESH_ENV,
          fallbackErrorDetail: `git fetch ${input.remoteName} failed`,
        },
      );
    },
  );

  const mergeRef: GitVcsDriver.GitVcsDriver["Service"]["mergeRef"] = (input) =>
    executeGit(
      "GitVcsDriver.mergeRef",
      input.cwd,
      ["merge", "--no-ff", "--no-edit", "--", input.sourceRef],
      { allowNonZeroExit: true },
    );

  const deleteLocalBranch: GitVcsDriver.GitVcsDriver["Service"]["deleteLocalBranch"] = (input) =>
    executeGit("GitVcsDriver.deleteLocalBranch", input.cwd, ["branch", "-d", "--", input.branch], {
      allowNonZeroExit: true,
    });

  const resolveRemoteTrackingCommit: GitVcsDriver.GitVcsDriver["Service"]["resolveRemoteTrackingCommit"] =
    Effect.fn("resolveRemoteTrackingCommit")(function* (input) {
      const remoteNames = yield* listRemoteNames(input.cwd);
      const parsedRemoteRef = parseRemoteRefWithRemoteNames(
        input.refName,
        remoteNames.toSorted((left, right) => right.length - left.length),
      );
      const remoteRefName =
        parsedRemoteRef?.remoteRef ?? `${input.fallbackRemoteName}/${input.refName}`;
      const commitSha = yield* runGitStdout("GitVcsDriver.resolveRemoteTrackingCommit", input.cwd, [
        "rev-parse",
        "--verify",
        `refs/remotes/${remoteRefName}^{commit}`,
      ]).pipe(Effect.map((stdout) => stdout.trim()));

      return { commitSha, remoteRefName };
    });

  const fetchRemoteBranch: GitVcsDriver.GitVcsDriver["Service"]["fetchRemoteBranch"] = Effect.fn(
    "fetchRemoteBranch",
  )(function* (input) {
    if (!isOriginRemoteName(input.remoteName)) {
      return yield* new GitCommandError({
        ...gitCommandContext({
          operation: "GitVcsDriver.fetchRemoteBranch",
          cwd: input.cwd,
          args: ["fetch", input.remoteName],
        }),
        detail: "Origin-only policy permits materializing a remote branch only from origin.",
      });
    }
    yield* runGit("GitVcsDriver.fetchRemoteBranch.fetch", input.cwd, [
      "fetch",
      "--quiet",
      "--no-tags",
      input.remoteName,
      `+refs/heads/${input.remoteBranch}:refs/remotes/${input.remoteName}/${input.remoteBranch}`,
    ]);

    const localBranchAlreadyExists = yield* branchExists(input.cwd, input.localBranch);
    const targetRef = `${input.remoteName}/${input.remoteBranch}`;
    yield* runGit(
      "GitVcsDriver.fetchRemoteBranch.materialize",
      input.cwd,
      localBranchAlreadyExists
        ? ["branch", "--force", input.localBranch, targetRef]
        : ["branch", input.localBranch, targetRef],
    );
  });

  const fetchRemoteTrackingBranch: GitVcsDriver.GitVcsDriver["Service"]["fetchRemoteTrackingBranch"] =
    Effect.fn("fetchRemoteTrackingBranch")(function* (input) {
      yield* runGit("GitVcsDriver.fetchRemoteTrackingBranch", input.cwd, [
        "fetch",
        "--quiet",
        "--no-tags",
        input.remoteName,
        `+refs/heads/${input.remoteBranch}:refs/remotes/${input.remoteName}/${input.remoteBranch}`,
      ]);
    });

  const setBranchUpstream: GitVcsDriver.GitVcsDriver["Service"]["setBranchUpstream"] = (input) =>
    isOriginRemoteName(input.remoteName)
      ? runGit("GitVcsDriver.setBranchUpstream", input.cwd, [
          "branch",
          "--set-upstream-to",
          `${input.remoteName}/${input.remoteBranch}`,
          input.branch,
        ])
      : Effect.fail(
          new GitCommandError({
            ...gitCommandContext({
              operation: "GitVcsDriver.setBranchUpstream",
              cwd: input.cwd,
              args: ["branch", "--set-upstream-to", `${input.remoteName}/${input.remoteBranch}`],
            }),
            detail: "Origin-only policy permits branch tracking only through origin.",
          }),
        );

  const removeWorktree: GitVcsDriver.GitVcsDriver["Service"]["removeWorktree"] = Effect.fn(
    "removeWorktree",
  )(function* (input) {
    const args = ["worktree", "remove"];
    if (input.force) {
      args.push("--force");
    }
    args.push(input.path);
    yield* executeGit("GitVcsDriver.removeWorktree", input.cwd, args, {
      timeoutMs: 15_000,
      fallbackErrorDetail: "git worktree remove failed",
    });
  });

  const renameBranch: GitVcsDriver.GitVcsDriver["Service"]["renameBranch"] = Effect.fn(
    "renameBranch",
  )(function* (input) {
    if (input.oldBranch === input.newBranch) {
      return { branch: input.newBranch };
    }
    const targetBranch = yield* resolveAvailableBranchName(input.cwd, input.newBranch);

    yield* executeGit(
      "GitVcsDriver.renameBranch",
      input.cwd,
      ["branch", "-m", "--", input.oldBranch, targetBranch],
      {
        timeoutMs: 10_000,
        fallbackErrorDetail: "git branch rename failed",
      },
    );

    return { branch: targetBranch };
  });

  const switchRef: GitVcsDriver.GitVcsDriver["Service"]["switchRef"] = Effect.fn("switchRef")(
    function* (input) {
      yield* requireOriginOrLocalRef({
        cwd: input.cwd,
        refName: input.refName,
        operation: "GitVcsDriver.switchRef",
        args: ["checkout", input.refName],
      });
      const [localInputExists, remoteExists] = yield* Effect.all(
        [
          executeGit(
            "GitVcsDriver.switchRef.localInputExists",
            input.cwd,
            ["show-ref", "--verify", "--quiet", `refs/heads/${input.refName}`],
            {
              timeoutMs: 5_000,
              allowNonZeroExit: true,
            },
          ).pipe(Effect.map((result) => result.exitCode === 0)),
          executeGit(
            "GitVcsDriver.switchRef.remoteExists",
            input.cwd,
            ["show-ref", "--verify", "--quiet", `refs/remotes/${input.refName}`],
            {
              timeoutMs: 5_000,
              allowNonZeroExit: true,
            },
          ).pipe(Effect.map((result) => result.exitCode === 0)),
        ],
        { concurrency: "unbounded" },
      );

      const localTrackingBranch = remoteExists
        ? yield* executeGit(
            "GitVcsDriver.switchRef.localTrackingBranch",
            input.cwd,
            ["for-each-ref", "--format=%(refname:short)\t%(upstream:short)", "refs/heads"],
            {
              timeoutMs: 5_000,
              allowNonZeroExit: true,
            },
          ).pipe(
            Effect.map((result) =>
              result.exitCode === 0
                ? parseTrackingBranchByUpstreamRef(result.stdout, input.refName)
                : null,
            ),
          )
        : null;

      const localTrackedBranchCandidate = deriveLocalBranchNameFromRemoteRef(input.refName);
      const localTrackedBranchTargetExists =
        remoteExists && localTrackedBranchCandidate
          ? yield* executeGit(
              "GitVcsDriver.switchRef.localTrackedBranchTargetExists",
              input.cwd,
              ["show-ref", "--verify", "--quiet", `refs/heads/${localTrackedBranchCandidate}`],
              {
                timeoutMs: 5_000,
                allowNonZeroExit: true,
              },
            ).pipe(Effect.map((result) => result.exitCode === 0))
          : false;

      const checkoutArgs = localInputExists
        ? ["checkout", input.refName]
        : remoteExists && !localTrackingBranch && localTrackedBranchTargetExists
          ? ["checkout", input.refName]
          : remoteExists && !localTrackingBranch
            ? ["checkout", "--track", input.refName]
            : remoteExists && localTrackingBranch
              ? ["checkout", localTrackingBranch]
              : ["checkout", input.refName];

      yield* executeGit("GitVcsDriver.switchRef.checkout", input.cwd, checkoutArgs, {
        timeoutMs: 10_000,
        fallbackErrorDetail: "git checkout failed",
      });

      const refName = yield* runGitStdout("GitVcsDriver.switchRef.currentBranch", input.cwd, [
        "branch",
        "--show-current",
      ]).pipe(Effect.map((stdout) => stdout.trim() || null));

      return { refName };
    },
  );

  const createRef: GitVcsDriver.GitVcsDriver["Service"]["createRef"] = Effect.fn("createRef")(
    function* (input) {
      yield* executeGit("GitVcsDriver.createRef", input.cwd, ["branch", input.refName], {
        timeoutMs: 10_000,
        fallbackErrorDetail: "git branch create failed",
      });
      if (input.switchRef) {
        yield* switchRef({ cwd: input.cwd, refName: input.refName });
      }

      return { refName: input.refName };
    },
  );

  const initRepo: GitVcsDriver.GitVcsDriver["Service"]["initRepo"] = (input) =>
    executeGit("GitVcsDriver.initRepo", input.cwd, ["init"], {
      timeoutMs: 10_000,
      fallbackErrorDetail: "git init failed",
    }).pipe(Effect.asVoid);

  const listLocalBranchNames: GitVcsDriver.GitVcsDriver["Service"]["listLocalBranchNames"] = (
    cwd,
  ) =>
    runGitStdout("GitVcsDriver.listLocalBranchNames", cwd, [
      "branch",
      "--list",
      "--no-column",
      "--format=%(refname:short)",
    ]).pipe(
      Effect.map((stdout) => {
        const branchNames: Array<string> = [];
        for (const line of stdout.split("\n")) {
          const branchName = line.trim();
          if (branchName.length > 0) {
            branchNames.push(branchName);
          }
        }
        return branchNames;
      }),
    );

  return GitVcsDriver.GitVcsDriver.of({
    execute,
    status,
    statusDetails,
    statusDetailsLocal,
    statusDetailsRemote,
    prepareCommitContext,
    commit: (cwd, subject, body, options) =>
      withGitRefsInvalidation(cwd, commit(cwd, subject, body, options)),
    pushCurrentBranch: (cwd, fallbackBranch, options) =>
      withGitRefsInvalidation(cwd, pushCurrentBranch(cwd, fallbackBranch, options)),
    pullCurrentBranch: (cwd) => withGitRefsInvalidation(cwd, pullCurrentBranch(cwd)),
    readRangeContext,
    getReviewDiffPreview,
    readConfigValue,
    listRefs,
    createWorktree: (input) => withGitRefsInvalidation(input.cwd, createWorktree(input)),
    fetchPullRequestBranch: (input) =>
      withGitRefsInvalidation(input.cwd, fetchPullRequestBranch(input)),
    ensureRemote: (input) => withGitRefsInvalidation(input.cwd, ensureRemote(input)),
    resolvePrimaryRemoteName,
    fetchRemote: (input) => withGitRefsInvalidation(input.cwd, fetchRemote(input)),
    resolveRemoteTrackingCommit,
    fetchRemoteBranch: (input) => withGitRefsInvalidation(input.cwd, fetchRemoteBranch(input)),
    fetchRemoteTrackingBranch: (input) =>
      withGitRefsInvalidation(input.cwd, fetchRemoteTrackingBranch(input)),
    setBranchUpstream: (input) => withGitRefsInvalidation(input.cwd, setBranchUpstream(input)),
    removeWorktree: (input) => withGitRefsInvalidation(input.cwd, removeWorktree(input)),
    mergeRef: (input) => withGitRefsInvalidation(input.cwd, mergeRef(input)),
    deleteLocalBranch: (input) => withGitRefsInvalidation(input.cwd, deleteLocalBranch(input)),
    renameBranch: (input) => withGitRefsInvalidation(input.cwd, renameBranch(input)),
    createRef: (input) => withGitRefsInvalidation(input.cwd, createRef(input)),
    switchRef: (input) => withGitRefsInvalidation(input.cwd, switchRef(input)),
    initRepo: (input) => withGitRefsInvalidation(input.cwd, initRepo(input)),
    listLocalBranchNames,
  });
});
