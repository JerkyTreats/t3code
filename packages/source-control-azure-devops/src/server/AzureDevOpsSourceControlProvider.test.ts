import { SourceControlProviderKind } from "@t3tools/contracts";
import * as TestSourceControlHost from "@t3tools/source-control-testing/TestSourceControlHost";
import { processOutput } from "@t3tools/source-control-testing/TestSourceControlHost";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ChildProcessSpawner } from "effect/process";

import * as AzureDevOpsCli from "./AzureDevOpsCli.ts";
import * as AzureDevOpsSourceControlProvider from "./AzureDevOpsSourceControlProvider.ts";

const { parseAuth } = AzureDevOpsSourceControlProvider.discovery;

it("reads the signed-in Azure account and says when az is signed out", () => {
  assert.deepStrictEqual(parseAuth(processOutput("azure-user@example.com\n")), {
    status: "authenticated",
    account: Option.some("azure-user@example.com"),
    host: Option.some("dev.azure.com"),
    detail: Option.none(),
  });
  assert.strictEqual(
    parseAuth(
      processOutput("", {
        stderr: "Please run 'az login' to setup account.\n",
        exitCode: ChildProcessSpawner.ExitCode(1),
      }),
    ).status,
    "unauthenticated",
  );
  assert.strictEqual(parseAuth(processOutput("\n")).status, "unknown");
});

it.effect(
  "looks up a branch's pull requests a full page at a time, past forks' same-named branches",
  () =>
    Effect.gen(function* () {
      const provider = yield* AzureDevOpsSourceControlProvider.make;
      assert.deepStrictEqual(
        provider.headBranchProbe?.({
          headSelectors: ["octocat:feature", "feature"],
          state: "open",
        }),
        { headSelectors: ["feature"], limit: 100 },
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.mock(AzureDevOpsCli.AzureDevOpsCli)({}),
          TestSourceControlHost.layer(),
        ),
      ),
    ),
);

it.effect.each([
  [
    "creates a missing branch from the fetched head",
    [],
    ["fetchRemoteBranch:origin/feature/x->feature/x"],
  ],
  ["fetches without resetting an existing branch", ["feature/x"], ["fetchRemoteTrackingBranch"]],
] as const)("checks a pull request out with git and %s", ([, localBranches, fetches]) => {
  const calls: Array<string> = [];
  return Effect.gen(function* () {
    const provider = yield* AzureDevOpsSourceControlProvider.make;
    yield* provider.checkoutChangeRequest({
      cwd: "/repo",
      reference: "42",
      context: {
        provider: {
          kind: SourceControlProviderKind.make("azure-devops"),
          name: "Azure DevOps",
          baseUrl: "https://dev.azure.com",
        },
        // Fork F06: checkout binds to and fetches from literal origin.
        remoteName: "origin",
        remoteUrl: "https://dev.azure.com/acme/project/_git/repo",
      },
    });
    assert.deepStrictEqual(calls, [...fetches, "switchRef:feature/x"]);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.mock(AzureDevOpsCli.AzureDevOpsCli)({
          getPullRequest: () =>
            Effect.succeed({
              number: 42,
              title: "Change",
              url: "https://dev.azure.com/acme/project/_git/repo/pullrequest/42",
              baseRefName: "main",
              headRefName: "feature/x",
              state: "open",
              isCrossRepository: false,
              closedAt: null,
              mergedAt: null,
              updatedAt: Option.none(),
            }),
        }),
        TestSourceControlHost.layer({
          git: {
            listLocalBranchNames: () => Effect.succeed([...localBranches]),
            fetchRemoteBranch: (input) => {
              calls.push(
                `fetchRemoteBranch:${input.remoteName}/${input.remoteBranch}->${input.localBranch}`,
              );
              return Effect.void;
            },
            fetchRemoteTrackingBranch: () => {
              calls.push("fetchRemoteTrackingBranch");
              return Effect.void;
            },
            switchRef: (input) => {
              calls.push(`switchRef:${input.refName}`);
              return Effect.succeed({ refName: input.refName });
            },
          },
        }),
      ),
    ),
  );
});
