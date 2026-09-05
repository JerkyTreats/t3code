import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import { ChildProcessSpawner } from "effect/unstable/process";

import { GitCommandError, SourceControlProviderError } from "@t3tools/contracts";

import * as ServerConfig from "../config.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import type * as SourceControlProvider from "./SourceControlProvider.ts";
import * as SourceControlProviderRegistry from "./SourceControlProviderRegistry.ts";
import * as SourceControlRepositoryService from "./SourceControlRepositoryService.ts";

const CLONE_URLS = {
  nameWithOwner: "octocat/t3code",
  url: "https://github.com/octocat/t3code",
  sshUrl: "git@github.com:octocat/t3code.git",
};

const ENTERPRISE_CLONE_URLS = {
  nameWithOwner: "octocat/t3code",
  url: "https://github.example.test/octocat/t3code",
  sshUrl: "git@github.example.test:octocat/t3code.git",
};

function makeProvider(
  overrides: Partial<SourceControlProvider.SourceControlProvider["Service"]> = {},
): SourceControlProvider.SourceControlProvider["Service"] {
  const unsupported = (operation: string) =>
    Effect.die(`unexpected provider operation ${operation}`) as Effect.Effect<
      never,
      SourceControlProviderError
    >;

  return {
    kind: "github",
    listChangeRequests: () => unsupported("listChangeRequests"),
    getChangeRequest: () => unsupported("getChangeRequest"),
    createChangeRequest: () => unsupported("createChangeRequest"),
    getRepositoryCloneUrls: () => Effect.succeed(CLONE_URLS),
    createRepository: () => Effect.succeed(CLONE_URLS),
    getDefaultBranch: () => Effect.succeed(null),
    checkoutChangeRequest: () => unsupported("checkoutChangeRequest"),
    ...overrides,
  };
}

