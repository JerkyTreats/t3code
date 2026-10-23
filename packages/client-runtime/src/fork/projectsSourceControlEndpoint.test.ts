import {
  SourceControlProviderKind,
  type SourceControlDiscoveryResult,
  type SourceControlProviderDiscoveryItem,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import {
  buildAddProjectRemoteSourceReadiness,
  getNewProjectPublishTargets,
  resolveAddProjectRepositoryLookupTarget,
} from "../operations/projects.ts";

// Fork F06: add-project and new-project hosts bind provider work to the authenticated endpoint.
// Upstream pruned the host tests that carried this proof, so it lives beside the owner.
function provider(input: {
  readonly kind: string;
  readonly label: string;
  readonly host: string | null;
  readonly account?: string;
}): SourceControlProviderDiscoveryItem {
  return {
    kind: SourceControlProviderKind.make(input.kind),
    label: input.label,
    status: "available",
    installHint: `Install ${input.kind}`,
    version: Option.some("1.0.0"),
    detail: Option.none(),
    auth: {
      status: "authenticated",
      account: Option.fromNullishOr(input.account ?? "example"),
      host: Option.fromNullishOr(input.host),
      detail: Option.none(),
    },
  };
}

function discovery(
  ...providers: ReadonlyArray<SourceControlProviderDiscoveryItem>
): SourceControlDiscoveryResult {
  return { versionControlSystems: [], sourceControlProviders: providers };
}

describe("project source-control endpoint binding", () => {
  it.each(["github.com", "git.example.test", "git.example.test:8443"])(
    "keeps the discovered GitHub publication endpoint %s",
    (host) => {
      const targets = getNewProjectPublishTargets(
        discovery(provider({ kind: "github", label: "GitHub", host })),
      );
      expect(targets[0]?.providerBaseUrl).toBe(`https://${host}`);
      expect(targets[0]?.owner).toBe("example");
    },
  );

  it("binds GitHub lookup to the discovered host", () => {
    expect(
      resolveAddProjectRepositoryLookupTarget({
        source: SourceControlProviderKind.make("github"),
        repository: "octocat/t3code",
        discovery: discovery(provider({ kind: "github", label: "GitHub", host: "github.com" })),
      }),
    ).toEqual({ providerBaseUrl: "https://github.com", repository: "octocat/t3code" });
  });

  it("binds Azure lookup to the discovered host and entered organization", () => {
    const azure = discovery(
      provider({ kind: "azure-devops", label: "Azure DevOps", host: "dev.azure.com" }),
    );
    expect(
      resolveAddProjectRepositoryLookupTarget({
        source: SourceControlProviderKind.make("azure-devops"),
        repository: "acme/platform/t3code",
        discovery: azure,
      }),
    ).toEqual({ providerBaseUrl: "https://dev.azure.com/acme", repository: "platform/t3code" });
    expect(
      resolveAddProjectRepositoryLookupTarget({
        source: SourceControlProviderKind.make("azure-devops"),
        repository: "platform/t3code",
        discovery: azure,
      }),
    ).toBeNull();
  });

  it("does not enable provider lookup or publication without an authenticated endpoint", () => {
    const missingHost = discovery(provider({ kind: "github", label: "GitHub", host: null }));
    expect(
      buildAddProjectRemoteSourceReadiness(missingHost)(SourceControlProviderKind.make("github"))
        .ready,
    ).toBe(false);
    expect(
      resolveAddProjectRepositoryLookupTarget({
        source: SourceControlProviderKind.make("github"),
        repository: "octocat/t3code",
        discovery: missingHost,
      }),
    ).toBeNull();
    expect(getNewProjectPublishTargets(missingHost)).toEqual([]);
  });
});
