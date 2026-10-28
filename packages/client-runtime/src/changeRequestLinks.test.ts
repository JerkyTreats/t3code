import {
  EnvironmentId,
  ProjectId,
  type RepositoryIdentity,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import type { ChangeRequestLink } from "@t3tools/source-control-core/shared/definition";
import { describe, expect, it } from "vite-plus/test";

import {
  findProjectForChangeRequest,
  findProjectOnChangeRequestHost,
  projectChangeRequestUrl,
  resolveChangeRequestLinkTarget,
  resolvePullRequestPreviewTarget,
} from "./changeRequestLinks.ts";
import { sourceControlClients } from "./sourceControlClients.ts";

describe("findProjectForChangeRequest", () => {
  const project = (identity: Record<string, unknown>) =>
    ({ id: "p1", repositoryIdentity: identity }) as never;

  it("matches a nested GitLab group by the whole path below the host", () => {
    const projects = [
      project({
        canonicalKey: "gitlab.com/t3tools/platform/t3code",
        provider: SourceControlProviderKind.make("gitlab"),
        displayName: "t3tools/platform/t3code",
        owner: "t3tools",
        name: "t3code",
        locator: {
          source: "git-remote",
          remoteName: "origin",
          remoteUrl: "https://gitlab.com/t3tools/platform/t3code.git",
        },
      }),
    ];
    expect(
      findProjectForChangeRequest(projects, {
        host: "gitlab.com",
        repository: "t3tools/platform/t3code",
        number: 42,
      }),
    ).toBe(projects[0]);
  });

  it("claims nothing for a lookalike host, which is what keeps a link a link", () => {
    const projects = [
      project({
        canonicalKey: "github.com/pingdotgg/t3code",
        provider: SourceControlProviderKind.make("github"),
        owner: "pingdotgg",
        name: "t3code",
      }),
    ];
    expect(
      findProjectForChangeRequest(projects, {
        host: "github.com-evil.test",
        repository: "pingdotgg/t3code",
        number: 1,
      }),
    ).toBeUndefined();
  });
});

describe("findProjectOnChangeRequestHost", () => {
  const project = (id: string, identity: Record<string, unknown>) =>
    ({ id, repositoryIdentity: identity }) as never;
  const frontend = project("frontend", {
    canonicalKey: "github.com/acme/frontend",
    provider: "github",
    owner: "acme",
    name: "frontend",
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "https://github.com/acme/frontend.git",
    },
  });
  const backend = project("backend", {
    canonicalKey: "github.com/acme/backend",
    provider: "github",
    owner: "acme",
    name: "backend",
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "https://github.com/acme/backend.git",
    },
  });

  it("prefers the project checked out from the link's own repository", () => {
    expect(
      findProjectOnChangeRequestHost([frontend, backend], {
        host: "github.com",
        repository: "acme/backend",
        number: 7,
      }),
    ).toBe(backend);
  });

  // Fork F06.D6: only the exact origin checkout admits a link; no project on the host is lent.
  it("lends no project on the host to a repository nobody has checked out", () => {
    expect(
      findProjectOnChangeRequestHost([frontend], {
        host: "github.com",
        repository: "acme/backend",
        number: 7,
      }),
    ).toBeUndefined();
  });
});

