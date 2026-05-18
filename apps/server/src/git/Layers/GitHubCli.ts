import { Effect, Layer, Schema, SchemaIssue } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@t3tools/contracts";

import { runProcess } from "../../processRunner.ts";
import { GitHubCliError } from "@t3tools/contracts";
import {
  GitHubCli,
  type GitHubRepositoryCloneUrls,
  type GitHubCliShape,
  type GitHubPullRequestSummary,
} from "../Services/GitHubCli.ts";
import type { GitHubIssue } from "@t3tools/contracts";

const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeGitHubCliError(operation: "execute" | "stdout", error: unknown): GitHubCliError {
  if (error instanceof Error) {
    if (error.message.includes("Command not found: gh")) {
      return new GitHubCliError({
        operation,
        detail: "GitHub CLI (`gh`) is required but not available on PATH.",
        cause: error,
      });
    }

    const lower = error.message.toLowerCase();
    if (
      lower.includes("authentication failed") ||
      lower.includes("not logged in") ||
      lower.includes("gh auth login") ||
      lower.includes("no oauth token")
    ) {
      return new GitHubCliError({
        operation,
        detail: "GitHub CLI is not authenticated. Run `gh auth login` and retry.",
        cause: error,
      });
    }

    if (
      lower.includes("could not resolve to a pullrequest") ||
      lower.includes("repository.pullrequest") ||
      lower.includes("no pull requests found for branch") ||
      lower.includes("pull request not found")
    ) {
      return new GitHubCliError({
        operation,
        detail: "Pull request not found. Check the PR number or URL and try again.",
        cause: error,
      });
    }

    return new GitHubCliError({
      operation,
      detail: `GitHub CLI command failed: ${error.message}`,
      cause: error,
    });
  }

  return new GitHubCliError({
    operation,
    detail: "GitHub CLI command failed.",
    cause: error,
  });
}

function normalizePullRequestState(input: {
  state?: string | null | undefined;
  mergedAt?: string | null | undefined;
}): "open" | "closed" | "merged" {
  const mergedAt = input.mergedAt;
  const state = input.state;
  if ((typeof mergedAt === "string" && mergedAt.trim().length > 0) || state === "MERGED") {
    return "merged";
  }
  if (state === "CLOSED") {
    return "closed";
  }
  return "open";
}

const RawGitHubPullRequestSchema = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  baseRefName: TrimmedNonEmptyString,
  headRefName: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  mergedAt: Schema.optional(Schema.NullOr(Schema.String)),
  updatedAt: Schema.optional(Schema.NullOr(Schema.String)),
  isCrossRepository: Schema.optional(Schema.Boolean),
  headRepository: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        nameWithOwner: Schema.String,
      }),
    ),
  ),
  headRepositoryOwner: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        login: Schema.String,
      }),
    ),
  ),
});

const RawGitHubRepositoryCloneUrlsSchema = Schema.Struct({
  nameWithOwner: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  sshUrl: TrimmedNonEmptyString,
});

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

function normalizePullRequestSummary(
  raw: Schema.Schema.Type<typeof RawGitHubPullRequestSchema>,
): GitHubPullRequestSummary {
  const headRepositoryNameWithOwner = raw.headRepository?.nameWithOwner ?? null;
  const headRepositoryOwnerLogin =
    raw.headRepositoryOwner?.login ??
    (typeof headRepositoryNameWithOwner === "string" && headRepositoryNameWithOwner.includes("/")
      ? (headRepositoryNameWithOwner.split("/")[0] ?? null)
      : null);
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    baseRefName: raw.baseRefName,
    headRefName: raw.headRefName,
    state: normalizePullRequestState(raw),
    ...(raw.updatedAt !== undefined ? { updatedAt: raw.updatedAt } : {}),
    ...(typeof raw.isCrossRepository === "boolean"
      ? { isCrossRepository: raw.isCrossRepository }
      : {}),
    ...(headRepositoryNameWithOwner ? { headRepositoryNameWithOwner } : {}),
    ...(headRepositoryOwnerLogin ? { headRepositoryOwnerLogin } : {}),
  };
}

function normalizeRepositoryCloneUrls(
  raw: Schema.Schema.Type<typeof RawGitHubRepositoryCloneUrlsSchema>,
): GitHubRepositoryCloneUrls {
  return {
    nameWithOwner: raw.nameWithOwner,
    url: raw.url,
    sshUrl: raw.sshUrl,
  };
}

