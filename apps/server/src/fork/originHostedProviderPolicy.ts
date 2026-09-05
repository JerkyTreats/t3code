import { PullRequestProviderError } from "../pullRequest/PullRequestProvider.ts";
import type { AzureDevOpsPullRequest } from "../pullRequest/azureDevOpsPullRequestJson.ts";
import {
  azureDevOpsRepositoryTargetFromOrigin,
  azureDevOpsThreadsUrlBelongsToTarget,
} from "../sourceControl/AzureDevOpsRepositoryTarget.ts";
import { gitLabRepositoryTargetFromOrigin } from "../sourceControl/GitLabRepositoryTarget.ts";
import { SourceControlProviderError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { normalizeGitRemoteMutationTarget } from "@t3tools/shared/git";
import * as SourceControlProvider from "../sourceControl/SourceControlProvider.ts";
import {
  gitLabRepositoryTargetFromContext,
  type GitLabRepositoryTarget,
} from "../sourceControl/GitLabRepositoryTarget.ts";
import {
  azureDevOpsRepositoryTargetFromContext,
  azureDevOpsChangeRequestBelongsToTarget,
  type AzureDevOpsRepositoryTarget,
} from "../sourceControl/AzureDevOpsRepositoryTarget.ts";
import type { NormalizedAzureDevOpsPullRequestRecord } from "../sourceControl/azureDevOpsPullRequests.ts";

/**
 * gh and glab let a URL selector override --repo. Reduce an origin-matching
 * URL to its number so the explicit repository remains the only CLI authority.
 * Non-URL branch and numeric selectors keep their existing CLI interpretation.
 */
export function originChangeRequestSelector(input: {
  readonly provider: "github" | "gitlab";
  /** Exact origin host, including any custom port, followed by its repository path. */
  readonly repository: string;
  readonly reference: string;
}): string | null {
  const reference = input.reference.trim();
  // GitHub's owner:branch selector filters PRs within --repo; it is not a URL target.
  if (input.provider === "github" && /^[a-z\d][a-z\d-]*:[^/\s][^:\s]*$/iu.test(reference)) {
    return input.reference;
  }
  if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(reference)) return input.reference;

  try {
    const url = new URL(reference);
    const origin = new URL(`https://${input.repository}`);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      origin.username ||
      origin.password ||
      url.host.toLowerCase() !== origin.host.toLowerCase()
    )
      return null;

    const match =
      input.provider === "github"
        ? /^\/([^/]+\/[^/]+)\/pull\/([1-9]\d*)\/?$/u.exec(url.pathname)
        : /^\/(.+)\/-\/merge_requests\/([1-9]\d*)\/?$/u.exec(url.pathname);
    if (!match?.[1] || !match[2]) return null;
    const repository = origin.pathname.slice(1);
    const matches =
      input.provider === "github"
        ? match[1].toLowerCase() === repository.toLowerCase()
        : match[1] === repository;
    return matches ? match[2] : null;
  } catch {
    return null;
  }
}

function repositoryFromContext(
  context: SourceControlProvider.SourceControlProviderContext | undefined,
): string | null {
  if (!context || context.provider.kind !== "github" || context.remoteName !== "origin") {
    return null;
  }
  const canonical = normalizeGitRemoteMutationTarget(context.remoteUrl);
  const [host, ...path] = canonical.split("/");
  if (!host || path.length < 2) return null;
  return [host, ...path].join("/");
}

export function requireGitHubRepository(input: {
  readonly cwd: string;
  readonly operation:
    | "listChangeRequests"
    | "getChangeRequest"
    | "createChangeRequest"
    | "getDefaultBranch"
    | "checkoutChangeRequest";
  readonly context: SourceControlProvider.SourceControlProviderContext | undefined;
  readonly reference: string | undefined;
}): Effect.Effect<string, SourceControlProviderError> {
  const repository = repositoryFromContext(input.context);
  return repository
    ? Effect.succeed(repository)
    : Effect.fail(
        new SourceControlProviderError({
          provider: "github",
          operation: input.operation,
          cwd: input.cwd,
          ...(input.reference
            ? {
                reference: SourceControlProvider.transportSafeSourceControlErrorValue(
                  input.reference,
                ),
              }
            : {}),
          detail: "Origin-only policy requires an exact GitHub origin repository context.",
        }),
      );
}

export function requireGitLabRepositoryTarget(input: {
  readonly cwd: string;
  readonly context: SourceControlProvider.SourceControlProviderContext | undefined;
  readonly operation:
    | "listChangeRequests"
    | "getChangeRequest"
    | "createChangeRequest"
    | "getRepositoryCloneUrls"
    | "getDefaultBranch"
    | "checkoutChangeRequest";
  readonly reference?: string;
}): Effect.Effect<GitLabRepositoryTarget, SourceControlProviderError> {
  const target = gitLabRepositoryTargetFromContext(input.context);
  return target
    ? Effect.succeed(target)
    : Effect.fail(
        new SourceControlProviderError({
          provider: "gitlab",
          operation: input.operation,
          cwd: input.cwd,
          ...(input.reference === undefined
            ? {}
            : {
                reference: SourceControlProvider.transportSafeSourceControlErrorValue(
                  input.reference,
                ),
              }),
          detail: "Origin-only policy requires an exact GitLab origin repository context.",
        }),
      );
}

