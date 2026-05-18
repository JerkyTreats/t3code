import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import { expect, vi } from "vitest";
import {
  GitCommandError,
  SourceControlProviderError,
  type SourceControlProviderKind,
  type SourceControlRepositoryCloneUrls,
  type SourceControlRepositoryVisibility,
} from "@t3tools/contracts";

import { ServerConfig } from "../config.ts";
import { GitCore, type GitCoreShape } from "../git/Services/GitCore.ts";
import * as SourceControlProvider from "./SourceControlProvider.ts";
import * as SourceControlProviderRegistry from "./SourceControlProviderRegistry.ts";
import { make } from "./SourceControlRepositoryService.ts";

const githubCloneUrls: SourceControlRepositoryCloneUrls = {
  nameWithOwner: "JerkyTreats/t3code",
  url: "https://github.com/JerkyTreats/t3code",
  sshUrl: "git@github.com:JerkyTreats/t3code.git",
};

const gitCommandResult = {
  code: 0,
  stdout: "",
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
};

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
    execute: () => Effect.succeed(gitCommandResult),
    status: () => Effect.die("not implemented in test"),
    statusDetails: () =>
      Effect.succeed({
        isRepo: true,
        hasOriginRemote: true,
        isDefaultBranch: false,
        branch: "main",
        hasWorkingTreeChanges: false,
        workingTree: { files: [], insertions: 0, deletions: 0 },
        hasUpstream: false,
        aheadCount: 0,
        behindCount: 0,
        upstreamRef: null,
      }),
    statusDetailsLocal: () => Effect.die("not implemented in test"),
    prepareCommitContext: () => Effect.die("not implemented in test"),
    commit: () => Effect.die("not implemented in test"),
    pushCurrentBranch: () =>
      Effect.succeed({
        status: "pushed",
        branch: "main",
        upstreamBranch: "origin/main",
        setUpstream: true,
      }),
    readRangeContext: () => Effect.die("not implemented in test"),
    readConfigValue: () => Effect.die("not implemented in test"),
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

function makeProvider(overrides?: Partial<SourceControlProvider.SourceControlProviderShape>) {
  return SourceControlProvider.SourceControlProvider.of({
    kind: "github",
    listChangeRequests: () => Effect.die("not implemented in test"),
    getChangeRequest: () => Effect.die("not implemented in test"),
    createChangeRequest: () => Effect.die("not implemented in test"),
    getRepositoryCloneUrls: () => Effect.succeed(githubCloneUrls),
    createRepository: () => Effect.succeed(githubCloneUrls),
    getDefaultBranch: () => Effect.succeed("main"),
    checkoutChangeRequest: () => Effect.die("not implemented in test"),
    ...overrides,
  });
}

function providerNotRegistered(kind: SourceControlProviderKind) {
  return new SourceControlProviderError({
    provider: kind,
    operation: "get",
    detail: `Provider ${kind} is not configured in this test.`,
  });
}

function makeRegistry(
  provider: SourceControlProvider.SourceControlProviderShape,
): SourceControlProviderRegistry.SourceControlProviderRegistryShape {
  return {
    get: (kind) =>
      kind === provider.kind ? Effect.succeed(provider) : Effect.fail(providerNotRegistered(kind)),
    resolveHandle: () =>
      Effect.succeed({
        provider,
        context: null,
      }),
    resolve: () => Effect.succeed(provider),
    discover: Effect.succeed([]),
  };
}

function makeService(input?: {
  readonly cwd?: string;
  readonly gitCore?: Partial<GitCoreShape>;
  readonly provider?: SourceControlProvider.SourceControlProviderShape;
}) {
  const provider = input?.provider ?? makeProvider();
  return make().pipe(
    Effect.provideService(GitCore, makeGitCore(input?.gitCore)),
    Effect.provideService(
      SourceControlProviderRegistry.SourceControlProviderRegistry,
      makeRegistry(provider),
    ),
    Effect.provide(
      ServerConfig.layerTest(input?.cwd ?? process.cwd(), {
        prefix: "t3-source-control-repository-service-",
      }),
    ),
  );
}

