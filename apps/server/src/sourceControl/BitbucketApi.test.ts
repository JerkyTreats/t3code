import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Option } from "effect";
import { HttpClient } from "effect/unstable/http";

import { GitCommandError } from "@t3tools/contracts";
import { GitCore, type GitCoreShape } from "../git/Services/GitCore.ts";
import { make } from "./BitbucketApi.ts";

function gitError(operation: string, cwd: string, detail: string) {
  return new GitCommandError({
    operation,
    command: "git",
    cwd,
    detail,
  });
}

function makeGitCore(overrides?: Partial<GitCoreShape>): GitCoreShape {
  return {
    execute: () =>
      Effect.succeed({
        code: 0,
        stdout: "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
      }),
    status: () => Effect.die("not implemented in test"),
    statusDetails: () => Effect.die("not implemented in test"),
    statusDetailsLocal: () => Effect.die("not implemented in test"),
    prepareCommitContext: () => Effect.die("not implemented in test"),
    commit: () => Effect.die("not implemented in test"),
    pushCurrentBranch: () => Effect.die("not implemented in test"),
    readRangeContext: () => Effect.die("not implemented in test"),
    readConfigValue: () => Effect.succeed(null),
    isInsideWorkTree: () => Effect.die("not implemented in test"),
    listWorkspaceFiles: () => Effect.die("not implemented in test"),
    filterIgnoredPaths: () => Effect.die("not implemented in test"),
    listBranches: () => Effect.die("not implemented in test"),
    pullCurrentBranch: () => Effect.die("not implemented in test"),
    createWorktree: () => Effect.die("not implemented in test"),
    fetchPullRequestBranch: () => Effect.die("not implemented in test"),
    ensureRemote: () => Effect.die("not implemented in test"),
    resolvePrimaryRemoteName: () => Effect.die("not implemented in test"),
    fetchRemoteBranch: () => Effect.die("not implemented in test"),
    setBranchUpstream: () => Effect.die("not implemented in test"),
    removeWorktree: () => Effect.die("not implemented in test"),
    renameBranch: () => Effect.die("not implemented in test"),
    createBranch: () => Effect.die("not implemented in test"),
    mergeBranches: () => Effect.die("not implemented in test"),
    abortMerge: () => Effect.die("not implemented in test"),
    checkoutBranch: () => Effect.die("not implemented in test"),
    initRepo: () => Effect.die("not implemented in test"),
    repositoryContext: () => Effect.die("not implemented in test"),
    listLocalBranchNames: () => Effect.die("not implemented in test"),
    ...overrides,
  };
}

const failingHttpClient = {
  execute: () => Effect.fail(new Error("offline")),
} as unknown as HttpClient.HttpClient;

const BitbucketApiTestLayer = Layer.empty.pipe(
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, failingHttpClient)),
);

it.layer(BitbucketApiTestLayer)("BitbucketApi", (it) => {
  it.effect("reports unauthenticated discovery when no credentials are configured", () =>
    Effect.gen(function* () {
      const api = yield* make().pipe(Effect.provideService(GitCore, makeGitCore()));

      const auth = yield* api.probeAuth;

      assert.equal(auth.status, "unauthenticated");
      assert.equal(
        Option.getOrNull(auth.detail),
        "Set T3CODE_BITBUCKET_EMAIL and T3CODE_BITBUCKET_API_TOKEN, or T3CODE_BITBUCKET_ACCESS_TOKEN.",
      );
    }),
  );

  it.effect("rejects repository creation without workspace and repository", () =>
    Effect.gen(function* () {
      const api = yield* make().pipe(Effect.provideService(GitCore, makeGitCore()));

      const error = yield* api
        .createRepository({
          cwd: "/repo",
          repository: "repo-only",
          visibility: "private",
        })
        .pipe(Effect.flip);

      assert.equal(error.operation, "createRepository");
      assert.equal(
        error.detail,
        "Bitbucket repositories must be specified as workspace/repository.",
      );
    }),
  );

  it.effect("resolves Bitbucket repositories from remotes before lookup", () =>
    Effect.gen(function* () {
      const api = yield* make().pipe(
        Effect.provideService(
          GitCore,
          makeGitCore({
            execute: () =>
              Effect.succeed({
                code: 0,
                stdout: "origin\tgit@bitbucket.org:workspace/repo.git (fetch)\n",
                stderr: "",
                stdoutTruncated: false,
                stderrTruncated: false,
              }),
          }),
        ),
      );

      const error = yield* api
        .getRepositoryCloneUrls({
          cwd: "/repo",
          repository: "",
        })
        .pipe(Effect.flip);

      assert.equal(error.operation, "getRepository");
    }),
  );
});