function deriveRepositoryCloneUrlsFromCreateOutput(
  stdout: string,
  repository: string,
): GitHubRepositoryCloneUrls | null {
  const match = stdout.match(/https?:\/\/[^\s]+/);
  if (!match) {
    return null;
  }

  const cleaned = match[0].replace(/\.git$/, "");
  try {
    const parsed = new URL(cleaned);
    const pathname = parsed.pathname.replace(/^\/+|\/+$/g, "");
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length !== 2) {
      return null;
    }
    const nameWithOwner = `${segments[0]}/${segments[1]}`;
    return {
      nameWithOwner,
      url: `${parsed.origin}/${nameWithOwner}`,
      sshUrl: `git@${parsed.host}:${nameWithOwner}.git`,
    };
  } catch {
    return {
      nameWithOwner: repository,
      url: `https://github.com/${repository}`,
      sshUrl: `git@github.com:${repository}.git`,
    };
  }
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
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.startsWith("git@")) {
    const hostWithPath = trimmed.slice("git@".length);
    const separatorIndex = hostWithPath.search(/[:/]/);
    if (separatorIndex <= 0) {
      return null;
    }
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

function parseGitHubRepositoryFromRemoteUrl(remoteUrl: string, hostname: string): string | null {
  const parsed = parseRemoteHostAndPath(remoteUrl);
  if (!parsed || parsed.host !== hostname.toLowerCase()) {
    return null;
  }

  const path = parsed.path.replace(/\/+$/, "").replace(/\.git$/i, "");
  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1];
  return owner && repo ? `${owner}/${repo}` : null;
}

function decodeGitHubJson<S extends Schema.Top>(
  raw: string,
  schema: S,
  operation:
    | "listOpenPullRequests"
    | "getPullRequest"
    | "getRepositoryCloneUrls"
    | "createRepository"
    | "getStatus"
    | "listIssues"
    | "readRepository"
    | "readIssue",
  invalidDetail: string,
): Effect.Effect<S["Type"], GitHubCliError, S["DecodingServices"]> {
  return Schema.decodeEffect(Schema.fromJsonString(schema))(raw).pipe(
    Effect.mapError(
      (error) =>
        new GitHubCliError({
          operation,
          detail: `${invalidDetail}: ${SchemaIssue.makeFormatterDefault()(error.issue)}`,
          cause: error,
        }),
    ),
  );
}

