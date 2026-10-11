import { describe, expect, it } from "vite-plus/test";
import { definition as github } from "../../../source-control-github/src/client/definition.ts";
import { definition as gitlab } from "../../../source-control-gitlab/src/client/definition.ts";
import { definition as azure } from "../../../source-control-azure-devops/src/client/definition.ts";
import { definition as bitbucket } from "../../../source-control-bitbucket/src/client/definition.ts";
import { definition as forgejo } from "../../../source-control-forgejo/src/client/definition.ts";
import { definition as gitcafe } from "../../../source-control-gitcafe/src/client/definition.ts";
import {
  exactOriginContainsChangeRequest,
  exactOriginContainsPullUrl,
} from "./originRepositoryPolicy.ts";
import type { ChangeRequestProjectIdentity } from "./definition.ts";

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
