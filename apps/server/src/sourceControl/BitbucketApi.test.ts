import { SourceControlProviderKind } from "@t3tools/contracts";
import { assert, it, vi } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http";

import * as BitbucketApi from "@t3tools/source-control-bitbucket/server/BitbucketApi";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as ServerSettings from "../serverSettings.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import type * as VcsDriver from "../vcs/VcsDriver.ts";
import * as ServerSourceControlHost from "./ServerSourceControlHost.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";

const isBitbucketRepositoryLocatorError = Schema.is(BitbucketApi.BitbucketRepositoryLocatorError);

const bitbucketPullRequest = {
  id: 42,
  title: "Add Bitbucket provider",
  state: "OPEN",
  updated_on: "2026-01-02T00:00:00.000Z",
  links: {
    html: {
      href: "https://bitbucket.org/pingdotgg/t3code/pull-requests/42",
    },
  },
  source: {
    branch: { name: "feature/source-control" },
    repository: {
      full_name: "octocat/t3code",
      workspace: { slug: "octocat" },
    },
  },
  destination: {
    branch: { name: "main" },
    repository: {
      full_name: "pingdotgg/t3code",
      workspace: { slug: "pingdotgg" },
    },
  },
};

const repositoryJson = {
  full_name: "pingdotgg/t3code",
  links: {
    html: { href: "https://bitbucket.org/pingdotgg/t3code" },
    clone: [
      { name: "https", href: "https://bitbucket.org/pingdotgg/t3code.git" },
      { name: "ssh", href: "git@bitbucket.org:pingdotgg/t3code.git" },
    ],
  },
  mainbranch: { name: "main" },
};

function makeLayer(input: {
  readonly response: (request: HttpClientRequest.HttpClientRequest) => Response;
  /** Holds the answer until it resolves, in place of answering at once. */
  readonly answer?: (response: Response) => Effect.Effect<Response>;
  readonly requestFailure?: (
    request: HttpClientRequest.HttpClientRequest,
  ) => HttpClientError.HttpClientError;
  readonly stall?: boolean;
  readonly git?: Partial<GitVcsDriver.GitVcsDriver["Service"]>;
  readonly apiBaseUrl?: string;
  readonly originRemoteUrl?: string;
  readonly env?: Record<string, string>;
}) {
  const originRemoteUrl = input.originRemoteUrl ?? "git@api.test.local:pingdotgg/t3code.git";
  const execute = vi.fn((request: HttpClientRequest.HttpClientRequest) =>
    input.stall
      ? Effect.never
      : input.requestFailure
        ? Effect.fail(input.requestFailure(request))
        : (input.answer ?? Effect.succeed)(input.response(request)).pipe(
            Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
          ),
  );
  const gitMock = {
    readConfigValue: vi.fn<GitVcsDriver.GitVcsDriver["Service"]["readConfigValue"]>(() =>
      Effect.succeed<string | null>(originRemoteUrl),
    ),
    resolvePrimaryRemoteName: vi.fn<
      GitVcsDriver.GitVcsDriver["Service"]["resolvePrimaryRemoteName"]
    >(() => Effect.succeed("origin")),
    ensureRemote: vi.fn<GitVcsDriver.GitVcsDriver["Service"]["ensureRemote"]>(() =>
      Effect.succeed("octocat"),
    ),
    fetchRemoteBranch: vi.fn<GitVcsDriver.GitVcsDriver["Service"]["fetchRemoteBranch"]>(
      () => Effect.void,
    ),
    fetchRemoteTrackingBranch: vi.fn<
      GitVcsDriver.GitVcsDriver["Service"]["fetchRemoteTrackingBranch"]
    >(() => Effect.void),
    setBranchUpstream: vi.fn<GitVcsDriver.GitVcsDriver["Service"]["setBranchUpstream"]>(
      () => Effect.void,
    ),
    switchRef: vi.fn<GitVcsDriver.GitVcsDriver["Service"]["switchRef"]>((request) =>
      Effect.succeed({ refName: request.refName }),
    ),
    listLocalBranchNames: vi.fn<GitVcsDriver.GitVcsDriver["Service"]["listLocalBranchNames"]>(() =>
      Effect.succeed([]),
    ),
  };
  const git = {
    ...gitMock,
    ...input.git,
  } satisfies Partial<GitVcsDriver.GitVcsDriver["Service"]>;

  const driver = {
    listRemotes: vi.fn(() =>
      Effect.succeed({
        remotes: [
          {
            name: "origin",
            url: originRemoteUrl,
            pushUrl: Option.none(),
            isPrimary: true,
          },
        ],
        freshness: {
          source: "live-local" as const,
          observedAt: DateTime.makeUnsafe("1970-01-01T00:00:00.000Z"),
          expiresAt: Option.none(),
        },
      }),
    ),
  } satisfies Partial<VcsDriver.VcsDriver["Service"]>;

  const resolve = vi.fn(() =>
    Effect.succeed({
      kind: "git" as const,
      repository: {
        kind: "git" as const,
        rootPath: "/repo",
        metadataPath: null,
        freshness: {
          source: "live-local" as const,
          observedAt: DateTime.makeUnsafe("1970-01-01T00:00:00.000Z"),
          expiresAt: Option.none(),
        },
      },
      driver: driver as unknown as VcsDriver.VcsDriver["Service"],
    }),
  );

  const layer = BitbucketApi.layer.pipe(
    Layer.provide(ServerSourceControlHost.layer),
    Layer.provide(SourceControlRateLimit.layer),
    Layer.provide(Layer.mock(VcsProcess.VcsProcess)({})),
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) => execute(request)),
      ),
    ),
    Layer.provide(
      Layer.mock(VcsDriverRegistry.VcsDriverRegistry)({
        resolve,
      }),
    ),
    Layer.provide(Layer.mock(GitVcsDriver.GitVcsDriver)(git)),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({
          env: input.env ?? {
            T3CODE_BITBUCKET_API_BASE_URL: input.apiBaseUrl ?? "https://api.test.local/2.0",
            T3CODE_BITBUCKET_EMAIL: "user@example.com",
            T3CODE_BITBUCKET_API_TOKEN: "token",
          },
        }),
      ),
    ),
    Layer.provideMerge(ServerSettings.layerTest()),
    Layer.provideMerge(NodeServices.layer),
  );

  return { execute, git: gitMock, resolve, listRemotes: driver.listRemotes, layer };
}

