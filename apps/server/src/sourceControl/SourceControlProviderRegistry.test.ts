import { SourceControlProviderKind } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as PubSub from "effect/PubSub";
import * as Redacted from "effect/Redacted";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";
import {
  DEFAULT_SERVER_SETTINGS,
  VcsProcessSpawnError,
  VcsProcessTimeoutError,
} from "@t3tools/contracts";

import * as ServerSettings from "../serverSettings.ts";
import * as ServerConfig from "../config.ts";
import type * as VcsDriver from "../vcs/VcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as AzureDevOpsCli from "@t3tools/source-control-azure-devops/server/AzureDevOpsCli";
import * as AzureDevOpsPullRequestCli from "@t3tools/source-control-azure-devops/server/AzureDevOpsPullRequestCli";
import * as BitbucketApi from "@t3tools/source-control-bitbucket/server/BitbucketApi";
import * as BitbucketPullRequestApi from "@t3tools/source-control-bitbucket/server/BitbucketPullRequestApi";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as GitHubRest from "@t3tools/source-control-github/server/GitHubRest";
import * as GitHubRequestPolicy from "@t3tools/source-control-github/server/GitHubRequestPolicy";
import * as GitHubPullRequestApi from "@t3tools/source-control-github/server/GitHubPullRequestApi";
import * as GitHubCredentials from "@t3tools/source-control-github/server/GitHubCredentials";
import * as GitLabCli from "@t3tools/source-control-gitlab/server/GitLabCli";
import * as GitLabPullRequestCli from "@t3tools/source-control-gitlab/server/GitLabPullRequestCli";
import * as ForgejoCli from "@t3tools/source-control-forgejo/server/ForgejoCli";
import * as GitCafeApi from "@t3tools/source-control-gitcafe/server/GitCafeApi";
import * as GitCafeCredentials from "@t3tools/source-control-gitcafe/server/GitCafeCredentials";
import * as SourceControlProviderRegistry from "./SourceControlProviderRegistry.ts";
import * as ServerSourceControlHost from "./ServerSourceControlHost.ts";

const TEST_EPOCH = DateTime.makeUnsafe("1970-01-01T00:00:00.000Z");

