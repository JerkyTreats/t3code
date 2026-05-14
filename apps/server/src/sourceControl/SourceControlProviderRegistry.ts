import { Cache, Context, Duration, Effect, Exit, Layer } from "effect";
import type {
  SourceControlProviderAuth,
  SourceControlProviderDiscoveryItem,
  SourceControlProviderError,
  SourceControlProviderKind,
} from "@t3tools/contracts";
import { SourceControlProviderError as SourceControlProviderErrorClass } from "@t3tools/contracts";
import { detectSourceControlProviderFromRemoteUrl } from "@t3tools/shared/sourceControl";
import { ServerConfig } from "../config.ts";
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

function providerAuth(input: {
  readonly status: SourceControlProviderAuth["status"];
  readonly account?: string | undefined;
  readonly host?: string | undefined;
  readonly detail?: string | undefined;
}): SourceControlProviderAuth {
  return SourceControlProviderDiscovery.providerAuth({
    status: input.status,
    ...(input.account ? { account: input.account } : {}),
    ...(input.host ? { host: input.host } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
  });
}

const GITHUB_DISCOVERY: SourceControlProviderDiscovery.SourceControlProviderDiscoverySpec = {
  type: "cli",
  kind: "github",
  label: "GitHub CLI",
  executable: "gh",
  versionArgs: ["--version"],
  authArgs: ["auth", "status"],
  installHint: "Install GitHub CLI from https://cli.github.com or with your package manager.",
  parseAuth: (input) => {
    const output = SourceControlProviderDiscovery.combinedAuthOutput(input);
    const account = SourceControlProviderDiscovery.matchFirst(output, [
      /Logged in to [^\s]+ as ([^\s]+)\b/iu,
      /account\s+([^\s]+)\b/iu,
    ]);
    const host = SourceControlProviderDiscovery.parseCliHost(output);
    const detail = SourceControlProviderDiscovery.firstSafeAuthLine(output);
    return providerAuth({
      status: /Logged in to/iu.test(output) ? "authenticated" : "unauthenticated",
      account,
      host,
      detail,
    });
  },
};

const GITLAB_DISCOVERY: SourceControlProviderDiscovery.SourceControlProviderDiscoverySpec = {
  type: "cli",
  kind: "gitlab",
  label: "GitLab CLI",
  executable: "glab",
  versionArgs: ["--version"],
  authArgs: ["auth", "status"],
  installHint:
    "Install GitLab CLI from https://gitlab.com/gitlab-org/cli or with your package manager.",
  parseAuth: (input) => {
    const output = SourceControlProviderDiscovery.combinedAuthOutput(input);
    const account = SourceControlProviderDiscovery.matchFirst(output, [
      /Logged in to [^\s]+ as ([^\s]+)\b/iu,
      /account:\s*([^\s]+)\b/iu,
      /user:\s*([^\s]+)\b/iu,
    ]);
    const host = SourceControlProviderDiscovery.parseCliHost(output);
    const detail = SourceControlProviderDiscovery.firstSafeAuthLine(output);
    return providerAuth({
      status: /Logged in|authenticated|valid/iu.test(output) ? "authenticated" : "unauthenticated",
      account,
      host,
      detail,
    });
  },
};

const AZURE_DEVOPS_DISCOVERY: SourceControlProviderDiscovery.SourceControlProviderDiscoverySpec = {
  type: "cli",
  kind: "azure-devops",
  label: "Azure CLI",
  executable: "az",
  versionArgs: ["version"],
  authArgs: ["account", "show"],
  installHint: "Install Azure CLI from https://learn.microsoft.com/cli/azure/install-azure-cli.",
  parseAuth: (input) => {
    const output = SourceControlProviderDiscovery.combinedAuthOutput(input);
    const account = SourceControlProviderDiscovery.matchFirst(output, [
      /"user"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/isu,
      /"name"\s*:\s*"([^"]+)"/iu,
    ]);
    const detail = SourceControlProviderDiscovery.firstSafeAuthLine(output);
    return providerAuth({
      status: input.exitCode === 0 ? "authenticated" : "unauthenticated",
      account,
      host: "dev.azure.com",
      detail,
    });
  },
};

const BITBUCKET_DISCOVERY: SourceControlProviderDiscovery.SourceControlProviderDiscoverySpec = {
  type: "api",
  kind: "bitbucket",
  label: "Bitbucket",
  installHint: "Configure Bitbucket access through repository remotes and app passwords.",
  probeAuth: Effect.succeed(
    providerAuth({
      status: "unknown",
      host: "bitbucket.org",
      detail: "Bitbucket auth discovery is not wired yet.",
    }),
  ),
};

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
  return yield* makeWithProviders([
    {
      kind: "github",
      provider: makeStubProvider("github"),
      discovery: GITHUB_DISCOVERY,
    },
    {
      kind: "gitlab",
      provider: makeStubProvider("gitlab"),
      discovery: GITLAB_DISCOVERY,
    },
    {
      kind: "azure-devops",
      provider: makeStubProvider("azure-devops"),
      discovery: AZURE_DEVOPS_DISCOVERY,
    },
    {
      kind: "bitbucket",
      provider: makeStubProvider("bitbucket"),
      discovery: BITBUCKET_DISCOVERY,
    },
  ]);
});

export const SourceControlProviderRegistryLive = Layer.effect(
  SourceControlProviderRegistry,
  make(),
);
