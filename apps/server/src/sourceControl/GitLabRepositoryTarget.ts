import type * as SourceControlProvider from "./SourceControlProvider.ts";

export interface GitLabRepositoryTarget {
  readonly host: string;
  readonly repository: string;
}

export interface GitLabOriginRemote {
  readonly remoteName: string;
  readonly remoteUrl: string;
}

export function gitLabRepositoryTargetFromOrigin(
  origin: GitLabOriginRemote | undefined,
): GitLabRepositoryTarget | null {
  if (!origin || origin.remoteName !== "origin") return null;

  const remoteUrl = origin.remoteUrl.trim();
  const scpMatch = remoteUrl.includes("://") ? null : /^[^@\s]+@([^:/\s]+):(.+)$/u.exec(remoteUrl);
  if (scpMatch?.[1] && scpMatch[2]) {
    const repository = scpMatch[2].replace(/^\/+|\/+$/gu, "").replace(/\.git$/iu, "");
    return repository.includes("/") ? { host: scpMatch[1], repository } : null;
  }

  try {
    const url = new URL(remoteUrl);
    const repository = url.pathname.replace(/^\/+|\/+$/gu, "").replace(/\.git$/iu, "");
    return url.host.length > 0 && repository.includes("/") ? { host: url.host, repository } : null;
  } catch {
    return null;
  }
}

export function gitLabRepositoryTargetFromContext(
  context:
    | Pick<
        SourceControlProvider.SourceControlProviderContext,
        "provider" | "remoteName" | "remoteUrl"
      >
    | undefined,
): GitLabRepositoryTarget | null {
  return context?.provider.kind === "gitlab" ? gitLabRepositoryTargetFromOrigin(context) : null;
}

export function gitLabRepositorySelector(target: GitLabRepositoryTarget): string {
  return `https://${target.host}/${target.repository}`;
}
