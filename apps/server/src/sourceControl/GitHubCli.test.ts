import { assert, it, afterEach, describe, expect, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import { ChildProcessSpawner } from "effect/unstable/process";
import { VcsProcessExitError, VcsProcessSpawnError } from "@t3tools/contracts";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubCli from "./GitHubCli.ts";

const processOutput = (stdout: string): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

const mockRun = vi.fn<VcsProcess.VcsProcess["Service"]["run"]>();

const layer = GitHubCli.layer.pipe(
  Layer.provide(
    Layer.mock(VcsProcess.VcsProcess)({
      run: mockRun,
    }),
  ),
);

afterEach(() => {
  mockRun.mockReset();
});

describe("GitHubCli.layer", () => {
  it.effect(
    "normalizes matching origin URLs before view and checkout while retaining branch selectors",
    () =>
      Effect.gen(function* () {
        const cli = yield* GitHubCli.GitHubCli;
        const referenceUrl = "https://github.example.test:8443/acme/web/pull/42";
        for (const reference of [
          referenceUrl,
          "42",
          "feature/origin-branch",
          "owner:feature/origin-branch",
        ]) {
          mockRun.mockReturnValueOnce(
            Effect.succeed(
              processOutput(
                // @effect-diagnostics-next-line preferSchemaOverJson:off
                JSON.stringify({
                  number: 42,
                  title: "Origin PR",
                  url: referenceUrl,
                  baseRefName: "main",
                  headRefName: "feature/origin-branch",
                  state: "OPEN",
                  isDraft: true,
                  mergedAt: null,
                }),
              ),
            ),
          );
          const result = yield* cli.getPullRequest({
            cwd: "/repo",
            repository: "github.example.test:8443/acme/web",
            reference,
          });
          assert.equal(result.number, 42);
          assert.equal(result.url, referenceUrl);
          mockRun.mockReturnValueOnce(Effect.succeed(processOutput("")));
          yield* cli.checkoutPullRequest({
            cwd: "/repo",
            repository: "github.example.test:8443/acme/web",
            reference,
          });
        }
        const commands = mockRun.mock.calls.map(([input]) => input.args);
        assert.deepStrictEqual(
          commands.map((args) => args.slice(0, 5)),
          [
            ["pr", "view", "42", "--repo", "github.example.test:8443/acme/web"],
            ["pr", "checkout", "42", "--repo", "github.example.test:8443/acme/web"],
            ["pr", "view", "42", "--repo", "github.example.test:8443/acme/web"],
            ["pr", "checkout", "42", "--repo", "github.example.test:8443/acme/web"],
            ["pr", "view", "feature/origin-branch", "--repo", "github.example.test:8443/acme/web"],
            [
              "pr",
              "checkout",
              "feature/origin-branch",
              "--repo",
              "github.example.test:8443/acme/web",
            ],
            [
              "pr",
              "view",
              "owner:feature/origin-branch",
              "--repo",
              "github.example.test:8443/acme/web",
            ],
            [
              "pr",
              "checkout",
              "owner:feature/origin-branch",
              "--repo",
              "github.example.test:8443/acme/web",
            ],
          ],
        );
      }).pipe(Effect.provide(layer)),
  );

  it.effect("rejects foreign URL targets before view or checkout executes the CLI", () =>
    Effect.gen(function* () {
      const cli = yield* GitHubCli.GitHubCli;
      for (const reference of [
        "https://github.example.test:8443/foreign/web/pull/42",
        "https://foreign.example.test:8443/acme/web/pull/42",
        "https://github.example.test:9443/acme/web/pull/42",
        "https://github.example.test/acme/web/pull/42",
        "https://[invalid",
      ]) {
        for (const action of [cli.getPullRequest, cli.checkoutPullRequest]) {
          const error = yield* action({
            cwd: "/repo",
            repository: "github.example.test:8443/acme/web",
            reference,
          }).pipe(Effect.flip);
          assert.equal(error._tag, "GitHubCliCommandError");
        }
      }
      expect(mockRun).not.toHaveBeenCalled();
    }).pipe(Effect.provide(layer)),
  );

  it("does not classify a missing cwd as an unavailable gh executable", () => {
    const context = { command: "gh", cwd: "/repo" } as const;
    const missingCwd = new VcsProcessSpawnError({
      operation: "GitHubCli.execute",
      command: "gh",
      cwd: context.cwd,
      cause: PlatformError.systemError({
        _tag: "NotFound",
        module: "FileSystem",
        method: "access",
        pathOrDescriptor: context.cwd,
      }),
    });

    const commandFailure = GitHubCli.fromVcsError(context, missingCwd);

    assert.equal(commandFailure._tag, "GitHubCliCommandError");
    assert.strictEqual(commandFailure.cause, missingCwd);
    assert.notProperty(commandFailure, "operation");
  });

  it.effect("parses pull request view output", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify({
              number: 42,
              title: "Add PR thread creation",
              url: "https://github.com/pingdotgg/codething-mvp/pull/42",
              baseRefName: "main",
              headRefName: "feature/pr-threads",
              state: "OPEN",
              isDraft: true,
              mergedAt: null,
              updatedAt: "2026-08-24T12:34:56Z",
              isCrossRepository: true,
              headRepository: {
                nameWithOwner: "octocat/codething-mvp",
              },
              headRepositoryOwner: {
                login: "octocat",
              },
            }),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.getPullRequest({
        cwd: "/repo",
        repository: "pingdotgg/codething-mvp",
        reference: "#42",
      });

      assert.deepStrictEqual(result, {
        number: 42,
        title: "Add PR thread creation",
        url: "https://github.com/pingdotgg/codething-mvp/pull/42",
        baseRefName: "main",
        headRefName: "feature/pr-threads",
        state: "open",
        isDraft: true,
        updatedAt: "2026-08-24T12:34:56.000Z",
        isCrossRepository: true,
        headRepositoryNameWithOwner: "octocat/codething-mvp",
        headRepositoryOwnerLogin: "octocat",
      });
      expect(mockRun).toHaveBeenCalledWith({
        operation: "GitHubCli.execute",
        command: "gh",
        args: [
          "pr",
          "view",
          "#42",
          "--repo",
          "pingdotgg/codething-mvp",
          "--json",
          "number,title,url,baseRefName,headRefName,state,isDraft,mergedAt,updatedAt,isCrossRepository,headRepository,headRepositoryOwner",
        ],
        cwd: "/repo",
        timeoutMs: 30_000,
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("trims pull request fields decoded from gh json", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify({
              number: 42,
              title: "  Add PR thread creation  \n",
              url: " https://github.com/pingdotgg/codething-mvp/pull/42 ",
              baseRefName: " main ",
              headRefName: "\tfeature/pr-threads\t",
              state: "OPEN",
              mergedAt: null,
              isCrossRepository: true,
              headRepository: {
                nameWithOwner: " octocat/codething-mvp ",
              },
              headRepositoryOwner: {
                login: " octocat ",
              },
            }),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.getPullRequest({
        cwd: "/repo",
        repository: "pingdotgg/codething-mvp",
        reference: "#42",
      });

      assert.deepStrictEqual(result, {
        number: 42,
        title: "Add PR thread creation",
        url: "https://github.com/pingdotgg/codething-mvp/pull/42",
        baseRefName: "main",
        headRefName: "feature/pr-threads",
        state: "open",
        isCrossRepository: true,
        headRepositoryNameWithOwner: "octocat/codething-mvp",
        headRepositoryOwnerLogin: "octocat",
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("skips invalid entries when parsing pr lists", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify([
              {
                number: 0,
                title: "invalid",
                url: "https://github.com/pingdotgg/codething-mvp/pull/0",
                baseRefName: "main",
                headRefName: "feature/invalid",
              },
              {
                number: 43,
                title: "  Valid PR  ",
                url: " https://github.com/pingdotgg/codething-mvp/pull/43 ",
                baseRefName: " main ",
                headRefName: " feature/pr-list ",
                headRepository: {
                  nameWithOwner: "   ",
                },
                headRepositoryOwner: {
                  login: "   ",
                },
              },
            ]),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.listOpenPullRequests({
        cwd: "/repo",
        repository: "pingdotgg/codething-mvp",
        headSelector: "feature/pr-list",
      });

      assert.deepStrictEqual(result, [
        {
          number: 43,
          title: "Valid PR",
          url: "https://github.com/pingdotgg/codething-mvp/pull/43",
          baseRefName: "main",
          headRefName: "feature/pr-list",
          state: "open",
        },
      ]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("keeps pull requests from gh versions without headRepository.nameWithOwner", () =>
    // gh < 2.47 (e.g. Ubuntu-packaged 2.46) exports headRepository as
    // {id, name} only. These entries must decode instead of being dropped,
    // with nameWithOwner rebuilt from the owner login.
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify([
              {
                number: 2829,
                title: "Codex turn mapping",
                url: "https://github.com/pingdotgg/codething-mvp/pull/2829",
                baseRefName: "main",
                headRefName: "t3code/codex-turn-mapping",
                state: "OPEN",
                mergedAt: null,
                isCrossRepository: false,
                headRepository: {
                  id: "R_kgDORLtfbQ",
                  name: "codething-mvp",
                },
                headRepositoryOwner: {
                  id: "MDEyOk9yZ2FuaXphdGlvbjg5MTkxNzI3",
                  login: "pingdotgg",
                },
              },
            ]),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.listOpenPullRequests({
        cwd: "/repo",
        repository: "pingdotgg/codething-mvp",
        headSelector: "t3code/codex-turn-mapping",
      });

      assert.deepStrictEqual(result, [
        {
          number: 2829,
          title: "Codex turn mapping",
          url: "https://github.com/pingdotgg/codething-mvp/pull/2829",
          baseRefName: "main",
          headRefName: "t3code/codex-turn-mapping",
          state: "open",
          isCrossRepository: false,
          headRepositoryNameWithOwner: "pingdotgg/codething-mvp",
          headRepositoryOwnerLogin: "pingdotgg",
        },
      ]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("reads repository clone URLs", () =>
    Effect.gen(function* () {
      mockRun.mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            // @effect-diagnostics-next-line preferSchemaOverJson:off
            JSON.stringify({
              nameWithOwner: "octocat/codething-mvp",
              url: "https://github.com/octocat/codething-mvp",
              sshUrl: "git@github.com:octocat/codething-mvp.git",
            }),
          ),
        ),
      );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.getRepositoryCloneUrls({
        cwd: "/repo",
        host: "github.example.test",
        repository: "octocat/codething-mvp",
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codething-mvp",
        url: "https://github.com/octocat/codething-mvp",
        sshUrl: "git@github.com:octocat/codething-mvp.git",
      });
      expect(mockRun).toHaveBeenCalledWith({
        operation: "GitHubCli.execute",
        command: "gh",
        args: [
          "api",
          "--hostname",
          "github.example.test",
          "repos/octocat/codething-mvp",
          "--jq",
          "{nameWithOwner: .full_name, url: .html_url, sshUrl: .ssh_url}",
        ],
        cwd: "/repo",
        timeoutMs: 30_000,
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("creates private user repositories through the explicitly hosted API", () =>
    Effect.gen(function* () {
      mockRun
        .mockReturnValueOnce(Effect.succeed(processOutput("octocat\n")))
        .mockReturnValueOnce(
          Effect.succeed(
            processOutput(
              '{"nameWithOwner":"octocat/codething-mvp","url":"https://github.com/octocat/codething-mvp","sshUrl":"git@github.com:octocat/codething-mvp.git"}\n',
            ),
          ),
        );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.createRepository({
        cwd: "/repo",
        host: "github.com",
        repository: "octocat/codething-mvp",
        visibility: "private",
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "octocat/codething-mvp",
        url: "https://github.com/octocat/codething-mvp",
        sshUrl: "git@github.com:octocat/codething-mvp.git",
      });
      expect(mockRun).toHaveBeenCalledTimes(2);
      expect(mockRun).toHaveBeenNthCalledWith(1, {
        operation: "GitHubCli.execute",
        command: "gh",
        args: ["api", "--hostname", "github.com", "user", "--jq", ".login"],
        cwd: "/repo",
        timeoutMs: 30_000,
      });
      expect(mockRun).toHaveBeenNthCalledWith(2, {
        operation: "GitHubCli.execute",
        command: "gh",
        args: [
          "api",
          "--hostname",
          "github.com",
          "--method",
          "POST",
          "user/repos",
          "--raw-field",
          "name=codething-mvp",
          "--field",
          "private=true",
          "--jq",
          "{nameWithOwner: .full_name, url: .html_url, sshUrl: .ssh_url}",
        ],
        cwd: "/repo",
        timeoutMs: 30_000,
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("creates private organization repositories through an Enterprise host", () =>
    Effect.gen(function* () {
      mockRun
        .mockReturnValueOnce(Effect.succeed(processOutput("service-user\n")))
        .mockReturnValueOnce(
          Effect.succeed(
            processOutput(
              '{"nameWithOwner":"acme/codething-mvp","url":"https://github.acme.test/acme/codething-mvp","sshUrl":"git@github.acme.test:acme/codething-mvp.git"}\n',
            ),
          ),
        );

      const gh = yield* GitHubCli.GitHubCli;
      const result = yield* gh.createRepository({
        cwd: "/repo",
        host: "github.acme.test",
        repository: "acme/codething-mvp",
        visibility: "private",
      });

      assert.deepStrictEqual(result, {
        nameWithOwner: "acme/codething-mvp",
        url: "https://github.acme.test/acme/codething-mvp",
        sshUrl: "git@github.acme.test:acme/codething-mvp.git",
      });
      expect(mockRun).toHaveBeenCalledTimes(2);
      expect(mockRun).toHaveBeenNthCalledWith(1, {
        operation: "GitHubCli.execute",
        command: "gh",
        args: ["api", "--hostname", "github.acme.test", "user", "--jq", ".login"],
        cwd: "/repo",
        timeoutMs: 30_000,
      });
      expect(mockRun).toHaveBeenNthCalledWith(2, {
        operation: "GitHubCli.execute",
        command: "gh",
        args: [
          "api",
          "--hostname",
          "github.acme.test",
          "--method",
          "POST",
          "orgs/acme/repos",
          "--raw-field",
          "name=codething-mvp",
          "--raw-field",
          "visibility=private",
          "--jq",
          "{nameWithOwner: .full_name, url: .html_url, sshUrl: .ssh_url}",
        ],
        cwd: "/repo",
        timeoutMs: 30_000,
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("pins pull request mutations and repository reads to the explicit repository", () =>
    Effect.gen(function* () {
      mockRun
        .mockReturnValueOnce(Effect.succeed(processOutput("")))
        .mockReturnValueOnce(Effect.succeed(processOutput("main\n")))
        .mockReturnValueOnce(Effect.succeed(processOutput("")));

      const gh = yield* GitHubCli.GitHubCli;
      yield* gh.createPullRequest({
        cwd: "/repo",
        repository: "octocat/codething-mvp",
        baseBranch: "main",
        headSelector: "feature/exact-origin",
        title: "Exact origin",
        bodyFile: "/tmp/body.md",
      });
      assert.strictEqual(
        yield* gh.getDefaultBranch({
          cwd: "/repo",
          repository: "octocat/codething-mvp",
        }),
        "main",
      );
      yield* gh.checkoutPullRequest({
        cwd: "/repo",
        repository: "octocat/codething-mvp",
        reference: "42",
      });

      const calls = mockRun.mock.calls.map(([input]) => input.args);
      assert.deepStrictEqual(calls[0]?.slice(0, 4), [
        "pr",
        "create",
        "--repo",
        "octocat/codething-mvp",
      ]);
      assert.deepStrictEqual(calls[1]?.slice(0, 3), ["repo", "view", "octocat/codething-mvp"]);
      assert.deepStrictEqual(calls[2]?.slice(0, 5), [
        "pr",
        "checkout",
        "42",
        "--repo",
        "octocat/codething-mvp",
      ]);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("surfaces a friendly error when the pull request is not found", () =>
    Effect.gen(function* () {
      const cause = new VcsProcessExitError({
        operation: "GitHubCli.execute",
        command: "gh pr view",
        cwd: "/repo",
        exitCode: 1,
        failureKind: "not-found",
        detail:
          "GraphQL: Could not resolve to a PullRequest with the number of 4888. (repository.pullRequest)",
      });
      mockRun.mockReturnValueOnce(Effect.fail(cause));

      const gh = yield* GitHubCli.GitHubCli;
      const error = yield* gh
        .getPullRequest({
          cwd: "/repo",
          repository: "pingdotgg/codething-mvp",
          reference: "4888",
        })
        .pipe(Effect.flip);

      assert.equal(error.message.includes("Pull request not found"), true);
      assert.strictEqual(error._tag, "GitHubPullRequestNotFoundError");
      assert.strictEqual(error.command, "gh");
      assert.strictEqual(error.cwd, "/repo");
      assert.strictEqual(error.cause, cause);
      assert.equal(error.message.includes(cause.detail), false);
    }).pipe(Effect.provide(layer)),
  );

  it.effect("surfaces an actionable rate-limit error without exposing provider stderr", () =>
    Effect.gen(function* () {
      const cause = new VcsProcessExitError({
        operation: "GitHubCli.execute",
        command: "gh",
        cwd: "/repo",
        exitCode: 1,
        failureKind: "rate-limited",
        detail: "API rate limit exceeded.",
        stderrLength: 82,
        stderrTruncated: false,
      });
      mockRun.mockReturnValueOnce(Effect.fail(cause));

      const gh = yield* GitHubCli.GitHubCli;
      const error = yield* gh
        .listOpenPullRequests({
          cwd: "/repo",
          repository: "pingdotgg/codething-mvp",
          headSelector: "feature/rate-limited",
        })
        .pipe(Effect.flip);

      assert.strictEqual(error._tag, "GitHubCliRateLimitError");
      assert.include(error.detail, "GitHub API rate limit exceeded");
      assert.include(error.detail, "gh api rate_limit");
      assert.strictEqual(error.cause, cause);
      assert.notInclude(error.message, "user ID");
    }).pipe(Effect.provide(layer)),
  );
});
