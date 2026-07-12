import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import {
  PositiveInt,
  TrimmedNonEmptyString,
  type GitHubCreateIssueInput,
  type GitHubCreateIssueResult,
  type GitHubIssue,
  type GitHubIssueMutationInput,
  type GitHubIssueMutationResult,
  type GitHubListIssuesInput,
  type GitHubListIssuesResult,
  type GitHubLoginInput,
  type GitHubStatusInput,
  type GitHubStatusResult,
  type SourceControlRepositoryVisibility,
  type VcsError,
} from "@t3tools/contracts";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import { pickForkSourceControlContext } from "../fork/sourceControlContextPolicy.ts";
import {
  decodeGitHubPullRequestJson,
  decodeGitHubPullRequestListJson,
} from "./gitHubPullRequests.ts";

const DEFAULT_TIMEOUT_MS = 30_000;

const gitHubCliFailureFields = {
  command: Schema.Literal("gh"),
  cwd: Schema.String,
  cause: Schema.Defect(),
} as const;

export class GitHubCliUnavailableError extends Schema.TaggedErrorClass<GitHubCliUnavailableError>()(
  "GitHubCliUnavailableError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "GitHub CLI (`gh`) is required but not available on PATH.";
  }

  override get message(): string {
    return `GitHub CLI failed in execute: ${this.detail}`;
  }
}

export class GitHubCliAuthenticationError extends Schema.TaggedErrorClass<GitHubCliAuthenticationError>()(
  "GitHubCliAuthenticationError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "GitHub CLI is not authenticated. Run `gh auth login` and retry.";
  }

  override get message(): string {
    return `GitHub CLI failed in execute: ${this.detail}`;
  }
}

export class GitHubPullRequestNotFoundError extends Schema.TaggedErrorClass<GitHubPullRequestNotFoundError>()(
  "GitHubPullRequestNotFoundError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "Pull request not found. Check the PR number or URL and try again.";
  }

  override get message(): string {
    return `GitHub CLI failed in execute: ${this.detail}`;
  }
}

export class GitHubCliCommandError extends Schema.TaggedErrorClass<GitHubCliCommandError>()(
  "GitHubCliCommandError",
  gitHubCliFailureFields,
) {
  get detail(): string {
    return "GitHub CLI command failed.";
  }

  override get message(): string {
    return `GitHub CLI failed in execute: ${this.detail}`;
  }
}

const gitHubCliDecodeFields = {
  command: Schema.Literal("gh"),
  cwd: Schema.String,
  cause: Schema.Defect(),
} as const;

export class GitHubPullRequestListDecodeError extends Schema.TaggedErrorClass<GitHubPullRequestListDecodeError>()(
  "GitHubPullRequestListDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid PR list JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in listOpenPullRequests: ${this.detail}`;
  }
}

export class GitHubChangeRequestListDecodeError extends Schema.TaggedErrorClass<GitHubChangeRequestListDecodeError>()(
  "GitHubChangeRequestListDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid change request JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in listChangeRequests: ${this.detail}`;
  }
}

export class GitHubPullRequestDecodeError extends Schema.TaggedErrorClass<GitHubPullRequestDecodeError>()(
  "GitHubPullRequestDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid pull request JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in getPullRequest: ${this.detail}`;
  }
}

export class GitHubRepositoryDecodeError extends Schema.TaggedErrorClass<GitHubRepositoryDecodeError>()(
  "GitHubRepositoryDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid repository JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in getRepositoryCloneUrls: ${this.detail}`;
  }
}

export class GitHubAuthStatusDecodeError extends Schema.TaggedErrorClass<GitHubAuthStatusDecodeError>()(
  "GitHubAuthStatusDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid auth status JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in getStatus: ${this.detail}`;
  }
}

export class GitHubIssueListDecodeError extends Schema.TaggedErrorClass<GitHubIssueListDecodeError>()(
  "GitHubIssueListDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid issue list JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in listIssues: ${this.detail}`;
  }
}

