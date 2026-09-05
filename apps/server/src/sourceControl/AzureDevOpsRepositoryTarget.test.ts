import { describe, expect, it } from "@effect/vitest";

import { azureDevOpsRepositoryTargetFromRemoteUrl } from "./AzureDevOpsRepositoryTarget.ts";

describe("azureDevOpsRepositoryTargetFromRemoteUrl", () => {
  it("parses the supported modern Azure SSH host", () => {
    expect(
      azureDevOpsRepositoryTargetFromRemoteUrl("git@ssh.dev.azure.com:v3/acme/platform/web.git"),
    ).toEqual({
      organization: "https://dev.azure.com/acme",
      project: "platform",
      repository: "web",
    });
  });

  it("parses the supported legacy Azure SSH host without changing service families", () => {
    expect(
      azureDevOpsRepositoryTargetFromRemoteUrl(
        "acme@vs-ssh.visualstudio.com:v3/acme/platform/web.git",
      ),
    ).toEqual({
      organization: "https://acme.visualstudio.com",
      project: "platform",
      repository: "web",
    });
  });

  it("rejects an Azure-shaped SCP path on a neutral host", () => {
    expect(
      azureDevOpsRepositoryTargetFromRemoteUrl("git@git.example.test:v3/acme/platform/web.git"),
    ).toBeNull();
  });

  it("rejects an Azure-shaped SSH URL on a neutral host", () => {
    expect(
      azureDevOpsRepositoryTargetFromRemoteUrl(
        "ssh://git@git.example.test/v3/acme/platform/web.git",
      ),
    ).toBeNull();
  });

  it("rejects a non-default port on an Azure SSH URL", () => {
    expect(
      azureDevOpsRepositoryTargetFromRemoteUrl(
        "ssh://git@ssh.dev.azure.com:2222/v3/acme/platform/web.git",
      ),
    ).toBeNull();
  });

  it("preserves a non-default port on an Azure HTTPS remote", () => {
    expect(
      azureDevOpsRepositoryTargetFromRemoteUrl(
        "https://dev.azure.com:8443/acme/platform/_git/web.git",
      ),
    ).toEqual({
      organization: "https://dev.azure.com:8443/acme",
      project: "platform",
      repository: "web",
    });
  });
});