it.layer(NodeServices.layer)("SourceControlRepositoryService", (it) => {
  it.effect("looks up repository clone URLs through the selected provider", () =>
    Effect.gen(function* () {
      const getRepositoryCloneUrls = vi.fn(() => Effect.succeed(githubCloneUrls));
      const service = yield* makeService({
        cwd: "/workspace",
        provider: makeProvider({
          getRepositoryCloneUrls,
        }),
      });

      const result = yield* service.lookupRepository({
        provider: "github",
        repository: "  JerkyTreats/t3code  ",
      });

      expect(result).toEqual({
        provider: "github",
        nameWithOwner: "JerkyTreats/t3code",
        url: "https://github.com/JerkyTreats/t3code",
        sshUrl: "git@github.com:JerkyTreats/t3code.git",
      });
      expect(getRepositoryCloneUrls).toHaveBeenCalledWith({
        cwd: "/workspace",
        repository: "JerkyTreats/t3code",
      });
    }),
  );

  it.effect("clones provider repositories using looked up SSH URLs by default", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tempDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-source-control-clone-",
      });
      const destinationPath = path.join(tempDir, "parent", "t3code");
      const execute = vi.fn(() => Effect.succeed(gitCommandResult));
      const getRepositoryCloneUrls = vi.fn(() => Effect.succeed(githubCloneUrls));
      const service = yield* makeService({
        gitCore: { execute },
        provider: makeProvider({ getRepositoryCloneUrls }),
      });

      const result = yield* service.cloneRepository({
        provider: "github",
        repository: "JerkyTreats/t3code",
        destinationPath,
      });

      expect(result).toEqual({
        cwd: destinationPath,
        remoteUrl: "git@github.com:JerkyTreats/t3code.git",
        repository: {
          provider: "github",
          nameWithOwner: "JerkyTreats/t3code",
          url: "https://github.com/JerkyTreats/t3code",
          sshUrl: "git@github.com:JerkyTreats/t3code.git",
        },
      });
      expect(getRepositoryCloneUrls).toHaveBeenCalledWith({
        cwd: path.dirname(destinationPath),
        repository: "JerkyTreats/t3code",
      });
      expect(execute).toHaveBeenCalledWith({
        operation: "SourceControlRepositoryService.cloneRepository",
        cwd: path.dirname(destinationPath),
        args: ["clone", "git@github.com:JerkyTreats/t3code.git", "t3code"],
        timeoutMs: 120_000,
        maxOutputBytes: 256 * 1024,
      });
    }),
  );

  it.effect("clones raw Git URLs without provider lookup", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const tempDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-source-control-clone-url-",
      });
      const destinationPath = path.join(tempDir, "clone");
      const execute = vi.fn(() => Effect.succeed(gitCommandResult));
      const getRepositoryCloneUrls = vi.fn(() => Effect.succeed(githubCloneUrls));
      const service = yield* makeService({
        gitCore: { execute },
        provider: makeProvider({ getRepositoryCloneUrls }),
      });

      const result = yield* service.cloneRepository({
        remoteUrl: "https://example.com/repo.git",
        destinationPath,
      });

      assert.equal(result.cwd, destinationPath);
      assert.equal(result.remoteUrl, "https://example.com/repo.git");
      assert.equal(result.repository, null);
      expect(getRepositoryCloneUrls).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledWith({
        operation: "SourceControlRepositoryService.cloneRepository",
        cwd: tempDir,
        args: ["clone", "https://example.com/repo.git", "clone"],
        timeoutMs: 120_000,
        maxOutputBytes: 256 * 1024,
      });
    }),
  );

  it.effect("rejects empty destination paths before cloning", () =>
    Effect.gen(function* () {
      const execute = vi.fn(() => Effect.succeed(gitCommandResult));
      const service = yield* makeService({
        gitCore: { execute },
      });

      const error = yield* service
        .cloneRepository({
          remoteUrl: "https://example.com/repo.git",
          destinationPath: "   ",
        })
        .pipe(Effect.flip);

      assert.equal(error.operation, "cloneRepository");
      assert.equal(error.detail, "Choose a destination path before cloning.");
      expect(execute).not.toHaveBeenCalled();
    }),
  );

  it.effect("rejects non-empty existing clone destinations", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const destinationPath = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "t3-source-control-non-empty-",
      });
      yield* fileSystem.writeFileString(path.join(destinationPath, "README.md"), "already here\n");
      const execute = vi.fn(() => Effect.succeed(gitCommandResult));
      const service = yield* makeService({
        gitCore: { execute },
      });

      const error = yield* service
        .cloneRepository({
          remoteUrl: "https://example.com/repo.git",
          destinationPath,
        })
        .pipe(Effect.flip);

      assert.equal(error.operation, "cloneRepository");
      assert.equal(error.detail, "Destination path already exists and is not empty.");
      expect(execute).not.toHaveBeenCalled();
    }),
  );

  it.effect("publishes committed repositories to the remote returned by ensureRemote", () =>
    Effect.gen(function* () {
      const createRepository = vi.fn(
        (input: {
          readonly cwd: string;
          readonly repository: string;
          readonly visibility: SourceControlRepositoryVisibility;
        }) => {
          assert.equal(input.repository, "JerkyTreats/t3code");
          assert.equal(input.visibility, "private");
          return Effect.succeed(githubCloneUrls);
        },
      );
      const ensureRemote = vi.fn(() => Effect.succeed("upstream"));
      const pushCurrentBranch = vi.fn(() =>
        Effect.succeed({
          status: "pushed" as const,
          branch: "feature/source-control",
          upstreamBranch: "upstream/feature/source-control",
          setUpstream: true,
        }),
      );
      const service = yield* makeService({
        provider: makeProvider({ createRepository }),
        gitCore: {
          ensureRemote,
          execute: () => Effect.succeed(gitCommandResult),
          pushCurrentBranch,
        },
      });

      const result = yield* service.publishRepository({
        provider: "github",
        cwd: "/repo",
        repository: "  JerkyTreats/t3code  ",
        visibility: "private",
        protocol: "ssh",
        remoteName: "origin",
      });

      expect(result).toEqual({
        repository: {
          provider: "github",
          nameWithOwner: "JerkyTreats/t3code",
          url: "https://github.com/JerkyTreats/t3code",
          sshUrl: "git@github.com:JerkyTreats/t3code.git",
        },
        remoteName: "upstream",
        remoteUrl: "git@github.com:JerkyTreats/t3code.git",
        branch: "feature/source-control",
        upstreamBranch: "upstream/feature/source-control",
        status: "pushed",
      });
      expect(ensureRemote).toHaveBeenCalledWith({
        cwd: "/repo",
        preferredName: "origin",
        url: "git@github.com:JerkyTreats/t3code.git",
      });
      expect(pushCurrentBranch).toHaveBeenCalledWith("/repo", null, { remoteName: "upstream" });
    }),
  );

  it.effect("adds the remote without pushing when the local repository has no commits", () =>
    Effect.gen(function* () {
      const ensureRemote = vi.fn(() => Effect.succeed("origin"));
      const pushCurrentBranch = vi.fn(() =>
        Effect.succeed({
          status: "pushed" as const,
          branch: "main",
        }),
      );
      const service = yield* makeService({
        gitCore: {
          ensureRemote,
          execute: (input) =>
            input.args.join(" ") === "rev-parse --verify HEAD"
              ? Effect.fail(gitError(input.operation, input.cwd, "no commits"))
              : Effect.succeed(gitCommandResult),
          statusDetails: () =>
            Effect.succeed({
              isRepo: true,
              hasOriginRemote: false,
              isDefaultBranch: true,
              branch: "main",
              hasWorkingTreeChanges: false,
              workingTree: { files: [], insertions: 0, deletions: 0 },
              hasUpstream: false,
              aheadCount: 0,
              behindCount: 0,
              upstreamRef: null,
            }),
          pushCurrentBranch,
        },
      });

      const result = yield* service.publishRepository({
        provider: "github",
        cwd: "/empty",
        repository: "JerkyTreats/t3code",
        visibility: "public",
        protocol: "https",
      });

      expect(result).toEqual({
        repository: {
          provider: "github",
          nameWithOwner: "JerkyTreats/t3code",
          url: "https://github.com/JerkyTreats/t3code",
          sshUrl: "git@github.com:JerkyTreats/t3code.git",
        },
        remoteName: "origin",
        remoteUrl: "https://github.com/JerkyTreats/t3code",
        branch: "main",
        status: "remote_added",
      });
      expect(ensureRemote).toHaveBeenCalledWith({
        cwd: "/empty",
        preferredName: "origin",
        url: "https://github.com/JerkyTreats/t3code",
      });
      expect(pushCurrentBranch).not.toHaveBeenCalled();
    }),
  );
});
