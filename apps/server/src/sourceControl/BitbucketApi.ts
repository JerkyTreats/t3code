import { Config, Context, Effect, FileSystem, Layer, Option, Schema } from "effect";
import {
  TrimmedNonEmptyString,
  type SourceControlProviderAuth,
  type SourceControlRepositoryCloneUrls,
  type SourceControlRepositoryVisibility,
} from "@t3tools/contracts";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { sanitizeBranchFragment } from "@t3tools/shared/git";
import { detectSourceControlProviderFromRemoteUrl } from "@t3tools/shared/sourceControl";

import { GitCore } from "../git/Services/GitCore.ts";
import * as BitbucketPullRequests from "./bitbucketPullRequests.ts";
import * as SourceControlProvider from "./SourceControlProvider.ts";

const DEFAULT_API_BASE_URL = "https://api.bitbucket.org/2.0";

const BitbucketApiEnvConfig = Config.all({
  baseUrl: Config.string("T3CODE_BITBUCKET_API_BASE_URL").pipe(
    Config.withDefault(DEFAULT_API_BASE_URL),
  ),
  accessToken: Config.string("T3CODE_BITBUCKET_ACCESS_TOKEN").pipe(Config.option),
  email: Config.string("T3CODE_BITBUCKET_EMAIL").pipe(Config.option),
  apiToken: Config.string("T3CODE_BITBUCKET_API_TOKEN").pipe(Config.option),
});

