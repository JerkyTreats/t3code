import { assert, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { expect, vi } from "vitest";

import { VcsProcessSpawnError } from "@t3tools/contracts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { GitLabCliError, make } from "./GitLabCli.ts";

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

it.effect("lists merge requests with normalized source branch and state args", () =>
  Effect.gen(function* () {
    const run = vi.fn(() =>
      Effect.succeed(
        vcsOutput(
          JSON.stringify([
            {
              iid: 7,
              title: "Ship GitLab",
              web_url: "https://gitlab.com/group/project/-/merge_requests/7",
              source_branch: "feature/source",
              target_branch: "main",
              state: "merged",
              updated_at: "2026-05-01T12:00:00Z",
              source_project_id: 1,
              target_project_id: 2,
              source_project: { path_with_namespace: "fork/project" },
              target_project: { path_with_namespace: "group/project" },
            },
          ]),
        ),
      ),
    );
    const cli = yield* makeCli(run);

    const result = yield* cli.listMergeRequests({
      cwd: "/repo",
      headSelector: "owner:feature/source",
      state: "merged",
      limit: 3,
    });

    expect(run).toHaveBeenCalledWith({
      operation: "GitLabCli.execute",
      command: "glab",
      args: [
        "mr",
        "list",
        "--source-branch",
        "feature/source",
        "--merged",
        "--per-page",
        "3",
        "--output",
        "json",
      ],
      cwd: "/repo",
      timeoutMs: 30_000,
    });
    assert.equal(result[0]?.number, 7);
    assert.equal(result[0]?.state, "merged");
    assert.equal(result[0]?.isCrossRepository, true);
    assert.equal(result[0]?.headRepositoryOwnerLogin, "fork");
  }),
);

it.effect("creates repositories with namespace lookup and visibility", () =>
  Effect.gen(function* () {
    const run = vi
      .fn<VcsProcess.VcsProcessShape["run"]>()
      .mockImplementationOnce(() => Effect.succeed(vcsOutput(JSON.stringify({ id: 99 }))))
      .mockImplementationOnce(() =>
        Effect.succeed(
          vcsOutput(
            JSON.stringify({
              path_with_namespace: "group/project",
              web_url: "https://gitlab.com/group/project",
              http_url_to_repo: "https://gitlab.com/group/project.git",
              ssh_url_to_repo: "git@gitlab.com:group/project.git",
            }),
          ),
        ),
      );
    const cli = yield* makeCli(run);

    const result = yield* cli.createRepository({
      cwd: "/repo",
      repository: "group/project",
      visibility: "private",
    });

    assert.equal(result.nameWithOwner, "group/project");
    assert.equal(result.sshUrl, "git@gitlab.com:group/project.git");
    expect(run.mock.calls[0]?.[0].args).toEqual(["api", "namespaces/group"]);
    expect(run.mock.calls[1]?.[0].args).toEqual([
      "api",
      "--method",
      "POST",
      "projects",
      "--raw-field",
      "path=project",
      "--raw-field",
      "name=project",
      "--raw-field",
      "visibility=private",
      "--raw-field",
      "namespace_id=99",
    ]);
  }),
);

it.effect("normalizes missing CLI errors", () =>
  Effect.gen(function* () {
    const cli = yield* makeCli(() =>
      Effect.fail(
        new VcsProcessSpawnError({
          operation: "test",
          command: "glab",
          cwd: "/repo",
          cause: new Error("Command not found: glab"),
        }),
      ),
    );

    const error = yield* cli
      .getRepositoryCloneUrls({ cwd: "/repo", repository: "group/project" })
      .pipe(Effect.flip);

    assert.equal(Schema.is(GitLabCliError)(error), true);
    assert.equal(error.detail, "GitLab CLI `glab` is required but not available on PATH.");
  }),
);
