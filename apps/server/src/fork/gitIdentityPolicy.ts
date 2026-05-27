export interface GitRemoteCandidate {
  readonly name: string;
  readonly url: string;
}

const FORK_FIRST_REMOTE_NAMES = ["origin", "fork"] as const;
const UPSTREAM_REMOTE_NAMES = new Set(["upstream"]);

export function pickForkFirstRemote(
  remotes: ReadonlyArray<GitRemoteCandidate>,
): GitRemoteCandidate | null {
  if (remotes.length === 0) {
    return null;
  }

  const byName = new Map(remotes.map((remote) => [remote.name, remote] as const));
  for (const remoteName of FORK_FIRST_REMOTE_NAMES) {
    const remote = byName.get(remoteName);
    if (remote) {
      return remote;
    }
  }

  const firstNonUpstreamRemote = remotes
    .filter((remote) => !UPSTREAM_REMOTE_NAMES.has(remote.name))
    .toSorted((left, right) => left.name.localeCompare(right.name))[0];
  if (firstNonUpstreamRemote) {
    return firstNonUpstreamRemote;
  }

  const firstRemote = remotes.toSorted((left, right) => left.name.localeCompare(right.name))[0];
  return firstRemote ?? null;
}