const processOutput = (
  stdout: string,
  options?: {
    readonly stderr?: string;
    readonly exitCode?: ChildProcessSpawner.ExitCode;
  },
): VcsProcess.VcsProcessOutput => ({
  exitCode: options?.exitCode ?? ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: options?.stderr ?? "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

function makeRegistry(input: {
  readonly remotes: ReadonlyArray<{
    readonly name: string;
    readonly url: string;
    readonly pushUrl?: string;
    readonly pushUrls?: ReadonlyArray<string>;
  }>;
  readonly process?: Partial<VcsProcess.VcsProcess["Service"]>;
  readonly githubApi?: Partial<GitHubRest.GitHubRest["Service"]>;
  readonly gitlab?: Partial<GitLabCli.GitLabCli["Service"]>;
  readonly forgejo?: Partial<ForgejoCli.ForgejoCli["Service"]>;
  readonly settings?: Partial<ServerSettings.ServerSettingsService["Service"]>;
  readonly resolve?: VcsDriverRegistry.VcsDriverRegistry["Service"]["resolve"];
  /** Per-checkout remotes; F06 rebinds every caller hint to the live origin of its cwd. */
  readonly remotesFor?: (cwd: string) => ReadonlyArray<{
    readonly name: string;
    readonly url: string;
    readonly pushUrl?: string;
    readonly pushUrls?: ReadonlyArray<string>;
  }>;
}) {
  const driver = {
    listRemotes: (cwd: string) =>
      Effect.succeed({
        remotes: (input.remotesFor?.(cwd) ?? input.remotes).map((remote) => ({
          ...remote,
          pushUrl:
            remote.pushUrl || remote.pushUrls?.at(-1)
              ? Option.some(remote.pushUrl ?? remote.pushUrls!.at(-1)!)
              : Option.none(),
          isPrimary: remote.name === "origin",
        })),
        freshness: {
          source: "live-local" as const,
          observedAt: TEST_EPOCH,
          expiresAt: Option.none(),
        },
      }),
  } satisfies Partial<VcsDriver.VcsDriver["Service"]>;

  const layerRegistry = Layer.mock(VcsDriverRegistry.VcsDriverRegistry)({
    get: () => Effect.succeed(driver as unknown as VcsDriver.VcsDriver["Service"]),
    resolve:
      input.resolve ??
      (() =>
        Effect.succeed({
          kind: "git",
          repository: {
            kind: "git",
            rootPath: "/repo",
            metadataPath: null,
            freshness: {
              source: "live-local" as const,
              observedAt: TEST_EPOCH,
              expiresAt: Option.none(),
            },
          },
          driver: driver as unknown as VcsDriver.VcsDriver["Service"],
        })),
  });

  // Answers origin URL inspection for the F06 mutation authority.
  const layerProcess = Layer.mock(VcsProcess.VcsProcess)({
    run: (request) => {
      const origin = input.remotes.find((remote) => remote.name === "origin");
      if (request.args.join("\0") === ["remote", "get-url", "--all", "origin"].join("\0")) {
        return Effect.succeed(
          processOutput(origin ? `${origin.url}\n` : "", {
            exitCode: ChildProcessSpawner.ExitCode(origin ? 0 : 2),
          }),
        );
      }
      if (
        request.args.join("\0") === ["remote", "get-url", "--push", "--all", "origin"].join("\0")
      ) {
        const pushUrls = origin?.pushUrls ?? (origin?.pushUrl ? [origin.pushUrl] : [origin?.url]);
        return Effect.succeed(
          processOutput(origin ? `${pushUrls.filter(Boolean).join("\n")}\n` : "", {
            exitCode: ChildProcessSpawner.ExitCode(origin ? 0 : 2),
          }),
        );
      }
      return Effect.succeed(processOutput(""));
    },
    ...input.process,
  });

  return SourceControlProviderRegistry.make.pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        layerRegistry,
        layerProcess,
        ServerSourceControlHost.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              layerProcess,
              layerRegistry,
              ServerSettings.ServerSettingsService.layerTest(),
              Layer.mock(GitVcsDriver.GitVcsDriver)({}),
            ),
          ),
        ),
        Layer.mock(AzureDevOpsCli.AzureDevOpsCli)({}),
        Layer.mock(AzureDevOpsPullRequestCli.AzureDevOpsPullRequestCli)({}),
        Layer.mock(BitbucketApi.BitbucketApi)({}),
        Layer.mock(BitbucketPullRequestApi.BitbucketPullRequestApi)({}),
        input.settings
          ? Layer.mock(ServerSettings.ServerSettingsService)(input.settings)
          : ServerSettings.ServerSettingsService.layerTest(),
        Layer.mock(GitHubPullRequestApi.GitHubPullRequestApi)({}),
        // The GitHub provider's GraphQL reads go through these; no test here makes one.
        Layer.mock(GitHubRequestPolicy.GitHubRequestPolicy)({}),
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.die(new Error("Unexpected GitHub GraphQL read"))),
        ),
        Layer.mock(GitHubRest.GitHubRest)({
          // No GitHub credential unless a test supplies one, so custom hosts stay unclaimed.
          credential: (host) => Effect.fail(new GitHubCredentials.GitHubNotSignedInError({ host })),
          ...input.githubApi,
        }),
        Layer.mock(GitVcsDriver.GitVcsDriver)({}),
        Layer.mock(GitLabCli.GitLabCli)(input.gitlab ?? {}),
        Layer.mock(GitLabPullRequestCli.GitLabPullRequestCli)({}),
        Layer.mock(ForgejoCli.ForgejoCli)({
          listLogins: () => Effect.succeed([]),
          ...input.forgejo,
        }),
        Layer.mock(GitCafeApi.GitCafeApi)({}),
        Layer.mock(GitCafeCredentials.GitCafeCredentials)({
          cliEnv: () => Effect.succeed({}),
        }),
        ServerConfig.layerTest(process.cwd(), {
          prefix: "t3-source-control-registry-test-",
        }).pipe(Layer.provide(NodeServices.layer)),
      ),
    ),
  );
}

