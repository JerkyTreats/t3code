import { SourceControlProviderKind } from "@t3tools/contracts";
import {
  PullRequestOperationError,
  PullRequestUnavailableError,
  type PullRequestRef,
} from "@t3tools/contracts";
import {
  azureDevOpsRepositoryTargetFromOrigin,
  azureDevOpsRepositoryTargetFromRemoteUrl,
} from "@t3tools/source-control-core/server/fork/AzureDevOpsRepositoryTarget";
import type { RepositoryIdentity } from "@t3tools/contracts";
import { gitLabRepositoryTargetFromOrigin } from "@t3tools/source-control-core/server/fork/GitLabRepositoryTarget";
import { SourceControlProviderError } from "@t3tools/contracts";
import { normalizeGitRemoteMutationTarget } from "@t3tools/shared/git";
import * as Effect from "effect/Effect";
import * as SourceControlProvider from "@t3tools/source-control-core/server/SourceControlProvider";
import type * as OriginRepositoryMutationAuthority from "./OriginRepositoryMutationAuthority.ts";
import { isOriginRemoteName } from "@t3tools/source-control-core/server/fork/originOnlySourceControlPolicy";
import type { SourceControlProviderInfo } from "@t3tools/contracts";
import { isSshRemoteUrl } from "@t3tools/shared/sourceControl";
import { sourceControlDefinitions } from "../sourceControl/sourceControlDefinitions.ts";

import { selectOriginRemote } from "@t3tools/source-control-core/server/fork/originOnlySourceControlPolicy";

export interface SourceControlRemoteCandidate {
  readonly name: string;
  readonly url: string;
}

export interface SourceControlContextCandidate {
  readonly provider: SourceControlProviderInfo;
  readonly remoteName: string;
  readonly remoteUrl: string;
}

export function requireSelectedOriginProject<
  A extends { readonly repository: string; readonly host: string },
>(
  project: A | undefined,
  ref: PullRequestRef,
): Effect.Effect<A, PullRequestOperationError | PullRequestUnavailableError> {
  if (project === undefined)
    return Effect.fail(new PullRequestUnavailableError({ reason: "provider-unsupported" }));
  const host = ref.host?.trim().toLowerCase();
  return project.repository.toLowerCase() === ref.repository.trim().toLowerCase() &&
    (host === undefined || host === project.host)
    ? Effect.succeed(project)
    : Effect.fail(
        new PullRequestOperationError({
          operation: "resolveRepository",
          detail: "The change request does not belong to the selected project's origin repository.",
        }),
      );
}

export function requireProjectedOriginIdentity(
  identity: RepositoryIdentity | null | undefined,
): Effect.Effect<RepositoryIdentity, PullRequestOperationError> {
  return identity != null && isOriginRemoteName(identity.locator.remoteName)
    ? Effect.succeed(identity)
    : Effect.fail(
        new PullRequestOperationError({
          operation: "authorizeMutation",
          detail: "The selected project has no exact origin repository identity.",
        }),
      );
}

export function requireOriginCreationRepository(
  cwd: string,
  remotes: ReadonlyArray<SourceControlRemoteCandidate>,
): Effect.Effect<
  {
    readonly origin: SourceControlRemoteCandidate;
    readonly expectedIdentity: RepositoryIdentity;
  },
  SourceControlProviderError
> {
  const origin = selectOriginRemote(remotes);
  return origin
    ? Effect.succeed({
        origin,
        expectedIdentity: {
          canonicalKey: sourceControlDefinitions.repositoryKeyFromRemote(origin.url),
          locator: { source: "git-remote", remoteName: origin.name, remoteUrl: origin.url },
        },
      })
    : Effect.fail(
        new SourceControlProviderError({
          provider: SourceControlProviderKind.make("unknown"),
          operation: "resolveChangeRequestHandle",
          cwd,
          detail: "Origin-only policy requires an origin remote before creating a change request.",
        }),
      );
}

export function requireSupportedOriginContext(
  cwd: string,
  context: SourceControlProvider.SourceControlProviderContext | null,
): Effect.Effect<SourceControlProvider.SourceControlProviderContext, SourceControlProviderError> {
  return context && context.provider.kind !== "unknown" && isOriginRemoteName(context.remoteName)
    ? Effect.succeed(context)
    : Effect.fail(
        new SourceControlProviderError({
          provider: SourceControlProviderKind.make("unknown"),
          operation: "resolveChangeRequestHandle",
          cwd,
          detail:
            "Origin-only policy could not identify a supported source-control provider for origin.",
        }),
      );
}

