import type * as SourceControlProvider from "./SourceControlProvider.ts";

export interface AzureDevOpsRepositoryTarget {
  readonly organization: string;
  readonly project: string;
  readonly repository: string;
}

export interface AzureDevOpsOriginRemote {
  readonly remoteName: string;
  readonly remoteUrl: string;
}

export function azureDevOpsRepositoryTargetFromPublication(input: {
  readonly providerBaseUrl: string;
  readonly repository: string;
}): AzureDevOpsRepositoryTarget | null {
  try {
    const endpoint = new URL(input.providerBaseUrl);
    const endpointOrganization = endpoint.pathname.split("/").find((segment) => segment.length > 0);
    const repositoryPath = input.repository
      .split("/")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    const hostname = endpoint.hostname.toLowerCase();

    if (hostname === "dev.azure.com") {
      const organization = endpointOrganization ?? repositoryPath[0];
      const project = endpointOrganization ? repositoryPath[0] : repositoryPath[1];
      const repository = endpointOrganization ? repositoryPath[1] : repositoryPath[2];
      return organization && project && repository
        ? {
            organization: `${endpoint.protocol}//${endpoint.host}/${organization}`,
            project,
            repository: repositoryName(repository),
          }
        : null;
    }

    if (hostname.endsWith(".visualstudio.com")) {
      const project = repositoryPath[0];
      const repository = repositoryPath[1];
      return project && repository
        ? {
            organization: `${endpoint.protocol}//${endpoint.host}`,
            project,
            repository: repositoryName(repository),
          }
        : null;
    }

    return null;
  } catch {
    return null;
  }
}

function repositoryName(value: string): string {
  return value.replace(/\.git$/iu, "");
}

function azureSshOrganizationUrl(input: {
  readonly hostname: string;
  readonly organization: string;
}): string | null {
  const hostname = input.hostname.toLowerCase();
  if (hostname === "ssh.dev.azure.com") {
    return `https://dev.azure.com/${input.organization}`;
  }
  if (hostname === "vs-ssh.visualstudio.com") {
    return `https://${input.organization}.visualstudio.com`;
  }
  return null;
}

/**
 * Resolves the exact Azure repository named by an origin remote. Azure accepts three common
 * remote shapes, while its CLI wants one organization url plus separate project and repository
 * selectors.
 */
export function azureDevOpsRepositoryTargetFromContext(
  context:
    | Pick<
        SourceControlProvider.SourceControlProviderContext,
        "provider" | "remoteName" | "remoteUrl"
      >
    | undefined,
): AzureDevOpsRepositoryTarget | null {
  if (!context || context.provider.kind !== "azure-devops" || context.remoteName !== "origin") {
    return null;
  }

  return azureDevOpsRepositoryTargetFromOrigin(context);
}

export function azureDevOpsRepositoryTargetFromOrigin(
  origin: AzureDevOpsOriginRemote | undefined,
): AzureDevOpsRepositoryTarget | null {
  if (!origin || origin.remoteName !== "origin") return null;

  return azureDevOpsRepositoryTargetFromRemoteUrl(origin.remoteUrl);
}

export function azureDevOpsRepositoryTargetFromRemoteUrl(
  remoteUrl: string,
): AzureDevOpsRepositoryTarget | null {
  const normalizedRemoteUrl = remoteUrl.trim();
  const scpMatch = /^[^@\s]+@([^:/\s]+):v3\/([^/\s]+)\/([^/\s]+)\/(.+)$/iu.exec(
    normalizedRemoteUrl,
  );
  if (scpMatch?.[2] && scpMatch[3] && scpMatch[4]) {
    const organization = azureSshOrganizationUrl({
      hostname: scpMatch[1] ?? "",
      organization: scpMatch[2],
    });
    if (organization === null) return null;
    return {
      organization,
      project: scpMatch[3],
      repository: repositoryName(scpMatch[4]),
    };
  }

  try {
    const url = new URL(normalizedRemoteUrl);
    const path = url.pathname.split("/").filter((segment) => segment.length > 0);
    if (path[0]?.toLowerCase() === "v3" && path[1] && path[2] && path[3]) {
      if (url.protocol !== "ssh:" || url.port.length > 0) return null;
      const organization = azureSshOrganizationUrl({
        hostname: url.hostname,
        organization: path[1],
      });
      if (organization === null) return null;
      return {
        organization,
        project: path[2],
        repository: repositoryName(path.slice(3).join("/")),
      };
    }
    const gitMarkerIndex = path.findIndex((segment) => segment.toLowerCase() === "_git");
    const repository = repositoryName(path[gitMarkerIndex + 1] ?? "");
    if (!repository || gitMarkerIndex < 1) return null;

    if (url.hostname.toLowerCase() === "dev.azure.com" && gitMarkerIndex >= 2) {
      const organization = path[0];
      const project = path[gitMarkerIndex - 1];
      return organization && project
        ? {
            organization: `${url.protocol}//${url.host}/${organization}`,
            project,
            repository,
          }
        : null;
    }

    if (url.hostname.toLowerCase().endsWith(".visualstudio.com")) {
      const project = path[gitMarkerIndex - 1];
      return project
        ? {
            organization: `${url.protocol}//${url.host}`,
            project,
            repository,
          }
        : null;
    }

    return null;
  } catch {
    return null;
  }
}

export function azureDevOpsChangeRequestBelongsToTarget(
  changeRequest: { readonly number: number; readonly url: string },
  target: AzureDevOpsRepositoryTarget,
): boolean {
  try {
    const repositoryUrl = new URL(
      `${target.organization.replace(/\/+$/u, "")}/${target.project}/_git/${target.repository}`,
    );
    const changeRequestUrl = new URL(changeRequest.url);
    return (
      changeRequestUrl.origin.toLowerCase() === repositoryUrl.origin.toLowerCase() &&
      changeRequestUrl.pathname.replace(/\/+$/u, "").toLowerCase() ===
        `${repositoryUrl.pathname.replace(/\/+$/u, "")}/pullrequest/${changeRequest.number}`.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function azureDevOpsThreadsUrlBelongsToTarget(
  threadsUrl: string,
  changeRequestNumber: number,
  target: AzureDevOpsRepositoryTarget,
): boolean {
  try {
    const organizationUrl = new URL(target.organization);
    const threads = new URL(threadsUrl);
    const expectedPath = [
      organizationUrl.pathname.replace(/\/+$/u, ""),
      encodeURIComponent(target.project),
      "_apis/git/repositories",
      encodeURIComponent(target.repository),
      "pullRequests",
      String(changeRequestNumber),
      "threads",
    ].join("/");
    return (
      threads.origin.toLowerCase() === organizationUrl.origin.toLowerCase() &&
      threads.pathname.replace(/\/+$/u, "").toLowerCase() === expectedPath.toLowerCase()
    );
  } catch {
    return false;
  }
}
