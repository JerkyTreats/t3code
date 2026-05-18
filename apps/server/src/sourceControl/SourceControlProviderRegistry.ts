import { Cache, Context, Duration, Effect, Exit, Layer } from "effect";
import type {
  SourceControlProviderDiscoveryItem,
  SourceControlProviderError,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import { SourceControlProviderError as SourceControlProviderErrorClass } from "@t3tools/contracts";
import { detectSourceControlProviderFromRemoteUrl } from "@t3tools/shared/sourceControl";
import { ServerConfig } from "../config.ts";
import * as AzureDevOpsSourceControlProvider from "./AzureDevOpsSourceControlProvider.ts";
import * as BitbucketSourceControlProvider from "./BitbucketSourceControlProvider.ts";
import * as GitHubSourceControlProvider from "./GitHubSourceControlProvider.ts";
import * as GitLabSourceControlProvider from "./GitLabSourceControlProvider.ts";
import * as SourceControlProvider from "./SourceControlProvider.ts";
import * as SourceControlProviderDiscovery from "./SourceControlProviderDiscovery.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";

const PROVIDER_DETECTION_CACHE_CAPACITY = 2_048;
const PROVIDER_DETECTION_CACHE_TTL = Duration.seconds(5);

export interface SourceControlProviderRegistration {
  readonly kind: SourceControlProviderKind;
  readonly provider: SourceControlProvider.SourceControlProviderShape;
  readonly discovery: SourceControlProviderDiscovery.SourceControlProviderDiscoverySpec;
}

export interface SourceControlProviderHandle {
  readonly provider: SourceControlProvider.SourceControlProviderShape;
  readonly context: SourceControlProvider.SourceControlProviderContext | null;
}

export interface SourceControlProviderRegistryShape {
  readonly get: (
    kind: SourceControlProviderKind,
  ) => Effect.Effect<SourceControlProvider.SourceControlProviderShape, SourceControlProviderError>;
  readonly resolveHandle: (input: {
    readonly cwd: string;
  }) => Effect.Effect<SourceControlProviderHandle, SourceControlProviderError>;
  readonly resolve: (input: {
    readonly cwd: string;
  }) => Effect.Effect<SourceControlProvider.SourceControlProviderShape, SourceControlProviderError>;
  readonly discover: Effect.Effect<ReadonlyArray<SourceControlProviderDiscoveryItem>>;
}

export class SourceControlProviderRegistry extends Context.Service<
  SourceControlProviderRegistry,
  SourceControlProviderRegistryShape
>()("t3/source-control/SourceControlProviderRegistry") {}

function unsupportedProvider(
  kind: SourceControlProviderKind,
): SourceControlProvider.SourceControlProviderShape {
  const unsupported = (operation: string) =>
    Effect.fail(
      new SourceControlProviderErrorClass({
        provider: kind,
        operation,
        detail: `No ${kind} source control provider is registered.`,
      }),
    );

  return SourceControlProvider.SourceControlProvider.of({
    kind,
    listChangeRequests: () => unsupported("listChangeRequests"),
    getChangeRequest: () => unsupported("getChangeRequest"),
    createChangeRequest: () => unsupported("createChangeRequest"),
    getRepositoryCloneUrls: () => unsupported("getRepositoryCloneUrls"),
    createRepository: () => unsupported("createRepository"),
    getDefaultBranch: () => unsupported("getDefaultBranch"),
    checkoutChangeRequest: () => unsupported("checkoutChangeRequest"),
  });
}

function providerDetectionError(operation: string, cwd: string, cause: unknown) {
  return new SourceControlProviderErrorClass({
    provider: "unknown",
    operation,
    detail: `Failed to detect source control provider for ${cwd}.`,
    cause,
  });
}

function selectProviderContext(
  remotes: ReadonlyArray<{
    readonly name: string;
    readonly url: string;
  }>,
): SourceControlProvider.SourceControlProviderContext | null {
  const candidates = remotes
    .map((remote) => {
      const provider = detectSourceControlProviderFromRemoteUrl(remote.url);
      return provider
        ? {
            provider,
            remoteName: remote.name,
            remoteUrl: remote.url,
          }
        : null;
    })
    .filter((value): value is SourceControlProvider.SourceControlProviderContext => value !== null);

  return (
    candidates.find((candidate) => candidate.remoteName === "origin") ??
    candidates.find((candidate) => candidate.provider.kind !== "unknown") ??
    candidates[0] ??
    null
  );
}

function bindProviderContext(
  provider: SourceControlProvider.SourceControlProviderShape,
  context: SourceControlProvider.SourceControlProviderContext | null,
): SourceControlProvider.SourceControlProviderShape {
  if (context === null) {
    return provider;
  }

  return SourceControlProvider.SourceControlProvider.of({
    kind: provider.kind,
    listChangeRequests: (input) =>
      provider.listChangeRequests({
        ...input,
        context: input.context ?? context,
      }),
    getChangeRequest: (input) =>
      provider.getChangeRequest({
        ...input,
        context: input.context ?? context,
      }),
    createChangeRequest: (input) =>
      provider.createChangeRequest({
        ...input,
        context: input.context ?? context,
      }),
    getRepositoryCloneUrls: (input) =>
      provider.getRepositoryCloneUrls({
        ...input,
        context: input.context ?? context,
      }),
    createRepository: (input) => provider.createRepository(input),
    getDefaultBranch: (input) =>
      provider.getDefaultBranch({
        ...input,
        context: input.context ?? context,
      }),
    checkoutChangeRequest: (input) =>
      provider.checkoutChangeRequest({
        ...input,
        context: input.context ?? context,
      }),
  });
}

function parseGitRemoteLines(stdout: string): ReadonlyArray<{ name: string; url: string }> {
  const remotes = new Map<string, { name: string; url: string }>();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const match = /^([^\s]+)\s+([^\s]+)(?:\s+\([^)]+\))?$/u.exec(trimmed);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    const name = match[1];
    const url = match[2];
    if (!remotes.has(name)) {
      remotes.set(name, { name, url });
    }
  }
  return [...remotes.values()];
}

