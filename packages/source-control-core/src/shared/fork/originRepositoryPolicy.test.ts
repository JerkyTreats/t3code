import { describe, expect, it } from "vite-plus/test";
import { definition as github } from "../../../../source-control-github/src/shared/definition.ts";
import { definition as gitlab } from "../../../../source-control-gitlab/src/shared/definition.ts";
import { definition as azure } from "../../../../source-control-azure-devops/src/shared/definition.ts";
import { definition as bitbucket } from "../../../../source-control-bitbucket/src/shared/definition.ts";
import { definition as forgejo } from "../../../../source-control-forgejo/src/shared/definition.ts";
import { definition as gitcafe } from "../../../../source-control-gitcafe/src/shared/definition.ts";
import {
  changeRequestMatchesDisplayHost,
  exactOriginContainsChangeRequest,
  exactOriginContainsPullUrl,
} from "./originRepositoryPolicy.ts";
import {
  type ChangeRequestProjectIdentity,
  makeSourceControlDefinitionRegistry,
} from "../definition.ts";

const identity = (remoteUrl: string, webUrl?: string): ChangeRequestProjectIdentity => ({
  canonicalKey: "synthetic/group/repository",
  locator: { source: "git-remote", remoteName: "origin", remoteUrl },
  ...(webUrl === undefined ? {} : { webUrl }),
});

describe("exact origin link admission", () => {
  it("preserves ports when a hosted pull URL authorizes a fallback fetch", () => {
    expect(
      exactOriginContainsPullUrl(
        "https://code.example.test:8443/team/repository.git",
        "https://code.example.test:8443/team/repository/pull/7",
      ),
    ).toBe(true);
    expect(
      exactOriginContainsPullUrl(
        "https://code.example.test:8443/team/repository.git",
        "https://code.example.test:9443/team/repository/pull/7",
      ),
    ).toBe(false);
    expect(
      exactOriginContainsPullUrl(
        "https://code.example.test:8443/team/repository.git",
        "https://code.example.test:8443/other/repository/pull/7",
      ),
    ).toBe(false);
  });
  it.each([github, gitlab, azure, bitbucket, forgejo, gitcafe])(
    "the $kind replacement host uses exact origin admission",
    (definition) => {
      const own = identity("https://forge.example.test:8443/mount/team/repository.git");
      const link = {
        host: "forge.example.test",
        authority: "forge.example.test:8443",
        repository: "mount/team/repository",
        number: 7,
      };
      for (const admits of [
        definition.isChangeRequestInRepository,
        definition.canReadChangeRequestOnHost,
      ]) {
        expect(admits(own, link)).toBe(true);
        expect(admits(own, { ...link, authority: "forge.example.test:9443" })).toBe(false);
        expect(admits(own, { ...link, authority: "forge.example.test" })).toBe(false);
        expect(admits(own, { ...link, repository: "team/repository" })).toBe(false);
        expect(admits({ ...own, locator: { ...own.locator, remoteName: "upstream" } }, link)).toBe(
          false,
        );
      }
    },
  );

  it("retains the full Azure organization and project scope across transports", () => {
    const own = identity("git@ssh.dev.azure.com:v3/organization/project/repository");
    const link = {
      host: "dev.azure.com",
      repository: "organization/project/_git/repository",
      number: 8,
    };
    expect(exactOriginContainsChangeRequest(own, link)).toBe(true);
    expect(
      exactOriginContainsChangeRequest(own, {
        ...link,
        repository: "other/project/_git/repository",
      }),
    ).toBe(false);
    expect(
      exactOriginContainsChangeRequest(own, {
        ...link,
        repository: "organization/other/_git/repository",
      }),
    ).toBe(false);
    expect(
      exactOriginContainsChangeRequest(own, { ...link, authority: "dev.azure.com:8443" }),
    ).toBe(false);
  });

  it("binds SSH repository hints to their explicit web mount and authority", () => {
    const own = identity(
      "git@forge.example.test:team/repository.git",
      "https://forge.example.test:8443/mount/team/repository",
    );
    const link = {
      host: "forge.example.test",
      authority: "forge.example.test:8443",
      repository: "mount/team/repository",
      number: 9,
    };
    expect(exactOriginContainsChangeRequest(own, link)).toBe(true);
    expect(
      exactOriginContainsChangeRequest(own, { ...link, authority: "forge.example.test:9443" }),
    ).toBe(false);
    expect(exactOriginContainsChangeRequest(own, { ...link, repository: "team/repository" })).toBe(
      false,
    );
    expect(
      exactOriginContainsChangeRequest(
        identity(own.locator.remoteUrl, "https://foreign.example.test/mount/team/repository"),
        { ...link, host: "foreign.example.test", authority: "foreign.example.test" },
      ),
    ).toBe(false);
    expect(
      exactOriginContainsChangeRequest(
        identity(own.locator.remoteUrl, "https://forge.example.test:8443/mount/other/repository"),
        { ...link, repository: "mount/other/repository" },
      ),
    ).toBe(false);
  });
});