function processOutput(): GitVcsDriver.ExecuteGitResult {
  return {
    exitCode: ChildProcessSpawner.ExitCode(0),
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

function makeLayer(input: {
  readonly provider?: SourceControlProvider.SourceControlProvider["Service"];
  readonly git?: Partial<GitVcsDriver.GitVcsDriver["Service"]>;
  readonly fileSystem?: FileSystem.FileSystem;
}) {
  const serviceLayer = SourceControlRepositoryService.layer.pipe(
    Layer.provide(
      Layer.mock(SourceControlProviderRegistry.SourceControlProviderRegistry)({
        get: () => Effect.succeed(input.provider ?? makeProvider()),
      }),
    ),
    Layer.provide(
      Layer.mock(GitVcsDriver.GitVcsDriver)({
        execute: (call) =>
          call.args[0] === "remote" && call.args[1] === "get-url" && input.git?.readConfigValue
            ? input.git
                .readConfigValue(call.cwd, "remote.origin.url")
                .pipe(Effect.map((url) => ({ ...processOutput(), stdout: url ?? "" })))
            : Effect.succeed(processOutput()),
        readConfigValue: () => Effect.succeed(null),
        pushCurrentBranch: () =>
          Effect.succeed({
            status: "pushed" as const,
            branch: "feature/remote-v1",
            upstreamBranch: "origin/feature/remote-v1",
            setUpstream: true,
          }),
        ...input.git,
      }),
    ),
    Layer.provide(
      ServerConfig.layerTest(
        process.cwd(),
        input.fileSystem ? "/tmp/t3-source-control-repos" : { prefix: "t3-source-control-repos-" },
      ),
    ),
  );

  return input.fileSystem
    ? serviceLayer.pipe(
        Layer.provide(Layer.succeed(FileSystem.FileSystem, input.fileSystem)),
        Layer.provideMerge(NodePath.layer),
      )
    : serviceLayer.pipe(Layer.provideMerge(NodeServices.layer));
}

it.effect("looks up repositories through the requested provider and exact endpoint", () => {
  const calls: Array<{ cwd: string; providerBaseUrl?: string; repository: string }> = [];
  const provider = makeProvider({
    getRepositoryCloneUrls: (input) =>
      Effect.sync(() => {
        calls.push({
          cwd: input.cwd,
          ...(input.providerBaseUrl ? { providerBaseUrl: input.providerBaseUrl } : {}),
          repository: input.repository,
        });
        return ENTERPRISE_CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const result = yield* service.lookupRepository({
      provider: "github",
      providerBaseUrl: "https://github.example.test",
      repository: "octocat/t3code",
      cwd: "/workspace",
    });

    assert.deepStrictEqual(result, { provider: "github", ...ENTERPRISE_CLONE_URLS });
    assert.deepStrictEqual(calls, [
      {
        cwd: "/workspace",
        providerBaseUrl: "https://github.example.test",
        repository: "octocat/t3code",
      },
    ]);
  }).pipe(Effect.provide(makeLayer({ provider })));
});

it.effect("rejects an enterprise lookup when one returned clone URL targets another host", () => {
  const provider = makeProvider({
    getRepositoryCloneUrls: () =>
      Effect.succeed({
        ...ENTERPRISE_CLONE_URLS,
        sshUrl: CLONE_URLS.sshUrl,
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .lookupRepository({
        provider: "github",
        providerBaseUrl: "https://github.example.test",
        repository: "octocat/t3code",
        cwd: "/workspace",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "do not match the selected provider endpoint and repository");
  }).pipe(Effect.provide(makeLayer({ provider })));
});

it.effect("preserves provider failures without deriving the repository message from them", () => {
  const providerCause = new SourceControlProviderError({
    provider: "github",
    operation: "getRepositoryCloneUrls",
    cwd: "/workspace",
    repository: "octocat/t3code",
    detail: "credential token abc123 was rejected",
  });
  const provider = makeProvider({
    getRepositoryCloneUrls: () => Effect.fail(providerCause),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* Effect.flip(
      service.lookupRepository({
        provider: "github",
        providerBaseUrl: "https://github.example.test",
        repository: "octocat/t3code",
        cwd: "/workspace",
      }),
    );

    assert.strictEqual(error.provider, "github");
    assert.strictEqual(error.operation, "lookupRepository");
    assert.strictEqual(error.detail, "The source control operation could not be completed.");
    assert.strictEqual(
      error.message,
      "Source control repository operation lookupRepository failed for github: The source control operation could not be completed.",
    );
    assert.strictEqual(error.cause, providerCause);
  }).pipe(Effect.provide(makeLayer({ provider })));
});

it.effect("clones a looked-up repository into the requested destination", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const parent = yield* fs.makeTempDirectoryScoped({
      prefix: "t3-source-control-clone-parent-",
    });
    const destinationPath = path.join(parent, "t3code");
    const cloneCalls: Array<{ cwd: string; args: ReadonlyArray<string> }> = [];

    yield* Effect.gen(function* () {
      const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
      const result = yield* service.cloneRepository({
        provider: "github",
        providerBaseUrl: "https://github.com",
        repository: "octocat/t3code",
        destinationPath,
        protocol: "https",
      });

      assert.deepStrictEqual(result, {
        cwd: destinationPath,
        remoteUrl: CLONE_URLS.url,
        repository: { provider: "github", ...CLONE_URLS },
      });
      assert.deepStrictEqual(cloneCalls, [
        {
          cwd: parent,
          args: ["clone", CLONE_URLS.url, "t3code"],
        },
      ]);
    }).pipe(
      Effect.provide(
        makeLayer({
          git: {
            execute: (input) =>
              Effect.sync(() => {
                cloneCalls.push({ cwd: input.cwd, args: input.args });
                return processOutput();
              }),
          },
        }),
      ),
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("preserves destination probe failures instead of treating them as missing paths", () => {
  const fileSystemCause = PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method: "exists",
    pathOrDescriptor: "/restricted/t3code",
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* Effect.flip(
      service.cloneRepository({
        remoteUrl: CLONE_URLS.sshUrl,
        destinationPath: "/restricted/t3code",
      }),
    );

    assert.strictEqual(error.provider, "unknown");
    assert.strictEqual(error.operation, "cloneRepository");
    assert.strictEqual(error.cause, fileSystemCause);
  }).pipe(
    Effect.provide(
      makeLayer({
        fileSystem: FileSystem.makeNoop({
          exists: () => Effect.fail(fileSystemCause),
          makeDirectory: () => Effect.void,
        }),
      }),
    ),
  );
});

it.effect(
  "rejects an enterprise creation result for another repository before Git mutation",
  () => {
    let addOriginCalls = 0;
    let pushCalls = 0;
    const provider = makeProvider({
      createRepository: () =>
        Effect.succeed({
          ...ENTERPRISE_CLONE_URLS,
          sshUrl: "git@github.example.test:attacker/t3code.git",
        }),
    });

    return Effect.gen(function* () {
      const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
      const error = yield* service
        .publishRepository({
          cwd: "/workspace",
          provider: "github",
          providerBaseUrl: "https://github.example.test",
          repository: "octocat/t3code",
          visibility: "private",
          remoteName: "origin",
          protocol: "ssh",
        })
        .pipe(Effect.flip);

      assert.include(error.detail, "do not match the selected provider endpoint and repository");
      assert.equal(addOriginCalls, 0);
      assert.equal(pushCalls, 0);
    }).pipe(
      Effect.provide(
        makeLayer({
          provider,
          git: {
            execute: (input) =>
              Effect.sync(() => {
                if (input.args[0] === "remote" && input.args[1] === "add") addOriginCalls += 1;
                return processOutput();
              }),
            pushCurrentBranch: () =>
              Effect.sync(() => {
                pushCalls += 1;
                return {
                  status: "pushed" as const,
                  branch: "feature/remote-v1",
                  upstreamBranch: "origin/feature/remote-v1",
                  setUpstream: true,
                };
              }),
          },
        }),
      ),
    );
  },
);

it.effect("publishes by creating the repository, adding a remote, and pushing upstream", () => {
  const createCalls: Array<{
    cwd: string;
    providerBaseUrl: string;
    repository: string;
    visibility: string;
  }> = [];
  const remoteCalls: Array<ReadonlyArray<string>> = [];
  const pushCalls: Array<{ cwd: string; remoteName: string | null | undefined }> = [];
  const provider = makeProvider({
    createRepository: (input) =>
      Effect.sync(() => {
        createCalls.push({
          cwd: input.cwd,
          providerBaseUrl: input.providerBaseUrl,
          repository: input.repository,
          visibility: input.visibility,
        });
        return CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const result = yield* service.publishRepository({
      cwd: "/workspace",
      provider: "github",
      providerBaseUrl: "https://github.com",
      repository: "octocat/t3code",
      visibility: "private",
      remoteName: "origin",
      protocol: "ssh",
    });

    assert.deepStrictEqual(result, {
      repository: { provider: "github", ...CLONE_URLS },
      remoteName: "origin",
      remoteUrl: CLONE_URLS.sshUrl,
      branch: "feature/remote-v1",
      upstreamBranch: "origin/feature/remote-v1",
      status: "pushed",
    });
    assert.deepStrictEqual(createCalls, [
      {
        cwd: "/workspace",
        providerBaseUrl: "https://github.com",
        repository: "octocat/t3code",
        visibility: "private",
      },
    ]);
    assert.deepStrictEqual(remoteCalls, [["remote", "add", "origin", CLONE_URLS.sshUrl]]);
    assert.deepStrictEqual(pushCalls, [{ cwd: "/workspace", remoteName: "origin" }]);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          execute: (input) =>
            Effect.sync(() => {
              if (input.args[0] === "remote" && input.args[1] === "add") {
                remoteCalls.push(input.args);
              }
              return processOutput();
            }),
          pushCurrentBranch: (cwd, _fallbackBranch, options) =>
            Effect.sync(() => {
              pushCalls.push({ cwd, remoteName: options?.remoteName });
              return {
                status: "pushed" as const,
                branch: "feature/remote-v1",
                upstreamBranch: "origin/feature/remote-v1",
                setUpstream: true,
              };
            }),
        },
      }),
    ),
  );
});

it.effect("rejects an unusable occupied origin before external repository creation", () => {
  let createCalls = 0;
  let gitMutationCalls = 0;
  let pushCalls = 0;
  const provider = makeProvider({
    createRepository: () =>
      Effect.sync(() => {
        createCalls += 1;
        return CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .publishRepository({
        cwd: "/workspace",
        provider: "github",
        providerBaseUrl: "https://github.com",
        repository: "octocat/t3code",
        visibility: "private",
        remoteName: "origin",
        protocol: "ssh",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "origin exists without a usable fetch URL");
    assert.equal(createCalls, 0);
    assert.equal(gitMutationCalls, 0);
    assert.equal(pushCalls, 0);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          execute: (input) =>
            Effect.sync(() => {
              if (input.args[0] === "remote" && input.args[1] === "add") {
                gitMutationCalls += 1;
              }
              return input.args.length === 1 && input.args[0] === "remote"
                ? { ...processOutput(), stdout: "origin\n" }
                : processOutput();
            }),
          pushCurrentBranch: () =>
            Effect.sync(() => {
              pushCalls += 1;
              return {
                status: "pushed" as const,
                branch: "feature/remote-v1",
                upstreamBranch: "origin/feature/remote-v1",
                setUpstream: true,
              };
            }),
        },
      }),
    ),
  );
});

it.effect("rejects a mismatched provider endpoint before external repository creation", () => {
  let createCalls = 0;
  const provider = makeProvider({
    createRepository: () =>
      Effect.sync(() => {
        createCalls += 1;
        return CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .publishRepository({
        cwd: "/workspace",
        provider: "github",
        providerBaseUrl: "https://gitlab.com",
        repository: "octocat/t3code",
        visibility: "private",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "does not match the selected provider");
    assert.equal(createCalls, 0);
  }).pipe(Effect.provide(makeLayer({ provider })));
});

it.effect("rejects a matching non-origin remote before external repository creation", () => {
  let createCalls = 0;
  let ensureRemoteCalls = 0;
  const provider = makeProvider({
    createRepository: () =>
      Effect.sync(() => {
        createCalls += 1;
        return CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .publishRepository({
        cwd: "/workspace",
        provider: "github",
        providerBaseUrl: "https://github.com",
        repository: "octocat/t3code",
        visibility: "private",
        remoteName: "origin",
        protocol: "ssh",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "non-origin remote");
    assert.equal(createCalls, 0);
    assert.equal(ensureRemoteCalls, 0);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          execute: (input) =>
            input.args[0] === "remote"
              ? Effect.succeed({
                  ...processOutput(),
                  stdout: "upstream\tgit@github.com:octocat/t3code.git (fetch)\n",
                })
              : Effect.succeed(processOutput()),
          ensureRemote: () =>
            Effect.sync(() => {
              ensureRemoteCalls += 1;
              return "origin";
            }),
        },
      }),
    ),
  );
});

it.effect(
  "rejects a matching push-only non-origin remote before external repository creation",
  () => {
    let createCalls = 0;
    let ensureRemoteCalls = 0;
    const provider = makeProvider({
      createRepository: () =>
        Effect.sync(() => {
          createCalls += 1;
          return CLONE_URLS;
        }),
    });

    return Effect.gen(function* () {
      const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
      const error = yield* service
        .publishRepository({
          cwd: "/workspace",
          provider: "github",
          providerBaseUrl: "https://github.com",
          repository: "octocat/t3code",
          visibility: "private",
          remoteName: "origin",
          protocol: "ssh",
        })
        .pipe(Effect.flip);

      assert.include(error.detail, "non-origin remote");
      assert.equal(createCalls, 0);
      assert.equal(ensureRemoteCalls, 0);
    }).pipe(
      Effect.provide(
        makeLayer({
          provider,
          git: {
            execute: (input) =>
              input.args[0] === "remote"
                ? Effect.succeed({
                    ...processOutput(),
                    stdout:
                      "upstream\tgit@github.com:another/project.git (fetch)\nupstream\tgit@github.com:octocat/t3code.git (push)\n",
                  })
                : Effect.succeed(processOutput()),
            ensureRemote: () =>
              Effect.sync(() => {
                ensureRemoteCalls += 1;
                return "origin";
              }),
          },
        }),
      ),
    );
  },
);

it.effect("does not reject the same repository path on another host during preflight", () => {
  let createCalls = 0;
  const enterpriseUrls = {
    ...CLONE_URLS,
    url: "https://git.enterprise.test/octocat/t3code",
    sshUrl: "git@git.enterprise.test:octocat/t3code.git",
  };
  const provider = makeProvider({
    createRepository: () =>
      Effect.sync(() => {
        createCalls += 1;
        return enterpriseUrls;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const result = yield* service.publishRepository({
      cwd: "/workspace",
      provider: "github",
      providerBaseUrl: "https://git.enterprise.test",
      repository: "octocat/t3code",
      visibility: "private",
      remoteName: "origin",
      protocol: "ssh",
    });

    assert.equal(result.remoteUrl, enterpriseUrls.sshUrl);
    assert.equal(createCalls, 1);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          execute: (input) =>
            input.args[0] === "remote" && input.args[1] === "-v"
              ? Effect.succeed({
                  ...processOutput(),
                  stdout: "upstream\tgit@another.enterprise.test:octocat/t3code.git (fetch)\n",
                })
              : Effect.succeed(processOutput()),
        },
      }),
    ),
  );
});

it.effect("includes a non-default endpoint port in publication preflight matching", () => {
  let createCalls = 0;
  const enterpriseUrls = {
    ...CLONE_URLS,
    url: "https://git.enterprise.test:8443/octocat/t3code",
    sshUrl: "ssh://git@git.enterprise.test:8443/octocat/t3code.git",
  };
  const provider = makeProvider({
    createRepository: () =>
      Effect.sync(() => {
        createCalls += 1;
        return enterpriseUrls;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const result = yield* service.publishRepository({
      cwd: "/workspace",
      provider: "github",
      providerBaseUrl: "https://git.enterprise.test:8443",
      repository: "octocat/t3code",
      visibility: "private",
      remoteName: "origin",
      protocol: "ssh",
    });

    assert.equal(result.remoteUrl, enterpriseUrls.sshUrl);
    assert.equal(createCalls, 1);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          execute: (input) =>
            input.args[0] === "remote" && input.args[1] === "-v"
              ? Effect.succeed({
                  ...processOutput(),
                  stdout:
                    "upstream\tssh://git@git.enterprise.test:9443/octocat/t3code.git (fetch)\n",
                })
              : Effect.succeed(processOutput()),
        },
      }),
    ),
  );
});

it.effect("rejects an exact neutral enterprise target on a non-origin remote", () => {
  let createCalls = 0;
  const provider = makeProvider({
    createRepository: () =>
      Effect.sync(() => {
        createCalls += 1;
        return CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .publishRepository({
        cwd: "/workspace",
        provider: "github",
        providerBaseUrl: "https://git.enterprise.test:8443",
        repository: "octocat/t3code",
        visibility: "private",
        remoteName: "origin",
        protocol: "ssh",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "non-origin remote");
    assert.equal(createCalls, 0);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          execute: (input) =>
            input.args[0] === "remote" && input.args[1] === "-v"
              ? Effect.succeed({
                  ...processOutput(),
                  stdout:
                    "upstream\tssh://git@git.enterprise.test:8443/octocat/t3code.git (fetch)\n",
                })
              : Effect.succeed(processOutput()),
        },
      }),
    ),
  );
});

it.effect("rejects an exact Azure target on a non-origin remote", () => {
  let createCalls = 0;
  const provider = makeProvider({
    createRepository: () =>
      Effect.sync(() => {
        createCalls += 1;
        return CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .publishRepository({
        cwd: "/workspace",
        provider: "azure-devops",
        providerBaseUrl: "https://dev.azure.com/org",
        repository: "project/repository",
        visibility: "private",
        remoteName: "origin",
        protocol: "ssh",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "non-origin remote");
    assert.equal(createCalls, 0);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          execute: (input) =>
            input.args[0] === "remote" && input.args[1] === "-v"
              ? Effect.succeed({
                  ...processOutput(),
                  stdout: "upstream\tgit@ssh.dev.azure.com:v3/org/project/repository (fetch)\n",
                })
              : Effect.succeed(processOutput()),
        },
      }),
    ),
  );
});

it.effect("rejects a conflicting origin before external creation or remote mutation", () => {
  let createCalls = 0;
  let ensureRemoteCalls = 0;
  const provider = makeProvider({
    createRepository: () =>
      Effect.sync(() => {
        createCalls += 1;
        return CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .publishRepository({
        cwd: "/workspace",
        provider: "github",
        providerBaseUrl: "https://github.com",
        repository: "octocat/t3code",
        visibility: "private",
        remoteName: "origin",
        protocol: "ssh",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "existing origin does not match");
    assert.equal(createCalls, 0);
    assert.equal(ensureRemoteCalls, 0);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          readConfigValue: (_cwd, key) =>
            Effect.succeed(key === "remote.origin.url" ? "git@github.com:other/project.git" : null),
          ensureRemote: () =>
            Effect.sync(() => {
              ensureRemoteCalls += 1;
              return "origin";
            }),
        },
      }),
    ),
  );
});

it.effect("reuses a matching existing origin without recreating the repository", () => {
  let createCalls = 0;
  const readContexts: Array<SourceControlProvider.SourceControlProviderContext | undefined> = [];
  const provider = makeProvider({
    createRepository: () =>
      Effect.sync(() => {
        createCalls += 1;
        return CLONE_URLS;
      }),
    getRepositoryCloneUrls: (input) =>
      Effect.sync(() => {
        readContexts.push(input.context);
        return CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const result = yield* service.publishRepository({
      cwd: "/workspace",
      provider: "github",
      providerBaseUrl: "https://github.com",
      repository: "octocat/t3code",
      visibility: "private",
      remoteName: "origin",
      protocol: "ssh",
    });

    assert.equal(result.remoteName, "origin");
    assert.equal(createCalls, 0);
    assert.deepStrictEqual(readContexts, [
      {
        provider: {
          kind: "github",
          name: "GitHub",
          baseUrl: "https://github.com",
        },
        remoteName: "origin",
        remoteUrl: CLONE_URLS.url,
      },
    ]);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          readConfigValue: (_cwd, key) =>
            Effect.succeed(
              key === "remote.origin.url"
                ? CLONE_URLS.url
                : key === "remote.origin.pushurl"
                  ? CLONE_URLS.sshUrl
                  : null,
            ),
        },
      }),
    ),
  );
});

it.effect("rejects existing origin reuse against another selected endpoint", () => {
  let readCalls = 0;
  const provider = makeProvider({
    getRepositoryCloneUrls: () =>
      Effect.sync(() => {
        readCalls += 1;
        return CLONE_URLS;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .publishRepository({
        cwd: "/workspace",
        provider: "github",
        providerBaseUrl: "https://github.enterprise.test",
        repository: "octocat/t3code",
        visibility: "private",
        remoteName: "origin",
        protocol: "ssh",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "selected provider endpoint and repository");
    assert.equal(readCalls, 0);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          readConfigValue: (_cwd, key) =>
            Effect.succeed(key === "remote.origin.url" ? CLONE_URLS.url : null),
        },
      }),
    ),
  );
});

it.effect("reuses an explicitly selected neutral enterprise origin", () => {
  const enterpriseUrls = {
    nameWithOwner: "octocat/t3code",
    url: "https://git.enterprise.test:8443/octocat/t3code",
    sshUrl: "ssh://git@git.enterprise.test:8443/octocat/t3code.git",
  };
  const readInputs: Array<{
    readonly repository: string;
    readonly context: SourceControlProvider.SourceControlProviderContext | undefined;
  }> = [];
  const provider = makeProvider({
    getRepositoryCloneUrls: (input) =>
      Effect.sync(() => {
        readInputs.push({ repository: input.repository, context: input.context });
        return enterpriseUrls;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const result = yield* service.publishRepository({
      cwd: "/workspace",
      provider: "github",
      providerBaseUrl: "https://git.enterprise.test:8443",
      repository: "octocat/t3code",
      visibility: "private",
      remoteName: "origin",
      protocol: "ssh",
    });

    assert.equal(result.remoteUrl, enterpriseUrls.sshUrl);
    assert.deepStrictEqual(readInputs, [
      {
        repository: "octocat/t3code",
        context: {
          provider: {
            kind: "github",
            name: "git.enterprise.test:8443",
            baseUrl: "https://git.enterprise.test:8443",
          },
          remoteName: "origin",
          remoteUrl: enterpriseUrls.url,
        },
      },
    ]);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          readConfigValue: (_cwd, key) =>
            Effect.succeed(key === "remote.origin.url" ? enterpriseUrls.url : null),
        },
      }),
    ),
  );
});

it.effect("reuses the exact Azure origin repository selector", () => {
  const azureUrls = {
    nameWithOwner: "project/repository",
    url: "https://dev.azure.com/org/project/_git/repository",
    sshUrl: "git@ssh.dev.azure.com:v3/org/project/repository",
  };
  const readInputs: Array<{
    readonly repository: string;
    readonly context: SourceControlProvider.SourceControlProviderContext | undefined;
  }> = [];
  const provider = makeProvider({
    getRepositoryCloneUrls: (input) =>
      Effect.sync(() => {
        readInputs.push({ repository: input.repository, context: input.context });
        return azureUrls;
      }),
  });

  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const result = yield* service.publishRepository({
      cwd: "/workspace",
      provider: "azure-devops",
      providerBaseUrl: "https://dev.azure.com/org",
      repository: "project/repository",
      visibility: "private",
      remoteName: "origin",
      protocol: "ssh",
    });

    assert.equal(result.remoteUrl, azureUrls.sshUrl);
    assert.deepStrictEqual(readInputs, [
      {
        repository: "repository",
        context: {
          provider: {
            kind: "azure-devops",
            name: "Azure DevOps",
            baseUrl: "https://dev.azure.com",
          },
          remoteName: "origin",
          remoteUrl: azureUrls.url,
        },
      },
    ]);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider,
        git: {
          readConfigValue: (_cwd, key) =>
            Effect.succeed(key === "remote.origin.url" ? azureUrls.url : null),
        },
      }),
    ),
  );
});

it.effect("rejects any divergent origin push URL before remote mutation", () => {
  let ensureRemoteCalls = 0;
  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .publishRepository({
        cwd: "/workspace",
        provider: "github",
        providerBaseUrl: "https://github.com",
        repository: "octocat/t3code",
        visibility: "private",
        remoteName: "origin",
        protocol: "ssh",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "push URL differs");
    assert.equal(ensureRemoteCalls, 0);
  }).pipe(
    Effect.provide(
      makeLayer({
        git: {
          readConfigValue: (_cwd, key) =>
            Effect.succeed(key === "remote.origin.url" ? CLONE_URLS.url : null),
          execute: (input) =>
            input.args[0] === "remote"
              ? Effect.succeed({
                  ...processOutput(),
                  stdout: input.args.includes("--push")
                    ? `${CLONE_URLS.url}\nhttps://github.com/other/project.git\n`
                    : CLONE_URLS.url,
                })
              : Effect.succeed(processOutput()),
          ensureRemote: () =>
            Effect.sync(() => {
              ensureRemoteCalls += 1;
              return "origin";
            }),
        },
      }),
    ),
  );
});

