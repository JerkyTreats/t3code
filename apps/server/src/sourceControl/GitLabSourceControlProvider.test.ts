import { assert, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { expect, vi } from "vitest";

import { GitLabCli, GitLabCliError, type GitLabCliShape } from "./GitLabCli.ts";
import { make } from "./GitLabSourceControlProvider.ts";

function makeGitLabCli(overrides?: Partial<GitLabCliShape>): GitLabCliShape {
  return {
    execute: () => Effect.die("not implemented in test"),
    listMergeRequests: () => Effect.succeed([]),
    getMergeRequest: () => Effect.die("not implemented in test"),
    getRepositoryCloneUrls: () => Effect.die("not implemented in test"),
    createRepository: () => Effect.die("not implemented in test"),
    createMergeRequest: () => Effect.void,
    getDefaultBranch: () => Effect.succeed("main"),
    checkoutMergeRequest: () => Effect.void,
    ...overrides,
  };
}

it.effect("maps merge requests to change requests", () =>
  Effect.gen(function* () {
    const listMergeRequests = vi.fn(() =>
      Effect.succeed([
        {
          number: 9,
          title: "Provider MR",
          url: "https://gitlab.com/group/project/-/merge_requests/9",
          baseRefName: "main",
          headRefName: "feature/provider",
          state: "open" as const,
          updatedAt: Option.none(),
          isCrossRepository: false,
          headRepositoryNameWithOwner: "group/project",
          headRepositoryOwnerLogin: "group",
        },
      ]),
    );
    const provider = yield* make().pipe(
      Effect.provideService(GitLabCli, makeGitLabCli({ listMergeRequests })),
    );

    const result = yield* provider.listChangeRequests({
      cwd: "/repo",
      headSelector: "group:feature/provider",
      state: "open",
      limit: 5,
    });

    expect(listMergeRequests).toHaveBeenCalledWith({
      cwd: "/repo",
      headSelector: "group:feature/provider",
      source: { owner: "group", refName: "feature/provider" },
      state: "open",
      limit: 5,
    });
    assert.equal(result[0]?.provider, "gitlab");
    assert.equal(result[0]?.number, 9);
    assert.equal(result[0]?.headRepositoryOwnerLogin, "group");
  }),
);

it.effect("maps CLI errors to provider errors", () =>
  Effect.gen(function* () {
    const provider = yield* make().pipe(
      Effect.provideService(
        GitLabCli,
        makeGitLabCli({
          getDefaultBranch: () =>
            Effect.fail(
              new GitLabCliError({
                operation: "getDefaultBranch",
                detail: "not authenticated",
              }),
            ),
        }),
      ),
    );

    const error = yield* provider.getDefaultBranch({ cwd: "/repo" }).pipe(Effect.flip);

    assert.equal(error.provider, "gitlab");
    assert.equal(error.operation, "getDefaultBranch");
    assert.equal(error.detail, "not authenticated");
  }),
);