const mismatchedOriginContext = {
  provider: {
    kind: SourceControlProviderKind.make("bitbucket"),
    name: "Bitbucket",
    baseUrl: "https://bitbucket.internal.example",
  },
  remoteName: "origin",
  remoteUrl: "ssh://git@bitbucket.internal.example/team/repo.git",
};

it.effect("refuses a source-control read when exact origin does not match the API host", () => {
  const { execute, layer } = makeLayer({ response: () => Response.json({ values: [] }) });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const error = yield* bitbucket
      .listPullRequests({
        cwd: "/repo",
        context: mismatchedOriginContext,
        headSelector: "feature/host-boundary",
        state: "open",
      })
      .pipe(Effect.flip);

    assert.instanceOf(error, BitbucketApi.BitbucketOriginHostError);
    assert.strictEqual(error.reason, "origin-host-mismatch");
    assert.strictEqual(execute.mock.calls.length, 0);
  }).pipe(Effect.provide(layer));
});

it.effect("refuses a source-control write before reading its body or sending a request", () => {
  const { execute, layer } = makeLayer({ response: () => Response.json(bitbucketPullRequest) });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const error = yield* bitbucket
      .createPullRequest({
        cwd: "/repo",
        context: mismatchedOriginContext,
        baseBranch: "main",
        headSelector: "feature/host-boundary",
        title: "Host-bound write",
        bodyFile: "/does/not/exist.md",
      })
      .pipe(Effect.flip);

    assert.instanceOf(error, BitbucketApi.BitbucketOriginHostError);
    assert.strictEqual(error.reason, "origin-host-mismatch");
    assert.strictEqual(execute.mock.calls.length, 0);
  }).pipe(Effect.provide(layer));
});

it.effect("accepts the Bitbucket Cloud origin for the Cloud API host", () => {
  const { layer } = makeLayer({
    apiBaseUrl: "https://api.bitbucket.org/2.0",
    originRemoteUrl: "git@bitbucket.org:team/repo.git",
    response: () => Response.json({}),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    yield* bitbucket.authorizeOriginHost({ originHost: "bitbucket.org" });
  }).pipe(Effect.provide(layer));
});

it.effect("requires an exact port match for a configured self-hosted API", () => {
  const { layer } = makeLayer({
    apiBaseUrl: "https://bitbucket.internal.example:8443/2.0",
    originRemoteUrl: "ssh://git@bitbucket.internal.example:8443/team/repo.git",
    response: () => Response.json({}),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    yield* bitbucket.authorizeOriginHost({ originHost: "bitbucket.internal.example:8443" });
    const error = yield* bitbucket
      .authorizeOriginHost({ originHost: "bitbucket.internal.example" })
      .pipe(Effect.flip);

    assert.instanceOf(error, BitbucketApi.BitbucketOriginHostError);
    assert.strictEqual(error.reason, "origin-host-mismatch");
  }).pipe(Effect.provide(layer));
});