it.effect("routes linked subjects only within the exact origin repository", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "https://github.com/team/project.git" }],
      githubApi: {
        rest: () =>
          Effect.succeed({
            status: 200,
            headers: {},
            body: JSON.stringify({ title: "GitHub issue", body: null }),
            truncated: false,
            invalidUtf8: false,
          }),
      },
      gitlab: {
        execute: () =>
          Effect.succeed(
            processOutput(JSON.stringify({ title: "GitLab MR", description: "Nested project" })),
          ),
      },
    });
    const githubLookup = registry.resolveLink({
      cwd: "/unrelated",
      url: new URL("https://github.com/team/project/issues/1"),
    });
    assert.ok(githubLookup);
    assert.deepStrictEqual(yield* githubLookup, { title: "GitHub issue", body: null });
    const foreignLookup = registry.resolveLink({
      cwd: "/unrelated",
      url: new URL("https://github.com/other/project/issues/1"),
    });
    assert.ok(foreignLookup);
    const foreignError = yield* foreignLookup.pipe(Effect.flip);
    assert.strictEqual(foreignError.operation, "resolveLink");

    const gitlabRegistry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "https://gitlab.com/team/sub/project.git" }],
      gitlab: {
        execute: () =>
          Effect.succeed(
            processOutput(JSON.stringify({ title: "GitLab MR", description: "Nested project" })),
          ),
      },
    });
    const gitlabLookup = gitlabRegistry.resolveLink({
      cwd: "/unrelated",
      url: new URL("https://gitlab.com/team/sub/project/-/merge_requests/2"),
    });
    assert.ok(gitlabLookup);
    assert.deepStrictEqual(yield* gitlabLookup, { title: "GitLab MR", body: "Nested project" });
    for (const url of [
      "https://example.test/team/project/issues/1",
      "https://github.attacker.test/team/project/issues/1",
      "https://gitlab.attacker.test/team/project/-/issues/1",
      "https://github.com/team/project",
      "https://codeberg.org/team/project/issues/1",
      "https://bitbucket.org/team/project/pull-requests/1",
      "https://dev.azure.com/org/project/_git/repo/pullrequest/1",
      "http://github.com/team/project/issues/1",
      "https://user:secret@github.com/team/project/issues/1",
    ]) {
      assert.strictEqual(registry.resolveLink({ cwd: "/unrelated", url: new URL(url) }), undefined);
    }
  }).pipe(Effect.scoped),
);

it.effect(
  "refines live origin SSH accounts by requested web authority without accepting a caller override",
  () =>
    Effect.gen(function* () {
      const remoteUrl = "git@forge.example.test:team/repo.git";
      const logins = [
        {
          name: "first",
          url: "https://forge.example.test:3000",
          user: "synthetic-first",
          default: "false",
          ssh_host: "forge.example.test",
        },
        {
          name: "second",
          url: "https://forge.example.test:4000",
          user: "synthetic-second",
          default: "false",
          ssh_host: "forge.example.test",
        },
      ];
      const registry = yield* makeRegistry({
        remotes: [{ name: "origin", url: remoteUrl }],
        forgejo: { listLogins: () => Effect.succeed(logins) },
      });
      const context = {
        remoteName: "origin",
        remoteUrl,
        provider: {
          kind: SourceControlProviderKind.make("unknown"),
          name: "Forgejo",
          baseUrl: "https://forge.example.test",
        },
      };
      for (const port of [3000, 4000]) {
        const handle = yield* registry.resolveHandle({
          cwd: "/repo",
          context: { ...context, requestedHost: `forge.example.test:${port}` },
        });
        assert.strictEqual(handle.provider.kind, "forgejo");
        assert.strictEqual(handle.context?.provider.baseUrl, `https://forge.example.test:${port}`);
        assert.strictEqual(handle.context?.remoteUrl, remoteUrl);
      }
      for (const foreign of [
        { ...context, remoteName: "upstream", requestedHost: "forge.example.test:4000" },
        {
          ...context,
          remoteUrl: "git@forge.example.test:foreign/repo.git",
          requestedHost: "forge.example.test:4000",
        },
        { ...context, requestedHost: "foreign.example.test:4000" },
      ]) {
        const handle = yield* registry.resolveHandle({ cwd: "/repo", context: foreign });
        assert.strictEqual(handle.context?.provider.kind, "unknown");
        assert.strictEqual(handle.context?.remoteUrl, remoteUrl);
      }
    }),
);

it.effect.each([
  { name: "a credential", credential: "found", expected: "github" },
  { name: "a host turned off in Settings", credential: "disabled", expected: "github" },
  { name: "no credential", credential: "missing", expected: "unknown" },
] as const)("resolves custom-host remotes with $name", (scenario) =>
  Effect.gen(function* () {
    const hosts: Array<string> = [];
    const commands: Array<string> = [];
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "git@code.example.test:team/project.git" }],
      process: {
        run: ({ command }) => {
          commands.push(command);
          return Effect.succeed(processOutput(""));
        },
      },
      githubApi: {
        credential: (host) => {
          hosts.push(host);
          return scenario.credential === "found"
            ? Effect.succeed({ token: Redacted.make("token"), fingerprint: `${host}:fingerprint` })
            : scenario.credential === "disabled"
              ? Effect.fail(new GitHubCredentials.GitHubHostDisabledError({ host }))
              : Effect.fail(new GitHubCredentials.GitHubNotSignedInError({ host }));
        },
      },
    });
    const handle = yield* registry.resolveHandle({ cwd: "/repo" });
    assert.strictEqual(handle.provider.kind, SourceControlProviderKind.make(scenario.expected));
    assert.strictEqual(handle.context?.provider.baseUrl, "https://code.example.test");
    assert.deepStrictEqual(hosts, ["code.example.test"]);
    assert.notInclude(commands, "gh");
  }),
);

