import * as Cache from "effect/Cache";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import {
  SourceControlProviderError,
  type SourceControlProviderDiscoveryItem,
} from "@t3tools/contracts";
import type { SourceControlProviderKind } from "@t3tools/contracts";
import { normalizeGitRemoteUrl } from "@t3tools/shared/git";

import * as AzureDevOpsSourceControlProvider from "./AzureDevOpsSourceControlProvider.ts";
import * as BitbucketSourceControlProvider from "./BitbucketSourceControlProvider.ts";
import * as GitHubSourceControlProvider from "./GitHubSourceControlProvider.ts";
import * as GitLabSourceControlProvider from "./GitLabSourceControlProvider.ts";
import * as SourceControlProvider from "./SourceControlProvider.ts";
import {
  probeSourceControlProvider,
  refineUnknownRemoteProvider,
  type SourceControlProviderDiscoverySpec,
} from "./SourceControlProviderDiscovery.ts";
import { isOriginRemoteName } from "../fork/originOnlySourceControlPolicy.ts";
import * as OriginRepositoryMutationAuthority from "../fork/OriginRepositoryMutationAuthority.ts";
import {
  pickOriginSourceControlContext,
  bindOriginProviderContext,
} from "../fork/sourceControlContextPolicy.ts";
import { ServerConfig } from "../config.ts";
import * as VcsDriverRegistry from "../vcs/VcsDriverRegistry.ts";
import * as VcsProcess from "../vcs/VcsProcess.ts";

const PROVIDER_DETECTION_CACHE_CAPACITY = 2_048;
const PROVIDER_DETECTION_CACHE_TTL = Duration.seconds(5);

export interface SourceControlProviderRegistration {
  readonly kind: SourceControlProviderKind;
  readonly provider: SourceControlProvider.SourceControlProvider["Service"];
  readonly discovery: SourceControlProviderDiscoverySpec;
}

export interface SourceControlProviderHandle {
  readonly provider: SourceControlProvider.SourceControlProvider["Service"];
  readonly context: SourceControlProvider.SourceControlProviderContext | null;
}

export class SourceControlProviderRegistry extends Context.Service<
  SourceControlProviderRegistry,
  {
    readonly get: (
      kind: SourceControlProviderKind,
    ) => Effect.Effect<
      SourceControlProvider.SourceControlProvider["Service"],
      SourceControlProviderError
    >;
    readonly resolveHandle: (input: {
      readonly cwd: string;
      readonly context?: SourceControlProvider.SourceControlProviderContext;
    }) => Effect.Effect<SourceControlProviderHandle, SourceControlProviderError>;
    readonly resolveChangeRequestHandle: (input: {
      readonly cwd: string;
    }) => Effect.Effect<SourceControlProviderHandle, SourceControlProviderError>;
    readonly resolve: (input: {
      readonly cwd: string;
    }) => Effect.Effect<
      SourceControlProvider.SourceControlProvider["Service"],
      SourceControlProviderError
    >;
    readonly discover: Effect.Effect<ReadonlyArray<SourceControlProviderDiscoveryItem>>;
  }
>()("t3/sourceControl/SourceControlProviderRegistry") {}