export class GitHubIssueDecodeError extends Schema.TaggedErrorClass<GitHubIssueDecodeError>()(
  "GitHubIssueDecodeError",
  gitHubCliDecodeFields,
) {
  get detail(): string {
    return "GitHub CLI returned invalid issue JSON.";
  }

  override get message(): string {
    return `GitHub CLI failed in readIssue: ${this.detail}`;
  }
}

export const GitHubCliError = Schema.Union([
  GitHubCliUnavailableError,
  GitHubCliAuthenticationError,
  GitHubPullRequestNotFoundError,
  GitHubCliCommandError,
  GitHubPullRequestListDecodeError,
  GitHubChangeRequestListDecodeError,
  GitHubPullRequestDecodeError,
  GitHubRepositoryDecodeError,
  GitHubAuthStatusDecodeError,
  GitHubIssueListDecodeError,
  GitHubIssueDecodeError,
]);
export type GitHubCliError = typeof GitHubCliError.Type;

export const isGitHubCliError = Schema.is(GitHubCliError);

export function fromVcsError(
  context: {
    readonly command: "gh";
    readonly cwd: string;
  },
  error: VcsError,
): GitHubCliError {
  if (
    error._tag === "VcsProcessSpawnError" &&
    error.cause instanceof PlatformError.PlatformError &&
    error.cause.reason._tag === "NotFound" &&
    error.cause.reason.module === "ChildProcess" &&
    error.cause.reason.method === "spawn"
  ) {
    return new GitHubCliUnavailableError({ ...context, cause: error });
  }

  if (error._tag === "VcsProcessExitError") {
    if (error.failureKind === "authentication") {
      return new GitHubCliAuthenticationError({ ...context, cause: error });
    }
    if (error.failureKind === "not-found") {
      return new GitHubPullRequestNotFoundError({ ...context, cause: error });
    }
  }

  return new GitHubCliCommandError({ ...context, cause: error });
}

export interface GitHubPullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state?: "open" | "closed" | "merged";
  readonly isCrossRepository?: boolean;
  readonly headRepositoryNameWithOwner?: string | null;
  readonly headRepositoryOwnerLogin?: string | null;
}

export interface GitHubRepositoryCloneUrls {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
}

export class GitHubCli extends Context.Service<
  GitHubCli,
  {
    readonly execute: (input: {
      readonly cwd: string;
      readonly args: ReadonlyArray<string>;
      readonly timeoutMs?: number;
    }) => Effect.Effect<VcsProcess.VcsProcessOutput, GitHubCliError>;

    readonly listOpenPullRequests: (input: {
      readonly cwd: string;
      readonly headSelector: string;
      readonly limit?: number;
      readonly repository?: string;
    }) => Effect.Effect<ReadonlyArray<GitHubPullRequestSummary>, GitHubCliError>;

    readonly getPullRequest: (input: {
      readonly cwd: string;
      readonly reference: string;
      readonly repository?: string;
    }) => Effect.Effect<GitHubPullRequestSummary, GitHubCliError>;

    readonly getRepositoryCloneUrls: (input: {
      readonly cwd: string;
      readonly repository: string;
    }) => Effect.Effect<GitHubRepositoryCloneUrls, GitHubCliError>;

    readonly createRepository: (input: {
      readonly cwd: string;
      readonly repository: string;
      readonly visibility: SourceControlRepositoryVisibility;
    }) => Effect.Effect<GitHubRepositoryCloneUrls, GitHubCliError>;

    readonly createPullRequest: (input: {
      readonly cwd: string;
      readonly baseBranch: string;
      readonly headSelector: string;
      readonly title: string;
      readonly bodyFile: string;
      readonly repository: string;
    }) => Effect.Effect<void, GitHubCliError>;

    readonly getDefaultBranch: (input: {
      readonly cwd: string;
      readonly repository?: string;
    }) => Effect.Effect<string | null, GitHubCliError>;

    readonly checkoutPullRequest: (input: {
      readonly cwd: string;
      readonly reference: string;
      readonly force?: boolean;
      readonly repository?: string;
    }) => Effect.Effect<void, GitHubCliError>;

    readonly getStatus: (
      input: GitHubStatusInput,
    ) => Effect.Effect<GitHubStatusResult, GitHubCliError>;

    readonly login: (input: GitHubLoginInput) => Effect.Effect<GitHubStatusResult, GitHubCliError>;

    readonly listIssues: (
      input: GitHubListIssuesInput,
    ) => Effect.Effect<GitHubListIssuesResult, GitHubCliError>;

    readonly createIssue: (
      input: GitHubCreateIssueInput,
    ) => Effect.Effect<GitHubCreateIssueResult, GitHubCliError>;

    readonly closeIssue: (
      input: GitHubIssueMutationInput,
    ) => Effect.Effect<GitHubIssueMutationResult, GitHubCliError>;

    readonly reopenIssue: (
      input: GitHubIssueMutationInput,
    ) => Effect.Effect<GitHubIssueMutationResult, GitHubCliError>;
  }