it.effect("parses pull request responses from the Bitbucket REST API", () => {
  const { execute, layer } = makeLayer({
    response: () =>
      Response.json({
        ...bitbucketPullRequest,
      }),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const result = yield* bitbucket.getPullRequest({
      cwd: "/repo",
      reference: "#42",
    });

    assert.deepStrictEqual(result, {
      number: 42,
      title: "Add Bitbucket provider",
      url: "https://bitbucket.org/pingdotgg/t3code/pull-requests/42",
      baseRefName: "main",
      headRefName: "feature/source-control",
      state: "open",
      updatedAt: Option.some(DateTime.makeUnsafe("2026-01-02T00:00:00.000Z")),
      isCrossRepository: true,
      headRepositoryNameWithOwner: "octocat/t3code",
      headRepositoryOwnerLogin: "octocat",
    });
    assert.strictEqual(
      execute.mock.calls[0]?.[0].url,
      "https://api.test.local/2.0/repositories/pingdotgg/t3code/pullrequests/42",
    );
  }).pipe(Effect.provide(layer));
});

it.effect("lists pull requests with Bitbucket state and source branch query params", () => {
  const { execute, layer } = makeLayer({
    response: () =>
      Response.json({
        values: [
          {
            ...bitbucketPullRequest,
            id: 7,
            state: "MERGED",
            source: {
              branch: { name: "feature/merged" },
              repository: { full_name: "pingdotgg/t3code" },
            },
          },
        ],
      }),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const result = yield* bitbucket.listPullRequests({
      cwd: "/repo",
      headSelector: "origin:feature/merged",
      state: "merged",
      limit: 10,
    });

    assert.strictEqual(result[0]?.state, "merged");
    const request = execute.mock.calls[0]?.[0];
    assert.strictEqual(
      request?.url,
      "https://api.test.local/2.0/repositories/pingdotgg/t3code/pullrequests",
    );
    assert.deepStrictEqual(request?.urlParams.params, [
      ["pagelen", "10"],
      ["sort", "-updated_on"],
      ["q", 'source.branch.name = "feature/merged" AND state = "MERGED"'],
      ["state", "MERGED"],
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("reads repository clone URLs and default branch", () => {
  const { layer } = makeLayer({
    response: (request) =>
      Response.json(
        request.url.endsWith("/branching-model")
          ? {
              development: {
                branch: { name: "main" },
                name: "main",
                use_mainbranch: true,
              },
            }
          : repositoryJson,
      ),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const cloneUrls = yield* bitbucket.getRepositoryCloneUrls({
      cwd: "/repo",
      repository: "pingdotgg/t3code",
    });
    const defaultBranch = yield* bitbucket.getDefaultBranch({ cwd: "/repo" });

    assert.deepStrictEqual(cloneUrls, {
      nameWithOwner: "pingdotgg/t3code",
      url: "https://bitbucket.org/pingdotgg/t3code.git",
      sshUrl: "git@bitbucket.org:pingdotgg/t3code.git",
    });
    assert.strictEqual(defaultBranch, "main");
  }).pipe(Effect.provide(layer));
});

it.effect.each([false, true])(
  "rejects invalid explicit repositories before fallback, context=%s",
  (withContext) => {
    const { execute, resolve, listRemotes, layer } = makeLayer({
      response: () => Response.json(repositoryJson),
    });

    return Effect.gen(function* () {
      const bitbucket = yield* BitbucketApi.BitbucketApi;
      for (const repository of ["t3code", "", " \t "]) {
        const error = yield* bitbucket
          .getRepositoryCloneUrls({
            cwd: "/repo",
            repository,
            ...(withContext
              ? {
                  context: {
                    provider: {
                      kind: SourceControlProviderKind.make("bitbucket"),
                      name: "Bitbucket",
                      baseUrl: "https://bitbucket.org",
                    },
                    remoteName: "origin",
                    remoteUrl: "git@bitbucket.org:pingdotgg/t3code.git",
                  },
                }
              : {}),
          })
          .pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => null }));

        assert.instanceOf(error, BitbucketApi.BitbucketRepositoryLocatorError);
        assert.strictEqual(
          isBitbucketRepositoryLocatorError(error) ? error.repository : null,
          repository,
        );
        assert.strictEqual(resolve.mock.calls.length, 0);
        assert.strictEqual(listRemotes.mock.calls.length, 0);
        assert.strictEqual(execute.mock.calls.length, 0);
      }
    }).pipe(Effect.provide(layer));
  },
);

it.effect("prefers an explicit repository and uses context when the repository is omitted", () => {
  const { execute, resolve, listRemotes, layer } = makeLayer({
    apiBaseUrl: "https://api.bitbucket.org/2.0",
    response: (request) =>
      Response.json(request.url.endsWith("/branching-model") ? {} : repositoryJson),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const context = {
      provider: {
        kind: SourceControlProviderKind.make("bitbucket"),
        name: "Bitbucket",
        baseUrl: "https://bitbucket.org",
      },
      remoteName: "origin",
      remoteUrl: "git@bitbucket.org:another/context.git",
    };
    for (const repository of ["pingdotgg/t3code", "https://bitbucket.org/pingdotgg/t3code.git"]) {
      yield* bitbucket.getRepositoryCloneUrls({ cwd: "/repo", context, repository });
    }
    yield* bitbucket.getDefaultBranch({ cwd: "/repo", context });

    assert.deepStrictEqual(
      execute.mock.calls.map(([request]) => request.url).toSorted(),
      [
        "https://api.bitbucket.org/2.0/repositories/pingdotgg/t3code",
        "https://api.bitbucket.org/2.0/repositories/pingdotgg/t3code",
        "https://api.bitbucket.org/2.0/repositories/another/context",
        "https://api.bitbucket.org/2.0/repositories/another/context/branching-model",
      ].toSorted(),
    );
    assert.strictEqual(resolve.mock.calls.length, 0);
    assert.strictEqual(listRemotes.mock.calls.length, 0);
  }).pipe(Effect.provide(layer));
});

it.effect(
  "prefers the Bitbucket branching model development branch as the default PR target",
  () => {
    const { execute, layer } = makeLayer({
      response: (request) =>
        Response.json(
          request.url.endsWith("/branching-model")
            ? {
                development: {
                  branch: { name: "develop" },
                  name: "develop",
                  use_mainbranch: false,
                },
              }
            : repositoryJson,
        ),
    });

    return Effect.gen(function* () {
      const bitbucket = yield* BitbucketApi.BitbucketApi;
      const defaultBranch = yield* bitbucket.getDefaultBranch({ cwd: "/repo" });

      assert.strictEqual(defaultBranch, "develop");
      assert.deepStrictEqual(
        execute.mock.calls.map((call) => call[0].url).toSorted(),
        [
          "https://api.test.local/2.0/repositories/pingdotgg/t3code",
          "https://api.test.local/2.0/repositories/pingdotgg/t3code/branching-model",
        ].toSorted(),
      );
    }).pipe(Effect.provide(layer));
  },
);

it.effect(
  "falls back to the repository main branch when the Bitbucket development branch is invalid",
  () => {
    const { layer } = makeLayer({
      response: (request) =>
        Response.json(
          request.url.endsWith("/branching-model")
            ? {
                development: {
                  name: "develop",
                  use_mainbranch: false,
                  is_valid: false,
                },
              }
            : repositoryJson,
        ),
    });

    return Effect.gen(function* () {
      const bitbucket = yield* BitbucketApi.BitbucketApi;
      const defaultBranch = yield* bitbucket.getDefaultBranch({ cwd: "/repo" });

      assert.strictEqual(defaultBranch, "main");
    }).pipe(Effect.provide(layer));
  },
);

it.effect("creates pull requests using the official REST payload shape", () => {
  const { execute, layer } = makeLayer({
    response: () => Response.json(bitbucketPullRequest),
  });

  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const bodyFile = yield* fileSystem.makeTempFileScoped({ prefix: "bitbucket-pr-body-" });
    yield* fileSystem.writeFileString(bodyFile, "PR body");

    const bitbucket = yield* BitbucketApi.BitbucketApi;
    yield* bitbucket.createPullRequest({
      cwd: "/repo",
      baseBranch: "main",
      headSelector: "owner:feature/provider",
      title: "Provider PR",
      bodyFile,
    });

    const request = execute.mock.calls[0]?.[0];
    assert.strictEqual(
      request?.url,
      "https://api.test.local/2.0/repositories/pingdotgg/t3code/pullrequests",
    );
    assert.strictEqual(request?.method, "POST");
    assert.ok(request);
    const rawBody = (request.body as { readonly body?: Uint8Array }).body;
    assert.ok(rawBody);
    assert.deepStrictEqual(JSON.parse(new TextDecoder().decode(rawBody)), {
      title: "Provider PR",
      description: "PR body",
      source: {
        branch: { name: "feature/provider" },
        repository: { full_name: "owner/t3code" },
      },
      destination: {
        branch: { name: "main" },
      },
    });
  }).pipe(Effect.provide(layer), Effect.scoped);
});

it.effect("prefers credentials saved in settings over the environment, without a restart", () => {
  const { execute, layer } = makeLayer({
    response: () => Response.json({ username: "bitbucket-user" }),
  });
  const lastAuthorization = () => execute.mock.calls.at(-1)?.[0].headers.authorization;
  const basic = (user: string, password: string) => `Basic ${btoa(`${user}:${password}`)}`;

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const settings = yield* ServerSettings.ServerSettingsService;

    yield* bitbucket.probeAuth;
    assert.strictEqual(lastAuthorization(), basic("user@example.com", "token"));

    yield* settings.updateSettings({
      sourceControlHosts: {
        bitbucket: { email: "saved@example.com", apiToken: "saved-api-token" },
      },
    });
    yield* bitbucket.probeAuth;
    assert.strictEqual(lastAuthorization(), basic("saved@example.com", "saved-api-token"));

    yield* settings.updateSettings({
      sourceControlHosts: { bitbucket: { accessToken: "saved-access-token" } },
    });
    yield* bitbucket.probeAuth;
    assert.strictEqual(lastAuthorization(), "Bearer saved-access-token");

    yield* settings.updateSettings({
      sourceControlHosts: { bitbucket: { accessToken: "", apiToken: "" } },
    });
    yield* bitbucket.probeAuth;
    assert.strictEqual(lastAuthorization(), basic("user@example.com", "token"));
  }).pipe(Effect.provide(layer));
});