function unsupportedProvider(
  kind: SourceControlProviderKind,
): SourceControlProvider.SourceControlProvider["Service"] {
  return SourceControlProvider.SourceControlProvider.of({
    kind,
    listChangeRequests: (input) =>
      new SourceControlProviderError({
        provider: kind,
        operation: "listChangeRequests",
        cwd: input.cwd,
        detail: `No ${kind} source control provider is registered.`,
      }),
    getChangeRequest: (input) =>
      new SourceControlProviderError({
        provider: kind,
        operation: "getChangeRequest",
        cwd: input.cwd,
        reference: SourceControlProvider.transportSafeSourceControlErrorValue(input.reference),
        detail: `No ${kind} source control provider is registered.`,
      }),
    createChangeRequest: (input) =>
      new SourceControlProviderError({
        provider: kind,
        operation: "createChangeRequest",
        cwd: input.cwd,
        reference: SourceControlProvider.transportSafeSourceControlErrorValue(input.headSelector),
        detail: `No ${kind} source control provider is registered.`,
      }),
    getRepositoryCloneUrls: (input) =>
      new SourceControlProviderError({
        provider: kind,
        operation: "getRepositoryCloneUrls",
        cwd: input.cwd,
        repository: SourceControlProvider.transportSafeSourceControlErrorValue(input.repository),
        detail: `No ${kind} source control provider is registered.`,
      }),
    createRepository: (input) =>
      new SourceControlProviderError({
        provider: kind,
        operation: "createRepository",
        cwd: input.cwd,
        repository: SourceControlProvider.transportSafeSourceControlErrorValue(input.repository),
        detail: `No ${kind} source control provider is registered.`,
      }),
    getDefaultBranch: (input) =>
      new SourceControlProviderError({
        provider: kind,
        operation: "getDefaultBranch",
        cwd: input.cwd,
        detail: `No ${kind} source control provider is registered.`,
      }),
    checkoutChangeRequest: (input) =>
      new SourceControlProviderError({
        provider: kind,
        operation: "checkoutChangeRequest",
        cwd: input.cwd,
        reference: SourceControlProvider.transportSafeSourceControlErrorValue(input.reference),
        detail: `No ${kind} source control provider is registered.`,
      }),
  });
}

function selectProviderContext(
  remotes: ReadonlyArray<{
    readonly name: string;
    readonly url: string;
  }>,
): SourceControlProvider.SourceControlProviderContext | null {
  return pickOriginSourceControlContext(remotes);
}