>()("t3/sourceControl/GitHubCli") {}

const RawGitHubRepositoryCloneUrlsSchema = Schema.Struct({
  nameWithOwner: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  sshUrl: TrimmedNonEmptyString,
});
const decodeRawGitHubRepositoryCloneUrls = Schema.decodeEffect(
  Schema.fromJsonString(RawGitHubRepositoryCloneUrlsSchema),
);

const RawGitHubRepositorySchema = Schema.Struct({
  nameWithOwner: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  defaultBranchRef: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        name: TrimmedNonEmptyString,
      }),
    ),
  ),
});
const decodeRawGitHubRepository = Schema.decodeEffect(
  Schema.fromJsonString(RawGitHubRepositorySchema),
);

const RawGitHubAuthHostEntrySchema = Schema.Struct({
  state: Schema.optional(Schema.NullOr(Schema.String)),
  active: Schema.optional(Schema.Boolean),
  host: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  login: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  tokenSource: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  scopes: Schema.optional(Schema.NullOr(Schema.String)),
  gitProtocol: Schema.optional(Schema.NullOr(Schema.String)),
});
const RawGitHubAuthStatusSchema = Schema.Struct({
  hosts: Schema.Record(Schema.String, Schema.Array(RawGitHubAuthHostEntrySchema)),
});
const decodeRawGitHubAuthStatus = Schema.decodeEffect(
  Schema.fromJsonString(RawGitHubAuthStatusSchema),
);

const RawGitHubIssueLabelSchema = Schema.Struct({
  name: TrimmedNonEmptyString,
  color: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
});

const RawGitHubIssueAssigneeSchema = Schema.Struct({
  login: TrimmedNonEmptyString,
});

const RawGitHubIssueAuthorSchema = Schema.Struct({
  login: TrimmedNonEmptyString,
});

const RawGitHubIssueSchema = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  state: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  body: Schema.optional(Schema.NullOr(Schema.String)),
  createdAt: TrimmedNonEmptyString,
  updatedAt: TrimmedNonEmptyString,
  labels: Schema.Array(RawGitHubIssueLabelSchema),
  assignees: Schema.Array(RawGitHubIssueAssigneeSchema),
  author: Schema.optional(Schema.NullOr(RawGitHubIssueAuthorSchema)),
});
const decodeRawGitHubIssue = Schema.decodeEffect(Schema.fromJsonString(RawGitHubIssueSchema));
const decodeRawGitHubIssueList = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Array(RawGitHubIssueSchema)),
);

