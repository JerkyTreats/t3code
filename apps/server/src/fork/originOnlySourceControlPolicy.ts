export const ORIGIN_REMOTE_NAME = "origin" as const;

export interface NamedRemoteCandidate {
  readonly name: string;
}

export function isOriginRemoteName(
  value: string | null | undefined,
): value is typeof ORIGIN_REMOTE_NAME {
  return value === ORIGIN_REMOTE_NAME;
}

export function selectOriginRemoteName(
  remoteNames: ReadonlyArray<string>,
): typeof ORIGIN_REMOTE_NAME | null {
  return remoteNames.some((remoteName) => isOriginRemoteName(remoteName))
    ? ORIGIN_REMOTE_NAME
    : null;
}

export function selectOriginRemote<Remote extends NamedRemoteCandidate>(
  remotes: ReadonlyArray<Remote>,
): Remote | null {
  return remotes.find((remote) => isOriginRemoteName(remote.name)) ?? null;
}

export function isOriginRemoteRef(
  refName: string | null | undefined,
): refName is `${typeof ORIGIN_REMOTE_NAME}/${string}` {
  return refName?.startsWith(`${ORIGIN_REMOTE_NAME}/`) ?? false;
}

export function canUseOriginBranchTracking(remoteName: string | null | undefined): boolean {
  return remoteName == null || isOriginRemoteName(remoteName);
}
