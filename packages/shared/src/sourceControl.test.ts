import { describe, expect, it } from "vitest";
import {
  detectSourceControlProviderFromRemoteUrl,
  formatChangeRequestAction,
  getChangeRequestTerminologyForKind,
  resolveChangeRequestPresentationForKind,
} from "./sourceControl.ts";

describe("detectSourceControlProviderFromRemoteUrl", () => {
  it("detects GitHub remotes", () => {
    expect(detectSourceControlProviderFromRemoteUrl("git@github.com:T3Tools/T3Code.git"))?.toEqual({
      kind: "github",
      name: "GitHub",
      baseUrl: "https://github.com",
    });
  });

  it("detects GitLab remotes", () => {
    expect(
      detectSourceControlProviderFromRemoteUrl("https://gitlab.com/T3Tools/platform/T3Code.git"),
    )?.toEqual({
      kind: "gitlab",
      name: "GitLab",
      baseUrl: "https://gitlab.com",
    });
  });

  it("detects Azure DevOps remotes", () => {
    expect(
      detectSourceControlProviderFromRemoteUrl("https://dev.azure.com/org/project/_git/repository"),
    )?.toEqual({
      kind: "azure-devops",
      name: "Azure DevOps",
      baseUrl: "https://dev.azure.com",
    });
  });

  it("detects Bitbucket remotes", () => {
    expect(
      detectSourceControlProviderFromRemoteUrl("git@bitbucket.org:workspace/repository.git"),
    )?.toEqual({
      kind: "bitbucket",
      name: "Bitbucket",
      baseUrl: "https://bitbucket.org",
    });
  });
});

describe("change request presentation", () => {
  it("returns provider-specific labels", () => {
    const presentation = resolveChangeRequestPresentationForKind("gitlab");
    expect(formatChangeRequestAction("Create", presentation)).toBe("Create MR");
    expect(getChangeRequestTerminologyForKind("gitlab")).toEqual({
      shortLabel: "MR",
      singular: "merge request",
    });
  });
});
