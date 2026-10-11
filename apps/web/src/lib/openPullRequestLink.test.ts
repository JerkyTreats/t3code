import { describe, expect, it } from "vite-plus/test";

import {
  changeRequestRepositoryUrl,
  findProjectForChangeRequest,
  findProjectOnChangeRequestHost,
  gitHubPullRequestBrowserUrl,
  matchesLinkedPullRequestUrl,
  parseChangeRequestUrl,
  pullRequestCandidateUrlFromReferenceAutolink,
  shouldOpenPullRequestExternally,
  resolvePullRequestPreviewTarget,
} from "./openPullRequestLink";
import { EnvironmentId, ProjectId, type RepositoryIdentity } from "@t3tools/contracts";
import { normalizeGitRemoteUrl } from "@t3tools/shared/git";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

function repositoryIdentity(
  provider: string,
  canonicalKey: string,
  remoteUrl: string,
): RepositoryIdentity {
  return {
    canonicalKey,
    provider,
    locator: { source: "git-remote", remoteName: "origin", remoteUrl },
  };
}

describe("gitHubPullRequestBrowserUrl", () => {
  it("uses the requested GitHub repository instead of the project's default repository", () => {
    const identity = repositoryIdentity(
      "github",
      "github.com/acme/default",
      "https://github.com/acme/default.git",
    );

    expect(gitHubPullRequestBrowserUrl(identity, "acme/other", 42)).toBe(
      "https://github.com/acme/other/pull/42",
    );
  });

  it("preserves a custom GitHub HTTP origin without its credentials", () => {
    const identity = repositoryIdentity(
      "github",
      "github.acme.test/team/default",
      "http://token@github.acme.test:8443/team/default.git",
    );

    expect(gitHubPullRequestBrowserUrl(identity, "platform/api", 7)).toBe(
      "http://github.acme.test:8443/platform/api/pull/7",
    );
  });

  it.each([
    {
      name: "SSH",
      remoteUrl: "git@github.acme.test:team/default.git",
    },
    {
      name: "git protocol",
      remoteUrl: "git://github.acme.test/team/default.git",
    },
  ])("uses the normalized host for a $name remote", ({ remoteUrl }) => {
    const identity = repositoryIdentity("github", "github.acme.test/team/default", remoteUrl);

    expect(gitHubPullRequestBrowserUrl(identity, "platform/api", 9)).toBe(
      "https://github.acme.test/platform/api/pull/9",
    );
  });

  it("returns null for missing or invalid GitHub data", () => {
    expect(gitHubPullRequestBrowserUrl(null, "acme/repository", 1)).toBeNull();
    expect(
      gitHubPullRequestBrowserUrl(
        repositoryIdentity("github", "github.com/acme/repository", "https://github.com/a/b"),
        "acme",
        1,
      ),
    ).toBeNull();
    expect(
      gitHubPullRequestBrowserUrl(
        repositoryIdentity("github", "github.com/acme/repository", "https://github.com/a/b"),
        "../repository",
        1,
      ),
    ).toBeNull();
    expect(
      gitHubPullRequestBrowserUrl(
        repositoryIdentity("github", "github.com/acme/repository", "https://github.com/a/b"),
        "acme/repository",
        0,
      ),
    ).toBeNull();
    expect(
      gitHubPullRequestBrowserUrl(
        repositoryIdentity("github", "bad host/acme/repository", "not a remote"),
        "acme/repository",
        1,
      ),
    ).toBeNull();
  });

  it.each(["gitlab", "bitbucket", "azure-devops", "unknown"])(
    "does not build a fallback for %s",
    (provider) => {
      expect(
        gitHubPullRequestBrowserUrl(
          repositoryIdentity(provider, "github.com/acme/repository", "https://github.com/a/b"),
          "acme/repository",
          1,
        ),
      ).toBeNull();
    },
  );
});

describe("changeRequestRepositoryUrl", () => {
  it("preserves repository path casing", () => {
    expect(
      changeRequestRepositoryUrl(
        "https://gitlab.example.test/Team/Platform/Repo/-/merge_requests/42/diffs#note_1",
      ),
    ).toBe("https://gitlab.example.test/Team/Platform/Repo");
  });

  it("keeps pull-like segments inside nested GitLab repository paths", () => {
    expect(
      changeRequestRepositoryUrl(
        "https://gitlab.example.test/group/pull/123/repo/-/merge_requests/42",
      ),
    ).toBe("https://gitlab.example.test/group/pull/123/repo");
  });
});