export function pickOriginSourceControlContext(
  remotes: ReadonlyArray<SourceControlRemoteCandidate>,
): SourceControlContextCandidate | null {
  const origin = selectOriginRemote(remotes);
  if (!origin) return null;

  const provider = sourceControlDefinitions.recognizeRemote(origin.url);
  return provider
    ? {
        provider,
        remoteName: origin.name,
        remoteUrl: origin.url,
      }
    : null;
}

/** The provider context of a projected exact origin identity, or null when it names no origin. */
export function originContextOfIdentity(
  identity: RepositoryIdentity | null | undefined,
): SourceControlProvider.SourceControlProviderContext | null {
  return identity != null && isOriginRemoteName(identity.locator.remoteName)
    ? pickOriginSourceControlContext([
        { name: identity.locator.remoteName, url: identity.locator.remoteUrl },
      ])
    : null;
}

/** Preserve authenticated SSH endpoint hints only after rebinding to the live origin. */
export function originProviderRefinementContext(
  origin: SourceControlProvider.SourceControlProviderContext | null,
  requested: SourceControlProvider.SourceControlProviderContext | undefined,
): SourceControlProvider.SourceControlProviderContext | null {
  if (
    !origin ||
    !requested ||
    !isOriginRemoteName(requested.remoteName) ||
    normalizeGitRemoteMutationTarget(origin.remoteUrl) !==
      normalizeGitRemoteMutationTarget(requested.remoteUrl) ||
    !isSshRemoteUrl(origin.remoteUrl) ||
    (origin.provider.kind !== "unknown" && origin.provider.kind !== "forgejo")
  )
    return origin;
  return {
    ...origin,
    provider: { ...origin.provider, kind: SourceControlProviderKind.make("unknown") },
    ...(requested.requestedHost === undefined ? {} : { requestedHost: requested.requestedHost }),
  };
}

export function originContainsHostedLink(
  context: SourceControlProvider.SourceControlProviderContext | null,
  url: URL,
): boolean {
  if (!context || !isOriginRemoteName(context.remoteName)) return false;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return false;
  const repositorySegments =
    context.provider.kind === "gitlab" && segments.includes("-")
      ? segments.slice(0, segments.indexOf("-"))
      : segments.slice(0, 2);
  if (repositorySegments.length < 2) return false;
  return (
    normalizeGitRemoteMutationTarget(context.remoteUrl) ===
    normalizeGitRemoteMutationTarget(`${url.origin}/${repositorySegments.join("/")}.git`)
  );
}