export function requireAzureDevOpsRepositoryTarget(input: {
  readonly cwd: string;
  readonly context: SourceControlProvider.SourceControlProviderContext | undefined;
  readonly operation:
    | "listChangeRequests"
    | "getChangeRequest"
    | "createChangeRequest"
    | "getRepositoryCloneUrls"
    | "getDefaultBranch"
    | "checkoutChangeRequest";
  readonly reference?: string;
}): Effect.Effect<AzureDevOpsRepositoryTarget, SourceControlProviderError> {
  const target = azureDevOpsRepositoryTargetFromContext(input.context);
  return target
    ? Effect.succeed(target)
    : Effect.fail(
        new SourceControlProviderError({
          provider: "azure-devops",
          operation: input.operation,
          cwd: input.cwd,
          ...(input.reference === undefined
            ? {}
            : {
                reference: SourceControlProvider.transportSafeSourceControlErrorValue(
                  input.reference,
                ),
              }),
          detail: "Origin-only policy requires an exact Azure DevOps origin repository context.",
        }),
      );
}

export function requireAzureDevOpsChangeRequestTarget(input: {
  readonly cwd: string;
  readonly operation: "getChangeRequest" | "checkoutChangeRequest";
  readonly reference: string;
  readonly target: AzureDevOpsRepositoryTarget;
  readonly changeRequest: NormalizedAzureDevOpsPullRequestRecord;
}): Effect.Effect<NormalizedAzureDevOpsPullRequestRecord, SourceControlProviderError> {
  return azureDevOpsChangeRequestBelongsToTarget(input.changeRequest, input.target)
    ? Effect.succeed(input.changeRequest)
    : Effect.fail(
        new SourceControlProviderError({
          provider: "azure-devops",
          operation: input.operation,
          cwd: input.cwd,
          reference: SourceControlProvider.transportSafeSourceControlErrorValue(input.reference),
          detail: "Origin-only policy rejected an Azure DevOps pull request outside origin.",
        }),
      );
}

export const requireAzureDevOpsPullRequestTarget = (input: {
  readonly cwd: string;
  readonly operation: string;
  readonly origin?: { readonly remoteName: string; readonly remoteUrl: string } | undefined;
}): Effect.Effect<AzureDevOpsRepositoryTarget, PullRequestProviderError> => {
  const target = azureDevOpsRepositoryTargetFromOrigin(input.origin);
  return target === null
    ? Effect.fail(
        new PullRequestProviderError({
          provider: "azure-devops",
          operation: input.operation,
          reason: "failed",
          detail: "Origin-only policy requires an exact Azure DevOps origin repository.",
        }),
      )
    : Effect.succeed(target);
};

export const requireAzurePullRequestMembership = (input: {
  readonly operation: string;
  readonly target: AzureDevOpsRepositoryTarget;
  readonly pullRequest: AzureDevOpsPullRequest;
}): Effect.Effect<AzureDevOpsPullRequest, PullRequestProviderError> =>
  azureDevOpsChangeRequestBelongsToTarget(input.pullRequest, input.target)
    ? Effect.succeed(input.pullRequest)
    : Effect.fail(
        new PullRequestProviderError({
          provider: "azure-devops",
          operation: input.operation,
          reason: "failed",
          detail: "Origin-only policy rejected an Azure DevOps pull request outside origin.",
        }),
      );

export const requireAzureThreadsMembership = (input: {
  readonly operation: string;
  readonly target: AzureDevOpsRepositoryTarget;
  readonly pullRequest: AzureDevOpsPullRequest;
  readonly threadsUrl: string;
}): Effect.Effect<string, PullRequestProviderError> =>
  azureDevOpsThreadsUrlBelongsToTarget(input.threadsUrl, input.pullRequest.number, input.target)
    ? Effect.succeed(input.threadsUrl)
    : Effect.fail(
        new PullRequestProviderError({
          provider: "azure-devops",
          operation: input.operation,
          reason: "failed",
          detail: "Origin-only policy rejected Azure DevOps threads outside origin.",
        }),
      );

export const requireGitLabPullRequestTarget = (input: {
  readonly operation: string;
  readonly origin?: { readonly remoteName: string; readonly remoteUrl: string } | undefined;
}): Effect.Effect<GitLabRepositoryTarget, PullRequestProviderError> => {
  const target = gitLabRepositoryTargetFromOrigin(input.origin);
  return target === null
    ? Effect.fail(
        new PullRequestProviderError({
          provider: "gitlab",
          operation: input.operation,
          reason: "failed",
          detail: "Origin-only policy requires an exact GitLab origin repository.",
        }),
      )
    : Effect.succeed(target);
};

export function bitbucketOriginHostFailure(
  originHost: string | undefined,
  apiHost: string,
): {
  readonly reason: "origin-context-required" | "origin-host-mismatch";
  readonly originHost?: string;
} | null {
  const normalized = originHost?.trim().toLowerCase();
  if (!normalized) return { reason: "origin-context-required" };
  return normalized === apiHost.toLowerCase() ||
    (normalized === "bitbucket.org" && apiHost.toLowerCase() === "api.bitbucket.org")
    ? null
    : { reason: "origin-host-mismatch", originHost: normalized };
}
