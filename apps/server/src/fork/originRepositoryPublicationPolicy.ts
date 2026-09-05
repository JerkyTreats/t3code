import { originPushRedirectError } from "./originGitPolicy.ts";
import {
  SourceControlRepositoryError,
  type SourceControlProviderKind,
  type SourceControlRepositoryCloneUrls,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { normalizeGitRemoteMutationTarget } from "@t3tools/shared/git";
import { detectSourceControlProviderFromRemoteUrl } from "@t3tools/shared/sourceControl";
import { isOriginRemoteName, ORIGIN_REMOTE_NAME } from "./originOnlySourceControlPolicy.ts";
import {
  azureDevOpsRepositoryTargetFromPublication,
  azureDevOpsRepositoryTargetFromRemoteUrl,
  type AzureDevOpsRepositoryTarget,
} from "../sourceControl/AzureDevOpsRepositoryTarget.ts";
import type * as SourceControlProvider from "../sourceControl/SourceControlProvider.ts";
import type * as GitVcsDriver from "../vcs/GitVcsDriver.ts";

export function validateProviderEndpoint(input: {
  readonly operation: "lookupRepository" | "publishRepository";
  readonly provider: SourceControlProviderKind;
  readonly providerBaseUrl: string;
}): Effect.Effect<
  NonNullable<ReturnType<typeof detectSourceControlProviderFromRemoteUrl>>,
  SourceControlRepositoryError
> {
  const providerBaseUrl = input.providerBaseUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(providerBaseUrl);
  } catch (cause) {
    return Effect.fail(
      new SourceControlRepositoryError({
        operation: input.operation,
        provider: input.provider,
        detail: "The selected provider endpoint is not a valid URL.",
        cause,
      }),
    );
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    return Effect.fail(
      new SourceControlRepositoryError({
        operation: input.operation,
        provider: input.provider,
        detail:
          "The selected provider endpoint must be an HTTP URL without credentials or query data.",
      }),
    );
  }

  const detected = detectSourceControlProviderFromRemoteUrl(providerBaseUrl);
  if (detected === null || (detected.kind !== "unknown" && detected.kind !== input.provider)) {
    return Effect.fail(
      new SourceControlRepositoryError({
        operation: input.operation,
        provider: input.provider,
        detail: "The selected provider endpoint does not match the selected provider.",
      }),
    );
  }

  return Effect.succeed({
    ...detected,
    kind: input.provider,
    baseUrl: providerBaseUrl.replace(/\/+$/u, ""),
  });
}

function parseRemoteUrls(
  stdout: string,
): ReadonlyArray<{ readonly name: string; readonly url: string }> {
  const remotes: Array<{ readonly name: string; readonly url: string }> = [];
  for (const line of stdout.split(/\r?\n/u)) {
    const match = /^(\S+)\s+(\S+)\s+\((?:fetch|push)\)$/u.exec(line.trim());
    if (match?.[1] && match[2]) remotes.push({ name: match[1], url: match[2] });
  }
  return remotes;
}

interface StandardPublicationRepositoryTarget {
  readonly kind: "standard";
  readonly host: string;
  readonly repository: string;
}

interface AzurePublicationRepositoryTarget {
  readonly kind: "azure-devops";
  readonly target: AzureDevOpsRepositoryTarget;
}

type PublicationRepositoryTarget =
  | StandardPublicationRepositoryTarget
  | AzurePublicationRepositoryTarget;

function normalizeRepositoryPath(repository: string): string | null {
  const normalized = repository
    .trim()
    .replace(/^\/+|\/+$/gu, "")
    .replace(/\.git$/iu, "")
    .toLowerCase();
  return normalized.includes("/") ? normalized : null;
}

export function publicationRepositoryTarget(input: {
  readonly providerBaseUrl: string;
  readonly provider: SourceControlProviderKind;
  readonly repository: string;
}): PublicationRepositoryTarget | null {
  if (input.provider === "azure-devops") {
    const target = azureDevOpsRepositoryTargetFromPublication(input);
    return target === null ? null : { kind: "azure-devops", target };
  }

  const repository = normalizeRepositoryPath(input.repository);
  if (repository === null) return null;
  try {
    const endpoint = new URL(input.providerBaseUrl);
    const host =
      input.provider === "bitbucket" && endpoint.host.toLowerCase() === "api.bitbucket.org"
        ? "bitbucket.org"
        : endpoint.host.toLowerCase();
    return host.length > 0 ? { kind: "standard", host, repository } : null;
  } catch {
    return null;
  }
}

function remoteRepositoryTarget(input: {
  readonly remoteUrl: string;
  readonly provider: SourceControlProviderKind;
}): PublicationRepositoryTarget | null {
  if (input.provider === "azure-devops") {
    const target = azureDevOpsRepositoryTargetFromRemoteUrl(input.remoteUrl);
    return target === null ? null : { kind: "azure-devops", target };
  }

  const mutationTarget = normalizeGitRemoteMutationTarget(input.remoteUrl);
  const separator = mutationTarget.indexOf("/");
  if (separator < 0) return null;
  const rawHost = mutationTarget.slice(0, separator);
  const host =
    input.provider === "bitbucket" && rawHost === "api.bitbucket.org" ? "bitbucket.org" : rawHost;
  const repository = normalizeRepositoryPath(mutationTarget.slice(separator + 1));
  return host.length > 0 && repository !== null ? { kind: "standard", host, repository } : null;
}