describe("exact origin registry identity", () => {
  const registry = makeSourceControlDefinitionRegistry(
    [github, gitlab, gitcafe, forgejo, bitbucket, azure],
    { claimChangeRequestUrlsFirst: [gitcafe.kind] },
  );

  it("keeps a non-default port as link authority without changing the grouping host", () => {
    for (const [url, host] of [
      ["https://github.example.test:8443/team/repo/pull/12", "github.example.test"],
      ["https://gitlab.example.test:8443/team/repo/-/merge_requests/12", "gitlab.example.test"],
      ["https://bitbucket.example.test:8443/team/repo/pull-requests/12", "bitbucket.example.test"],
    ] as const) {
      expect(registry.parseChangeRequestUrl(url)?.link).toMatchObject({
        host,
        authority: `${host}:8443`,
        repository: "team/repo",
        number: 12,
      });
    }
    expect(
      registry.parseChangeRequestUrl("https://github.com/team/repo/pull/12")?.link.authority,
    ).toBeUndefined();
    expect(
      registry.isSameChangeRequest(
        "https://github.example.test:8443/team/repo/pull/12",
        "https://github.example.test/team/repo/pull/12",
      ),
    ).toBe(false);
  });

  it("paints a cached custom-port URL for its exact authority or a portless provider host", () => {
    const matches = (url: string, host: string) => {
      const parsed = registry.parseChangeRequestUrl(url);
      return parsed !== null && changeRequestMatchesDisplayHost(parsed, url, host);
    };
    for (const url of [
      "https://github.example.test:8443/team/repo/pull/12",
      "https://gitlab.example.test:8443/team/repo/-/merge_requests/12",
    ]) {
      const host = new URL(url).hostname;
      expect(matches(url, `${host}:8443`)).toBe(true);
      expect(matches(url, host)).toBe(true);
      expect(matches(url, `${host}:9443`)).toBe(false);
      expect(matches(url, "other.example.test")).toBe(false);
    }
    const forgejoUrl = "https://forge.example.test:8443/team/repo/pulls/12";
    expect(matches(forgejoUrl, "forge.example.test:8443")).toBe(true);
    expect(matches(forgejoUrl, "forge.example.test")).toBe(false);
  });

  it("keys change requests under the exact origin host and HTTP port for every provider", () => {
    const own = {
      canonicalKey: "forge.example/team/repo",
      locator: { remoteName: "origin", remoteUrl: "http://forge.example:3000/team/repo.git" },
    };
    for (const kind of [github.kind, gitlab.kind, forgejo.kind, bitbucket.kind]) {
      expect(registry.changeRequestHost(own, kind)).toBe("forge.example:3000");
    }
    expect(
      registry.changeRequestHost(
        { ...own, locator: { remoteName: "origin", remoteUrl: "git@forge.example:team/repo.git" } },
        gitlab.kind,
      ),
    ).toBe("forge.example");
    expect(
      registry.changeRequestHost(
        { ...own, locator: { remoteName: "upstream", remoteUrl: own.locator.remoteUrl } },
        gitlab.kind,
      ),
    ).toBe("forge.example");
    expect(registry.changeRequestHost({ locator: own.locator }, github.kind)).toBe("github");
  });
});
