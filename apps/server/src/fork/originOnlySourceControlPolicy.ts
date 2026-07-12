export const ORIGIN_REMOTE_NAME = "origin" as const;

export function isOriginRemoteName(
  value: string | null | undefined,
): value is typeof ORIGIN_REMOTE_NAME {
  return value?.trim() === ORIGIN_REMOTE_NAME;
}

export function selectOriginRemoteName(
  remoteNames: ReadonlyArray<string>,
): typeof ORIGIN_REMOTE_NAME | null {
  return remoteNames.some((remoteName) => isOriginRemoteName(remoteName))
    ? ORIGIN_REMOTE_NAME
    : null;
}

export function isOriginRemoteRef(
  refName: string | null | undefined,
): refName is `${typeof ORIGIN_REMOTE_NAME}/${string}` {
  return refName?.trim().startsWith(`${ORIGIN_REMOTE_NAME}/`) ?? false;
}