it.effect("rejects an origin push URL on a different non-default port", () => {
  let ensureRemoteCalls = 0;
  const portUrls = {
    ...CLONE_URLS,
    url: "https://github.example.test:8443/octocat/t3code",
    sshUrl: "ssh://git@github.example.test:8443/octocat/t3code.git",
  };
  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const error = yield* service
      .publishRepository({
        cwd: "/workspace",
        provider: "github",
        providerBaseUrl: "https://github.com",
        repository: "octocat/t3code",
        visibility: "private",
        remoteName: "origin",
        protocol: "ssh",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "existing origin does not match");
    assert.equal(ensureRemoteCalls, 0);
  }).pipe(
    Effect.provide(
      makeLayer({
        provider: makeProvider({ getRepositoryCloneUrls: () => Effect.succeed(portUrls) }),
        git: {
          readConfigValue: (_cwd, key) =>
            Effect.succeed(
              key === "remote.origin.url"
                ? "https://github.example.test:8443/octocat/t3code.git"
                : null,
            ),
          execute: (input) =>
            input.args[0] === "remote"
              ? Effect.succeed({
                  ...processOutput(),
                  stdout: "https://github.example.test:9443/octocat/t3code.git\n",
                })
              : Effect.succeed(processOutput()),
          ensureRemote: () =>
            Effect.sync(() => {
              ensureRemoteCalls += 1;
              return "origin";
            }),
        },
      }),
    ),
  );
});

