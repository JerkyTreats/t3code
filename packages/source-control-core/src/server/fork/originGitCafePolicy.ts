import { normalizeGitRemoteMutationTarget } from "@t3tools/shared/git";

export interface GitCafeTarget {
  readonly host: "git.cafe" | "staging.git.cafe";
  readonly repository: string;
}

function parseTarget(value: string): GitCafeTarget | null {
  const match = /^(git\.cafe|staging\.git\.cafe)\/([a-z\d_.-]+\/[a-z\d_.-]+)$/u.exec(
    normalizeGitRemoteMutationTarget(value),
  );
  return match ? { host: match[1] as GitCafeTarget["host"], repository: match[2]! } : null;
}

/** Explicit endpoints govern lookup and publication independently of checkout defaults. */
export function gitCafePublicationTarget(
  endpoint: string,
  repository: string,
): GitCafeTarget | null {
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !["", "/", "/api", "/api/"].includes(url.pathname)
    )
      return null;
    return parseTarget(`https://${url.host}/${repository}`);
  } catch {
    return null;
  }
}

export function gitCafeOriginTarget(
  origin: { readonly remoteName: string; readonly remoteUrl: string } | undefined,
  repository?: string,
): GitCafeTarget | null {
  if (origin?.remoteName !== "origin") return null;
  const target = parseTarget(origin.remoteUrl);
  if (!target) return null;
  if (repository === undefined) return target;
  const selected = parseTarget(repository) ?? parseTarget(`https://${target.host}/${repository}`);
  return selected?.host === target.host && selected.repository === target.repository
    ? target
    : null;
}

export function gitCafeOriginPullNumber(target: GitCafeTarget, reference: string): string | null {
  const numeric = /^#?([1-9]\d*)$/u.exec(reference.trim());
  if (numeric) return numeric[1]!;
  try {
    const url = new URL(reference);
    // GitCafe serves `/pull/<n>` and redirects the older `/pulls/<n>` there.
    const match = /^\/(.+)\/pulls?\/([1-9]\d*)\/?$/u.exec(url.pathname);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.host === target.host &&
      match?.[1]?.toLowerCase() === target.repository
      ? match[2]!
      : null;
  } catch {
    return null;
  }
}

/** Admitted pull metadata may name a fork on the origin's host for local checkout. */
export function gitCafeCloneLookupTarget(input: {
  readonly context?: { readonly remoteName: string; readonly remoteUrl: string };
  readonly providerBaseUrl?: string;
  readonly repository: string;
}): GitCafeTarget | null {
  if (input.context !== undefined) {
    const origin = gitCafeOriginTarget(input.context);
    return origin ? gitCafePublicationTarget(`https://${origin.host}`, input.repository) : null;
  }
  return gitCafePublicationTarget(input.providerBaseUrl ?? "", input.repository);
}