const notFound = (command: string, cwd: string) =>
  new VcsProcessSpawnError({
    operation: "test",
    command,
    cwd,
    cause: PlatformError.systemError({ _tag: "NotFound", module: "ChildProcess", method: "spawn" }),
  });

const resolveUnknown = (
  registry: SourceControlProviderRegistry.SourceControlProviderRegistry["Service"],
  repository: string,
) =>
  registry.resolveHandle({
    cwd: `/${repository}`,
    context: {
      provider: {
        kind: SourceControlProviderKind.make("unknown"),
        name: "git.example.internal",
        baseUrl: "https://git.example.internal",
      },
      remoteName: "origin",
      remoteUrl: `git@Git.Example.Internal:team/${repository}.git`,
    },
  });

/** The live origin each `resolveUnknown` checkout reports. */
const unknownServerOrigins = (cwd: string) => [
  { name: "origin", url: `git@Git.Example.Internal:team${cwd}.git` },
];

it.effect("asks once for every checkout of a server no integration claims", () =>
  Effect.gen(function* () {
    const asked: Array<string> = [];
    const release = yield* Deferred.make<void>();
    const registry = yield* makeRegistry({
      remotes: [],
      remotesFor: unknownServerOrigins,
      process: {
        run: ({ command, args, cwd }) => {
          asked.push([command, ...args].join(" "));
          return Deferred.await(release).pipe(Effect.andThen(Effect.fail(notFound(command, cwd))));
        },
      },
      githubApi: {
        credential: (host) => {
          asked.push(`credential ${host}`);
          return Effect.fail(new GitHubCredentials.GitHubNotSignedInError({ host }));
        },
      },
      forgejo: {
        listLogins: ({ command = "tea", cwd }) => {
          asked.push(command);
          const cause = notFound(command, cwd);
          return Effect.fail(new ForgejoCli.ForgejoCliError({ command, cwd, detail: "", cause }));
        },
      },
    });

    const started = yield* Effect.forEach(["a", "b", "c"], () => Deferred.make<void>());
    const callers = yield* Effect.forEach(
      ["a", "b", "c"],
      (repository, index) =>
        Deferred.succeed(started[index]!, undefined).pipe(
          Effect.andThen(resolveUnknown(registry, repository)),
        ),
      { concurrency: "unbounded" },
    ).pipe(Effect.forkChild);
    yield* Effect.forEach(started, Deferred.await);
    yield* Deferred.succeed(release, undefined);
    const handles = yield* Fiber.join(callers);
    yield* resolveUnknown(registry, "d");
    assert.deepStrictEqual(
      handles.map((handle) => handle.provider.kind),
      ["unknown", "unknown", "unknown"],
    );
    const once = asked.slice();
    assert.sameMembers(once, [
      "credential git.example.internal",
      "glab auth status --hostname Git.Example.Internal",
      "fj",
      "tea",
    ]);

    yield* TestClock.adjust("5 minutes");
    yield* resolveUnknown(registry, "a");
    assert.deepStrictEqual(asked, [...once, ...once]);
  }),
);

it.effect("asks again after a check that could not answer", () =>
  Effect.gen(function* () {
    let asks = 0;
    const registry = yield* makeRegistry({
      remotes: [],
      remotesFor: unknownServerOrigins,
      process: {
        run: ({ command, cwd }) => {
          asks += 1;
          return Effect.fail(
            new VcsProcessTimeoutError({ operation: "test", command, cwd, timeoutMs: 1 }),
          );
        },
      },
    });
    yield* resolveUnknown(registry, "a");
    yield* resolveUnknown(registry, "b");
    assert.strictEqual(asks, 2);
  }),
);