it.effect("never puts a saved token that is unsafe for an HTTP header on the wire", () => {
  const { execute, layer } = makeLayer({
    response: () => Response.json({ username: "bitbucket-user" }),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const settings = yield* ServerSettings.ServerSettingsService;

    // Fetch would reject this header with an error quoting the token, and that error reaches
    // clients. The unusable token is ignored, so the environment credential is used instead.
    yield* settings.updateSettings({
      sourceControlHosts: { bitbucket: { accessToken: "saved\ntoken" } },
    });
    yield* bitbucket.probeAuth;
    assert.strictEqual(
      execute.mock.calls.at(-1)?.[0].headers.authorization,
      `Basic ${btoa("user@example.com:token")}`,
    );
  }).pipe(Effect.provide(layer));
});

it.effect("reports saved credentials as configured when Bitbucket cannot confirm them", () => {
  const { layer } = makeLayer({
    response: () => new Response(null, { status: 401 }),
    env: { T3CODE_BITBUCKET_API_BASE_URL: "https://api.test.local/2.0" },
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const settings = yield* ServerSettings.ServerSettingsService;

    assert.strictEqual((yield* bitbucket.probeAuth).status, "unauthenticated");

    yield* settings.updateSettings({
      sourceControlHosts: { bitbucket: { accessToken: "saved-access-token" } },
    });
    assert.deepStrictEqual(yield* bitbucket.probeAuth, {
      status: "unknown",
      account: Option.none(),
      host: Option.some("api.test.local"),
      detail: Option.some("An access token is configured."),
    });
  }).pipe(Effect.provide(layer));
});

