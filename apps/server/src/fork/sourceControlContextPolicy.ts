import type { SourceControlProviderInfo } from "@t3tools/contracts";
import { detectSourceControlProviderFromRemoteUrl } from "@t3tools/shared/sourceControl";

export interface SourceControlRemoteCandidate {
  readonly name: string;
  readonly url: string;
}

export interface SourceControlContextCandidate {
  readonly provider: SourceControlProviderInfo;
  readonly remoteName: string;
  readonly remoteUrl: string;
}

const FORK_REMOTE_NAMES = ["fork"] as const;
const PRIMARY_REMOTE_NAMES = ["origin"] as const;
const UPSTREAM_REMOTE_NAMES = new Set(["upstream"]);

export function sourceControlContextCandidates(
  remotes: ReadonlyArray<SourceControlRemoteCandidate>,
): SourceControlContextCandidate[] {
  return remotes
    .map((remote) => {
      const provider = detectSourceControlProviderFromRemoteUrl(remote.url);
      return provider
        ? {
            provider,
            remoteName: remote.name,
            remoteUrl: remote.url,
          }
        : null;
    })
    .filter((value): value is SourceControlContextCandidate => value !== null);
}

export function pickForkSourceControlContext(
  remotes: ReadonlyArray<SourceControlRemoteCandidate>,
): SourceControlContextCandidate | null {
  const candidates = sourceControlContextCandidates(remotes);
  if (candidates.length === 0) {
    return null;
  }

  const byName = new Map(candidates.map((candidate) => [candidate.remoteName, candidate] as const));
  for (const remoteName of FORK_REMOTE_NAMES) {
    const candidate = byName.get(remoteName);
    if (candidate) {
      return candidate;
    }
  }

  for (const remoteName of PRIMARY_REMOTE_NAMES) {
    const candidate = byName.get(remoteName);
    if (candidate) {
      return candidate;
    }
  }

  const firstNonUpstreamContext = candidates
    .filter((candidate) => !UPSTREAM_REMOTE_NAMES.has(candidate.remoteName))
    .toSorted((left, right) => left.remoteName.localeCompare(right.remoteName))[0];
  if (firstNonUpstreamContext) {
    return firstNonUpstreamContext;
  }

  return (
    candidates.toSorted((left, right) => left.remoteName.localeCompare(right.remoteName))[0] ?? null
  );
}
