import { assert, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { expect, vi } from "vitest";

import { AzureDevOpsCli, AzureDevOpsCliError, type AzureDevOpsCliShape } from "./AzureDevOpsCli.ts";
import { make } from "./AzureDevOpsSourceControlProvider.ts";

function makeAzureCli(overrides?: Partial<AzureDevOpsCliShape>): AzureDevOpsCliShape {
  return {
    execute: () => Effect.die("not implemented in test"),
    listPullRequests: () => Effect.succeed([]),
    getPullRequest: () => Effect.die("not implemented in test"),
    getRepositoryCloneUrls: () => Effect.die("not implemented in test"),
    createRepository: () => Effect.die("not implemented in test"),
    createPullRequest: () => Effect.void,
    getDefaultBranch: () => Effect.succeed("main"),
    checkoutPullRequest: () => Effect.void,
    ...overrides,
  };
}

it.effect("maps pull requests to change requests", () =>
  Effect.gen(function* () {
    const listPullRequests = vi.fn(() =>
      Effect.succeed([
        {
          number: 44,
          title: "Provider PR",
          url: "https://dev.azure.com/org/project/_git/repo/pullrequest/44",
          baseRefName: "main",
          headRefName: "feature/provider",
          state: "open" as const,
          updatedAt: Option.none(),
        },
      ]),
    );
    const provider = yield* make().pipe(
      Effect.provideService(AzureDevOpsCli, makeAzureCli({ listPullRequests })),
    );

    const result = yield* provider.listChangeRequests({
      cwd: "/repo",
      headSelector: "owner:feature/provider",
      state: "open",
      limit: 5,
    });

    expect(listPullRequests).toHaveBeenCalledWith({
      cwd: "/repo",
      headSelector: "owner:feature/provider",
      source: { owner: "owner", refName: "feature/provider" },
      state: "open",
      limit: 5,
    });
    assert.equal(result[0]?.provider, "azure-devops");
    assert.equal(result[0]?.number, 44);
    assert.equal(result[0]?.isCrossRepository, false);
  }),
);

it.effect("passes resolved remote names to checkout", () =>
  Effect.gen(function* () {
    const checkoutPullRequest = vi.fn(() => Effect.void);
    const provider = yield* make().pipe(
      Effect.provideService(AzureDevOpsCli, makeAzureCli({ checkoutPullRequest })),
    );

    yield* provider.checkoutChangeRequest({
      cwd: "/repo",
      reference: "#44",
      context: {
        provider: {
          kind: "azure-devops",
          name: "Azure DevOps",
          baseUrl: "https://dev.azure.com",
        },
        remoteName: "upstream",
        remoteUrl: "https://dev.azure.com/org/project/_git/repo",
      },
    });

    expect(checkoutPullRequest).toHaveBeenCalledWith({
      cwd: "/repo",
      reference: "#44",
      remoteName: "upstream",
    });
  }),
);

it.effect("maps CLI errors to provider errors", () =>
  Effect.gen(function* () {
    const provider = yield* make().pipe(
      Effect.provideService(
        AzureDevOpsCli,
        makeAzureCli({
          getDefaultBranch: () =>
            Effect.fail(
              new AzureDevOpsCliError({
                operation: "getDefaultBranch",
                detail: "not authenticated",
              }),
            ),
        }),
      ),
    );

    const error = yield* provider.getDefaultBranch({ cwd: "/repo" }).pipe(Effect.flip);

    assert.equal(error.provider, "azure-devops");
    assert.equal(error.operation, "getDefaultBranch");
    assert.equal(error.detail, "not authenticated");
  }),
);