it.effect("publish succeeds with status remote_added when the local repo has no commits", () => {
  let pushCalls = 0;
  return Effect.gen(function* () {
    const service = yield* SourceControlRepositoryService.SourceControlRepositoryService;
    const result = yield* service.publishRepository({
      cwd: "/workspace",
      provider: "github",
      providerBaseUrl: "https://github.com",
      repository: "octocat/t3code",
      visibility: "private",
      remoteName: "origin",
      protocol: "ssh",
    });

    assert.deepStrictEqual(result, {
      repository: { provider: "github", ...CLONE_URLS },
      remoteName: "origin",
      remoteUrl: CLONE_URLS.sshUrl,
      branch: "main",
      status: "remote_added",
    });
    assert.strictEqual(pushCalls, 0);
  }).pipe(
    Effect.provide(
      makeLayer({
        git: {
          execute: (input) =>
            input.args[0] === "rev-parse"
              ? Effect.fail(
                  new GitCommandError({
                    operation: input.operation,
                    command: "git rev-parse --verify HEAD",
                    cwd: input.cwd,
                    detail: "fatal: Needed a single revision",
                  }),
                )
              : Effect.succeed(processOutput()),
          statusDetails: () =>
            Effect.succeed({
              isRepo: true,
              hasOriginRemote: true,
              isDefaultBranch: true,
              branch: "main",
              upstreamRef: null,
              hasWorkingTreeChanges: false,
              workingTree: { files: [], insertions: 0, deletions: 0 },
              hasUpstream: false,
              aheadCount: 0,
              behindCount: 0,
              aheadOfDefaultCount: 0,
            }),
          pushCurrentBranch: () =>
            Effect.sync(() => {
              pushCalls += 1;
              return {
                status: "pushed" as const,
                branch: "main",
                upstreamBranch: "origin/main",
                setUpstream: true,
              };
            }),
        },
      }),
    ),
  );
});
