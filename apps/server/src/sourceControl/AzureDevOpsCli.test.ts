import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect, vi } from "vitest";

import { VcsProcessSpawnError } from "@t3tools/contracts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { make } from "./AzureDevOpsCli.ts";

function vcsOutput(stdout: string): VcsProcess.VcsProcessOutput {
  return {
    exitCode: 0 as VcsProcess.VcsProcessOutput["exitCode"],
    stdout,
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

function makeCli(run: VcsProcess.VcsProcessShape["run"]) {
  return make().pipe(
    Effect.provideService(VcsProcess.VcsProcess, {
      run,
      withProcess: () => Effect.die("not implemented in test"),
    }),
  );
}

it.effect("lists pull requests with source branch, status, and JSON output flags", () =>
  Effect.gen(function* () {
    const run = vi.fn(() =>
      Effect.succeed(
        vcsOutput(
          JSON.stringify([
            {
              pullRequestId: 12,
              title: "Ship Azure",
              sourceRefName: "refs/heads/feature/azure",
              targetRefName: "refs/heads/main",
              status: "completed",
              creationDate: "2026-05-01T12:00:00Z",
              _links: {
                web: { href: "https://dev.azure.com/org/project/_git/repo/pullrequest/12" },
              },
            },
          ]),
        ),
      ),
    );
    const cli = yield* makeCli(run);

    const result = yield* cli.listPullRequests({
      cwd: "/repo",
      headSelector: "owner:feature/azure",
      state: "merged",
      limit: 4,
    });

    expect(run).toHaveBeenCalledWith({
      operation: "AzureDevOpsCli.execute",
      command: "az",
      args: [
        "repos",
        "pr",
        "list",
        "--detect",
        "true",
        "--source-branch",
        "feature/azure",
        "--status",
        "completed",
        "--top",
        "4",
        "--only-show-errors",
        "--output",
        "json",
      ],
      cwd: "/repo",
      timeoutMs: 30_000,
    });
    assert.equal(result[0]?.number, 12);
    assert.equal(result[0]?.state, "merged");
    assert.equal(result[0]?.baseRefName, "main");
  }),
);

it.effect("creates repositories in a parsed project", () =>
  Effect.gen(function* () {
    const run = vi.fn<VcsProcess.VcsProcessShape["run"]>(() =>
      Effect.succeed(
        vcsOutput(
          JSON.stringify({
            name: "repo",
            webUrl: "https://dev.azure.com/org/project/_git/repo",
            remoteUrl: "https://dev.azure.com/org/project/_git/repo",
            sshUrl: "git@ssh.dev.azure.com:v3/org/project/repo",
            project: { name: "project" },
          }),
        ),
      ),
    );
    const cli = yield* makeCli(run);

    const result = yield* cli.createRepository({
      cwd: "/repo",
      repository: "project/repo",
      visibility: "public",
    });

    assert.equal(result.nameWithOwner, "project/repo");
    expect(run.mock.calls[0]?.[0].args).toEqual([
      "repos",
      "create",
      "--detect",
      "true",
      "--name",
      "repo",
      "--project",
      "project",
      "--only-show-errors",
      "--output",
      "json",
    ]);
  }),
);

it.effect("normalizes missing CLI errors", () =>
  Effect.gen(function* () {
    const cli = yield* makeCli(() =>
      Effect.fail(
        new VcsProcessSpawnError({
          operation: "test",
          command: "az",
          cwd: "/repo",
          cause: new Error("command not found: az"),
        }),
      ),
    );

    const error = yield* cli
      .getRepositoryCloneUrls({ cwd: "/repo", repository: "project/repo" })
      .pipe(Effect.flip);

    assert.equal(
      error.detail,
      "Azure CLI `az` with the Azure DevOps extension is required on PATH.",
    );
  }),
);