function azureServiceKey(target: AzureDevOpsRepositoryTarget): string | null {
  try {
    const organization = new URL(target.organization);
    const hostname = organization.hostname.toLowerCase();
    const pathOrganization = organization.pathname.split("/").find((segment) => segment.length > 0);
    if (hostname === "dev.azure.com" && pathOrganization) {
      return organization.port.length > 0
        ? `${organization.host.toLowerCase()}/${pathOrganization.toLowerCase()}`
        : `azure/${pathOrganization.toLowerCase()}`;
    }
    if (hostname.endsWith(".visualstudio.com")) {
      const hostOrganization = hostname.slice(0, -".visualstudio.com".length);
      return hostOrganization.length > 0 && organization.port.length === 0
        ? `azure/${hostOrganization}`
        : organization.host.toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

function publicationTargetMatchesRemote(
  publication: PublicationRepositoryTarget,
  remote: PublicationRepositoryTarget | null,
): boolean {
  if (remote === null || publication.kind !== remote.kind) return false;
  if (publication.kind === "standard" && remote.kind === "standard") {
    return publication.host === remote.host && publication.repository === remote.repository;
  }
  if (publication.kind === "azure-devops" && remote.kind === "azure-devops") {
    const publicationService = azureServiceKey(publication.target);
    return (
      publicationService !== null &&
      publicationService === azureServiceKey(remote.target) &&
      publication.target.project.toLowerCase() === remote.target.project.toLowerCase() &&
      publication.target.repository.toLowerCase() === remote.target.repository.toLowerCase()
    );
  }
  return false;
}

export function validateRepositoryCloneUrls(input: {
  readonly operation: "lookupRepository" | "publishRepository";
  readonly provider: SourceControlProviderKind;
  readonly requestedTarget: PublicationRepositoryTarget;
  readonly urls: SourceControlRepositoryCloneUrls;
}): Effect.Effect<SourceControlRepositoryCloneUrls, SourceControlRepositoryError> {
  const returnedTargets = [input.urls.url, input.urls.sshUrl].map((remoteUrl) =>
    remoteRepositoryTarget({ remoteUrl, provider: input.provider }),
  );
  if (
    returnedTargets.every((target) => publicationTargetMatchesRemote(input.requestedTarget, target))
  ) {
    return Effect.succeed(input.urls);
  }

  return Effect.fail(
    new SourceControlRepositoryError({
      operation: input.operation,
      provider: input.provider,
      detail:
        "The provider returned clone URLs that do not match the selected provider endpoint and repository.",
    }),
  );
}

export function exactRepositorySelector(target: PublicationRepositoryTarget): string {
  return target.kind === "azure-devops" ? target.target.repository : target.repository;
}

function providerContextFromOrigin(input: {
  readonly provider: SourceControlProviderKind;
  readonly originUrl: string;
}): SourceControlProvider.SourceControlProviderContext | null {
  const detected = detectSourceControlProviderFromRemoteUrl(input.originUrl);
  if (detected === null || (detected.kind !== "unknown" && detected.kind !== input.provider)) {
    return null;
  }
  return {
    provider: { ...detected, kind: input.provider },
    remoteName: ORIGIN_REMOTE_NAME,
    remoteUrl: input.originUrl,
  };
}

export const preflightPublication = Effect.fn("OriginPublicationPolicy.preflightPublication")(
  function* (
    git: Pick<GitVcsDriver.GitVcsDriver["Service"], "execute" | "readConfigValue">,
    input: {
      readonly cwd: string;
      readonly remoteName?: string | undefined;
      readonly provider: SourceControlProviderKind;
    },
    requestedTarget: PublicationRepositoryTarget,
  ) {
    const providerKind = input.provider;
    const requestedRemoteName = input.remoteName?.trim() || ORIGIN_REMOTE_NAME;
    if (!isOriginRemoteName(requestedRemoteName)) {
      return yield* new SourceControlRepositoryError({
        operation: "publishRepository",
        provider: providerKind,
        detail: "Origin-only policy permits publishing only through the origin remote.",
      });
    }

    const branchResult = yield* git.execute({
      operation: "OriginPublicationPolicy.branch",
      cwd: input.cwd,
      args: ["branch", "--show-current"],
      timeoutMs: 5_000,
      maxOutputBytes: 64 * 1024,
    });
    const globalRedirect = yield* git.readConfigValue(input.cwd, "remote.pushDefault");
    const branchName = branchResult.stdout.trim();
    const branchRedirect = branchName
      ? yield* git.readConfigValue(input.cwd, `branch.${branchName}.pushRemote`)
      : null;
    const redirectError = originPushRedirectError(branchRedirect ?? "", globalRedirect ?? "");
    if (redirectError)
      return yield* new SourceControlRepositoryError({
        operation: "publishRepository",
        provider: providerKind,
        detail: redirectError,
      });

    let existingOriginUrl = yield* git.readConfigValue(input.cwd, "remote.origin.url");
    if (existingOriginUrl !== null) {
      const live = yield* git.execute({
        operation: "OriginPublicationPolicy.fetchUrls",
        cwd: input.cwd,
        args: ["remote", "get-url", "--all", ORIGIN_REMOTE_NAME],
        timeoutMs: 5_000,
        maxOutputBytes: 64 * 1024,
      });
      const fetchUrls = live.stdout.trim().split(/\r?\n/u).filter(Boolean);
      if (
        live.stdoutTruncated ||
        !fetchUrls[0] ||
        fetchUrls.some(
          (url) =>
            normalizeGitRemoteMutationTarget(url) !==
            normalizeGitRemoteMutationTarget(fetchUrls[0]!),
        )
      )
        return yield* new SourceControlRepositoryError({
          operation: "publishRepository",
          provider: providerKind,
          detail: "Origin-only policy requires an unambiguous origin fetch URL.",
        });
      existingOriginUrl = fetchUrls[0];
    }
    if (existingOriginUrl === null) {
      const remoteNamesResult = yield* git.execute({
        operation: "SourceControlRepositoryService.publishRepository.preflightRemoteNames",
        cwd: input.cwd,
        args: ["remote"],
        timeoutMs: 5_000,
        maxOutputBytes: 64 * 1024,
      });
      const originRemoteNameOccupied = remoteNamesResult.stdout
        .split(/\r?\n/u)
        .some((remoteName) => isOriginRemoteName(remoteName));
      if (originRemoteNameOccupied) {
        return yield* new SourceControlRepositoryError({
          operation: "publishRepository",
          provider: providerKind,
          detail:
            "Origin-only policy rejected publication because origin exists without a usable fetch URL.",
        });
      }

      const remoteResult = yield* git.execute({
        operation: "SourceControlRepositoryService.publishRepository.preflightRemotes",
        cwd: input.cwd,
        args: ["remote", "-v"],
        timeoutMs: 5_000,
        maxOutputBytes: 64 * 1024,
      });
      const conflictingRemote = parseRemoteUrls(remoteResult.stdout).find(
        (remote) =>
          !isOriginRemoteName(remote.name) &&
          publicationTargetMatchesRemote(
            requestedTarget,
            remoteRepositoryTarget({ remoteUrl: remote.url, provider: providerKind }),
          ),
      );
      if (conflictingRemote) {
        return yield* new SourceControlRepositoryError({
          operation: "publishRepository",
          provider: providerKind,
          detail:
            "Origin-only policy rejected publication because the requested repository is already configured through a non-origin remote.",
        });
      }
    }
    const existingOriginPushUrls =
      existingOriginUrl === null
        ? []
        : yield* git
            .execute({
              operation: "SourceControlRepositoryService.publishRepository.originPushUrls",
              cwd: input.cwd,
              args: ["remote", "get-url", "--push", "--all", ORIGIN_REMOTE_NAME],
              allowNonZeroExit: true,
              timeoutMs: 5_000,
              maxOutputBytes: 64 * 1024,
            })
            .pipe(
              Effect.map((result) =>
                result.exitCode === 0 && !result.stdoutTruncated
                  ? result.stdout
                      .split(/\r?\n/u)
                      .map((url) => url.trim())
                      .filter((url) => url.length > 0)
                  : [],
              ),
            );
    const existingOriginTarget =
      existingOriginUrl === null
        ? null
        : remoteRepositoryTarget({ remoteUrl: existingOriginUrl, provider: providerKind });
    const existingOriginContext =
      existingOriginUrl === null
        ? null
        : providerContextFromOrigin({ provider: providerKind, originUrl: existingOriginUrl });
    if (
      existingOriginUrl !== null &&
      (!publicationTargetMatchesRemote(requestedTarget, existingOriginTarget) ||
        existingOriginContext === null)
    ) {
      return yield* new SourceControlRepositoryError({
        operation: "publishRepository",
        provider: providerKind,
        detail:
          "Origin-only policy rejected publication because the existing origin does not match the selected provider endpoint and repository.",
      });
    }
    if (
      existingOriginUrl !== null &&
      (existingOriginPushUrls.length === 0 ||
        existingOriginPushUrls.some(
          (url) =>
            normalizeGitRemoteMutationTarget(url) !==
            normalizeGitRemoteMutationTarget(existingOriginUrl),
        ))
    ) {
      return yield* new SourceControlRepositoryError({
        operation: "publishRepository",
        provider: providerKind,
        detail:
          "Origin-only policy rejected origin because its push URL differs from its fetch URL.",
      });
    }
    return { existingOriginUrl, existingOriginTarget, existingOriginContext };
  },
);
