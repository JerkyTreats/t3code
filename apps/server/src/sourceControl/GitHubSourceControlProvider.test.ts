import { assert, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubCli from "./GitHubCli.ts";
import * as GitHubGraphQlBudget from "./githubGraphQlBudget.ts";
import { parseGitHubAuthStatus } from "./gitHubAuthStatus.ts";
import * as GitHubSourceControlProvider from "./GitHubSourceControlProvider.ts";

const ORIGIN_CONTEXT = {
  provider: {
    kind: "github" as const,
    name: "GitHub",
    baseUrl: "https://github.com",
  },
  remoteName: "origin",
  remoteUrl: "git@github.com:pingdotgg/t3code.git",
};

const processResult = (
  stdout: string,
  options?: {
    readonly stderr?: string;
    readonly exitCode?: ChildProcessSpawner.ExitCode;
  },
): VcsProcess.VcsProcessOutput => ({
  exitCode: options?.exitCode ?? ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: options?.stderr ?? "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

function makeProvider(github: Partial<GitHubCli.GitHubCli["Service"]>) {
  return GitHubSourceControlProvider.make.pipe(
    Effect.provide(Layer.mock(GitHubCli.GitHubCli)(github)),
  );
}

it.effect("binds repository lookup to the explicit GitHub endpoint", () =>
  Effect.gen(function* () {
    let received: Parameters<GitHubCli.GitHubCli["Service"]["getRepositoryCloneUrls"]>[0] | null =
      null;
    const provider = yield* makeProvider({
      getRepositoryCloneUrls: (input) => {
        received = input;
        return Effect.succeed({
          nameWithOwner: "owner/repo",
          url: "https://github.example.test/owner/repo",
          sshUrl: "git@github.example.test:owner/repo.git",
        });
      },
    });

    yield* provider.getRepositoryCloneUrls({
      cwd: "/repo",
      providerBaseUrl: "https://github.example.test",
      repository: "owner/repo",
    });

    assert.deepStrictEqual(received, {
      cwd: "/repo",
      host: "github.example.test",
      repository: "owner/repo",
    });
  }),
);

it.effect("uses the enterprise quota for a current-repository default branch read", () =>
  Effect.gen(function* () {
    // github.com is out of quota; the enterprise read must not be priced against it.
    const budget = yield* GitHubGraphQlBudget.GitHubGraphQlBudget;
    yield* budget.observe(
      "github.com",
      '{"data":{"rateLimit":{"cost":1,"limit":5000,"remaining":0,"resetAt":"2099-01-01T00:00:00Z"}}}',
    );
    const provider = yield* GitHubSourceControlProvider.make;
    const branch = yield* provider.getDefaultBranch({
      cwd: "/enterprise-repo",
      context: {
        provider: { kind: "github", name: "GitHub Enterprise", baseUrl: "https://enterprise.test" },
        remoteName: "origin",
        remoteUrl: "https://enterprise.test/acme/web.git",
      },
    });
    assert.strictEqual(branch, "main");
  }).pipe(
    Effect.provide(GitHubCli.layer),
    Effect.provideService(VcsProcess.VcsProcess, {
      run: () => Effect.succeed(processResult("main")),
    }),
  ),
);

it.effect("maps GitHub PR summaries into provider-neutral change requests", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      getPullRequest: () =>
        Effect.succeed({
          number: 42,
          title: "Add GitHub provider",
          url: "https://github.com/pingdotgg/t3code/pull/42",
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
      context: ORIGIN_CONTEXT,
      reference: "42",
    });

    assert.deepStrictEqual(changeRequest, {
      provider: "github",
      number: 42,
      title: "Add GitHub provider",
      url: "https://github.com/pingdotgg/t3code/pull/42",
      baseRefName: "main",
      headRefName: "feature/source-control",
      state: "open",
      closedAt: null,
      mergedAt: null,
      updatedAt: Option.none(),
      isCrossRepository: true,
      headRepositoryNameWithOwner: "fork/t3code",
      headRepositoryOwnerLogin: "fork",
    });
  }),
);

it.effect("adds safe request context while retaining GitHub CLI causes", () =>
  Effect.gen(function* () {
    const cause = new GitHubCli.GitHubPullRequestNotFoundError({
      command: "gh",
      cwd: "/repo",
      cause: new Error("raw upstream detail that should remain in the cause"),
    });
    const provider = yield* makeProvider({
      getPullRequest: () => Effect.fail(cause),
    });

    const error = yield* provider
      .getChangeRequest({
        cwd: "/repo",
        context: ORIGIN_CONTEXT,
        reference: "https://user:secret@github.com/pingdotgg/t3code/pull/42?token=secret#diff",
      })
      .pipe(Effect.flip);

    assert.deepStrictEqual(
      {
        provider: error.provider,
        operation: error.operation,
        command: error.command,
        cwd: error.cwd,
        reference: error.reference,
        detail: error.detail,
      },
      {
        provider: "github",
        operation: "getChangeRequest",
        command: "gh",
        cwd: "/repo",
        reference: "https://github.com/pingdotgg/t3code/pull/42",
        detail: "Pull request not found. Check the PR number or URL and try again.",
      },
    );
    assert.strictEqual(error.cause, cause);
    assert.equal(error.message.includes("raw upstream detail"), false);
  }),
);

it.effect("lists change request history through the batched head lookup", () =>
  Effect.gen(function* () {
    let lookup: Parameters<GitHubCli.GitHubCli["Service"]["listPullRequestsByHead"]>[0] | null =
      null;
    const provider = yield* makeProvider({
      listPullRequestsByHead: (input) => {
        lookup = input;
        return Effect.succeed([
          {
            number: 7,
            title: "Merged work",
            url: "https://enterprise.test/acme/web/pull/7",
            baseRefName: "main",
            headRefName: "feature/merged",
            state: "merged",
            mergedAt: "2026-01-01T00:00:00Z",
            updatedAt: Option.some(DateTime.makeUnsafe("2026-01-02T00:00:00.000Z")),
          },
        ]);
      },
    });

    const changeRequests = yield* provider.listChangeRequests({
      cwd: "/repo",
      context: {
        provider: { kind: "github", name: "GitHub Enterprise", baseUrl: "https://enterprise.test" },
        remoteName: "origin",
        remoteUrl: "https://enterprise.test/acme/web.git",
      },
      headSelector: "feature/merged",
      state: "all",
      limit: 10,
    });

    assert.deepStrictEqual(lookup, {
      cwd: "/repo",
      repository: "enterprise.test/acme/web",
      headSelector: "feature/merged",
      state: "all",
      limit: 10,
      rateLimitHost: "enterprise.test",
    });
    assert.strictEqual(changeRequests[0]?.provider, "github");
    assert.strictEqual(changeRequests[0]?.state, "merged");
    assert.strictEqual(changeRequests[0]?.mergedAt, "2026-01-01T00:00:00Z");
    assert.deepStrictEqual(
      changeRequests[0]?.updatedAt,
      Option.some(DateTime.makeUnsafe("2026-01-02T00:00:00.000Z")),
    );
  }),
);

it.effect("creates GitHub PRs through provider-neutral input names", () =>
  Effect.gen(function* () {
    let createInput: Parameters<GitHubCli.GitHubCli["Service"]["createPullRequest"]>[0] | null =
      null;
    const provider = yield* makeProvider({
      createPullRequest: (input) => {
        createInput = input;
        return Effect.void;
      },
    });

    yield* provider.createChangeRequest({
      cwd: "/repo",
      context: ORIGIN_CONTEXT,
      baseRefName: "main",
      headSelector: "owner:feature/provider",
      title: "Provider PR",
      bodyFile: "/tmp/body.md",
    });

    assert.deepStrictEqual(createInput, {
      cwd: "/repo",
      repository: "github.com/pingdotgg/t3code",
      baseBranch: "main",
      headSelector: "owner:feature/provider",
      title: "Provider PR",
      bodyFile: "/tmp/body.md",
    });
  }),
);

it.effect("preserves a non-default GitHub port in explicit repository selectors", () =>
  Effect.gen(function* () {
    let repository: string | null = null;
    const provider = yield* makeProvider({
      createPullRequest: (input) => {
        repository = input.repository;
        return Effect.void;
      },
    });

    yield* provider.createChangeRequest({
      cwd: "/repo",
      context: {
        provider: {
          kind: "github",
          name: "GitHub Self-Hosted",
          baseUrl: "https://github.example.test:8443",
        },
        remoteName: "origin",
        remoteUrl: "https://github.example.test:8443/acme/project.git",
      },
      baseRefName: "main",
      headSelector: "feature/port",
      title: "Port-aware PR",
      bodyFile: "/tmp/body.md",
    });

    assert.strictEqual(repository, "github.example.test:8443/acme/project");
  }),
);

it("accepts active authenticated GitHub accounts when another account fails", () => {
  const auth = GitHubSourceControlProvider.discovery.parseAuth(
    processResult(
      JSON.stringify({
        hosts: {
          "github.com": [
            {
              state: "success",
              active: true,
              host: "github.com",
              login: "active-user",
              tokenSource: "keyring",
              gitProtocol: "ssh",
            },
            {
              state: "error",
              active: false,
              host: "github.com",
              login: "stale-user",
              tokenSource: "keyring",
              gitProtocol: "ssh",
              error: "The token in keyring is invalid.",
            },
          ],
        },
      }),
    ),
  );

  assert.deepStrictEqual(
    {
      status: auth.status,
      account: auth.account,
      host: auth.host,
    },
    {
      status: "authenticated",
      account: Option.some("active-user"),
      host: Option.some("github.com"),
    },
  );
});

it("parses GitHub auth JSON from stdout when stderr has warnings", () => {
  const auth = GitHubSourceControlProvider.discovery.parseAuth(
    processResult(
      JSON.stringify({
        hosts: {
          "github.com": [
            {
              state: "success",
              active: true,
              host: "github.com",
              login: "active-user",
              tokenSource: "keyring",
              gitProtocol: "ssh",
            },
          ],
        },
      }),
      { stderr: "warning: ignored diagnostic from gh\n" },
    ),
  );

  assert.deepStrictEqual(
    {
      status: auth.status,
      account: auth.account,
      host: auth.host,
    },
    {
      status: "authenticated",
      account: Option.some("active-user"),
      host: Option.some("github.com"),
    },
  );
});

it("parses GitHub auth status accounts by host and active state", () => {
  assert.deepStrictEqual(
    parseGitHubAuthStatus(
      JSON.stringify({
        hosts: {
          "github.com": [
            {
              state: "success",
              active: true,
              host: "github.com",
              login: "active-user",
              tokenSource: "keyring",
              gitProtocol: "ssh",
            },
            {
              state: "error",
              active: false,
              host: "github.com",
              login: "stale-user",
              tokenSource: "keyring",
              gitProtocol: "ssh",
            },
          ],
          "github.example.test": [
            {
              state: "success",
              active: false,
              host: "github.example.test",
              login: "enterprise-user",
              tokenSource: "keyring",
              gitProtocol: "ssh",
            },
          ],
        },
      }),
    ).accounts,
    [
      {
        host: "github.com",
        account: "active-user",
        authenticated: true,
        active: true,
        error: null,
      },
      {
        host: "github.com",
        account: "stale-user",
        authenticated: false,
        active: false,
        error: null,
      },
      {
        host: "github.example.test",
        account: "enterprise-user",
        authenticated: true,
        active: false,
        error: null,
      },
    ],
  );
});

it("reports unauthenticated when GitHub JSON has accounts but none are valid", () => {
  const auth = GitHubSourceControlProvider.discovery.parseAuth(
    processResult(
      JSON.stringify({
        hosts: {
          "github.com": [
            {
              state: "error",
              active: true,
              host: "github.com",
              login: "stale-user",
              tokenSource: "keyring",
              gitProtocol: "ssh",
              error: "The token in keyring is invalid.",
            },
          ],
        },
      }),
    ),
  );

  assert.deepStrictEqual(
    {
      status: auth.status,
      host: auth.host,
      detail: auth.detail,
    },
    {
      status: "unauthenticated",
      host: Option.some("github.com"),
      detail: Option.some("The token in keyring is invalid."),
    },
  );
});

it("reports an update hint instead of unauthenticated when gh predates --json", () => {
  const auth = GitHubSourceControlProvider.discovery.parseAuth(
    processResult("", {
      stderr: "unknown flag: --json\n\nUsage:  gh auth status [flags]\n",
      exitCode: ChildProcessSpawner.ExitCode(1),
    }),
  );

  assert.strictEqual(auth.status, "unknown");
  assert.match(
    Option.getOrElse(auth.detail, () => ""),
    /2\.81\.0/,
  );
});

for (const kind of ["pull", "issues"]) {
  it.effect(`resolves ${kind} subjects on the linked host without using the checkout`, () =>
    Effect.gen(function* () {
      const provider = yield* makeProvider({
        execute: (input) => {
          assert.deepStrictEqual(input.args, [
            "api",
            "--hostname",
            "github.com",
            "repos/owner/repo/issues/42",
            "--jq",
            "{title, body}",
          ]);
          assert.strictEqual(input.maxOutputBytes, 32_000);
          assert.strictEqual(input.timeoutMs, 3_000);
          return Effect.succeed({
            exitCode: ChildProcessSpawner.ExitCode(0),
            stdout: JSON.stringify({ title: "Pairing expiry", body: "Preserve remote access" }),
            stderr: "",
            stdoutTruncated: false,
            stderrTruncated: false,
          });
        },
      });
      const lookup = provider.resolveLink?.({
        cwd: "/unrelated",
        url: new URL(`https://github.com/owner/repo/${kind}/42`),
      });
      assert.ok(lookup);
      assert.deepStrictEqual(yield* lookup, {
        title: "Pairing expiry",
        body: "Preserve remote access",
      });
      assert.strictEqual(
        provider.resolveLink?.({
          cwd: "/unrelated",
          url: new URL("https://github.com/owner/repo"),
        }),
        undefined,
      );
    }),
  );
}

for (const stage of ["read", "decode"] as const) {
  it.effect(`retains the ${stage} failure without exposing its raw contents`, () =>
    Effect.gen(function* () {
      const cause = new GitHubCli.GitHubCliCommandError({
        command: "gh",
        cwd: "/repo",
        cause: new Error("private response text"),
      });
      const provider = yield* makeProvider({
        execute: () =>
          stage === "read"
            ? Effect.fail(cause)
            : Effect.succeed({
                exitCode: ChildProcessSpawner.ExitCode(0),
                stdout: "private response text",
                stderr: "",
                stdoutTruncated: false,
                stderrTruncated: false,
              }),
      });
      const lookup = provider.resolveLink?.({
        cwd: "/repo",
        url: new URL("https://github.com/owner/repo/issues/42"),
      });
      assert.ok(lookup);
      const error = yield* Effect.flip(lookup);
      assert.strictEqual(error.operation, stage === "read" ? "resolveLink" : "resolveLink.decode");
      assert.strictEqual(error.detail, "The linked subject could not be read.");
      assert.notInclude(error.message, "private response text");
      if (stage === "read") assert.strictEqual(error.cause, cause);
      else assert.propertyVal(error.cause, "_tag", "SchemaError");
    }),
  );
}

it.effect("refuses historical head lookup without an origin context", () =>
  Effect.gen(function* () {
    let reads = 0;
    const provider = yield* makeProvider({
      listPullRequestsByHead: () =>
        Effect.sync(() => {
          reads++;
          return [];
        }),
    });
    const failure = yield* provider
      .listChangeRequests({ cwd: "/repo", headSelector: "feature/a", state: "all" })
      .pipe(Effect.flip);
    assert.strictEqual(failure._tag, "SourceControlProviderError");
    assert.strictEqual(reads, 0);
  }),
);
