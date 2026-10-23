/** Exact-origin identity for official desktop releases across build and client hosts. */
export const OFFICIAL_DESKTOP_UPDATER_REPOSITORY = "JerkyTreats/t3code";

export function officialDesktopRepository(requestedRepository?: string): {
  readonly owner: string;
  readonly repo: string;
} | null {
  const repository = requestedRepository?.trim() || OFFICIAL_DESKTOP_UPDATER_REPOSITORY;
  return repository === OFFICIAL_DESKTOP_UPDATER_REPOSITORY
    ? { owner: "JerkyTreats", repo: "t3code" }
    : null;
}

export function officialDesktopReleaseUrl(version?: string | null): string {
  const base = `https://github.com/${OFFICIAL_DESKTOP_UPDATER_REPOSITORY}/releases`;
  const normalizedVersion = version?.trim();
  return normalizedVersion ? `${base}/tag/v${encodeURIComponent(normalizedVersion)}` : base;
}
