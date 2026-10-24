import { SourceControlProviderKind } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as BitbucketApi from "../BitbucketApi.ts";
import * as BitbucketPullRequestApi from "../BitbucketPullRequestApi.ts";
import * as BitbucketPullRequestProvider from "../BitbucketPullRequestProvider.ts";
import * as BitbucketSourceControlProvider from "../BitbucketSourceControlProvider.ts";

// Fork F06 evidence rehomed from the upstream-deleted BitbucketSourceControlProvider.test.ts.

function makeProvider(bitbucket: Partial<BitbucketApi.BitbucketApi["Service"]>) {
  return BitbucketSourceControlProvider.make.pipe(
    Effect.provide(Layer.mock(BitbucketApi.BitbucketApi)(bitbucket)),
  );
}

const cloneUrls = {
  nameWithOwner: "owner/repo",
  url: "https://bitbucket.org/owner/repo",
  sshUrl: "git@bitbucket.org:owner/repo.git",
};

it.effect("binds repository lookup to the explicit Bitbucket endpoint", () =>
  Effect.gen(function* () {
    let received:
      | Parameters<BitbucketApi.BitbucketApi["Service"]["getRepositoryCloneUrls"]>[0]
      | null = null;
    const provider = yield* makeProvider({
      getRepositoryCloneUrls: (input) => {
        received = input;
        return Effect.succeed(cloneUrls);
      },
    });

    yield* provider.getRepositoryCloneUrls({
      cwd: "/repo",
      providerBaseUrl: "https://api.bitbucket.org/2.0",
      repository: "owner/repo",
    });

    assert.deepStrictEqual(received, {
      cwd: "/repo",
      repository: "owner/repo",
      context: {
        provider: {
          kind: SourceControlProviderKind.make("bitbucket"),
          name: "Bitbucket",
          baseUrl: "https://api.bitbucket.org/2.0",
        },
        remoteName: "origin",
        remoteUrl: "https://api.bitbucket.org/2.0",
      },
    });
  }),
);

it.effect("forwards the explicit publication endpoint to repository creation", () =>
  Effect.gen(function* () {
    const received: Array<Parameters<BitbucketApi.BitbucketApi["Service"]["createRepository"]>[0]> =
      [];
    const provider = yield* makeProvider({
      createRepository: (input) => {
        received.push(input);
        return Effect.succeed(cloneUrls);
      },
    });

    yield* provider.createRepository({
      cwd: "/repo",
      providerBaseUrl: "https://api.bitbucket.org/2.0",
      repository: "owner/repo",
      visibility: "private",
    });

    assert.strictEqual(received[0]?.providerBaseUrl, "https://api.bitbucket.org/2.0");
  }),
);

it.effect("forwards the exact origin locator with every pull request call", () =>
  Effect.gen(function* () {
    const origins: Array<unknown> = [];
    const record = <A>(value: A) =>
      ((input: { readonly origin?: unknown }) => {
        origins.push(input.origin);
        return Effect.succeed(value);
      }) as never;
    const provider = yield* BitbucketPullRequestProvider.make.pipe(
      Effect.provide(
        Layer.mock(BitbucketPullRequestApi.BitbucketPullRequestApi)({
          getRepositoryPermission: record(true),
          comment: record(undefined),
          runAction: record(undefined),
        }),
      ),
    );
    const origin = { remoteName: "origin", remoteUrl: "git@bitbucket.org:acme/web.git" };
    const ref = { cwd: "/repo", host: "bitbucket.org", repository: "acme/web", origin };

    yield* provider.getViewerPermissions({ ...ref, number: 1 });
    yield* provider.comment({ ...ref, number: 1, body: "hello" });
    yield* provider.runAction({ ...ref, number: 1, action: "close" });

    assert.deepStrictEqual(origins, [origin, origin, origin]);
  }),
);