it.effect("asks again once Settings change", () =>
  Effect.gen(function* () {
    const changes = yield* PubSub.unbounded<typeof DEFAULT_SERVER_SETTINGS>();
    const handled = yield* Deferred.make<void>();
    let signedIn = false;
    const registry = yield* makeRegistry({
      remotes: [],
      remotesFor: unknownServerOrigins,
      settings: {
        subscribeChanges: PubSub.subscribe(changes).pipe(
          Effect.map((subscription) =>
            Stream.fromSubscription(subscription).pipe(
              Stream.flatMap((settings) =>
                Stream.concat(
                  Stream.make(settings),
                  Stream.fromEffectDrain(Deferred.succeed(handled, undefined)),
                ),
              ),
            ),
          ),
        ),
      },
      process: { run: ({ command, cwd }) => Effect.fail(notFound(command, cwd)) },
      githubApi: {
        credential: (host) =>
          signedIn
            ? Effect.succeed({ token: Redacted.make("token"), fingerprint: `${host}:fingerprint` })
            : Effect.fail(new GitHubCredentials.GitHubNotSignedInError({ host })),
      },
    });
    assert.strictEqual((yield* resolveUnknown(registry, "a")).provider.kind, "unknown");
    signedIn = true;
    assert.strictEqual((yield* resolveUnknown(registry, "b")).provider.kind, "unknown");

    yield* PubSub.publish(changes, DEFAULT_SERVER_SETTINGS);
    yield* Deferred.await(handled);
    assert.strictEqual((yield* resolveUnknown(registry, "c")).provider.kind, "github");
  }),
);

// Fork F06: exact-origin change request authority.
it.effect("pins change request operations to the exact origin remote", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [
        { name: "origin", url: "git@github.com:fork/project.git" },
        { name: "upstream", url: "git@github.com:upstream/project.git" },
      ],
    });

    const handle = yield* registry.resolveChangeRequestHandle({ cwd: "/repo" });

    assert.strictEqual(handle.provider.kind, "github");
    assert.strictEqual(handle.context?.remoteName, "origin");
    assert.strictEqual(handle.context?.remoteUrl, "git@github.com:fork/project.git");
  }),
);

it.effect("reauthorizes a change request immediately before provider mutation", () =>
  Effect.gen(function* () {
    const pushUrls = ["git@github.com:fork/project.git"];
    const registry = yield* makeRegistry({
      remotes: [
        {
          name: "origin",
          url: "git@github.com:fork/project.git",
          pushUrls,
        },
      ],
    });
    const handle = yield* registry.resolveChangeRequestHandle({ cwd: "/repo" });
    pushUrls.unshift("git@github.com:upstream/project.git");

    const error = yield* handle.provider
      .createChangeRequest({
        cwd: "/repo",
        baseRefName: "main",
        headSelector: "feature/exact-origin",
        title: "Exact origin",
        bodyFile: "/tmp/body.md",
      })
      .pipe(Effect.flip);

    assert.strictEqual(error.operation, "createChangeRequest");
    assert.include(error.detail, "push repository identities disagree");
  }),
);

it.effect("keeps general resolved providers from bypassing live mutation authority", () =>
  Effect.gen(function* () {
    const pushUrls = ["git@github.com:fork/project.git"];
    const registry = yield* makeRegistry({
      remotes: [
        {
          name: "origin",
          url: "git@github.com:fork/project.git",
          pushUrls,
        },
      ],
    });
    const provider = yield* registry.resolve({ cwd: "/repo" });
    pushUrls.unshift("git@github.com:upstream/project.git");

    const error = yield* provider
      .createChangeRequest({
        cwd: "/repo",
        baseRefName: "main",
        headSelector: "feature/exact-origin",
        title: "Exact origin",
        bodyFile: "/tmp/body.md",
      })
      .pipe(Effect.flip);

    assert.strictEqual(error.operation, "createChangeRequest");
    assert.include(error.detail, "push repository identities disagree");
  }),
);

it.effect("keeps direct provider lookup from exposing an unscoped change request mutation", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "git@github.com:fork/project.git" }],
    });
    const provider = yield* registry.get(SourceControlProviderKind.make("github"));

    const error = yield* provider
      .createChangeRequest({
        cwd: "/repo",
        baseRefName: "main",
        headSelector: "feature/exact-origin",
        title: "Exact origin",
        bodyFile: "/tmp/body.md",
      })
      .pipe(Effect.flip);

    assert.strictEqual(error.operation, "createChangeRequest");
    assert.include(error.detail, "requires an origin source-control context");
  }),
);