describe("resolveChangeRequestLinkTarget", () => {
  const local = EnvironmentId.make("local");
  const remote = EnvironmentId.make("remote");
  const project = (id: string, environmentId: EnvironmentId, canonicalKey: string) => ({
    id: ProjectId.make(id),
    environmentId,
    repositoryIdentity: {
      canonicalKey,
      provider: SourceControlProviderKind.make(
        canonicalKey.startsWith("git.cafe") ? "gitcafe" : "github",
      ),
      displayName: canonicalKey.split("/").slice(1).join("/"),
      locator: { source: "git-remote", remoteName: "origin", remoteUrl: `https://${canonicalKey}` },
    } satisfies RepositoryIdentity,
  });
  const mirrored = project("mirrored", local, "git.cafe/acme/app");
  const sibling = project("sibling", local, "github.com/acme/tools");
  const elsewhere = project("elsewhere", remote, "github.com/acme/app");
  const projects = [mirrored, sibling, elsewhere];
  const hostReads = () => ({ pullRequests: true, threadPullRequests: true });
  const url = "https://github.com/acme/app/pull/7";

  // Fork F06.D6: a sibling on the link's host is not the link's origin repository.
  it("leaves a mirror's link to the browser when its environment has no origin checkout", () => {
    expect(
      resolveChangeRequestLinkTarget({
        url,
        projects,
        capabilities: hostReads,
        environmentId: local,
        projectId: mirrored.id,
        lendHostProject: true,
      }),
    ).toBeNull();
  });

  it("only borrows a host project for views that can show any repository on the host", () => {
    const resolve = (capabilities: typeof hostReads, lendHostProject: boolean) =>
      resolveChangeRequestLinkTarget({
        url,
        projects,
        capabilities,
        environmentId: local,
        lendHostProject,
      });
    expect(resolve(hostReads, false)).toBeNull();
    expect(resolve(() => ({ pullRequests: true, threadPullRequests: false }), true)).toBeNull();
  });

  it("finds the checked-out repository in any environment that reads change requests", () => {
    expect(
      resolveChangeRequestLinkTarget({
        url,
        projects,
        capabilities: hostReads,
        primaryEnvironmentId: local,
        lendHostProject: false,
      })?.project,
    ).toBe(elsewhere);
    expect(
      resolveChangeRequestLinkTarget({
        url,
        projects,
        capabilities: (environmentId) => (environmentId === remote ? undefined : hostReads()),
        lendHostProject: false,
      }),
    ).toBeNull();
  });
});

describe("resolvePullRequestPreviewTarget", () => {
  const environmentId = EnvironmentId.make("env-1");
  const project = {
    id: ProjectId.make("project-1"),
    environmentId,
    repositoryIdentity: {
      canonicalKey: "github.com/acme/web",
      provider: SourceControlProviderKind.make("github"),
      displayName: "acme/web",
      locator: { source: "git-remote", remoteName: "origin", remoteUrl: "git@github.com:acme/web" },
    } satisfies RepositoryIdentity,
  };

  it("previews a pull request only under the project that holds its repository", () => {
    const target = (url: string) =>
      resolvePullRequestPreviewTarget({
        environmentId,
        projects: [project],
        pullRequestsEnabled: true,
        url,
      });
    expect(target("https://github.com/acme/web/pull/7")).toEqual({
      environmentId,
      input: { projectId: project.id, host: "github.com", repository: "acme/web", number: 7 },
    });
    expect(target("https://github.com/acme/other/pull/7")).toBeNull();
  });
});

describe("projectChangeRequestUrl", () => {
  const identity = (provider: string): RepositoryIdentity => ({
    canonicalKey: "github.com/acme/default",
    provider: SourceControlProviderKind.make(provider),
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "git@github.com:acme/default",
    },
  });

  it("builds the requested repository's URL on the project's host", () => {
    expect(projectChangeRequestUrl(identity("github"), "acme/other", 42)).toBe(
      "https://github.com/acme/other/pull/42",
    );
  });

  it("builds the project's own Azure repository from its full path, not its short selector", () => {
    const azure: RepositoryIdentity = {
      canonicalKey: "dev.azure.com/org/project/_git/web",
      provider: SourceControlProviderKind.make("azure-devops"),
      owner: "org",
      name: "web",
      locator: {
        source: "git-remote",
        remoteName: "origin",
        remoteUrl: "https://dev.azure.com/org/project/_git/web",
      },
    };
    expect(projectChangeRequestUrl(azure, "web", 42)).toBe(
      "https://dev.azure.com/org/project/_git/web/pullrequest/42",
    );
  });

  it("builds nothing without a project host that knows its URL shape", () => {
    expect(projectChangeRequestUrl(null, "acme/repository", 1)).toBeNull();
    expect(projectChangeRequestUrl(identity("unknown"), "acme/repository", 1)).toBeNull();
    const { provider: _provider, ...withoutProvider } = identity("github");
    expect(projectChangeRequestUrl(withoutProvider, "acme/repository", 1)).toBeNull();
  });
});

