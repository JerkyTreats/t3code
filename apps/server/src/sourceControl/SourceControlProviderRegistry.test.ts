import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ChildProcessSpawner } from "effect/unstable/process";
import { VcsRepositoryDetectionError } from "@t3tools/contracts";

import * as ServerConfig from "../config.ts";
import type * as VcsDriver from "../vcs/VcsDriver.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as AzureDevOpsCli from "./AzureDevOpsCli.ts";
import * as BitbucketApi from "./BitbucketApi.ts";
import * as GitHubCli from "./GitHubCli.ts";
import * as GitLabCli from "./GitLabCli.ts";
import * as SourceControlProviderRegistry from "./SourceControlProviderRegistry.ts";

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
  readonly resolve?: VcsDriverRegistry.VcsDriverRegistry["Service"]["resolve"];
}) {
  const driver = {
    listRemotes: () =>
      Effect.succeed({
        remotes: input.remotes.map((remote) => ({
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

  const registryLayer = Layer.mock(VcsDriverRegistry.VcsDriverRegistry)({
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

  const processLayer = Layer.mock(VcsProcess.VcsProcess)({
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
        registryLayer,
        processLayer,
        Layer.mock(AzureDevOpsCli.AzureDevOpsCli)({}),
        Layer.mock(BitbucketApi.BitbucketApi)({}),
        Layer.mock(GitHubCli.GitHubCli)({}),
        Layer.mock(GitLabCli.GitLabCli)({}),
        ServerConfig.layerTest(process.cwd(), {
          prefix: "t3-source-control-registry-test-",
        }).pipe(Layer.provide(NodeServices.layer)),
      ),
    ),
  );
}

it.effect("routes GitHub remotes to the GitHub provider", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "git@github.com:pingdotgg/t3code.git" }],
    });

    const provider = yield* registry.resolve({ cwd: "/repo" });

    assert.strictEqual(provider.kind, "github");
  }),
);

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
    const provider = yield* registry.get("github");

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

it.effect("routes directly by provider kind for remote-first workflows", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [],
    });

    const provider = yield* registry.get("github");

    assert.strictEqual(provider.kind, "github");
  }),
);

it.effect("includes the request cwd when an unregistered provider is used", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({ remotes: [] });
    const provider = yield* registry.get("unknown");

    const error = yield* provider
      .getChangeRequest({ cwd: "/repo", reference: "#42" })
      .pipe(Effect.flip);

    assert.strictEqual(error.provider, "unknown");
    assert.strictEqual(error.operation, "getChangeRequest");
    assert.strictEqual(error.cwd, "/repo");
    assert.strictEqual(error.reference, "#42");
  }),
);

it.effect("retains VCS detection failures with structured cwd context", () =>
  Effect.gen(function* () {
    const cause = new VcsRepositoryDetectionError({
      operation: "resolve",
      cwd: "/repo",
      detail: "raw VCS detection failure",
      cause: new Error("raw nested failure"),
    });
    const registry = yield* makeRegistry({
      remotes: [],
      resolve: () => Effect.fail(cause),
    });

    const error = yield* registry.resolve({ cwd: "/repo" }).pipe(Effect.flip);

    assert.strictEqual(error.provider, "unknown");
    assert.strictEqual(error.operation, "detectProvider");
    assert.strictEqual(error.cwd, "/repo");
    assert.strictEqual(error.detail, "Failed to detect source control provider.");
    assert.strictEqual(error.cause, cause);
    assert.equal(error.message.includes(cause.message), false);
  }),
);

it.effect("routes GitLab remotes to the GitLab provider", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "git@gitlab.com:group/project.git" }],
    });

    const provider = yield* registry.resolve({ cwd: "/repo" });

    assert.strictEqual(provider.kind, "gitlab");
  }),
);

it.effect("routes authenticated self-hosted GitLab remotes without relying on host naming", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "https://self-hosted.example.test/group/project.git" }],
      process: {
        run: () =>
          Effect.succeed(
            processOutput(
              `gitlab.com
  x gitlab.com: API call failed: 401 Unauthorized
  ! No token found
self-hosted.example.test
  ✓ Logged in to self-hosted.example.test as gitlab-user
  ✓ Token found: ******
`,
              { exitCode: ChildProcessSpawner.ExitCode(1) },
            ),
          ),
      },
    });

    const provider = yield* registry.resolve({ cwd: "/repo" });

    assert.strictEqual(provider.kind, "gitlab");
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
          kind: "unknown",
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

it.effect("routes authenticated self-hosted GitLab remotes on non-standard ports", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "https://self-hosted.example.test:8443/group/project.git" }],
      process: {
        run: () =>
          Effect.succeed(
            processOutput(
              `self-hosted.example.test:8443
  ✓ Logged in to self-hosted.example.test:8443 as gitlab-user
  ✓ Token found: ******
`,
            ),
          ),
      },
    });

    const provider = yield* registry.resolve({ cwd: "/repo" });

    assert.strictEqual(provider.kind, "gitlab");
  }),
);

it.effect("routes Bitbucket remotes to the Bitbucket provider", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "git@bitbucket.org:pingdotgg/t3code.git" }],
    });

    const provider = yield* registry.resolve({ cwd: "/repo" });

    assert.strictEqual(provider.kind, "bitbucket");
  }),
);

it.effect("routes Azure DevOps remotes to the Azure DevOps provider", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "origin", url: "https://dev.azure.com/acme/project/_git/repo" }],
    });

    const provider = yield* registry.resolve({ cwd: "/repo" });

    assert.strictEqual(provider.kind, "azure-devops");
  }),
);

it.effect("fails closed when origin is not configured", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry({
      remotes: [{ name: "upstream", url: "https://dev.azure.com/acme/project/_git/repo" }],
    });

    const provider = yield* registry.resolve({ cwd: "/repo" });

    assert.strictEqual(provider.kind, "unknown");
  }),
);
