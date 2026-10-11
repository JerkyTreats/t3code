export function authenticatedProviderEndpoint(host: string | null | undefined): string | null {
  if (!host) return null;
  try {
    const endpoint = new URL(`https://${host}`);
    return endpoint.username ||
      endpoint.password ||
      endpoint.pathname !== "/" ||
      endpoint.search ||
      endpoint.hash
      ? null
      : endpoint.origin;
  } catch {
    return null;
  }
}

export function publicationProviderEndpoint(input: {
  kind: string;
  host: string | null | undefined;
  organizationEndpoint?: string;
}): string | null {
  const authenticated = authenticatedProviderEndpoint(input.host);
  if (!authenticated) return null;
  if (input.kind !== "azure-devops") return authenticated;
  try {
    const endpoint = new URL(input.organizationEndpoint ?? authenticated);
    if (
      endpoint.origin !== authenticated ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      (endpoint.hostname === "dev.azure.com" &&
        endpoint.pathname.split("/").filter(Boolean).length !== 1)
    )
      return null;
    return endpoint.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

export function repositoryLookupTarget(input: {
  kind: string;
  host: string | null | undefined;
  repository: string;
}): { readonly providerBaseUrl: string; readonly repository: string } | null {
  const endpoint = authenticatedProviderEndpoint(input.host);
  if (!endpoint) return null;
  const repository = input.repository.trim().replace(/^\/+|\/+$/gu, "");
  if (input.kind !== "azure-devops") {
    return repository ? { providerBaseUrl: endpoint, repository } : null;
  }
  const [organization, project, ...parts] = repository.split("/");
  const azureRepository = parts.join("/");
  if (!organization || !project || !azureRepository) return null;
  return {
    providerBaseUrl: `${endpoint}/${organization}`,
    repository: `${project}/${azureRepository}`,
  };
}