it.effect("fails closed when origin is not configured", () =>
  Effect.gen(function* () {
    let linkReads = 0;
    const registry = yield* makeRegistry({
      remotes: [{ name: "upstream", url: "https://github.com/team/project.git" }],
      githubApi: {
        rest: () => {
          linkReads += 1;
          return Effect.succeed({
            status: 200,
            headers: {},
            body: JSON.stringify({ title: "Upstream issue", body: null }),
            truncated: false,
            invalidUtf8: false,
          });
        },
      },
    });

    const provider = yield* registry.resolve({ cwd: "/repo" });
    assert.strictEqual(provider.kind, "unknown");

    // A linked subject in the non-origin remote's repository is never read.
    const lookup = registry.resolveLink({
      cwd: "/repo",
      url: new URL("https://github.com/team/project/issues/1"),
    });
    assert.ok(lookup);
    const error = yield* lookup.pipe(Effect.flip);
    assert.strictEqual(error.operation, "resolveLink");
    assert.strictEqual(linkReads, 0);
  }),
);

it.effect("does not let a caller-selected context override exact origin", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "git@github.com:fork/project.git" }],
      process: {
        run: () =>
          Effect.succeed(
            processOutput(`self-hosted.example.test
  ✓ Logged in to self-hosted.example.test as gitlab-user
`),
          ),
      },
    });

    const handle = yield* registry.resolveHandle({
      cwd: "/repo",
      context: {
        provider: {
          kind: SourceControlProviderKind.make("unknown"),
          name: "self-hosted.example.test",
          baseUrl: "https://self-hosted.example.test",
        },
        remoteName: "upstream",
        remoteUrl: "https://self-hosted.example.test/group/project.git",
      },
    });

    assert.strictEqual(handle.context?.provider.kind, "github");
    assert.strictEqual(handle.context?.remoteName, "origin");
  }),
);

it.effect("rejects change request operations when exact origin is absent", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "upstream", url: "git@github.com:upstream/project.git" }],
    });

    const error = yield* registry.resolveChangeRequestHandle({ cwd: "/repo" }).pipe(Effect.flip);
    assert.strictEqual(error.operation, "resolveChangeRequestHandle");
    assert.include(error.detail, "requires an origin remote");
  }),
);

it.effect("rejects change request operations when origin fetch and push identities differ", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [
        {
          name: "origin",
          url: "git@github.com:fork/project.git",
          pushUrl: "git@github.com:upstream/project.git",
        },
      ],
    });

    const error = yield* registry.resolveChangeRequestHandle({ cwd: "/repo" }).pipe(Effect.flip);
    assert.include(error.detail, "push repository identities disagree");
  }),
);

it.effect("rejects an unsafe first origin push URL even when the summarized URL is safe", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [
        {
          name: "origin",
          url: "git@github.com:fork/project.git",
          pushUrls: ["git@github.com:upstream/project.git", "git@github.com:fork/project.git"],
        },
      ],
    });

    const error = yield* registry.resolveChangeRequestHandle({ cwd: "/repo" }).pipe(Effect.flip);

    assert.include(error.detail, "push repository identities disagree");
  }),
);

it.effect("rebinds an empty caller provider hint to live origin", () =>
  Effect.gen(function* () {
    const hosts: string[] = [];
    const remoteUrl = "git@githubenterprise.dev.example.com:team/workspace.git";
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: remoteUrl }],
      githubApi: {
        credential: (host) => {
          hosts.push(host);
          return Effect.succeed({
            token: Redacted.make("token"),
            fingerprint: `${host}:fingerprint`,
          });
        },
      },
    });
    const context = {
      provider: { kind: SourceControlProviderKind.make("unknown"), name: "Unknown", baseUrl: "" },
      remoteName: "origin",
      remoteUrl,
    };
    const unresolved = yield* registry.resolveHandle({ cwd: "/repo", context });
    assert.strictEqual(unresolved.context?.remoteUrl, remoteUrl);
    assert.strictEqual(unresolved.context?.provider.kind, "github");
    assert.deepStrictEqual(hosts, ["githubenterprise.dev.example.com"]);

    const resolved = yield* registry.resolveHandle({ cwd: "/repo" });
    assert.strictEqual(resolved.provider.kind, "github");
    assert.strictEqual(
      resolved.context?.provider.baseUrl,
      "https://githubenterprise.dev.example.com",
    );
    // The upstream unknown-remote cache answers the second lookup.
    assert.deepStrictEqual(hosts, ["githubenterprise.dev.example.com"]);
  }),
);