export const makeWithProviders = Effect.fn("makeSourceControlProviderRegistryWithProviders")(
  function* (registrations: ReadonlyArray<SourceControlProviderRegistration>) {
    const config = yield* ServerConfig;
    const process = yield* VcsProcess.VcsProcess;
    const mutationAuthority = yield* OriginRepositoryMutationAuthority.make;
    const vcsRegistry = yield* VcsDriverRegistry.VcsDriverRegistry;
    const providers = new Map<
      SourceControlProviderKind,
      SourceControlProvider.SourceControlProvider["Service"]
    >(registrations.map((registration) => [registration.kind, registration.provider]));
    const discoverySpecs = registrations.map((registration) => registration.discovery);

    const get: SourceControlProviderRegistry["Service"]["get"] = (kind) => {
      const provider = providers.get(kind) ?? unsupportedProvider(kind);
      return Effect.succeed(bindOriginProviderContext(provider, null, mutationAuthority));
    };

    const detectProviderContext = Effect.fn("SourceControlProviderRegistry.detectProviderContext")(
      function* (cwd: string) {
        const handle = yield* vcsRegistry.resolve({ cwd }).pipe(
          Effect.mapError(
            (error) =>
              new SourceControlProviderError({
                provider: "unknown",
                operation: "detectProvider",
                cwd,
                detail: "Failed to detect source control provider.",
                cause: error,
              }),
          ),
        );
        const remotes = yield* handle.driver.listRemotes(cwd).pipe(
          Effect.mapError(
            (error) =>
              new SourceControlProviderError({
                provider: "unknown",
                operation: "detectProvider",
                cwd,
                detail: "Failed to detect source control provider.",
                cause: error,
              }),
          ),
        );
        const context = selectProviderContext(remotes.remotes);

        return yield* refineUnknownRemoteProvider({
          specs: discoverySpecs,
          process,
          cwd,
          context,
        });
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

    const resolveHandle: SourceControlProviderRegistry["Service"]["resolveHandle"] = (input) =>
      Cache.get(providerContextCache, input.cwd).pipe(
        Effect.map((context) => {
          const kind = context?.provider.kind ?? "unknown";
          const provider = providers.get(kind) ?? unsupportedProvider(kind);
          return {
            provider: bindOriginProviderContext(provider, context, mutationAuthority),
            context,
          } satisfies SourceControlProviderHandle;
        }),
      );

    const resolveChangeRequestHandle: SourceControlProviderRegistry["Service"]["resolveChangeRequestHandle"] =
      Effect.fn("SourceControlProviderRegistry.resolveChangeRequestHandle")(function* (input) {
        const handle = yield* vcsRegistry.resolve({ cwd: input.cwd }).pipe(
          Effect.mapError(
            (cause) =>
              new SourceControlProviderError({
                provider: "unknown",
                operation: "resolveChangeRequestHandle",
                cwd: input.cwd,
                detail: "Origin-only policy could not inspect the repository remotes.",
                cause,
              }),
          ),
        );
        const remoteResult = yield* handle.driver.listRemotes(input.cwd).pipe(
          Effect.mapError(
            (cause) =>
              new SourceControlProviderError({
                provider: "unknown",
                operation: "resolveChangeRequestHandle",
                cwd: input.cwd,
                detail: "Origin-only policy could not inspect the repository remotes.",
                cause,
              }),
          ),
        );
        const origin = remoteResult.remotes.find((remote) => isOriginRemoteName(remote.name));
        if (!origin) {
          return yield* new SourceControlProviderError({
            provider: "unknown",
            operation: "resolveChangeRequestHandle",
            cwd: input.cwd,
            detail:
              "Origin-only policy requires an origin remote before creating a change request.",
          });
        }

        yield* mutationAuthority
          .authorize({
            cwd: input.cwd,
            expectedIdentity: {
              canonicalKey: normalizeGitRemoteUrl(origin.url),
              locator: {
                source: "git-remote",
                remoteName: origin.name,
                remoteUrl: origin.url,
              },
            },
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new SourceControlProviderError({
                  provider: "unknown",
                  operation: "resolveChangeRequestHandle",
                  cwd: input.cwd,
                  detail: cause.detail,
                  cause,
                }),
            ),
          );

        const context = yield* refineUnknownRemoteProvider({
          specs: discoverySpecs,
          process,
          cwd: input.cwd,
          context: selectProviderContext([{ name: origin.name, url: origin.url }]),
        });
        if (!context || context.provider.kind === "unknown") {
          return yield* new SourceControlProviderError({
            provider: "unknown",
            operation: "resolveChangeRequestHandle",
            cwd: input.cwd,
            detail:
              "Origin-only policy could not identify a supported source-control provider for origin.",
          });
        }

        const provider =
          providers.get(context.provider.kind) ?? unsupportedProvider(context.provider.kind);
        return {
          provider: bindOriginProviderContext(provider, context, mutationAuthority),
          context,
        } satisfies SourceControlProviderHandle;
      });

    return SourceControlProviderRegistry.of({
      get,
      resolveHandle,
      resolveChangeRequestHandle,
      resolve: (input) => resolveHandle(input).pipe(Effect.map((handle) => handle.provider)),
      discover: Effect.all(
        discoverySpecs.map((spec) =>
          probeSourceControlProvider({
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

export const make = Effect.gen(function* () {
  const github = yield* GitHubSourceControlProvider.make;
  const gitlab = yield* GitLabSourceControlProvider.make;
  const bitbucket = yield* BitbucketSourceControlProvider.make;
  const bitbucketDiscovery = yield* BitbucketSourceControlProvider.makeDiscovery;
  const azureDevOps = yield* AzureDevOpsSourceControlProvider.make;
  return yield* makeWithProviders([
    {
      kind: "github",
      provider: github,
      discovery: GitHubSourceControlProvider.discovery,
    },
    {
      kind: "gitlab",
      provider: gitlab,
      discovery: GitLabSourceControlProvider.discovery,
    },
    {
      kind: "azure-devops",
      provider: azureDevOps,
      discovery: AzureDevOpsSourceControlProvider.discovery,
    },
    {
      kind: "bitbucket",
      provider: bitbucket,
      discovery: bitbucketDiscovery,
    },
  ]);
});

export const layer = Layer.effect(SourceControlProviderRegistry, make);
