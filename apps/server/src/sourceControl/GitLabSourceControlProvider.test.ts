import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as GitLabCli from "./GitLabCli.ts";
import { parseGitLabAuthStatusHosts } from "./gitLabAuthStatus.ts";
import * as GitLabSourceControlProvider from "./GitLabSourceControlProvider.ts";

const originContext = {
  provider: {
    kind: "gitlab" as const,
    name: "GitLab",
    baseUrl: "https://gitlab.com",
  },
  remoteName: "origin",
  remoteUrl: "git@gitlab.com:fork/project.git",
};

function makeProvider(gitlab: Partial<GitLabCli.GitLabCli["Service"]>) {
  return GitLabSourceControlProvider.make.pipe(
    Effect.provide(Layer.mock(GitLabCli.GitLabCli)(gitlab)),
  );
}

it.effect("binds repository lookup to the explicit GitLab endpoint", () =>
  Effect.gen(function* () {
    let received: Parameters<GitLabCli.GitLabCli["Service"]["getRepositoryCloneUrls"]>[0] | null =
      null;
    const provider = yield* makeProvider({
      getRepositoryCloneUrls: (input) => {
        received = input;
        return Effect.succeed({
          nameWithOwner: "group/repo",
          url: "https://gitlab.example.test/group/repo",
          sshUrl: "git@gitlab.example.test:group/repo.git",
        });
      },
    });

    yield* provider.getRepositoryCloneUrls({
      cwd: "/repo",
      providerBaseUrl: "https://gitlab.example.test",
      repository: "group/repo",
    });

    assert.deepStrictEqual(received, {
      cwd: "/repo",
      host: "gitlab.example.test",
      repository: "group/repo",
    });
  }),
);

it.effect("maps GitLab MR summaries into provider-neutral change requests", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      getMergeRequest: () =>
        Effect.succeed({
          number: 42,
          title: "Add GitLab provider",
          url: "https://gitlab.com/pingdotgg/t3code/-/merge_requests/42",
          baseRefName: "main",
          headRefName: "feature/source-control",
          state: "open",
          isCrossRepository: true,
          headRepositoryNameWithOwner: "fork/t3code",
          headRepositoryOwnerLogin: "fork",
        }),
    });

    const changeRequest = yield* provider.getChangeRequest({
      cwd: "/repo",
      context: originContext,
      reference: "42",
    });

    assert.deepStrictEqual(changeRequest, {
      provider: "gitlab",
      number: 42,
      title: "Add GitLab provider",
      url: "https://gitlab.com/pingdotgg/t3code/-/merge_requests/42",
      baseRefName: "main",
      headRefName: "feature/source-control",
      state: "open",
      updatedAt: Option.none(),
      isCrossRepository: true,
      headRepositoryNameWithOwner: "fork/t3code",
      headRepositoryOwnerLogin: "fork",
    });
  }),
);

it.effect("adds repository context while retaining GitLab CLI causes", () =>
  Effect.gen(function* () {
    const cause = new GitLabCli.GitLabCliCommandError({
      operation: "execute",
      command: "glab",
      cwd: "/repo",
      cause: new Error("raw upstream detail that should remain in the cause"),
    });
    const provider = yield* makeProvider({
      createRepository: () => Effect.fail(cause),
    });

    const error = yield* provider
      .createRepository({
        cwd: "/repo",
        providerBaseUrl: "https://gitlab.com",
        repository: "owner/repo",
        visibility: "private",
      })
      .pipe(Effect.flip);

    assert.deepStrictEqual(
      {
        provider: error.provider,
        operation: error.operation,
        command: error.command,
        cwd: error.cwd,
        repository: error.repository,
        detail: error.detail,
      },
      {
        provider: "gitlab",
        operation: "createRepository",
        command: "glab",
        cwd: "/repo",
        repository: "owner/repo",
        detail: "GitLab CLI command failed.",
      },
    );
    assert.strictEqual(error.cause, cause);
    assert.equal(error.message.includes("raw upstream detail"), false);
  }),
);

it.effect("lists GitLab MRs through provider-neutral input names", () =>
  Effect.gen(function* () {
    let listInput: Parameters<GitLabCli.GitLabCli["Service"]["listMergeRequests"]>[0] | null = null;
    const provider = yield* makeProvider({
      listMergeRequests: (input) => {
        listInput = input;
        return Effect.succeed([]);
      },
    });

    yield* provider.listChangeRequests({
      cwd: "/repo",
      context: originContext,
      headSelector: "feature/provider",
      state: "all",
      limit: 10,
    });

    assert.deepStrictEqual(listInput, {
      cwd: "/repo",
      host: "gitlab.com",
      repository: "fork/project",
      headSelector: "feature/provider",
      state: "all",
      limit: 10,
    });
  }),
);