export function bindOriginProviderContext(
  provider: SourceControlProvider.SourceControlProvider["Service"],
  context: SourceControlProvider.SourceControlProviderContext | null,
  mutationAuthority: OriginRepositoryMutationAuthority.OriginRepositoryMutationAuthority["Service"],
): SourceControlProvider.SourceControlProvider["Service"] {
  const withContext = <Input extends object>(input: Input): Input =>
    context === null ? input : { ...input, context };

  const authorizeOriginMutation = Effect.fn(
    "SourceControlProviderRegistry.authorizeOriginMutation",
  )(function* (input: {
    readonly cwd: string;
    readonly reference: string;
  }): Effect.fn.Return<
    SourceControlProvider.SourceControlProviderContext,
    SourceControlProviderError
  > {
    if (!context || !isOriginRemoteName(context.remoteName)) {
      return yield* new SourceControlProviderError({
        provider: provider.kind,
        operation: "createChangeRequest",
        cwd: input.cwd,
        reference: SourceControlProvider.transportSafeSourceControlErrorValue(input.reference),
        detail:
          "Origin-only policy requires an origin source-control context before this operation can run.",
      });
    }

    yield* mutationAuthority
      .authorize({
        cwd: input.cwd,
        expectedIdentity: {
          canonicalKey: sourceControlDefinitions.repositoryKeyFromRemote(context.remoteUrl),
          locator: {
            source: "git-remote",
            remoteName: context.remoteName,
            remoteUrl: context.remoteUrl,
          },
        },
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new SourceControlProviderError({
              provider: provider.kind,
              operation: "createChangeRequest",
              cwd: input.cwd,
              reference: SourceControlProvider.transportSafeSourceControlErrorValue(
                input.reference,
              ),
              detail: cause.detail,
              cause,
            }),
        ),
      );

    return context;
  });

  return SourceControlProvider.SourceControlProvider.of({
    ...provider,
    kind: provider.kind,
    ...(provider.resolveLink === undefined ? {} : { resolveLink: provider.resolveLink }),
    // Binding context does not create a second provider-operation span.
    listChangeRequests: Effect.fnUntraced(function* (input) {
      return yield* provider.listChangeRequests(withContext(input));
    }),
    getChangeRequest: Effect.fnUntraced(function* (input) {
      return yield* provider.getChangeRequest(withContext(input));
    }),
    createChangeRequest: Effect.fnUntraced(function* (input) {
      const mutationContext = yield* authorizeOriginMutation({
        cwd: input.cwd,
        reference: input.headSelector,
      });
      return yield* provider.createChangeRequest({ ...input, context: mutationContext });
    }),
    getRepositoryCloneUrls: Effect.fnUntraced(function* (input) {
      return yield* provider.getRepositoryCloneUrls(withContext(input));
    }),
    createRepository: Effect.fnUntraced(function* (input) {
      return yield* provider.createRepository(input);
    }),
    getDefaultBranch: Effect.fnUntraced(function* (input) {
      return yield* provider.getDefaultBranch(withContext(input));
    }),
    checkoutChangeRequest: Effect.fnUntraced(function* (input) {
      return yield* provider.checkoutChangeRequest(withContext(input));
    }),
  });
}

export function originPullRequestRepository(
  identity: RepositoryIdentity | null | undefined,
): string | null {
  if (!identity?.locator || !isOriginRemoteName(identity.locator.remoteName)) return null;
  const target = gitLabRepositoryTargetFromOrigin(identity.locator);
  if (!target) return null;
  return identity.provider === "azure-devops"
    ? (target.repository.split("/").at(-1) ?? null)
    : target.repository;
}

/** Validate the native provider URL before deriving the app's origin-bound link key. */
export function originCreatedPullRequestKey(
  identity: RepositoryIdentity | null | undefined,
  url: string,
  number: number,
): {
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
} | null {
  const parsed = sourceControlDefinitions.parseChangeRequestUrl(url)?.link;
  const repository = originPullRequestRepository(identity);
  if (!identity || !parsed || parsed.number !== number || repository === null) return null;
  if (identity.provider === "azure-devops") {
    const expected = azureDevOpsRepositoryTargetFromOrigin(identity.locator);
    const actual = azureDevOpsRepositoryTargetFromRemoteUrl(url);
    if (!expected || !actual) return null;
    const key = (target: typeof expected) =>
      sourceControlDefinitions.canonicalRepositoryKey(
        normalizeGitRemoteMutationTarget(
          `${target.organization}/${target.project}/_git/${target.repository}`,
        ),
      );
    if (key(expected) !== key(actual)) return null;
  } else if (
    `${parsed.authority ?? parsed.host}/${parsed.repository}` !==
    normalizeGitRemoteMutationTarget(identity.locator.remoteUrl)
  )
    return null;
  const host = sourceControlDefinitions.changeRequestHost(identity, identity.provider);
  if (host === undefined) return null;
  return {
    host,
    repository: repository.toLowerCase(),
    number,
    url,
  };
}

/** Why an agent-supplied link or watch target was refused. */
export const ORIGIN_THREAD_PULL_REQUEST_REFUSAL =
  "Only pull requests in this project's exact origin repository can be linked or watched.";

/**
 * Agent tools may link or watch a pull request only when its URL names the selected project's
 * exact origin repository and number. Unlinking and unwatching stay available for any existing
 * link, so a stale link always has a way out.
 */
export function originAdmitsThreadPullRequest(
  identity: RepositoryIdentity | null | undefined,
  target: { readonly url: string; readonly number: number },
): boolean {
  return originCreatedPullRequestKey(identity, target.url, target.number) !== null;
}
