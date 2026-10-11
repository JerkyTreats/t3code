import { describe, expect, it } from "vite-plus/test";
import {
  authenticatedProviderEndpoint,
  publicationProviderEndpoint,
  repositoryLookupTarget,
} from "./sourceControlEndpoint.ts";

describe("client endpoint preparation owner", () => {
  it("replaces palette and publication hosts while keeping exact authenticated authority", () => {
    expect(publicationProviderEndpoint({ kind: "gitcafe", host: "git.example.test:8443" })).toBe(
      "https://git.example.test:8443",
    );
    for (const host of [
      null,
      "",
      "user:password@git.example.test",
      "git.example.test/foreign",
      "git.example.test?query=1",
    ]) {
      expect(authenticatedProviderEndpoint(host)).toBeNull();
      expect(
        repositoryLookupTarget({ kind: "github", host, repository: "owner/repository" }),
      ).toBeNull();
    }
  });
  it("keeps Azure organization scope and refuses foreign publication hosts", () => {
    expect(
      repositoryLookupTarget({
        kind: "azure-devops",
        host: "dev.azure.com",
        repository: "organization/project/repository",
      }),
    ).toEqual({
      providerBaseUrl: "https://dev.azure.com/organization",
      repository: "project/repository",
    });
    expect(
      repositoryLookupTarget({
        kind: "azure-devops",
        host: "dev.azure.com",
        repository: "project/repository",
      }),
    ).toBeNull();
    expect(
      publicationProviderEndpoint({
        kind: "azure-devops",
        host: "dev.azure.com",
        organizationEndpoint: "https://dev.azure.com/organization",
      }),
    ).toBe("https://dev.azure.com/organization");
    for (const organizationEndpoint of [
      "https://dev.azure.com",
      "https://dev.azure.com/organization/project",
      "https://foreign.example.test/organization",
      "https://dev.azure.com:8443/organization",
      "https://dev.azure.com/organization?token=synthetic",
    ]) {
      expect(
        publicationProviderEndpoint({
          kind: "azure-devops",
          host: "dev.azure.com",
          organizationEndpoint,
        }),
      ).toBeNull();
    }
  });
});
