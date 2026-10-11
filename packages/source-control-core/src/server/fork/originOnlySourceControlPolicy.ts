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

export function originRemoteUrlConfigKey(): string {
  return `remote.${ORIGIN_REMOTE_NAME}.url`;
}

export function originRemoteBranchPattern(branch: string): string {
  return `refs/remotes/${ORIGIN_REMOTE_NAME}/${branch}`;
}

export function originHeadAssociation(
  branch: string,
  upstreamRef: string | null,
): {
  readonly remoteName: typeof ORIGIN_REMOTE_NAME;
  readonly headBranch: string;
} {
  const upstreamBranch = isOriginRemoteRef(upstreamRef)
    ? upstreamRef.slice(ORIGIN_REMOTE_NAME.length + 1)
    : "";
  return { remoteName: ORIGIN_REMOTE_NAME, headBranch: upstreamBranch || branch };
}

export function hasOriginCreationTracking(
  remoteName: string | null,
  upstreamRef: string | null,
): boolean {
  return isOriginRemoteName(remoteName) && isOriginRemoteRef(upstreamRef);
}

export function originStatusTracking(input: {
  readonly upstreamRef: string | null;
  readonly parsedRemoteName: string | null;
  readonly aheadCount: number;
  readonly behindCount: number;
}): {
  readonly upstreamRef: string | null;
  readonly aheadCount: number;
  readonly behindCount: number;
} {
  return input.upstreamRef && isOriginRemoteName(input.parsedRemoteName)
    ? {
        upstreamRef: input.upstreamRef,
        aheadCount: input.aheadCount,
        behindCount: input.behindCount,
      }
    : { upstreamRef: null, aheadCount: 0, behindCount: 0 };
}

export function originStatusFallbackRef(
  branch: string | null,
  hasOrigin: boolean,
  hasOriginBranch: boolean,
): string | null {
  return branch && hasOrigin && hasOriginBranch ? `${ORIGIN_REMOTE_NAME}/${branch}` : null;
}

export function selectOriginUpstream<A extends { readonly remoteName: string }>(
  configured: A | null,
): A | null {
  return configured && isOriginRemoteName(configured.remoteName) ? configured : null;
}

export function originSameNameUpstream(
  branchName: string,
  exists: boolean,
): {
  readonly upstreamRef: string;
  readonly remoteName: typeof ORIGIN_REMOTE_NAME;
  readonly branchName: string;
} | null {
  return branchName && exists
    ? {
        upstreamRef: `${ORIGIN_REMOTE_NAME}/${branchName}`,
        remoteName: ORIGIN_REMOTE_NAME,
        branchName,
      }
    : null;
}