function normalizeRepositoryCloneUrls(
  raw: Schema.Schema.Type<typeof RawGitHubRepositoryCloneUrlsSchema>,
): GitHubRepositoryCloneUrls {
  return {
    nameWithOwner: raw.nameWithOwner,
    url: raw.url,
    sshUrl: raw.sshUrl,
  };
}

function normalizeRepository(raw: Schema.Schema.Type<typeof RawGitHubRepositorySchema>) {
  return {
    nameWithOwner: raw.nameWithOwner,
    url: raw.url,
    description: raw.description ?? null,
    defaultBranch: raw.defaultBranchRef?.name ?? null,
  };
}

function normalizeIssueState(state: string): "open" | "closed" {
  return state.toUpperCase() === "CLOSED" ? "closed" : "open";
}

function normalizeIssue(raw: Schema.Schema.Type<typeof RawGitHubIssueSchema>): GitHubIssue {
  return {
    number: raw.number,
    title: raw.title,
    state: normalizeIssueState(raw.state),
    url: raw.url,
    body: raw.body ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    labels: raw.labels.map((label) => ({
      name: label.name,
      color: label.color ?? null,
    })),
    assignees: raw.assignees.map((assignee) => ({
      login: assignee.login,
    })),
    author: raw.author?.login ?? null,
  };
}

function splitScopes(raw: string | null | undefined): ReadonlyArray<string> {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeGitProtocol(raw: string | null | undefined): "https" | "ssh" | null {
  return raw === "https" || raw === "ssh" ? raw : null;
}

function resolveCommandCwd(cwd: string | null | undefined): string {
  return cwd ?? process.cwd();
}

function buildRepoFlag(repository: string | undefined): Array<string> {
  return repository ? ["--repo", repository] : [];
}

function parseGitRemoteNames(raw: string): ReadonlyArray<string> {
  return raw
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseRemoteHostAndPath(remoteUrl: string): { host: string; path: string } | null {
  const trimmed = remoteUrl.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith("git@")) {
    const hostWithPath = trimmed.slice("git@".length);
    const separatorIndex = hostWithPath.search(/[:/]/);
    if (separatorIndex <= 0) return null;
    return {
      host: hostWithPath.slice(0, separatorIndex).toLowerCase(),
      path: hostWithPath.slice(separatorIndex + 1),
    };
  }

  try {
    const parsed = new URL(trimmed);
    return {
      host: parsed.hostname.toLowerCase(),
      path: parsed.pathname.replace(/^\/+/, ""),
    };
  } catch {
    return null;
  }
}

export function parseGitHubRepositoryFromRemoteUrl(
  remoteUrl: string,
  hostname: string,
): string | null {
  const parsed = parseRemoteHostAndPath(remoteUrl);
  if (!parsed || parsed.host !== hostname.toLowerCase()) return null;

  const path = parsed.path.replace(/\/+$/, "").replace(/\.git$/i, "");
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const owner = segments[0];
  const repo = segments[1];
  return owner && repo ? `${owner}/${repo}` : null;
}

/**
 * `gh repo create` prints the canonical URL of the new repository on stdout
 * (e.g. `https://github.com/owner/repo`). Reading it back here avoids a
 * follow-up `gh repo view`, which can race GitHub's GraphQL eventual
 * consistency window and falsely report the just-created repo as missing.
 */
function deriveRepositoryCloneUrlsFromCreateOutput(
  stdout: string,
  repository: string,
): GitHubRepositoryCloneUrls {
  const fallbackHost = "github.com";
  const match = stdout.match(/https?:\/\/[^\s]+/);
  if (match) {
    const cleaned = match[0].replace(/\.git$/, "");
    try {
      const parsed = new URL(cleaned);
      const pathname = parsed.pathname.replace(/^\/+|\/+$/g, "");
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length === 2) {
        const nameWithOwner = `${segments[0]}/${segments[1]}`;
        return {
          nameWithOwner,
          url: `${parsed.origin}/${nameWithOwner}`,
          sshUrl: `git@${parsed.host}:${nameWithOwner}.git`,
        };
      }
    } catch {
      // Fall through to the input-derived defaults below.
    }
  }
  return {
    nameWithOwner: repository,
    url: `https://${fallbackHost}/${repository}`,
    sshUrl: `git@${fallbackHost}:${repository}.git`,
  };
}

