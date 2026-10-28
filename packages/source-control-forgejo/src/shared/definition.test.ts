import type { ChangeRequestProjectIdentity } from "@t3tools/source-control-core/shared/definition";
import { recognizeRemoteWith } from "@t3tools/source-control-core/shared/definition";
import { describe, expect, it } from "vite-plus/test";

import { definition } from "./definition.ts";

const parse = (url: string) => definition.parseChangeRequestUrl(new URL(url))!;

const identity = (
  remoteUrl: string,
  fields: Partial<ChangeRequestProjectIdentity> = {},
): ChangeRequestProjectIdentity => ({
  canonicalKey: "forge.example/git/team/repo",
  displayName: "git/team/repo",
  locator: { source: "git-remote", remoteName: "origin", remoteUrl },
  ...fields,
});

const onHost = (project: ChangeRequestProjectIdentity, link: ReturnType<typeof parse>) =>
  definition.isChangeRequestInRepository(project, link) ||
  definition.canReadChangeRequestOnHost(project, link);

describe("Forgejo change request URLs", () => {
  it("reads nested paths and keeps the server's port as the authority", () => {
    expect(parse("http://git.example.test:3000/Team/Repo/pulls/42/files")).toEqual({
      host: "git.example.test",
      authority: "git.example.test:3000",
      repository: "team/repo",
      number: 42,
      repositoryUrl: "http://git.example.test:3000/Team/Repo",
    });
    expect(parse("https://github.internal/team/repo/pulls/7")).toMatchObject({
      host: "github.internal",
      authority: "github.internal",
    });
  });

  it("claims only its own route", () => {
    for (const url of [
      "https://forge.example/team/repo/pull/7",
      "https://forge.example/repo/pulls/7",
      "https://forge.example/team/repo/pulls/abc",
    ]) {
      expect(definition.parseChangeRequestUrl(new URL(url)), url).toBeNull();
    }
  });

  it.each([
    ["http://forge.example:3000/git/owner/repo.git", "http://forge.example:3000"],
    ["git@forge.example:git/owner/repo.git", "https://forge.example"],
    ["http://other.example:3000/git/owner/repo.git", "https://forge.example"],
  ])("keeps the matching web origin from %s", (remoteUrl, origin) => {
    expect(
      definition.changeRequestUrl({
        host: "forge.example",
        repository: "git/owner/repo",
        number: 42,
        remoteUrl,
      }),
    ).toBe(`${origin}/git/owner/repo/pulls/42`);
  });

  it("keeps the origin when the host already carries its port", () => {
    expect(
      definition.changeRequestUrl({
        host: "forge.example:3000",
        repository: "team/repo",
        number: 42,
        remoteUrl: "http://forge.example:3000/team/repo.git",
      }),
    ).toBe("http://forge.example:3000/team/repo/pulls/42");
  });

  // Fork F06.D6: admission names the exact origin repository; a shared host lends nothing.
  it("admits only the exact origin HTTP port and repository", () => {
    const [atThree, atFour] = [3000, 4000].map((port) =>
      identity(`http://forge.example:${port}/git/team/repo.git`),
    );
    const link = parse("http://forge.example:4000/git/team/repo/pulls/42");
    expect(definition.isChangeRequestInRepository(atFour!, link)).toBe(true);
    expect(onHost(atFour!, link)).toBe(true);
    expect(onHost(atFour!, { ...link, repository: "git/team/other" })).toBe(false);
    expect(definition.isChangeRequestInRepository(atThree!, link)).toBe(false);
    expect(onHost(atThree!, link)).toBe(false);
  });

  it("binds an SSH origin to a related resolved web URL and nothing else", () => {
    const link = parse("http://forge.example:4000/git/team/repo/pulls/42");
    expect(
      definition.isChangeRequestInRepository(identity("git@forge.example:git/team/repo.git"), link),
    ).toBe(false);
    const resolved = identity("git@forge.example:team/repo.git", {
      webUrl: "http://forge.example:4000/git/team/repo",
    });
    expect(definition.isChangeRequestInRepository(resolved, link)).toBe(true);
    expect(onHost(resolved, { ...link, repository: "git/team/other" })).toBe(false);
    const unrelated = identity("git@ssh.forge.example:team/repo.git", {
      webUrl: "http://forge.example:4000/git/team/repo",
    });
    expect(onHost(unrelated, link)).toBe(false);
    for (const url of [
      "http://other.example:4000/git/team/repo/pulls/42",
      "http://forge.example:3000/git/team/repo/pulls/42",
      "http://forge.example:4000/other/team/repo/pulls/42",
    ]) {
      expect(onHost(resolved, parse(url)), url).toBe(false);
    }
  });
});

describe("Forgejo remotes", () => {
  it("recognises Codeberg and Forgejo or Gitea hosts, keeping an HTTP remote's origin", () => {
    for (const host of ["codeberg.org", "forgejo.example.test", "gitea.example.test"]) {
      expect(recognizeRemoteWith(definition, `http://${host}:3000/team/repo.git`)).toEqual({
        kind: "forgejo",
        name: "Forgejo",
        baseUrl: `http://${host}:3000`,
      });
    }
    expect(
      recognizeRemoteWith(definition, "ssh://git@forgejo.example.test:2222/team/repo.git")?.baseUrl,
    ).toBe("https://forgejo.example.test");
    expect(recognizeRemoteWith(definition, "https://git.example.test/team/repo")).toBeNull();
  });
});

describe("Forgejo change request host", () => {
  it("keeps an HTTP remote's port, because a server's identity includes it", () => {
    const project = identity("http://forge.example:3000/git/team/repo.git");
    expect(definition.changeRequestHost?.(project)).toBe("forge.example:3000");
    expect(
      definition.changeRequestHost?.(identity("ssh://git@forge.example:2222/git/team/repo.git")),
    ).toBe("forge.example");
  });
});