it.effect("pins GitLab lookup and checkout to origin when another remote may be present", () =>
  Effect.gen(function* () {
    let getInput: Parameters<GitLabCli.GitLabCli["Service"]["getMergeRequest"]>[0] | null = null;
    let checkoutInput:
      | Parameters<GitLabCli.GitLabCli["Service"]["checkoutMergeRequest"]>[0]
      | null = null;
    const provider = yield* makeProvider({
      getMergeRequest: (input) => {
        getInput = input;
        return Effect.succeed({
          number: 42,
          title: "Origin MR",
          url: "https://gitlab.com/fork/project/-/merge_requests/42",
          baseRefName: "main",
          headRefName: "feature/origin",
          state: "open",
        });
      },
      checkoutMergeRequest: (input) => {
        checkoutInput = input;
        return Effect.void;
      },
    });

    yield* provider.getChangeRequest({ cwd: "/repo", context: originContext, reference: "42" });
    yield* provider.checkoutChangeRequest({
      cwd: "/repo",
      context: originContext,
      reference: "42",
    });

    assert.deepStrictEqual(getInput, {
      cwd: "/repo",
      context: originContext,
      host: "gitlab.com",
      repository: "fork/project",
      reference: "42",
    });
    assert.deepStrictEqual(checkoutInput, {
      cwd: "/repo",
      context: originContext,
      host: "gitlab.com",
      repository: "fork/project",
      reference: "42",
    });
  }),
);

it.effect("pins GitLab MR creation to origin when another remote may be present", () =>
  Effect.gen(function* () {
    let createInput: Parameters<GitLabCli.GitLabCli["Service"]["createMergeRequest"]>[0] | null =
      null;
    const provider = yield* makeProvider({
      createMergeRequest: (input) => {
        createInput = input;
        return Effect.void;
      },
    });

    yield* provider.createChangeRequest({
      cwd: "/repo",
      context: originContext,
      baseRefName: "main",
      headSelector: "owner:feature/provider",
      title: "Provider MR",
      bodyFile: "/tmp/body.md",
    });

    assert.deepStrictEqual(createInput, {
      cwd: "/repo",
      host: "gitlab.com",
      repository: "fork/project",
      baseBranch: "main",
      headSelector: "owner:feature/provider",
      source: {
        owner: "owner",
        refName: "feature/provider",
      },
      title: "Provider MR",
      bodyFile: "/tmp/body.md",
    });
  }),
);

it.effect("rejects GitLab MR creation without an exact origin context", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      createMergeRequest: () => Effect.die("must not be called"),
    });

    const error = yield* provider
      .createChangeRequest({
        cwd: "/repo",
        context: { ...originContext, remoteName: "upstream" },
        baseRefName: "main",
        headSelector: "feature/provider",
        title: "Provider MR",
        bodyFile: "/tmp/body.md",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "exact GitLab origin");
  }),
);

it("accepts authenticated GitLab hosts when another configured host fails", () => {
  const auth = GitLabSourceControlProvider.discovery.parseAuth({
    exitCode: ChildProcessSpawner.ExitCode(1),
    stdout: `gitlab.com
  x gitlab.com: API call failed: 401 Unauthorized
  ! No token found
self-hosted.example.test
  ✓ Logged in to self-hosted.example.test as gitlab-user
  ✓ Token found: ******
`,
    stderr: "",
  });

  assert.deepStrictEqual(
    {
      status: auth.status,
      account: auth.account,
      host: auth.host,
    },
    {
      status: "authenticated",
      account: Option.some("gitlab-user"),
      host: Option.some("self-hosted.example.test"),
    },
  );
});

it("refines unknown GitLab remotes with mixed-case provider hosts", () => {
  const provider = GitLabSourceControlProvider.discovery.refineUnknownRemote?.({
    cwd: "/repo",
    context: {
      provider: {
        kind: "unknown",
        name: "Self-Hosted.Example.Test",
        baseUrl: "https://Self-Hosted.Example.Test",
      },
      remoteName: "origin",
      remoteUrl: "https://Self-Hosted.Example.Test/group/project.git",
    },
    auth: {
      exitCode: ChildProcessSpawner.ExitCode(0),
      stdout: `self-hosted.example.test
  ✓ Logged in to self-hosted.example.test as gitlab-user
  ✓ Token found: ******
`,
      stderr: "",
    },
  });

  assert.deepStrictEqual(provider, {
    kind: "gitlab",
    name: "GitLab Self-Hosted",
    baseUrl: "https://Self-Hosted.Example.Test",
  });
});

it("parses authenticated GitLab auth status hosts with ports and single-label names", () => {
  assert.deepStrictEqual(
    parseGitLabAuthStatusHosts(`localhost:8080
  ✓ Logged in to localhost:8080 as local-user
selfhosted
  ✓ Logged in to selfhosted as single-label-user
`),
    [
      { host: "localhost:8080", account: "local-user" },
      { host: "selfhosted", account: "single-label-user" },
    ],
  );
});