describe("pullRequestCandidateUrlFromReferenceAutolink", () => {
  it("turns GitHub's shared issue route into a pull request candidate", () => {
    expect(
      pullRequestCandidateUrlFromReferenceAutolink(
        "https://github.com/pingdotgg/t3code/issues/8600#issuecomment-1",
      ),
    ).toBe("https://github.com/pingdotgg/t3code/pull/8600#issuecomment-1");
  });

  it("does not reinterpret other issue hosts or malformed references", () => {
    expect(
      pullRequestCandidateUrlFromReferenceAutolink(
        "https://gitlab.com/pingdotgg/t3code/-/issues/8600",
      ),
    ).toBeNull();
    expect(
      pullRequestCandidateUrlFromReferenceAutolink(
        "https://github.com/pingdotgg/t3code/issues/not-a-number",
      ),
    ).toBeNull();
  });
});

describe("matchesLinkedPullRequestUrl", () => {
  const linkedPullRequest = {
    projectId: ProjectId.make("project-1"),
    repository: "pingdotgg/t3code",
    number: 42,
    url: "https://github.com/pingdotgg/t3code/pull/42",
  };

  it("matches the same pull request without looking up its project", () => {
    expect(
      matchesLinkedPullRequestUrl(
        linkedPullRequest,
        "https://github.com/PingDotGG/T3Code/pull/42/files",
      ),
    ).toBe(true);
  });

  it.each([
    ["http://forge.example:3000/git/team/repo/pulls/42/files", true],
    ["http://forge.example:4000/git/team/repo/pulls/42", false],
    ["http://forge.example/git/team/repo/pulls/42", false],
  ])("matches Forgejo links by web authority: %s", (url, expected) => {
    expect(
      matchesLinkedPullRequestUrl(
        { ...linkedPullRequest, url: "http://forge.example:3000/git/team/repo/pulls/42" },
        url,
      ),
    ).toBe(expected);
  });

  it("keeps GitHub links on different web ports separate", () => {
    expect(
      matchesLinkedPullRequestUrl(
        linkedPullRequest,
        "https://github.com:8443/pingdotgg/t3code/pull/42",
      ),
    ).toBe(false);
    expect(
      matchesLinkedPullRequestUrl(
        { ...linkedPullRequest, url: "https://github.com:8443/pingdotgg/t3code/pull/42" },
        "https://github.com:8443/PingDotGG/T3Code/pull/42/files",
      ),
    ).toBe(true);
  });

  it("keeps Forgejo and GitHub path shapes distinct on a GitHub-named host", () => {
    expect(
      matchesLinkedPullRequestUrl(
        { ...linkedPullRequest, url: "https://github.internal/team/repo/pulls/42" },
        "https://github.internal/team/repo/pull/42",
      ),
    ).toBe(false);
  });

  it("rejects a different pull request or host", () => {
    expect(
      matchesLinkedPullRequestUrl(linkedPullRequest, "https://github.com/pingdotgg/t3code/pull/43"),
    ).toBe(false);
    expect(
      matchesLinkedPullRequestUrl(
        linkedPullRequest,
        "https://github.example.com/pingdotgg/t3code/pull/42",
      ),
    ).toBe(false);
  });
});

describe("shouldOpenPullRequestExternally", () => {
  it("uses the browser for command-click and control-click", () => {
    expect(shouldOpenPullRequestExternally({ metaKey: true, ctrlKey: false })).toBe(true);
    expect(shouldOpenPullRequestExternally({ metaKey: false, ctrlKey: true })).toBe(true);
  });

  it("keeps an unmodified click in the pull request view", () => {
    expect(shouldOpenPullRequestExternally({ metaKey: false, ctrlKey: false })).toBe(false);
  });
});