it.effect("keeps Bitbucket response bodies out of checkout diagnostics", () => {
  const responseBody = '{"error":{"message":"credential=secret-value"}}';
  const { layer } = makeLayer({
    response: () => new Response(responseBody, { status: 403 }),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const error = yield* bitbucket
      .checkoutPullRequest({ cwd: "/repo", reference: "42" })
      .pipe(Effect.flip);

    assert.instanceOf(error, BitbucketApi.BitbucketResponseError);
    assert.strictEqual(error.operation, "getPullRequest");
    assert.strictEqual(error.status, 403);
    assert.strictEqual(error.responseBodyLength, responseBody.length);
    assert.notProperty(error, "responseBody");
    assert.strictEqual(
      error.message,
      "Bitbucket API failed in getPullRequest: Bitbucket returned HTTP 403.",
    );
    assert.notInclude(error.message, "secret-value");
  }).pipe(Effect.provide(layer));
});

it.effect("checks out fork pull requests through an ensured fork remote", () => {
  const { git, layer } = makeLayer({
    response: (request) => {
      if (request.url.endsWith("/repositories/octocat/t3code")) {
        return Response.json({
          ...repositoryJson,
          full_name: "octocat/t3code",
          links: {
            html: { href: "https://bitbucket.org/octocat/t3code" },
            clone: [
              { name: "https", href: "https://bitbucket.org/octocat/t3code.git" },
              { name: "ssh", href: "git@bitbucket.org:octocat/t3code.git" },
            ],
          },
        });
      }
      return Response.json({
        ...bitbucketPullRequest,
        source: {
          branch: { name: "main" },
          repository: {
            full_name: "octocat/t3code",
            workspace: { slug: "octocat" },
          },
        },
      });
    },
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    yield* bitbucket.checkoutPullRequest({
      cwd: "/repo",
      reference: "42",
      force: true,
    });

    assert.deepStrictEqual(git.ensureRemote.mock.calls[0]?.[0], {
      cwd: "/repo",
      preferredName: "octocat",
      url: "git@bitbucket.org:octocat/t3code.git",
    });
    assert.deepStrictEqual(git.fetchRemoteBranch.mock.calls[0]?.[0], {
      cwd: "/repo",
      remoteName: "octocat",
      remoteBranch: "main",
      localBranch: "t3code/pr-42/main",
    });
    assert.deepStrictEqual(git.setBranchUpstream.mock.calls[0]?.[0], {
      cwd: "/repo",
      branch: "t3code/pr-42/main",
      remoteName: "octocat",
      remoteBranch: "main",
    });
    assert.deepStrictEqual(git.switchRef.mock.calls[0]?.[0], {
      cwd: "/repo",
      refName: "t3code/pr-42/main",
    });
  }).pipe(Effect.provide(layer));
});