export const make = Effect.gen(function* () {
  const process = yield* VcsProcess.VcsProcess;

  const execute: GitHubCli["Service"]["execute"] = (input) =>
    process
      .run({
        operation: "GitHubCli.execute",
        command: "gh",
        args: input.args,
        cwd: input.cwd,
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      })
      .pipe(Effect.mapError((error) => fromVcsError({ command: "gh", cwd: input.cwd }, error)));

  const runGitStdout = (input: { cwd: string | null; args: ReadonlyArray<string> }) =>
    process
      .run({
        operation: "GitHubCli.git",
        command: "git",
        args: input.args,
        cwd: resolveCommandCwd(input.cwd),
        allowNonZeroExit: true,
      })
      .pipe(
        Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() : "")),
        Effect.orElseSucceed(() => ""),
      );

  const resolveRepositoryArg = Effect.fn("GitHubCli.resolveRepositoryArg")(function* (input: {
    cwd: string | null;
    repository?: string;
    hostname?: string;
  }) {
    const explicitRepository = input.repository?.trim();
    if (explicitRepository) return explicitRepository;
    if (!input.cwd) return undefined;

    const hostname = input.hostname ?? "github.com";
    const remoteNames = parseGitRemoteNames(
      yield* runGitStdout({
        cwd: input.cwd,
        args: ["remote"],
      }),
    );
    const remotes = yield* Effect.all(
      remoteNames.map((name) =>
        runGitStdout({
          cwd: input.cwd,
          args: ["remote", "get-url", name],
        }).pipe(Effect.map((url) => ({ name, url }))),
      ),
      { concurrency: "unbounded" },
    );
    const githubRemotes = remotes.filter(
      (remote) => parseGitHubRepositoryFromRemoteUrl(remote.url, hostname) !== null,
    );
    const selectedRemote = pickForkSourceControlContext(githubRemotes);
    return selectedRemote
      ? (parseGitHubRepositoryFromRemoteUrl(selectedRemote.remoteUrl, hostname) ?? undefined)
      : undefined;
  });

  const resolveOriginRepositoryArg = Effect.fn("GitHubCli.resolveOriginRepositoryArg")(
    function* (input: { cwd: string | null; repository?: string }) {
      const cwd = resolveCommandCwd(input.cwd);
      if (!input.cwd) {
        return yield* new GitHubCliCommandError({
          command: "gh",
          cwd,
          cause: new Error("Origin-only policy requires a repository working directory."),
        });
      }

      const originUrl = yield* runGitStdout({
        cwd: input.cwd,
        args: ["remote", "get-url", "origin"],
      });
      const remote = parseRemoteHostAndPath(originUrl);
      const originRepositoryName = remote
        ? parseGitHubRepositoryFromRemoteUrl(originUrl, remote.host)
        : null;
      if (!remote || !originRepositoryName) {
        return yield* new GitHubCliCommandError({
          command: "gh",
          cwd,
          cause: new Error("Origin-only policy requires origin to identify a GitHub repository."),
        });
      }
      const originRepository =
        remote.host === "github.com"
          ? originRepositoryName
          : `${remote.host}/${originRepositoryName}`;

      const explicitRepository = input.repository?.trim();
      if (
        explicitRepository &&
        explicitRepository.toLowerCase() !== originRepository.toLowerCase()
      ) {
        return yield* new GitHubCliCommandError({
          command: "gh",
          cwd,
          cause: new Error(
            "Origin-only policy rejected an issue mutation targeting a non-origin repository.",
          ),
        });
      }

      return originRepository;
    },
  );

  const readRepository = (input: { cwd: string | null; repository?: string; hostname?: string }) =>
    resolveRepositoryArg(input).pipe(
      Effect.flatMap((repository) =>
        execute({
          cwd: resolveCommandCwd(input.cwd),
          args: [
            "repo",
            "view",
            ...(repository ? [repository] : []),
            "--json",
            "nameWithOwner,url,description,defaultBranchRef",
          ],
        }),
      ),
      Effect.map((result) => result.stdout.trim()),
      Effect.flatMap((raw) =>
        decodeRawGitHubRepository(raw).pipe(
          Effect.mapError(
            (cause) =>
              new GitHubRepositoryDecodeError({
                command: "gh",
                cwd: resolveCommandCwd(input.cwd),
                cause,
              }),
          ),
        ),
      ),
      Effect.map(normalizeRepository),
    );

  const readIssue = (input: {
    cwd: string | null;
    repository?: string;
    hostname?: string;
    reference: string;
  }) =>
    resolveRepositoryArg(input).pipe(
      Effect.flatMap((repository) =>
        execute({
          cwd: resolveCommandCwd(input.cwd),
          args: [
            "issue",
            "view",
            input.reference,
            ...buildRepoFlag(repository),
            "--json",
            "number,title,state,url,body,createdAt,updatedAt,labels,assignees,author",
          ],
        }),
      ),
      Effect.map((result) => result.stdout.trim()),
      Effect.flatMap((raw) =>
        decodeRawGitHubIssue(raw).pipe(
          Effect.mapError(
            (cause) =>
              new GitHubIssueDecodeError({
                command: "gh",
                cwd: resolveCommandCwd(input.cwd),
                cause,
              }),
          ),
        ),
      ),
      Effect.map(normalizeIssue),
    );

  const getStatus: GitHubCli["Service"]["getStatus"] = (input) => {
    const hostname = input.hostname ?? "github.com";
    return execute({
      cwd: resolveCommandCwd(input.cwd),
      args: ["auth", "status", "--hostname", hostname, "--active", "--json", "hosts"],
    }).pipe(
      Effect.map((result) => result.stdout.trim()),
      Effect.flatMap((raw) =>
        decodeRawGitHubAuthStatus(raw).pipe(
          Effect.mapError(
            (cause) =>
              new GitHubAuthStatusDecodeError({
                command: "gh",
                cwd: resolveCommandCwd(input.cwd),
                cause,
              }),
          ),
        ),
      ),
      Effect.flatMap((rawStatus) => {
        const hostEntries = rawStatus.hosts[hostname] ?? [];
        const activeEntry =
          hostEntries.find((entry) => entry.active === true) ?? hostEntries.at(0) ?? null;
        const authenticated =
          activeEntry?.state === "success" && (activeEntry.active ?? true) === true;

        return readRepository({ cwd: input.cwd, hostname }).pipe(
          Effect.orElseSucceed(() => null),
          Effect.map((repo) => ({
            installed: true,
            authenticated,
            hostname,
            accountLogin: authenticated ? (activeEntry?.login ?? null) : null,
            gitProtocol: authenticated ? normalizeGitProtocol(activeEntry?.gitProtocol) : null,
            tokenSource: authenticated ? (activeEntry?.tokenSource ?? null) : null,
            scopes: authenticated ? Array.from(splitScopes(activeEntry?.scopes)) : [],
            repo: authenticated ? repo : null,
          })),
        );
      }),
      Effect.catch((error) => {
        if (error._tag === "GitHubCliUnavailableError") {
          return Effect.succeed({
            installed: false,
            authenticated: false,
            hostname,
            accountLogin: null,
            gitProtocol: null,
            tokenSource: null,
            scopes: [],
            repo: null,
          });
        }
        if (error._tag === "GitHubCliAuthenticationError") {
          return Effect.succeed({
            installed: true,
            authenticated: false,
            hostname,
            accountLogin: null,
            gitProtocol: null,
            tokenSource: null,
            scopes: [],
            repo: null,
          });
        }
        return Effect.fail(error);
      }),
    );
  };

  const login: GitHubCli["Service"]["login"] = (input) =>
    execute({
      cwd: resolveCommandCwd(input.cwd),
      args: [
        "auth",
        "login",
        "--hostname",
        input.hostname ?? "github.com",
        "--git-protocol",
        input.gitProtocol ?? "https",
        "--web",
      ],
      timeoutMs: 5 * 60_000,
    }).pipe(
      Effect.asVoid,
      Effect.flatMap(() => getStatus({ cwd: input.cwd, hostname: input.hostname })),
    );

  return GitHubCli.of({
    execute,
    listOpenPullRequests: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "list",
          ...buildRepoFlag(input.repository),
          "--head",
          input.headSelector,
          "--state",
          "open",
          "--limit",
          String(input.limit ?? 1),
          "--json",
          "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner",
        ],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          raw.length === 0
            ? Effect.succeed([])
            : Effect.sync(() => decodeGitHubPullRequestListJson(raw)).pipe(
                Effect.flatMap((decoded) => {
                  if (!Result.isSuccess(decoded)) {
                    return Effect.fail(
                      new GitHubPullRequestListDecodeError({
                        command: "gh",
                        cwd: input.cwd,
                        cause: decoded.failure,
                      }),
                    );
                  }

                  return Effect.succeed(
                    decoded.success.map(({ updatedAt: _updatedAt, ...summary }) => summary),
                  );
                }),
              ),
        ),
      ),
    getPullRequest: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "view",
          input.reference,
          ...buildRepoFlag(input.repository),
          "--json",
          "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner",
        ],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          Effect.sync(() => decodeGitHubPullRequestJson(raw)).pipe(
            Effect.flatMap((decoded) => {
              if (!Result.isSuccess(decoded)) {
                return Effect.fail(
                  new GitHubPullRequestDecodeError({
                    command: "gh",
                    cwd: input.cwd,
                    cause: decoded.failure,
                  }),
                );
              }

              return Effect.succeed(
                (({ updatedAt: _updatedAt, ...summary }) => summary)(decoded.success),
              );
            }),
          ),
        ),
      ),
    getRepositoryCloneUrls: (input) =>
      execute({
        cwd: input.cwd,
        args: ["repo", "view", input.repository, "--json", "nameWithOwner,url,sshUrl"],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          decodeRawGitHubRepositoryCloneUrls(raw).pipe(
            Effect.mapError(
              (cause) =>
                new GitHubRepositoryDecodeError({
                  command: "gh",
                  cwd: input.cwd,
                  cause,
                }),
            ),
          ),
        ),
        Effect.map(normalizeRepositoryCloneUrls),
      ),
    createRepository: (input) =>
      execute({
        cwd: input.cwd,
        args: ["repo", "create", input.repository, `--${input.visibility}`],
      }).pipe(
        Effect.map((result) =>
          deriveRepositoryCloneUrlsFromCreateOutput(result.stdout, input.repository),
        ),
      ),
    createPullRequest: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "create",
          "--repo",
          input.repository,
          "--base",
          input.baseBranch,
          "--head",
          input.headSelector,
          "--title",
          input.title,
          "--body-file",
          input.bodyFile,
        ],
      }).pipe(Effect.asVoid),
    getDefaultBranch: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "repo",
          "view",
          ...(input.repository ? [input.repository] : []),
          "--json",
          "defaultBranchRef",
          "--jq",
          ".defaultBranchRef.name",
        ],
      }).pipe(
        Effect.map((value) => {
          const trimmed = value.stdout.trim();
          return trimmed.length > 0 ? trimmed : null;
        }),
      ),
    checkoutPullRequest: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "checkout",
          input.reference,
          ...buildRepoFlag(input.repository),
          ...(input.force ? ["--force"] : []),
        ],
      }).pipe(Effect.asVoid),
    getStatus,
    login,
    listIssues: (input) =>
      resolveRepositoryArg({ cwd: input.cwd }).pipe(
        Effect.flatMap((repository) =>
          execute({
            cwd: resolveCommandCwd(input.cwd),
            args: [
              "issue",
              "list",
              ...buildRepoFlag(repository),
              ...(input.state ? ["--state", input.state] : []),
              "--limit",
              String(input.limit ?? 20),
              "--json",
              "number,title,state,url,body,createdAt,updatedAt,labels,assignees,author",
            ],
          }).pipe(Effect.map((result) => ({ repository, stdout: result.stdout.trim() }))),
        ),
        Effect.flatMap(({ repository, stdout }) =>
          (stdout.length === 0
            ? Effect.succeed([] as Array<Schema.Schema.Type<typeof RawGitHubIssueSchema>>)
            : decodeRawGitHubIssueList(stdout).pipe(
                Effect.mapError(
                  (cause) =>
                    new GitHubIssueListDecodeError({
                      command: "gh",
                      cwd: resolveCommandCwd(input.cwd),
                      cause,
                    }),
                ),
              )
          ).pipe(Effect.map((issues) => ({ repository, issues }))),
        ),
        Effect.flatMap(({ repository, issues }) =>
          readRepository({ cwd: input.cwd, ...(repository ? { repository } : {}) }).pipe(
            Effect.orElseSucceed(() => null),
            Effect.map((repo) => ({
              repo,
              issues: issues.map(normalizeIssue),
            })),
          ),
        ),
      ),
    createIssue: (input) =>
      resolveOriginRepositoryArg({
        cwd: input.cwd,
        ...(input.repo ? { repository: input.repo } : {}),
      }).pipe(
        Effect.flatMap((repository) =>
          execute({
            cwd: resolveCommandCwd(input.cwd),
            args: [
              "issue",
              "create",
              ...buildRepoFlag(repository),
              "--title",
              input.title,
              "--body",
              input.body ?? "",
            ],
          }).pipe(Effect.map((result) => ({ repository, stdout: result.stdout }))),
        ),
        Effect.map(({ repository, stdout }) => ({
          repository,
          reference: stdout
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .find((line) => line.length > 0),
        })),
        Effect.flatMap(({ repository, reference }) =>
          reference
            ? readIssue({
                cwd: input.cwd,
                ...(repository ? { repository } : {}),
                reference,
              })
            : Effect.fail(
                new GitHubCliCommandError({
                  command: "gh",
                  cwd: resolveCommandCwd(input.cwd),
                  cause: new Error("GitHub CLI did not return the created issue URL."),
                }),
              ),
        ),
      ),
    closeIssue: (input) =>
      resolveOriginRepositoryArg({
        cwd: input.cwd,
        ...(input.repo ? { repository: input.repo } : {}),
      }).pipe(
        Effect.flatMap((repository) =>
          execute({
            cwd: resolveCommandCwd(input.cwd),
            args: ["issue", "close", String(input.issueNumber), ...buildRepoFlag(repository)],
          }),
        ),
        Effect.as({
          number: input.issueNumber,
          state: "closed" as const,
        }),
      ),
    reopenIssue: (input) =>
      resolveOriginRepositoryArg({
        cwd: input.cwd,
        ...(input.repo ? { repository: input.repo } : {}),
      }).pipe(
        Effect.flatMap((repository) =>
          execute({
            cwd: resolveCommandCwd(input.cwd),
            args: ["issue", "reopen", String(input.issueNumber), ...buildRepoFlag(repository)],
          }),
        ),
        Effect.as({
          number: input.issueNumber,
          state: "open" as const,
        }),
      ),
  });
});

export const layer = Layer.effect(GitHubCli, make);