describe("parseChangeRequestUrl", () => {
  it("reads a GitHub pull request", () => {
    expect(parseChangeRequestUrl("https://github.com/T3Tools/T3Code/pull/123")).toEqual({
      host: "github.com",
      repository: "t3tools/t3code",
      number: 123,
    });
  });

  it("reads a pull request on a GitHub Enterprise host", () => {
    expect(parseChangeRequestUrl("https://github.acme.test/platform/api/pull/7")).toEqual({
      host: "github.acme.test",
      repository: "platform/api",
      number: 7,
    });
  });

  it("reads a GitLab merge request, nested groups and all", () => {
    expect(
      parseChangeRequestUrl("https://gitlab.com/t3tools/platform/t3code/-/merge_requests/42"),
    ).toEqual({
      host: "gitlab.com",
      repository: "t3tools/platform/t3code",
      number: 42,
    });
  });

  it("reads a merge request on a self-hosted GitLab named nothing like GitLab", () => {
    expect(parseChangeRequestUrl("https://code.acme.test/team/project/-/merge_requests/9")).toEqual(
      {
        host: "code.acme.test",
        repository: "team/project",
        number: 9,
      },
    );
  });

  it("reads a Bitbucket pull request", () => {
    expect(parseChangeRequestUrl("https://bitbucket.org/workspace/repo/pull-requests/5")).toEqual({
      host: "bitbucket.org",
      repository: "workspace/repo",
      number: 5,
    });
  });

  it("reads both Azure DevOps URL forms, keeping `_git` in the repository path", () => {
    expect(
      parseChangeRequestUrl("https://dev.azure.com/acme/platform/_git/t3code/pullrequest/17"),
    ).toEqual({
      host: "dev.azure.com",
      repository: "acme/platform/_git/t3code",
      number: 17,
    });
    expect(
      parseChangeRequestUrl("https://acme.visualstudio.com/platform/_git/t3code/pullrequest/17"),
    ).toEqual({
      host: "acme.visualstudio.com",
      repository: "platform/_git/t3code",
      number: 17,
    });
  });

  it("survives trailing segments, a trailing slash and a query string", () => {
    expect(parseChangeRequestUrl("https://github.com/t3tools/t3code/pull/123/files?w=1")).toEqual({
      host: "github.com",
      repository: "t3tools/t3code",
      number: 123,
    });
    expect(
      parseChangeRequestUrl("https://gitlab.com/team/project/-/merge_requests/42/diffs#note_1"),
    ).toEqual({ host: "gitlab.com", repository: "team/project", number: 42 });
    expect(
      parseChangeRequestUrl("https://bitbucket.org/team/repo/pull-requests/5/commits"),
    ).toEqual({ host: "bitbucket.org", repository: "team/repo", number: 5 });
    expect(parseChangeRequestUrl("https://github.com/t3tools/t3code/pull/123/")).toEqual({
      host: "github.com",
      repository: "t3tools/t3code",
      number: 123,
    });
  });

  it("claims nothing it cannot be sure of, so the link goes to the browser", () => {
    for (const link of [
      "https://github.com/t3tools/t3code/issues/123",
      "https://github.com/t3tools/t3code/commit/0a1b2c3",
      "https://github.com/t3tools/t3code",
      "https://github.com/t3tools/t3code/pull/abc",
      "https://gitlab.com/t3tools/t3code/-/snippets/12",
      "https://gitlab.com/t3tools/t3code/-/issues/12",
      // A path shape that means nothing off its own host.
      "https://blog.example.test/2026/updates/pull/3",
      // A lookalike is deliberately not fought here: `github.com.evil.test` reads as a GitHub
      // Enterprise install and there is no way to tell it from one. It is `findProjectForChange
      // Request` that refuses it, because no project in the workspace is checked out from it.
      "javascript:alert(1)//github.com/t3tools/t3code/pull/1",
      "not a url",
    ]) {
      expect(parseChangeRequestUrl(link), link).toBeNull();
    }
  });
});