it.effect("refuses a url that points away from the configured Bitbucket", () => {
  const { layer, execute } = makeLayer({ response: () => new Response("{}", { status: 200 }) });
  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;

    const error = yield* Effect.flip(
      bitbucket.request({ method: "GET", url: "https://attacker.example/2.0/repositories" }),
    );

    assert.strictEqual(error._tag, "BitbucketUntrustedUrlError");
    assert.strictEqual(execute.mock.calls.length, 0);
  }).pipe(Effect.provide(layer));
});

it.effect("keeps only the host of a url it refuses, never its query", () =>
  Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;

    const error = yield* Effect.flip(
      bitbucket.request({
        method: "GET",
        url: "https://attacker.example/asset?signature=secret-token",
      }),
    );

    assert.strictEqual(error._tag, "BitbucketUntrustedUrlError");
    assert.strictEqual(
      error._tag === "BitbucketUntrustedUrlError" ? error.host : "",
      "https://attacker.example",
    );
    assert.notInclude(error.message, "secret-token");
  }).pipe(Effect.provide(makeLayer({ response: () => new Response("{}", { status: 200 }) }).layer)),
);

it.effect("does not follow a redirect off the configured Bitbucket", () =>
  Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;

    const error = yield* Effect.flip(
      bitbucket.request({ method: "GET", url: "/repositories/acme/web/pullrequests/1/diff" }),
    );

    // The client would carry every header to the new host, so the hop is checked here instead.
    assert.strictEqual(error._tag, "BitbucketUntrustedUrlError");
  }).pipe(
    Effect.provide(
      makeLayer({
        response: () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://attacker.example/stolen" },
          }),
      }).layer,
    ),
  ),
);

it.effect("follows a redirect that stays on the configured Bitbucket", () =>
  Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;

    const result = yield* bitbucket.request({
      method: "GET",
      url: "/repositories/acme/web/pullrequests/1/diff",
    });

    // Bitbucket serves a diff as a redirect to a commit range, so the hop has to be followed.
    assert.strictEqual(result.body, "diff --git a/a.ts b/a.ts");
    assert.isFalse(result.truncated);
  }).pipe(
    Effect.provide(
      makeLayer({
        response: (request) =>
          request.url.endsWith("/pullrequests/1/diff")
            ? new Response(null, {
                status: 302,
                headers: { location: "https://api.test.local/2.0/repositories/acme/web/diff/abc" },
              })
            : new Response("diff --git a/a.ts b/a.ts", { status: 200 }),
      }).layer,
    ),
  ),
);

it.effect("cuts a response short rather than reading an unbounded diff into memory", () =>
  Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;

    const result = yield* bitbucket.request({
      method: "GET",
      url: "/repositories/acme/web/pullrequests/1/diff",
      maxBytes: 8,
    });

    assert.strictEqual(result.body, "12345678");
    assert.isTrue(result.truncated);
  }).pipe(
    Effect.provide(
      makeLayer({ response: () => new Response("1234567890", { status: 200 }) }).layer,
    ),
  ),
);

