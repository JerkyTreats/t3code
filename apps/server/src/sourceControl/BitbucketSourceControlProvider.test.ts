import { assert, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { expect, vi } from "vitest";

import { BitbucketApi, BitbucketApiError, type BitbucketApiShape } from "./BitbucketApi.ts";
import { make, makeDiscovery } from "./BitbucketSourceControlProvider.ts";

function makeBitbucketApi(overrides?: Partial<BitbucketApiShape>): BitbucketApiShape {
  return {
    probeAuth: Effect.succeed({
      status: "authenticated",
      account: Option.some("workspace"),
      host: Option.some("bitbucket.org"),
      detail: Option.none(),
    }),
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
          number: 14,
          title: "Provider PR",
          url: "https://bitbucket.org/workspace/repo/pull-requests/14",
          baseRefName: "main",
          headRefName: "feature/provider",
          state: "open" as const,
          updatedAt: Option.none(),
          isCrossRepository: true,
          headRepositoryNameWithOwner: "fork/repo",
          headRepositoryOwnerLogin: "fork",
        },
      ]),
    );
    const provider = yield* make().pipe(
      Effect.provideService(BitbucketApi, makeBitbucketApi({ listPullRequests })),
    );

    const result = yield* provider.listChangeRequests({
      cwd: "/repo",
      headSelector: "fork:feature/provider",
      state: "open",
      limit: 5,
    });

    expect(listPullRequests).toHaveBeenCalledWith({
      cwd: "/repo",
      headSelector: "fork:feature/provider",
      source: { owner: "fork", refName: "feature/provider" },
      state: "open",
      limit: 5,
    });
    assert.equal(result[0]?.provider, "bitbucket");
    assert.equal(result[0]?.number, 14);
    assert.equal(result[0]?.headRepositoryOwnerLogin, "fork");
  }),
);

it.effect("exposes Bitbucket auth discovery from the API", () =>
  Effect.gen(function* () {
    const discovery = yield* makeDiscovery().pipe(
      Effect.provideService(BitbucketApi, makeBitbucketApi()),
    );

    const auth = yield* discovery.probeAuth;

    assert.equal(discovery.kind, "bitbucket");
    assert.equal(auth.status, "authenticated");
    assert.equal(Option.getOrNull(auth.account), "workspace");
  }),
);

it.effect("maps API errors to provider errors", () =>
  Effect.gen(function* () {
    const provider = yield* make().pipe(
      Effect.provideService(
        BitbucketApi,
        makeBitbucketApi({
          getDefaultBranch: () =>
            Effect.fail(
              new BitbucketApiError({
                operation: "getDefaultBranch",
                detail: "not authenticated",
              }),
            ),
        }),
      ),
    );

    const error = yield* provider.getDefaultBranch({ cwd: "/repo" }).pipe(Effect.flip);

    assert.equal(error.provider, "bitbucket");
    assert.equal(error.operation, "getDefaultBranch");
    assert.equal(error.detail, "not authenticated");
  }),
);
