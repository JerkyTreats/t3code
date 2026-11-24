import {
  ProjectId,
  type PullRequestRef,
  type RepositoryIdentity,
  type ThreadPullRequestKey,
} from "@t3tools/contracts";
import { sourceControlDefinitions } from "../sourceControl/sourceControlDefinitions.ts";
import { normalizeThreadPullRequestKey } from "../sourceControl/threadPullRequests.ts";

export function pullRequestSyncKey(
  reference: PullRequestRef,
  identity?: RepositoryIdentity | null,
): ThreadPullRequestKey | null {
  const host = identity
    ? sourceControlDefinitions.changeRequestHost(identity, identity.provider)
    : undefined;
  // A host whose tools select a repository by something other than its path (Azure DevOps takes
  // the bare name) can only key such a reference through the project's own repository.
  const definition = identity?.provider
    ? sourceControlDefinitions.find(identity.provider)
    : undefined;
  if (identity && definition?.repositorySelector && !reference.repository.includes("/")) {
    if (
      reference.repository.toLowerCase() !==
        definition.repositorySelector(identity)?.toLowerCase() ||
      (reference.host !== undefined && reference.host.toLowerCase() !== host)
    )
      return null;
    const [projectHost, ...repository] = identity.canonicalKey.split("/");
    if (!projectHost || repository.length === 0) return null;
    return normalizeThreadPullRequestKey({
      host: projectHost,
      repository: repository.join("/"),
      number: reference.number,
    });
  }
  const resolvedHost = reference.host ?? host;
  return resolvedHost === undefined
    ? null
    : normalizeThreadPullRequestKey({
        host: resolvedHost,
        repository: reference.repository,
        number: reference.number,
      });
}

/**
 * The exact origin repository whose pull requests are the project's own.
 * A primary remote that is already `origin` is that repository. A recorded
 * origin on the same host is used instead of any other remote. Another
 * repository is never admitted beside it (F06 override of c79f618bf8).
 */
export function ownPullRequestRepositories(
  identity: RepositoryIdentity | null | undefined,
): ReadonlyArray<{
  readonly key: Pick<ThreadPullRequestKey, "host" | "repository">;
  readonly locator: RepositoryIdentity["locator"];
}> {
  if (!identity) return [];
  const candidate = exactOriginIdentity(identity);
  if (candidate === null) return [];
  const key = pullRequestSyncKey(
    {
      projectId: ProjectId.make("own"),
      repository: sourceControlDefinitions.repositorySelector(candidate) ?? "",
      number: 1,
    },
    candidate,
  );
  return key === null
    ? []
    : [{ key: { host: key.host, repository: key.repository }, locator: candidate.locator }];
}

function exactOriginIdentity(identity: RepositoryIdentity): RepositoryIdentity | null {
  if (identity.locator.remoteName === "origin") return identity;
  const origin = identity.origin;
  const [host, ...path] = origin?.canonicalKey.split("/") ?? [];
  if (
    origin?.remoteUrl === undefined ||
    path.length === 0 ||
    host !== identity.canonicalKey.split("/")[0]
  ) {
    return null;
  }
  const { owner: _owner, name: _name, ...primary } = identity;
  return {
    ...primary,
    canonicalKey: origin.canonicalKey,
    displayName: origin.displayName ?? path.join("/"),
    locator: { source: "git-remote", remoteName: "origin", remoteUrl: origin.remoteUrl },
  };
}