it.effect("pauses background reads after a 429 until Bitbucket's retry-after passes", () => {
  let answered = 0;
  const { execute, layer } = makeLayer({
    response: () => {
      answered += 1;
      return answered === 1
        ? new Response("Rate limit exceeded", { status: 429, headers: { "retry-after": "60" } })
        : Response.json({ values: [] });
    },
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const lookup = bitbucket.listPullRequests({
      cwd: "/repo",
      headSelector: "feature/a",
      state: "all",
    });

    yield* Effect.flip(lookup);
    const paused = yield* Effect.flip(lookup);
    // Keyed by the repository host, where PullRequestService records its own backoff.
    assert.deepInclude(paused, {
      _tag: "SourceControlRateLimitPausedError",
      host: "bitbucket.org",
      retryAt: 60_000,
    });
    assert.strictEqual(execute.mock.calls.length, 1);

    // A user waiting on an answer is not held back by the background pause, and their success
    // does not end it early.
    yield* lookup.pipe(Effect.provideService(SourceControlRateLimit.Interactive, true));
    yield* bitbucket.request({
      method: "POST",
      url: "/repositories/acme/web/pullrequests/1/approve",
    });

    yield* TestClock.adjust("59 seconds");
    assert.strictEqual((yield* Effect.flip(lookup))._tag, "SourceControlRateLimitPausedError");

    yield* TestClock.adjust("1 second");
    yield* lookup;
  }).pipe(Effect.provide(layer));
});

it.effect("keeps a sweep over many branches to a few Bitbucket requests at a time", () =>
  Effect.gen(function* () {
    const started = yield* Queue.unbounded<void>();
    const release = yield* Deferred.make<void>();
    let inFlight = 0;
    let peak = 0;
    const { layer } = makeLayer({
      response: () => Response.json({ values: [] }),
      answer: (response) =>
        Effect.gen(function* () {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          yield* Queue.offer(started, undefined);
          yield* Deferred.await(release);
          inFlight -= 1;
          return response;
        }),
    });

    yield* Effect.gen(function* () {
      const bitbucket = yield* BitbucketApi.BitbucketApi;
      const sweep = yield* Effect.forEach(
        Array.from({ length: 12 }, (_, index) => `feature/${index}`),
        (branch) =>
          bitbucket.listPullRequests({ cwd: "/repo", headSelector: branch, state: "all" }),
        { concurrency: "unbounded", discard: true },
      ).pipe(Effect.forkChild);
      for (let index = 0; index < 4; index += 1) yield* Queue.take(started);
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(sweep);
    }).pipe(Effect.provide(layer));

    assert.strictEqual(peak, 4);
  }),
);

it.effect("binds saved credentials and auth reports to the configured API host and port", () => {
  const host = "bitbucket.internal.example:8443";
  let status = 200;
  const { execute, layer } = makeLayer({
    apiBaseUrl: `https://${host}/2.0`,
    originRemoteUrl: `ssh://git@${host}/team/repo.git`,
    response: () =>
      status === 200 ? Response.json({ username: "saved-user" }) : new Response(null, { status }),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const settings = yield* ServerSettings.ServerSettingsService;
    yield* settings.updateSettings({
      sourceControlHosts: { bitbucket: { accessToken: "saved-access-token" } },
    });

    assert.deepStrictEqual(yield* bitbucket.probeAuth, {
      status: "authenticated",
      account: Option.some("saved-user"),
      host: Option.some(host),
      detail: Option.none(),
    });
    assert.strictEqual(execute.mock.calls.at(-1)?.[0].url, `https://${host}/2.0/user`);
    assert.strictEqual(
      execute.mock.calls.at(-1)?.[0].headers.authorization,
      "Bearer saved-access-token",
    );

    status = 401;
    assert.deepStrictEqual(yield* bitbucket.probeAuth, {
      status: "unknown",
      account: Option.none(),
      host: Option.some(host),
      detail: Option.some("An access token is configured."),
    });
    yield* settings.updateSettings({
      sourceControlHosts: {
        bitbucket: { accessToken: "", email: "saved@example.com", apiToken: "saved-api-token" },
      },
    });
    assert.deepStrictEqual(yield* bitbucket.probeAuth, {
      status: "unknown",
      account: Option.some("saved@example.com"),
      host: Option.some(host),
      detail: Option.some("An API token is configured."),
    });
    yield* settings.updateSettings({ sourceControlHosts: { bitbucket: { apiToken: "" } } });
    assert.deepStrictEqual((yield* bitbucket.probeAuth).host, Option.some(host));
  }).pipe(Effect.provide(layer));
});

