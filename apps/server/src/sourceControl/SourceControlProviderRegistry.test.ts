import { assert, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { expect, vi } from "vitest";

import { GitHubCli, type GitHubCliShape } from "../git/Services/GitHubCli.ts";
import { AzureDevOpsCli, type AzureDevOpsCliShape } from "./AzureDevOpsCli.ts";
import { BitbucketApi, type BitbucketApiShape } from "./BitbucketApi.ts";
import { GitLabCli, type GitLabCliShape } from "./GitLabCli.ts";
import { ServerConfig, type ServerConfigShape } from "../config.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { make } from "./SourceControlProviderRegistry.ts";

function makeServerConfig(): ServerConfigShape {
  return {
    logLevel: "Error",
    traceMinLevel: "Info",
    traceTimingEnabled: true,
    traceBatchWindowMs: 200,
    traceMaxBytes: 10 * 1024 * 1024,
    traceMaxFiles: 10,
    otlpTracesUrl: undefined,
    otlpMetricsUrl: undefined,
    otlpExportIntervalMs: 10_000,
    otlpServiceName: "t3-server",
    mode: "web",
    port: 0,
    host: undefined,
    cwd: "/repo",
    baseDir: "/tmp/t3-test",
    staticDir: undefined,
    devUrl: undefined,
    noBrowser: false,
    authToken: undefined,
    desktopBootstrapToken: undefined,
    autoBootstrapProjectFromCwd: false,
    logWebSocketEvents: false,
    stateDir: "/tmp/t3-test/userdata",
    dbPath: "/tmp/t3-test/userdata/state.sqlite",
    environmentIdPath: "/tmp/t3-test/userdata/environment-id",
    keybindingsConfigPath: "/tmp/t3-test/userdata/keybindings.json",
    settingsPath: "/tmp/t3-test/userdata/settings.json",
    providerStatusCacheDir: "/tmp/t3-test/caches",
    worktreesDir: "/tmp/t3-test/worktrees",
    attachmentsDir: "/tmp/t3-test/userdata/attachments",
    logsDir: "/tmp/t3-test/userdata/logs",
    serverLogPath: "/tmp/t3-test/userdata/logs/server.log",
    serverTracePath: "/tmp/t3-test/userdata/logs/server.trace.ndjson",
    providerLogsDir: "/tmp/t3-test/userdata/logs/provider",
    providerEventLogPath: "/tmp/t3-test/userdata/logs/provider/events.log",
    terminalLogsDir: "/tmp/t3-test/userdata/logs/terminals",
    anonymousIdPath: "/tmp/t3-test/userdata/anonymous-id",
    secretsDir: "/tmp/t3-test/userdata/secrets",
  };
}

function makeVcsProcess(
  overrides?: Partial<VcsProcess.VcsProcessShape>,
): VcsProcess.VcsProcessShape {
  return {
    withProcess: () => Effect.die("not implemented in test"),
    run: () => Effect.succeed(makeVcsProcessOutput()),
    ...overrides,
  };
}

function makeVcsProcessOutput(
  overrides?: Partial<VcsProcess.VcsProcessOutput>,
): VcsProcess.VcsProcessOutput {
  return {
    exitCode: 0 as VcsProcess.VcsProcessOutput["exitCode"],
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    ...overrides,
  };
}

function makeGitHubCli(overrides?: Partial<GitHubCliShape>): GitHubCliShape {
  return {
    execute: () =>
      Effect.succeed({
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        timedOut: false,
      }),
    listOpenPullRequests: () => Effect.succeed([]),
    getPullRequest: () => Effect.die("not implemented in test"),
    getRepositoryCloneUrls: () => Effect.die("not implemented in test"),
    createRepository: () => Effect.die("not implemented in test"),
    createPullRequest: () => Effect.void,
    getDefaultBranch: () => Effect.succeed("main"),
    checkoutPullRequest: () => Effect.void,
    getStatus: () => Effect.die("not implemented in test"),
    login: () => Effect.die("not implemented in test"),
    listIssues: () => Effect.die("not implemented in test"),
    createIssue: () => Effect.die("not implemented in test"),
    closeIssue: () => Effect.die("not implemented in test"),
    reopenIssue: () => Effect.die("not implemented in test"),
    ...overrides,
  };
}

function makeGitLabCli(): GitLabCliShape {
  return {
    execute: () => Effect.die("not implemented in test"),
    listMergeRequests: () => Effect.succeed([]),
    getMergeRequest: () => Effect.die("not implemented in test"),
    getRepositoryCloneUrls: () => Effect.die("not implemented in test"),
    createRepository: () => Effect.die("not implemented in test"),
    createMergeRequest: () => Effect.void,
    getDefaultBranch: () => Effect.succeed("main"),
    checkoutMergeRequest: () => Effect.void,
  };
}

function makeAzureDevOpsCli(): AzureDevOpsCliShape {
  return {
    execute: () => Effect.die("not implemented in test"),
    listPullRequests: () => Effect.succeed([]),
    getPullRequest: () => Effect.die("not implemented in test"),
    getRepositoryCloneUrls: () => Effect.die("not implemented in test"),
    createRepository: () => Effect.die("not implemented in test"),
    createPullRequest: () => Effect.void,
    getDefaultBranch: () => Effect.succeed("main"),
    checkoutPullRequest: () => Effect.void,
  };
}

function makeBitbucketApi(): BitbucketApiShape {
  return {
    probeAuth: Effect.succeed({
      status: "unknown",
      account: Option.none(),
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
  };
}

function makeRegistry(input?: {
  vcsProcess?: Partial<VcsProcess.VcsProcessShape>;
  gitHubCli?: Partial<GitHubCliShape>;
}) {
  return make().pipe(
    Effect.provideService(ServerConfig, makeServerConfig()),
    Effect.provideService(VcsProcess.VcsProcess, makeVcsProcess(input?.vcsProcess)),
    Effect.provideService(GitHubCli, makeGitHubCli(input?.gitHubCli)),
    Effect.provideService(GitLabCli, makeGitLabCli()),
    Effect.provideService(AzureDevOpsCli, makeAzureDevOpsCli()),
    Effect.provideService(BitbucketApi, makeBitbucketApi()),
  );
}

it.effect("binds github operations through the resolved provider handle", () =>
  Effect.gen(function* () {
    const listOpenPullRequests = vi.fn(() =>
      Effect.succeed([
        {
          number: 42,
          title: "Improve source control substrate",
          url: "https://github.com/JerkyTreats/t3code/pull/42",
          baseRefName: "main",
          headRefName: "feature/source-control",
          state: "open" as const,
          isCrossRepository: false,
          headRepositoryNameWithOwner: "JerkyTreats/t3code",
          headRepositoryOwnerLogin: "JerkyTreats",
        },
      ]),
    );
    const registry = yield* makeRegistry({
      vcsProcess: {
        run: vi.fn(() =>
          Effect.succeed(
            makeVcsProcessOutput({
              stdout:
                "origin\thttps://github.com/JerkyTreats/t3code.git (fetch)\norigin\thttps://github.com/JerkyTreats/t3code.git (push)\n",
            }),
          ),
        ),
      },
      gitHubCli: {
        listOpenPullRequests,
      },
    });

    const handle = yield* registry.resolveHandle({ cwd: "/repo" });
    assert.equal(handle.context?.provider.kind, "github");
    assert.equal(handle.context?.remoteName, "origin");

    const changeRequests = yield* handle.provider.listChangeRequests({
      cwd: "/repo",
      headSelector: "feature/source-control",
      state: "open",
    });

    assert.equal(changeRequests.length, 1);
    assert.equal(changeRequests[0]?.provider, "github");
    assert.equal(changeRequests[0]?.number, 42);
    assert.equal(changeRequests[0]?.title, "Improve source control substrate");
    assert.equal(Option.isNone(changeRequests[0]?.updatedAt ?? Option.none()), true);
    expect(listOpenPullRequests).toHaveBeenCalledWith({
      cwd: "/repo",
      headSelector: "feature/source-control",
    });
  }),
);

it.effect("delegates github default-branch lookups through the registry", () =>
  Effect.gen(function* () {
    const getDefaultBranch = vi.fn(() => Effect.succeed("develop"));
    const registry = yield* makeRegistry({
      gitHubCli: {
        getDefaultBranch,
      },
    });

    const provider = yield* registry.get("github");
    const branch = yield* provider.getDefaultBranch({ cwd: "/repo" });

    assert.equal(branch, "develop");
    expect(getDefaultBranch).toHaveBeenCalledWith({ cwd: "/repo" });
  }),
);

it.effect("registers non-github providers for workflows", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry();
    const provider = yield* registry.get("gitlab");

    const branch = yield* provider.getDefaultBranch({ cwd: "/repo" });

    assert.equal(branch, "main");
  }),
);