const makeGitHubCli = Effect.sync(() => {
  const execute: GitHubCliShape["execute"] = (input) =>
    Effect.tryPromise({
      try: () =>
        runProcess("gh", input.args, {
          cwd: input.cwd,
          timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        }),
      catch: (error) => normalizeGitHubCliError("execute", error),
    });

  const runGitStdout = (input: { cwd: string | null; args: ReadonlyArray<string> }) =>
    Effect.tryPromise({
      try: async () => {
        const result = await runProcess("git", input.args, {
          cwd: resolveCommandCwd(input.cwd),
          allowNonZeroExit: true,
        });
        return result.code === 0 ? result.stdout.trim() : "";
      },
      catch: (error) => normalizeGitHubCliError("execute", error),
    }).pipe(Effect.catch(() => Effect.succeed("")));

  const resolveRepositoryArg = Effect.fn("resolveRepositoryArg")(function* (input: {
    cwd: string | null;
    repository?: string;
    hostname?: string;
  }) {
    const explicitRepository = input.repository?.trim();
    if (explicitRepository) {
      return explicitRepository;
    }
    if (!input.cwd) {
      return undefined;
    }

    const hostname = input.hostname ?? "github.com";
    const currentBranch = yield* runGitStdout({
      cwd: input.cwd,
      args: ["branch", "--show-current"],
    });
    const branchPushRemote =
      currentBranch.length > 0
        ? yield* runGitStdout({
            cwd: input.cwd,
            args: ["config", "--get", `branch.${currentBranch}.pushRemote`],
          })
        : "";
    const remotePushDefault = yield* runGitStdout({
      cwd: input.cwd,
      args: ["config", "--get", "remote.pushDefault"],
    });
    const remoteNames = parseGitRemoteNames(
      yield* runGitStdout({
        cwd: input.cwd,
        args: ["remote"],
      }),
    );
    const preferredRemoteName =
      branchPushRemote ||
      remotePushDefault ||
      (remoteNames.includes("origin") ? "origin" : (remoteNames[0] ?? ""));
    if (!preferredRemoteName) {
      return undefined;
    }

    const remoteUrl = yield* runGitStdout({
      cwd: input.cwd,
      args: ["remote", "get-url", preferredRemoteName],
    });
    const parsedRepository = parseGitHubRepositoryFromRemoteUrl(remoteUrl, hostname);
    return parsedRepository ?? undefined;
  });

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
        decodeGitHubJson(
          raw,
          RawGitHubRepositorySchema,
          "readRepository",
          "GitHub CLI returned invalid repository JSON.",
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
        decodeGitHubJson(
          raw,
          RawGitHubIssueSchema,
          "readIssue",
          "GitHub CLI returned invalid issue JSON.",
        ),
      ),
      Effect.map(normalizeIssue),
    );

  const getStatus: GitHubCliShape["getStatus"] = (input) => {
    const hostname = input.hostname ?? "github.com";
    return execute({
      cwd: resolveCommandCwd(input.cwd),
      args: ["auth", "status", "--hostname", hostname, "--active", "--json", "hosts"],
    }).pipe(
      Effect.map((result) => result.stdout.trim()),
      Effect.flatMap((raw) =>
        decodeGitHubJson(
          raw,
          RawGitHubAuthStatusSchema,
          "getStatus",
          "GitHub CLI returned invalid auth status JSON.",
        ),
      ),
      Effect.flatMap((rawStatus) => {
        const hostEntries = rawStatus.hosts[hostname] ?? [];
        const activeEntry =
          hostEntries.find((entry) => entry.active === true) ?? hostEntries.at(0) ?? null;
        const authenticated =
          activeEntry?.state === "success" && (activeEntry.active ?? true) === true;

        return readRepository({ cwd: input.cwd, hostname }).pipe(
          Effect.catch(() => Effect.succeed(null)),
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
        if (error.detail.includes("required but not available")) {
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
        if (error.detail.includes("not authenticated")) {
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

  const login: GitHubCliShape["login"] = (input) =>
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
      Effect.flatMap(() =>
        getStatus({
          cwd: input.cwd,
          hostname: input.hostname,
        }),
      ),
    );

  const service = {
    execute,
    listOpenPullRequests: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "list",
          "--head",
          input.headSelector,
          "--state",
          input.state ?? "open",
          "--limit",
          String(input.limit ?? 1),
          "--json",
          "number,title,url,baseRefName,headRefName,state,mergedAt,updatedAt,isCrossRepository,headRepository,headRepositoryOwner",
        ],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          raw.length === 0
            ? Effect.succeed([])
            : decodeGitHubJson(
                raw,
                Schema.Array(RawGitHubPullRequestSchema),
                "listOpenPullRequests",
                "GitHub CLI returned invalid PR list JSON.",
              ),
        ),
        Effect.map((pullRequests) => pullRequests.map(normalizePullRequestSummary)),
      ),
    getPullRequest: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "view",
          input.reference,
          "--json",
          "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner",
        ],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          decodeGitHubJson(
            raw,
            RawGitHubPullRequestSchema,
            "getPullRequest",
            "GitHub CLI returned invalid pull request JSON.",
          ),
        ),
        Effect.map(normalizePullRequestSummary),
      ),
    getRepositoryCloneUrls: (input) =>
      execute({
        cwd: input.cwd,
        args: ["repo", "view", input.repository, "--json", "nameWithOwner,url,sshUrl"],
      }).pipe(
        Effect.map((result) => result.stdout.trim()),
        Effect.flatMap((raw) =>
          decodeGitHubJson(
            raw,
            RawGitHubRepositoryCloneUrlsSchema,
            "getRepositoryCloneUrls",
            "GitHub CLI returned invalid repository JSON.",
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
        Effect.flatMap((derived) =>
          derived
            ? Effect.succeed(derived)
            : execute({
                cwd: input.cwd,
                args: ["repo", "view", input.repository, "--json", "nameWithOwner,url,sshUrl"],
              }).pipe(
                Effect.map((result) => result.stdout.trim()),
                Effect.flatMap((raw) =>
                  decodeGitHubJson(
                    raw,
                    RawGitHubRepositoryCloneUrlsSchema,
                    "createRepository",
                    "GitHub CLI returned invalid repository JSON.",
                  ),
                ),
                Effect.map(normalizeRepositoryCloneUrls),
              ),
        ),
      ),
    createPullRequest: (input) =>
      execute({
        cwd: input.cwd,
        args: [
          "pr",
          "create",
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
        args: ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"],
      }).pipe(
        Effect.map((value) => {
          const trimmed = value.stdout.trim();
          return trimmed.length > 0 ? trimmed : null;
        }),
      ),
    checkoutPullRequest: (input) =>
      execute({
        cwd: input.cwd,
        args: ["pr", "checkout", input.reference, ...(input.force ? ["--force"] : [])],
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
            : decodeGitHubJson(
                stdout,
                Schema.Array(RawGitHubIssueSchema),
                "listIssues",
                "GitHub CLI returned invalid issue list JSON.",
              )
          ).pipe(Effect.map((issues) => ({ repository, issues }))),
        ),
        Effect.flatMap(({ repository, issues }) =>
          readRepository({ cwd: input.cwd, ...(repository ? { repository } : {}) }).pipe(
            Effect.catch(() => Effect.succeed(null)),
            Effect.map((repo) => ({
              repo,
              issues: issues.map(normalizeIssue),
            })),
          ),
        ),
      ),
    createIssue: (input) =>
      resolveRepositoryArg({
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
                new GitHubCliError({
                  operation: "createIssue",
                  detail: "GitHub CLI did not return the created issue URL.",
                }),
              ),
        ),
      ),
    closeIssue: (input) =>
      resolveRepositoryArg({
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
      resolveRepositoryArg({
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
  } satisfies GitHubCliShape;

  return service;
});

export const GitHubCliLive = Layer.effect(GitHubCli, makeGitHubCli);