it.effect("authorizes origin before using saved credentials for provider reads and writes", () => {
  const host = "bitbucket.internal.example:8443";
  const context = {
    provider: {
      kind: SourceControlProviderKind.make("bitbucket"),
      name: "Bitbucket",
      baseUrl: `https://${host}`,
    },
    remoteName: "origin",
    remoteUrl: `ssh://git@${host}/team/repo.git`,
  };
  const { execute, layer } = makeLayer({
    apiBaseUrl: `https://${host}/2.0`,
    originRemoteUrl: context.remoteUrl,
    response: () => Response.json({ values: [] }),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const settings = yield* ServerSettings.ServerSettingsService;
    yield* settings.updateSettings({
      sourceControlHosts: { bitbucket: { accessToken: "saved-access-token" } },
    });
    yield* bitbucket.listPullRequests({
      cwd: "/repo",
      context,
      headSelector: "feature/host-boundary",
      state: "open",
    });
    assert.strictEqual(execute.mock.calls.length, 1);
    assert.strictEqual(
      execute.mock.calls[0]?.[0].url,
      `https://${host}/2.0/repositories/team/repo/pullrequests`,
    );
    assert.strictEqual(
      execute.mock.calls[0]?.[0].headers.authorization,
      "Bearer saved-access-token",
    );
    execute.mockClear();

    const mismatchedContext = {
      ...context,
      remoteUrl: "ssh://git@bitbucket.internal.example/team/repo.git",
    };
    const readError = yield* bitbucket
      .listPullRequests({
        cwd: "/repo",
        context: mismatchedContext,
        headSelector: "feature/host-boundary",
        state: "open",
      })
      .pipe(Effect.flip);
    const writeError = yield* bitbucket
      .createPullRequest({
        cwd: "/repo",
        context: mismatchedContext,
        baseBranch: "main",
        headSelector: "feature/host-boundary",
        title: "Host-bound write",
        bodyFile: "/does/not/exist.md",
      })
      .pipe(Effect.flip);
    assert.instanceOf(readError, BitbucketApi.BitbucketOriginHostError);
    assert.instanceOf(writeError, BitbucketApi.BitbucketOriginHostError);
    assert.strictEqual(readError.reason, "origin-host-mismatch");
    assert.strictEqual(writeError.reason, "origin-host-mismatch");
    assert.strictEqual(execute.mock.calls.length, 0);
  }).pipe(Effect.provide(layer));
});

it.effect("refuses repository creation for an endpoint other than the configured API", () => {
  const { execute, layer } = makeLayer({ response: () => Response.json(repositoryJson) });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const error = yield* bitbucket
      .createRepository({
        cwd: "/repo",
        providerBaseUrl: "https://bitbucket.internal.example",
        repository: "pingdotgg/t3code",
        visibility: "private",
      })
      .pipe(Effect.flip);
    assert.instanceOf(error, BitbucketApi.BitbucketOriginHostError);
    assert.strictEqual(execute.mock.calls.length, 0);

    yield* bitbucket.createRepository({
      cwd: "/repo",
      providerBaseUrl: "https://api.test.local",
      repository: "pingdotgg/t3code",
      visibility: "private",
    });
    assert.strictEqual(execute.mock.calls.length, 1);
  }).pipe(Effect.provide(layer));
});

it.effect("authorizes a pull request origin locator by exact host and port", () => {
  const { layer } = makeLayer({
    apiBaseUrl: "https://bitbucket.internal.example:8443/2.0",
    response: () => Response.json({}),
  });

  return Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    yield* bitbucket.authorizeOrigin({
      remoteName: "origin",
      remoteUrl: "ssh://git@bitbucket.internal.example:8443/team/repo.git",
    });
    const mismatch = yield* bitbucket
      .authorizeOrigin({
        remoteName: "origin",
        remoteUrl: "ssh://git@bitbucket.internal.example/team/repo.git",
      })
      .pipe(Effect.flip);
    const notOrigin = yield* bitbucket
      .authorizeOrigin({
        remoteName: "upstream",
        remoteUrl: "ssh://git@bitbucket.internal.example:8443/team/repo.git",
      })
      .pipe(Effect.flip);
    const missing = yield* bitbucket.authorizeOrigin(undefined).pipe(Effect.flip);

    assert.strictEqual(mismatch.reason, "origin-host-mismatch");
    assert.strictEqual(notOrigin.reason, "origin-context-required");
    assert.strictEqual(missing.reason, "origin-context-required");
  }).pipe(Effect.provide(layer));
});