function project(id: string, identity: RepositoryIdentity | null): EnvironmentProject {
  return {
    environmentId: EnvironmentId.make("environment-test"),
    id: ProjectId.make(id),
    title: id,
    workspaceRoot: `/synthetic/${id}`,
    repositoryIdentity: identity,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const membershipResolvers = [findProjectForChangeRequest, findProjectOnChangeRequestHost];

function expectMembership(
  projects: ReadonlyArray<EnvironmentProject>,
  reference: NonNullable<ReturnType<typeof parseChangeRequestUrl>>,
  expected: EnvironmentProject | undefined,
) {
  for (const resolve of membershipResolvers) expect(resolve(projects, reference)).toBe(expected);
}

describe("exact origin project admission", () => {
  it.each([
    { provider: "github", host: "github.example.test", path: "pull" },
    { provider: "gitlab", host: "code.example.test", path: "-/merge_requests" },
  ])(
    "binds $provider links to the exact origin repository and HTTP port",
    ({ provider, host, path }) => {
      const checkout = project("project-test", {
        ...repositoryIdentity(provider, `${host}/team/repo`, `https://${host}:8443/team/repo.git`),
        displayName: "team/repo",
      });
      const url = `https://${host}:8443/team/repo/${path}/42`;
      const reference = parseChangeRequestUrl(url)!;
      expectMembership([checkout], reference, checkout);
      expectMembership([checkout], { ...reference, repository: "team/other" }, undefined);
      expect(
        resolvePullRequestPreviewTarget({
          environmentId: checkout.environmentId,
          projects: [checkout],
          pullRequestsEnabled: true,
          url,
        }),
      ).toEqual({
        environmentId: checkout.environmentId,
        input: {
          projectId: checkout.id,
          host: `${host}:8443`,
          repository: "team/repo",
          number: 42,
        },
      });
      for (const authority of [host, `${host}:9443`, `foreign.${host}:8443`]) {
        const foreignUrl = `https://${authority}/team/repo/${path}/42`;
        expectMembership([checkout], parseChangeRequestUrl(foreignUrl)!, undefined);
        expect(
          resolvePullRequestPreviewTarget({
            environmentId: checkout.environmentId,
            projects: [checkout],
            pullRequestsEnabled: true,
            url: foreignUrl,
          }),
        ).toBeNull();
      }
    },
  );

  it.each([
    "git@ssh.dev.azure.com:v3/org-a/project/web",
    "git@vs-ssh.visualstudio.com:v3/org-a/project/web",
    "https://org-a.visualstudio.com/defaultcollection/project/_git/web",
    "https://dev.azure.com/org-a/project/_git/web",
  ])("matches the full Azure target recorded by origin %s", (remoteUrl) => {
    const checkout = project(
      "azure",
      repositoryIdentity("azure-devops", "display.example/grouping-only", remoteUrl),
    );
    const reference = parseChangeRequestUrl(
      "https://dev.azure.com/org-a/project/_git/web/pullrequest/42",
    )!;
    expectMembership([checkout], reference, checkout);
    for (const repository of [
      "org-b/project/_git/web",
      "org-a/other-project/_git/web",
      "org-a/project/_git/other",
    ])
      expectMembership([checkout], { ...reference, repository }, undefined);
    expectMembership([checkout], { ...reference, authority: "dev.azure.com:8443" }, undefined);
  });

  it("retains an Azure HTTP port across browser aliases", () => {
    const checkout = project(
      "azure-port",
      repositoryIdentity(
        "azure-devops",
        "dev.azure.com/org-a/project/_git/web",
        "https://org-a.visualstudio.com:8443/project/_git/web",
      ),
    );
    const own = parseChangeRequestUrl(
      "https://org-a.visualstudio.com:8443/project/_git/web/pullrequest/42",
    )!;
    expectMembership([checkout], own, checkout);
    expectMembership([checkout], { ...own, authority: "org-a.visualstudio.com" }, undefined);
    expectMembership([checkout], { ...own, authority: "org-a.visualstudio.com:9443" }, undefined);
    const publicAlias = parseChangeRequestUrl(
      "https://dev.azure.com/org-a/project/_git/web/pullrequest/42",
    )!;
    expectMembership([checkout], publicAlias, undefined);
  });

  const frontend = project(
    "frontend",
    repositoryIdentity(
      "github",
      "github.com/acme/frontend",
      "https://github.com/acme/frontend.git",
    ),
  );
  const backend = project(
    "backend",
    repositoryIdentity("github", "github.com/acme/backend", "https://github.com/acme/backend.git"),
  );
  const backendReference = { host: "github.com", repository: "acme/backend", number: 7 };

  it("selects the origin checkout for the link without borrowing from another repository", () => {
    expectMembership([frontend, backend], backendReference, backend);
    expectMembership([backend, frontend], backendReference, backend);
    expectMembership([frontend], backendReference, undefined);
  });

  it("selects Forgejo by exact origin HTTP authority and mount path", () => {
    const projects = [3000, 4000].map((port) =>
      project(`forgejo-${port}`, {
        ...repositoryIdentity(
          "forgejo",
          "forge.example/git/team/repo",
          `http://forge.example:${port}/git/team/repo.git`,
        ),
        displayName: "git/team/repo",
      }),
    );
    const reference = parseChangeRequestUrl("http://forge.example:4000/git/team/repo/pulls/42")!;
    expectMembership(projects, reference, projects[1]);
    expectMembership([projects[0]!], reference, undefined);
    expectMembership(projects, { ...reference, repository: "git/team/other" }, undefined);
    expectMembership(projects, { ...reference, repository: "team/repo" }, undefined);
  });

  it("uses an explicit related web endpoint for Forgejo SSH origin", () => {
    const identity = repositoryIdentity(
      "forgejo",
      "forge.example/team/repo",
      "git@forge.example:team/repo.git",
    );
    const checkout = project("forgejo-ssh", {
      ...identity,
      webUrl: "http://forge.example:4000/git/team/repo",
    });
    const reference = parseChangeRequestUrl("http://forge.example:4000/git/team/repo/pulls/42")!;
    expectMembership([checkout], reference, checkout);
    expectMembership([project("ssh-unresolved", identity)], reference, undefined);
    for (const url of [
      "http://other.example:4000/git/team/repo/pulls/42",
      "http://forge.example:3000/git/team/repo/pulls/42",
      "http://forge.example/git/team/repo/pulls/42",
      "http://forge.example:4000/other/team/repo/pulls/42",
      "http://forge.example:4000/git/team/other/pulls/42",
    ])
      expectMembership([checkout], parseChangeRequestUrl(url)!, undefined);
    const foreignWeb = project("ssh-foreign-web", {
      ...identity,
      webUrl: "http://other.example:4000/git/team/repo",
    });
    expectMembership(
      [foreignWeb],
      parseChangeRequestUrl("http://other.example:4000/git/team/repo/pulls/42")!,
      undefined,
    );
    const mismatchedRepository = project("ssh-foreign-repo", {
      ...identity,
      webUrl: "http://forge.example:4000/git/team/other",
    });
    expectMembership(
      [mismatchedRepository],
      parseChangeRequestUrl("http://forge.example:4000/git/team/other/pulls/42")!,
      undefined,
    );
  });

  it.each(["upstream", "backup"])(
    "refuses a %s locator even when the canonical identity matches",
    (remoteName) => {
      const own = backend.repositoryIdentity!;
      const wrongRemote = project("wrong-remote", {
        ...own,
        locator: { ...own.locator, remoteName },
      });
      expectMembership([wrongRemote], backendReference, undefined);
    },
  );

  it("refuses missing repository identity and keeps display grouping from authorizing links", () => {
    expectMembership([project("missing-origin", null)], backendReference, undefined);
    const displayOnly = project("display-only", {
      ...frontend.repositoryIdentity!,
      canonicalKey: "github.com/acme/backend",
      displayName: "acme/backend",
      owner: "acme",
      name: "backend",
    });
    expectMembership([displayOnly], backendReference, undefined);
  });

  it("matches nested GitLab groups using the complete origin path", () => {
    const checkout = project("nested-gitlab", {
      ...repositoryIdentity(
        "gitlab",
        "gitlab.com/t3tools/platform/t3code",
        "https://gitlab.com/t3tools/platform/t3code.git",
      ),
      displayName: "t3tools/platform/t3code",
      owner: "t3tools",
      name: "t3code",
    });
    const own = { host: "gitlab.com", repository: "t3tools/platform/t3code", number: 42 };
    expectMembership([checkout], own, checkout);
    expectMembership([checkout], { ...own, repository: "t3tools/t3code" }, undefined);
    expectMembership([checkout], { ...own, repository: "other/platform/t3code" }, undefined);
  });

  it("matches Azure SSH transport while retaining organization and project identity", () => {
    const remoteUrl = "git@ssh.dev.azure.com:v3/T3Tools/Platform/T3Code";
    const canonicalKey = normalizeGitRemoteUrl(remoteUrl);
    const checkout = project(
      "azure-ssh",
      repositoryIdentity("azure-devops", canonicalKey, remoteUrl),
    );
    expectMembership(
      [checkout],
      { host: "dev.azure.com", repository: "t3tools/platform/_git/t3code", number: 1 },
      checkout,
    );
    expectMembership(
      [checkout],
      { host: "dev.azure.com", repository: "other/platform/_git/t3code", number: 1 },
      undefined,
    );
  });

  it("keeps public, Enterprise and lookalike hosts separate", () => {
    const own = { host: "github.com", repository: "acme/backend", number: 7 };
    expectMembership([backend], own, backend);
    expectMembership([backend], { ...own, host: "github.acme.test" }, undefined);
    expectMembership([backend], { ...own, host: "github.com-evil.test" }, undefined);
  });
});