export class BitbucketApiError extends Schema.TaggedErrorClass<BitbucketApiError>()(
  "BitbucketApiError",
  {
    operation: Schema.String,
    detail: Schema.String,
    status: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Bitbucket API failed in ${this.operation}: ${this.detail}`;
  }
}

const RawBitbucketRepositorySchema = Schema.Struct({
  full_name: TrimmedNonEmptyString,
  links: Schema.Struct({
    html: Schema.optional(Schema.Struct({ href: TrimmedNonEmptyString })),
    clone: Schema.optional(
      Schema.Array(Schema.Struct({ name: TrimmedNonEmptyString, href: TrimmedNonEmptyString })),
    ),
  }),
  mainbranch: Schema.optional(Schema.NullOr(Schema.Struct({ name: TrimmedNonEmptyString }))),
});

const RawBitbucketBranchingModelSchema = Schema.Struct({
  development: Schema.optional(
    Schema.Struct({
      branch: Schema.optional(
        Schema.NullOr(Schema.Struct({ name: Schema.optional(TrimmedNonEmptyString) })),
      ),
      is_valid: Schema.optional(Schema.Boolean),
      name: Schema.optional(Schema.NullOr(Schema.String)),
      use_mainbranch: Schema.optional(Schema.Boolean),
    }),
  ),
});

const BitbucketUserSchema = Schema.Struct({
  username: Schema.optional(TrimmedNonEmptyString),
  display_name: Schema.optional(TrimmedNonEmptyString),
  account_id: Schema.optional(TrimmedNonEmptyString),
});

export interface BitbucketRepositoryLocator {
  readonly workspace: string;
  readonly repoSlug: string;
}

export interface BitbucketApiShape {
  readonly probeAuth: Effect.Effect<SourceControlProviderAuth, never>;
  readonly listPullRequests: (input: {
    readonly cwd: string;
    readonly context?: SourceControlProvider.SourceControlProviderContext;
    readonly headSelector: string;
    readonly source?: SourceControlProvider.SourceControlRefSelector;
    readonly state: "open" | "closed" | "merged" | "all";
    readonly limit?: number;
  }) => Effect.Effect<
    ReadonlyArray<BitbucketPullRequests.NormalizedBitbucketPullRequestRecord>,
    BitbucketApiError
  >;
  readonly getPullRequest: (input: {
    readonly cwd: string;
    readonly context?: SourceControlProvider.SourceControlProviderContext;
    readonly reference: string;
  }) => Effect.Effect<
    BitbucketPullRequests.NormalizedBitbucketPullRequestRecord,
    BitbucketApiError
  >;
  readonly getRepositoryCloneUrls: (input: {
    readonly cwd: string;
    readonly context?: SourceControlProvider.SourceControlProviderContext;
    readonly repository: string;
  }) => Effect.Effect<SourceControlRepositoryCloneUrls, BitbucketApiError>;
  readonly createRepository: (input: {
    readonly cwd: string;
    readonly repository: string;
    readonly visibility: SourceControlRepositoryVisibility;
  }) => Effect.Effect<SourceControlRepositoryCloneUrls, BitbucketApiError>;
  readonly createPullRequest: (input: {
    readonly cwd: string;
    readonly context?: SourceControlProvider.SourceControlProviderContext;
    readonly baseBranch: string;
    readonly headSelector: string;
    readonly source?: SourceControlProvider.SourceControlRefSelector;
    readonly target?: SourceControlProvider.SourceControlRefSelector;
    readonly title: string;
    readonly bodyFile: string;
  }) => Effect.Effect<void, BitbucketApiError>;
  readonly getDefaultBranch: (input: {
    readonly cwd: string;
    readonly context?: SourceControlProvider.SourceControlProviderContext;
  }) => Effect.Effect<string | null, BitbucketApiError>;
  readonly checkoutPullRequest: (input: {
    readonly cwd: string;
    readonly context?: SourceControlProvider.SourceControlProviderContext;
    readonly reference: string;
    readonly force?: boolean;
  }) => Effect.Effect<void, BitbucketApiError>;
}

export class BitbucketApi extends Context.Service<BitbucketApi, BitbucketApiShape>()(
  "t3/source-control/BitbucketApi",
) {}

function nonEmpty(value: string | undefined): Option.Option<string> {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? Option.none() : Option.some(trimmed);
}

function normalizeChangeRequestId(reference: string): string {
  const trimmed = reference.trim().replace(/^#/, "");
  const urlMatch = /(?:pull-requests|pullrequests|pull-request|pull|pr)\/(\d+)(?:\D.*)?$/i.exec(
    trimmed,
  );
  return urlMatch?.[1] ?? trimmed;
}

function sourceWorkspace(input: {
  readonly headSelector: string;
  readonly source?: SourceControlProvider.SourceControlRefSelector;
}): string | undefined {
  return (
    input.source?.owner ??
    SourceControlProvider.parseSourceControlOwnerRef(input.headSelector)?.owner
  );
}

function toBitbucketStates(state: "open" | "closed" | "merged" | "all"): ReadonlyArray<string> {
  switch (state) {
    case "open":
      return ["OPEN"];
    case "closed":
      return ["DECLINED", "SUPERSEDED"];
    case "merged":
      return ["MERGED"];
    case "all":
      return ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"];
  }
}

function parseBitbucketRepositorySlug(value: string): BitbucketRepositoryLocator | null {
  const normalized = value.trim().replace(/\.git$/u, "");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.length < 2) return null;
  const workspace = parts.at(-2);
  const repoSlug = parts.at(-1);
  return workspace && repoSlug ? { workspace, repoSlug } : null;
}

function requireRepositoryLocator(
  operation: string,
  repository: string,
): Effect.Effect<BitbucketRepositoryLocator, BitbucketApiError> {
  const locator = parseBitbucketRepositorySlug(repository);
  return locator
    ? Effect.succeed(locator)
    : Effect.fail(
        new BitbucketApiError({
          operation,
          detail: "Bitbucket repositories must be specified as workspace/repository.",
        }),
      );
}

function parseBitbucketRemoteUrl(remoteUrl: string): BitbucketRepositoryLocator | null {
  const trimmed = remoteUrl.trim();
  if (trimmed.startsWith("git@")) {
    const pathStart = trimmed.indexOf(":");
    return pathStart < 0 ? null : parseBitbucketRepositorySlug(trimmed.slice(pathStart + 1));
  }
  try {
    return parseBitbucketRepositorySlug(new URL(trimmed).pathname);
  } catch {
    return null;
  }
}

function normalizeRepositoryCloneUrls(
  raw: typeof RawBitbucketRepositorySchema.Type,
): SourceControlRepositoryCloneUrls {
  const httpClone =
    raw.links.clone?.find((entry) => entry.name.toLowerCase() === "https")?.href ??
    raw.links.html?.href;
  const sshClone = raw.links.clone?.find((entry) => entry.name.toLowerCase() === "ssh")?.href;
  return {
    nameWithOwner: raw.full_name,
    url: httpClone ?? raw.links.html?.href ?? raw.full_name,
    sshUrl: sshClone ?? httpClone ?? raw.full_name,
  };
}

function defaultChangeRequestTargetBranch(input: {
  readonly repository: typeof RawBitbucketRepositorySchema.Type;
  readonly branchingModel: typeof RawBitbucketBranchingModelSchema.Type | null;
}): string | null {
  const repositoryMainBranch = input.repository.mainbranch?.name ?? null;
  const development = input.branchingModel?.development;
  if (!development || development.use_mainbranch === true || development.is_valid === false) {
    return repositoryMainBranch;
  }
  const developmentBranch = development.branch?.name?.trim() ?? development.name?.trim() ?? "";
  return developmentBranch.length === 0 || developmentBranch === "null"
    ? repositoryMainBranch
    : developmentBranch;
}

function shouldPreferSshRemote(originRemoteUrl: string | null): boolean {
  const trimmed = originRemoteUrl?.trim() ?? "";
  return trimmed.startsWith("git@") || trimmed.startsWith("ssh://");
}

function selectCloneUrl(input: {
  readonly cloneUrls: SourceControlRepositoryCloneUrls;
  readonly originRemoteUrl: string | null;
}): string {
  return shouldPreferSshRemote(input.originRemoteUrl)
    ? input.cloneUrls.sshUrl
    : input.cloneUrls.url;
}

function checkoutBranchName(input: {
  readonly pullRequestId: number;
  readonly headBranch: string;
  readonly isCrossRepository: boolean;
}): string {
  return input.isCrossRepository
    ? `t3code/pr-${input.pullRequestId}/${sanitizeBranchFragment(input.headBranch)}`
    : input.headBranch;
}

function repositoryNameWithOwner(
  repository: Schema.Schema.Type<
    typeof BitbucketPullRequests.BitbucketPullRequestSchema
  >["source"]["repository"],
): string | null {
  const fullName = repository?.full_name?.trim() ?? "";
  return fullName.length > 0 ? fullName : null;
}

function repositoryOwnerName(repositoryName: string): string {
  return repositoryName.split("/")[0]?.trim() || "bitbucket";
}

function authFromConfig(
  config: Config.Success<typeof BitbucketApiEnvConfig>,
): SourceControlProviderAuth {
  if (Option.isSome(config.accessToken)) {
    return {
      status: "unknown",
      account: Option.none(),
      host: Option.some("bitbucket.org"),
      detail: Option.some("Bitbucket access token is configured."),
    };
  }
  if (Option.isSome(config.email) && Option.isSome(config.apiToken)) {
    return {
      status: "unknown",
      account: config.email,
      host: Option.some("bitbucket.org"),
      detail: Option.some("Bitbucket API token is configured."),
    };
  }
  return {
    status: "unauthenticated",
    account: Option.none(),
    host: Option.some("bitbucket.org"),
    detail: Option.some(
      "Set T3CODE_BITBUCKET_EMAIL and T3CODE_BITBUCKET_API_TOKEN, or T3CODE_BITBUCKET_ACCESS_TOKEN.",
    ),
  };
}

function requestError(operation: string, cause: unknown): BitbucketApiError {
  return new BitbucketApiError({
    operation,
    detail: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function responseError(
  operation: string,
  response: HttpClientResponse.HttpClientResponse,
): Effect.Effect<never, BitbucketApiError> {
  return response.text.pipe(
    Effect.catch(() => Effect.succeed("")),
    Effect.flatMap((body) =>
      Effect.fail(
        new BitbucketApiError({
          operation,
          status: response.status,
          detail:
            body.trim().length > 0
              ? `Bitbucket returned HTTP ${response.status}: ${body.trim()}`
              : `Bitbucket returned HTTP ${response.status}.`,
        }),
      ),
    ),
  );
}

function parseGitRemoteLines(stdout: string): ReadonlyArray<{ name: string; url: string }> {
  const remotes = new Map<string, { name: string; url: string }>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^([^\s]+)\s+([^\s]+)(?:\s+\([^)]+\))?$/u.exec(line.trim());
    if (!match?.[1] || !match[2]) continue;
    if (!remotes.has(match[1])) remotes.set(match[1], { name: match[1], url: match[2] });
  }
  return [...remotes.values()];
}

export const make = Effect.fn("makeBitbucketApi")(function* () {
  const config = yield* BitbucketApiEnvConfig;
  const httpClient = yield* HttpClient.HttpClient;
  const fileSystem = yield* FileSystem.FileSystem;
  const git = yield* GitCore;

  const apiUrl = (path: string) => `${config.baseUrl.replace(/\/+$/u, "")}${path}`;
  const withAuth = (request: HttpClientRequest.HttpClientRequest) => {
    if (Option.isSome(config.accessToken)) {
      return request.pipe(HttpClientRequest.bearerToken(config.accessToken.value));
    }
    if (Option.isSome(config.email) && Option.isSome(config.apiToken)) {
      return request.pipe(HttpClientRequest.basicAuth(config.email.value, config.apiToken.value));
    }
    return request;
  };
  const decodeResponse = <S extends Schema.Top>(
    operation: string,
    schema: S,
    response: HttpClientResponse.HttpClientResponse,
  ): Effect.Effect<S["Type"], BitbucketApiError, S["DecodingServices"]> =>
    HttpClientResponse.matchStatus({
      "2xx": (success) =>
        HttpClientResponse.schemaBodyJson(schema)(success).pipe(
          Effect.mapError(
            (cause) =>
              new BitbucketApiError({
                operation,
                detail: "Bitbucket returned invalid JSON for the requested resource.",
                cause,
              }),
          ),
        ),
      orElse: (failed) => responseError(operation, failed),
    })(response);
  const executeJson = <S extends Schema.Top>(
    operation: string,
    request: HttpClientRequest.HttpClientRequest,
    schema: S,
  ): Effect.Effect<S["Type"], BitbucketApiError, S["DecodingServices"]> =>
    httpClient.execute(withAuth(request.pipe(HttpClientRequest.acceptJson))).pipe(
      Effect.mapError((cause) => requestError(operation, cause)),
      Effect.flatMap((response) => decodeResponse(operation, schema, response)),
    );

  const resolveRepository = Effect.fn("BitbucketApi.resolveRepository")(function* (input: {
    readonly cwd: string;
    readonly context?: SourceControlProvider.SourceControlProviderContext;
    readonly repository?: string;
  }) {
    const fromRepository =
      input.repository !== undefined ? parseBitbucketRepositorySlug(input.repository) : null;
    if (fromRepository) return fromRepository;
    const fromContext =
      input.context?.provider.kind === "bitbucket"
        ? parseBitbucketRemoteUrl(input.context.remoteUrl)
        : null;
    if (fromContext) return fromContext;
    const remotes = yield* git
      .execute({
        operation: "BitbucketApi.resolveRepository.remotes",
        cwd: input.cwd,
        args: ["remote", "-v"],
        allowNonZeroExit: true,
      })
      .pipe(Effect.mapError((cause) => requestError("resolveRepository", cause)));
    for (const remote of parseGitRemoteLines(remotes.stdout)) {
      if (detectSourceControlProviderFromRemoteUrl(remote.url)?.kind !== "bitbucket") continue;
      const parsed = parseBitbucketRemoteUrl(remote.url);
      if (parsed) return parsed;
    }
    return yield* new BitbucketApiError({
      operation: "resolveRepository",
      detail: `No Bitbucket repository remote was detected for ${input.cwd}.`,
    });
  });

  const getRepositoryFromLocator = (repository: BitbucketRepositoryLocator) =>
    executeJson(
      "getRepository",
      HttpClientRequest.get(
        apiUrl(
          `/repositories/${encodeURIComponent(repository.workspace)}/${encodeURIComponent(repository.repoSlug)}`,
        ),
      ),
      RawBitbucketRepositorySchema,
    );
  const getRepository = (input: {
    readonly cwd: string;
    readonly context?: SourceControlProvider.SourceControlProviderContext;
    readonly repository?: string;
  }) => resolveRepository(input).pipe(Effect.flatMap(getRepositoryFromLocator));
  const getBranchingModelFromLocator = (repository: BitbucketRepositoryLocator) =>
    executeJson(
      "getBranchingModel",
      HttpClientRequest.get(
        apiUrl(
          `/repositories/${encodeURIComponent(repository.workspace)}/${encodeURIComponent(repository.repoSlug)}/branching-model`,
        ),
      ),
      RawBitbucketBranchingModelSchema,
    );
  const getRawPullRequestFromRepository = (
    repository: BitbucketRepositoryLocator,
    reference: string,
  ) =>
    executeJson(
      "getPullRequest",
      HttpClientRequest.get(
        apiUrl(
          `/repositories/${encodeURIComponent(repository.workspace)}/${encodeURIComponent(repository.repoSlug)}/pullrequests/${encodeURIComponent(normalizeChangeRequestId(reference))}`,
        ),
      ),
      BitbucketPullRequests.BitbucketPullRequestSchema,
    );
  const readConfigValueNullable = (cwd: string, key: string) =>
    git.readConfigValue(cwd, key).pipe(Effect.catch(() => Effect.succeed(null)));

  return BitbucketApi.of({
    probeAuth: executeJson(
      "probeAuth",
      HttpClientRequest.get(apiUrl("/user")),
      BitbucketUserSchema,
    ).pipe(
      Effect.map((user) => ({
        status: "authenticated" as const,
        account: nonEmpty(user.username ?? user.display_name ?? user.account_id),
        host: Option.some("bitbucket.org"),
        detail: Option.none<string>(),
      })),
      Effect.catch(() => Effect.succeed(authFromConfig(config))),
    ),
    listPullRequests: (input) =>
      resolveRepository(input).pipe(
        Effect.flatMap((repository) => {
          const states = toBitbucketStates(input.state);
          return executeJson(
            "listPullRequests",
            HttpClientRequest.get(
              apiUrl(
                `/repositories/${encodeURIComponent(repository.workspace)}/${encodeURIComponent(repository.repoSlug)}/pullrequests`,
              ),
              {
                urlParams: {
                  pagelen: String(Math.max(1, Math.min(input.limit ?? 20, 50))),
                  sort: "-updated_on",
                  q: [
                    `source.branch.name = "${SourceControlProvider.sourceBranch(input).replaceAll('"', '\\"')}"`,
                    states.length === 1
                      ? `state = "${states[0]}"`
                      : `(${states.map((state) => `state = "${state}"`).join(" OR ")})`,
                  ].join(" AND "),
                  state: states,
                },
              },
            ),
            BitbucketPullRequests.BitbucketPullRequestListSchema,
          );
        }),
        Effect.map((list) =>
          list.values.map(BitbucketPullRequests.normalizeBitbucketPullRequestRecord),
        ),
      ),
    getPullRequest: (input) =>
      resolveRepository(input).pipe(
        Effect.flatMap((repository) =>
          getRawPullRequestFromRepository(repository, input.reference),
        ),
        Effect.map(BitbucketPullRequests.normalizeBitbucketPullRequestRecord),
      ),
    getRepositoryCloneUrls: (input) =>
      getRepository(input).pipe(Effect.map(normalizeRepositoryCloneUrls)),
    createRepository: (input) =>
      requireRepositoryLocator("createRepository", input.repository).pipe(
        Effect.flatMap((repository) =>
          executeJson(
            "createRepository",
            HttpClientRequest.post(
              apiUrl(
                `/repositories/${encodeURIComponent(repository.workspace)}/${encodeURIComponent(repository.repoSlug)}`,
              ),
            ).pipe(
              HttpClientRequest.bodyJsonUnsafe({
                scm: "git",
                is_private: input.visibility === "private",
              }),
            ),
            RawBitbucketRepositorySchema,
          ),
        ),
        Effect.map(normalizeRepositoryCloneUrls),
      ),
    createPullRequest: (input) =>
      Effect.gen(function* () {
        const repository = yield* resolveRepository(input);
        const description = yield* fileSystem.readFileString(input.bodyFile).pipe(
          Effect.mapError(
            (cause) =>
              new BitbucketApiError({
                operation: "createPullRequest",
                detail: `Failed to read pull request body file ${input.bodyFile}.`,
                cause,
              }),
          ),
        );
        const sourceOwner = sourceWorkspace(input);
        yield* executeJson(
          "createPullRequest",
          HttpClientRequest.post(
            apiUrl(
              `/repositories/${encodeURIComponent(repository.workspace)}/${encodeURIComponent(repository.repoSlug)}/pullrequests`,
            ),
          ).pipe(
            HttpClientRequest.bodyJsonUnsafe({
              title: input.title,
              description,
              source: {
                branch: { name: SourceControlProvider.sourceBranch(input) },
                ...(sourceOwner
                  ? {
                      repository: {
                        full_name: `${sourceOwner}/${input.source?.repository ?? repository.repoSlug}`,
                      },
                    }
                  : {}),
              },
              destination: { branch: { name: input.target?.refName ?? input.baseBranch } },
            }),
          ),
          BitbucketPullRequests.BitbucketPullRequestSchema,
        );
      }),
    getDefaultBranch: (input) =>
      resolveRepository(input).pipe(
        Effect.flatMap((locator) =>
          Effect.all(
            {
              repository: getRepositoryFromLocator(locator),
              branchingModel: getBranchingModelFromLocator(locator).pipe(
                Effect.catch(() =>
                  Effect.succeed<typeof RawBitbucketBranchingModelSchema.Type | null>(null),
                ),
              ),
            },
            { concurrency: "unbounded" },
          ),
        ),
        Effect.map(defaultChangeRequestTargetBranch),
      ),
    checkoutPullRequest: (input) =>
      Effect.gen(function* () {
        const destinationRepository = yield* resolveRepository(input);
        const pullRequest = yield* getRawPullRequestFromRepository(
          destinationRepository,
          input.reference,
        );
        const destinationRepositoryName =
          repositoryNameWithOwner(pullRequest.destination.repository) ??
          `${destinationRepository.workspace}/${destinationRepository.repoSlug}`;
        const sourceRepositoryName =
          repositoryNameWithOwner(pullRequest.source.repository) ?? destinationRepositoryName;
        const isCrossRepository = sourceRepositoryName !== destinationRepositoryName;
        const cloneUrls = yield* getRepository({
          cwd: input.cwd,
          repository: sourceRepositoryName,
          ...(input.context ? { context: input.context } : {}),
        }).pipe(Effect.map(normalizeRepositoryCloneUrls));
        const originRemoteUrl = yield* readConfigValueNullable(input.cwd, "remote.origin.url");
        const remoteName =
          input.context?.provider.kind === "bitbucket" && !isCrossRepository
            ? input.context.remoteName
            : yield* git.ensureRemote({
                cwd: input.cwd,
                preferredName: isCrossRepository
                  ? repositoryOwnerName(sourceRepositoryName)
                  : destinationRepository.workspace,
                url: selectCloneUrl({ cloneUrls, originRemoteUrl }),
              });
        const remoteBranch = pullRequest.source.branch.name;
        const localBranch = checkoutBranchName({
          pullRequestId: pullRequest.id,
          headBranch: remoteBranch,
          isCrossRepository,
        });
        yield* git.fetchRemoteBranch({ cwd: input.cwd, remoteName, remoteBranch, localBranch });
        yield* git.setBranchUpstream({
          cwd: input.cwd,
          branch: localBranch,
          remoteName,
          remoteBranch,
        });
        yield* git.checkoutBranch({ cwd: input.cwd, branch: localBranch });
      }).pipe(
        Effect.mapError((cause) =>
          Schema.is(BitbucketApiError)(cause)
            ? cause
            : new BitbucketApiError({
                operation: "checkoutPullRequest",
                detail: cause instanceof Error ? cause.message : String(cause),
                cause,
              }),
        ),
      ),
  });
});

export const BitbucketApiLive = Layer.effect(BitbucketApi, make());
