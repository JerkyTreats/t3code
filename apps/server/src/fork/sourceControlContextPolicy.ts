import type { RepositoryIdentity } from "@t3tools/contracts";
import { gitLabRepositoryTargetFromOrigin } from "../sourceControl/GitLabRepositoryTarget.ts";
import { SourceControlProviderError } from "@t3tools/contracts";
import { normalizeGitRemoteUrl } from "@t3tools/shared/git";
import * as Effect from "effect/Effect";
import * as SourceControlProvider from "../sourceControl/SourceControlProvider.ts";
import type * as OriginRepositoryMutationAuthority from "./OriginRepositoryMutationAuthority.ts";
import { isOriginRemoteName } from "./originOnlySourceControlPolicy.ts";
import type { SourceControlProviderInfo } from "@t3tools/contracts";
import { detectSourceControlProviderFromRemoteUrl } from "@t3tools/shared/sourceControl";

import { selectOriginRemote } from "./originOnlySourceControlPolicy.ts";

export interface SourceControlRemoteCandidate {
  readonly name: string;
  readonly url: string;
}

export interface SourceControlContextCandidate {
  readonly provider: SourceControlProviderInfo;
  readonly remoteName: string;
  readonly remoteUrl: string;
}

export function pickOriginSourceControlContext(
  remotes: ReadonlyArray<SourceControlRemoteCandidate>,
): SourceControlContextCandidate | null {
  const origin = selectOriginRemote(remotes);
  if (!origin) return null;

  const provider = detectSourceControlProviderFromRemoteUrl(origin.url);
  return provider
    ? {
        provider,
        remoteName: origin.name,
        remoteUrl: origin.url,
      }
    : null;
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
          canonicalKey: normalizeGitRemoteUrl(context.remoteUrl),
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
    kind: provider.kind,
    listChangeRequests: (input) => provider.listChangeRequests(withContext(input)),
    getChangeRequest: (input) => provider.getChangeRequest(withContext(input)),
    createChangeRequest: (input) =>
      authorizeOriginMutation({ cwd: input.cwd, reference: input.headSelector }).pipe(
        Effect.flatMap((mutationContext) =>
          provider.createChangeRequest({ ...input, context: mutationContext }),
        ),
      ),
    getRepositoryCloneUrls: (input) => provider.getRepositoryCloneUrls(withContext(input)),
    createRepository: (input) => provider.createRepository(input),
    getDefaultBranch: (input) => provider.getDefaultBranch(withContext(input)),
    checkoutChangeRequest: (input) => provider.checkoutChangeRequest(withContext(input)),
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