describe("exact origin project admission", () => {
  const environmentId = EnvironmentId.make("environment-test");
  const repositoryIdentity = (
    provider: string,
    canonicalKey: string,
    remoteUrl: string,
  ): RepositoryIdentity => ({
    canonicalKey,
    provider: SourceControlProviderKind.make(provider),
    locator: { source: "git-remote", remoteName: "origin", remoteUrl },
  });
  const project = (id: string, identity: RepositoryIdentity | null) => ({
    id: ProjectId.make(id),
    environmentId,
    repositoryIdentity: identity,
  });
  type Project = ReturnType<typeof project>;
  const parse = (url: string) => sourceControlClients.parseChangeRequestUrl(url)!.link;
  const expectMembership = (
    projects: ReadonlyArray<Project>,
    reference: ChangeRequestLink,
    expected: Project | undefined,
  ) => {
    for (const resolve of [findProjectForChangeRequest, findProjectOnChangeRequestHost])
      expect(resolve(projects, reference)).toBe(expected);
  };

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
      const reference = parse(url);
      expectMembership([checkout], reference, checkout);
      expectMembership([checkout], { ...reference, repository: "team/other" }, undefined);
      expect(
        resolvePullRequestPreviewTarget({
          environmentId,
          projects: [checkout],
          pullRequestsEnabled: true,
          url,
        }),
      ).toEqual({
        environmentId,
        input: {
          projectId: checkout.id,
          host: `${host}:8443`,
          repository: "team/repo",
          number: 42,
        },
      });
      for (const authority of [host, `${host}:9443`, `foreign.${host}:8443`]) {
        const foreignUrl = `https://${authority}/team/repo/${path}/42`;
        expectMembership([checkout], parse(foreignUrl), undefined);
        expect(
          resolvePullRequestPreviewTarget({
            environmentId,
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
    const reference = parse("https://dev.azure.com/org-a/project/_git/web/pullrequest/42");
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
    const own = parse("https://org-a.visualstudio.com:8443/project/_git/web/pullrequest/42");
    expectMembership([checkout], own, checkout);
    expectMembership([checkout], { ...own, authority: "org-a.visualstudio.com" }, undefined);
    expectMembership([checkout], { ...own, authority: "org-a.visualstudio.com:9443" }, undefined);
    expectMembership(
      [checkout],
      parse("https://dev.azure.com/org-a/project/_git/web/pullrequest/42"),
      undefined,
    );
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
    const reference = parse("http://forge.example:4000/git/team/repo/pulls/42");
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
    const reference = parse("http://forge.example:4000/git/team/repo/pulls/42");
    expectMembership([checkout], reference, checkout);
    expectMembership([project("ssh-unresolved", identity)], reference, undefined);
    for (const url of [
      "http://other.example:4000/git/team/repo/pulls/42",
      "http://forge.example:3000/git/team/repo/pulls/42",
      "http://forge.example/git/team/repo/pulls/42",
      "http://forge.example:4000/other/team/repo/pulls/42",
      "http://forge.example:4000/git/team/other/pulls/42",
    ])
      expectMembership([checkout], parse(url), undefined);
    const foreignWeb = project("ssh-foreign-web", {
      ...identity,
      webUrl: "http://other.example:4000/git/team/repo",
    });
    expectMembership(
      [foreignWeb],
      parse("http://other.example:4000/git/team/repo/pulls/42"),
      undefined,
    );
    const mismatchedRepository = project("ssh-foreign-repo", {
      ...identity,
      webUrl: "http://forge.example:4000/git/team/other",
    });
    expectMembership(
      [mismatchedRepository],
      parse("http://forge.example:4000/git/team/other/pulls/42"),
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
    const checkout = project(
      "azure-ssh",
      repositoryIdentity(
        "azure-devops",
        sourceControlClients.repositoryKeyFromRemote(remoteUrl),
        remoteUrl,
      ),
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