function makeStubProvider(
  kind: SourceControlProviderKind,
): SourceControlProvider.SourceControlProviderShape {
  return unsupportedProvider(kind);
}

export const makeWithProviders = Effect.fn("makeSourceControlProviderRegistryWithProviders")(
  function* (registrations: ReadonlyArray<SourceControlProviderRegistration>) {
    const config = yield* ServerConfig;
    const process = yield* VcsProcess.VcsProcess;
    const providers = new Map<
      SourceControlProviderKind,
      SourceControlProvider.SourceControlProviderShape
    >(registrations.map((registration) => [registration.kind, registration.provider]));
    const discoverySpecs = registrations.map((registration) => registration.discovery);

    const get: SourceControlProviderRegistryShape["get"] = (kind) =>
      Effect.succeed(providers.get(kind) ?? unsupportedProvider(kind));

    const detectProviderContext = Effect.fn("SourceControlProviderRegistry.detectProviderContext")(
      function* (cwd: string) {
        const remotesResult = yield* process
          .run({
            operation: "source-control.detect.git-remotes",
            command: "git",
            args: ["remote", "-v"],
            cwd,
            allowNonZeroExit: true,
            timeoutMs: 5_000,
            maxOutputBytes: 16_000,
            truncateOutputAtMaxBytes: true,
          })
          .pipe(Effect.mapError((error) => providerDetectionError("detectProvider", cwd, error)));
        return selectProviderContext(parseGitRemoteLines(remotesResult.stdout));
      },
    );

    const providerContextCache = yield* Cache.makeWith<
      string,
      SourceControlProvider.SourceControlProviderContext | null,
      SourceControlProviderError
    >(detectProviderContext, {
      capacity: PROVIDER_DETECTION_CACHE_CAPACITY,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? PROVIDER_DETECTION_CACHE_TTL : Duration.zero),
    });

    const resolveHandle: SourceControlProviderRegistryShape["resolveHandle"] = (input) =>
      Cache.get(providerContextCache, input.cwd).pipe(
        Effect.map((context) => {
          const kind = context?.provider.kind ?? "unknown";
          const provider = providers.get(kind) ?? unsupportedProvider(kind);
          return {
            provider: bindProviderContext(provider, context),
            context,
          } satisfies SourceControlProviderHandle;
        }),
      );

    return SourceControlProviderRegistry.of({
      get,
      resolveHandle,
      resolve: (input) => resolveHandle(input).pipe(Effect.map((handle) => handle.provider)),
      discover: Effect.all(
        discoverySpecs.map((spec) =>
          SourceControlProviderDiscovery.probeSourceControlProvider({
            spec,
            process,
            cwd: config.cwd,
          }),
        ),
        { concurrency: "unbounded" },
      ),
    });
  },
);

export const make = Effect.fn("makeSourceControlProviderRegistry")(function* () {
  const gitHubProvider = yield* GitHubSourceControlProvider.make();
  const gitLabProvider = yield* GitLabSourceControlProvider.make();
  const azureDevOpsProvider = yield* AzureDevOpsSourceControlProvider.make();
  const bitbucketProvider = yield* BitbucketSourceControlProvider.make();
  const bitbucketDiscovery = yield* BitbucketSourceControlProvider.makeDiscovery();

  return yield* makeWithProviders([
    {
      kind: "github",
      provider: gitHubProvider,
      discovery: GitHubSourceControlProvider.discovery,
    },
    {
      kind: "gitlab",
      provider: gitLabProvider,
      discovery: GitLabSourceControlProvider.discovery,
    },
    {
      kind: "azure-devops",
      provider: azureDevOpsProvider,
      discovery: AzureDevOpsSourceControlProvider.discovery,
    },
    {
      kind: "bitbucket",
      provider: bitbucketProvider,
      discovery: bitbucketDiscovery,
    },
  ]);
});

export const SourceControlProviderRegistryLive = Layer.effect(
  SourceControlProviderRegistry,
  make(),
);
