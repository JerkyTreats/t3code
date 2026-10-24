import { SourceControlProviderKind } from "@t3tools/contracts";
import {
  requireAzureDevOpsRepositoryTarget,
  requireAzureDevOpsChangeRequestTarget,
} from "@t3tools/source-control-core/server/fork/originHostedProviderPolicy";
import * as Effect from "effect/Effect";
import { SourceControlProviderError, type ChangeRequest } from "@t3tools/contracts";

import * as AzureDevOpsCli from "./AzureDevOpsCli.ts";
import type { NormalizedAzureDevOpsPullRequestRecord } from "./azureDevOpsPullRequests.ts";
import * as SourceControlProvider from "@t3tools/source-control-core/server/SourceControlProvider";
import { azureDevOpsRepositoryTargetFromPublication } from "@t3tools/source-control-core/server/fork/AzureDevOpsRepositoryTarget";
import {
  combinedAuthOutput,
  firstSafeAuthLine,
  providerAuth,
  type SourceControlAuthProbeInput,
  type SourceControlCliDiscoverySpec,
} from "@t3tools/source-control-core/server/discovery";

function parseAzureAuth(input: SourceControlAuthProbeInput) {
  const account = input.stdout.trim().split(/\r?\n/)[0]?.trim();

  if (input.exitCode !== 0) {
    return providerAuth({
      status: "unauthenticated",
      detail:
        firstSafeAuthLine(combinedAuthOutput(input)) ?? "Run `az login` to authenticate Azure CLI.",
    });
  }

  if (account !== undefined && account.length > 0) {
    return providerAuth({
      status: "authenticated",
      account,
      host: "dev.azure.com",
    });
  }

  return providerAuth({
    status: "unknown",
    host: "dev.azure.com",
    detail: "Azure CLI account status could not be parsed.",
  });
}

export const discovery = {
  type: "cli",
  kind: SourceControlProviderKind.make("azure-devops"),
  label: "Azure DevOps",
  executable: "az",
  versionArgs: ["--version"],
  authArgs: ["account", "show", "--query", "user.name", "-o", "tsv"],
  // `az` boots a fresh Python interpreter on every invocation, so even `az --version` takes ~6s
  // on Windows and overruns the default budget, leaving the provider reported as missing on
  // machines where it is installed.
  probeTimeoutMs: 20_000,
  parseAuth: parseAzureAuth,
  installHint:
    "Install the Azure command-line tools (`az`), then enable Azure DevOps support with `az extension add --name azure-devops`.",
} satisfies SourceControlCliDiscoverySpec;

function toChangeRequest(summary: NormalizedAzureDevOpsPullRequestRecord): ChangeRequest {
  return {
    provider: SourceControlProviderKind.make("azure-devops"),
    number: summary.number,
    title: summary.title,
    url: summary.url,
    baseRefName: summary.baseRefName,
    headRefName: summary.headRefName,
    ...(summary.headSha !== undefined ? { headSha: summary.headSha } : {}),
    state: summary.state,
    ...(summary.isDraft === true ? { isDraft: true } : {}),
    closedAt: summary.closedAt ?? null,
    mergedAt: summary.mergedAt ?? null,
    updatedAt: summary.updatedAt,
    isCrossRepository: summary.isCrossRepository,
  };
}

export const make = Effect.gen(function* () {
  const azure = yield* AzureDevOpsCli.AzureDevOpsCli;

  return SourceControlProvider.SourceControlProvider.of({
    kind: SourceControlProviderKind.make("azure-devops"),
    listChangeRequests: (input) => {
      const source = SourceControlProvider.sourceControlRefFromInput(input);
      return requireAzureDevOpsRepositoryTarget({
        cwd: input.cwd,
        context: input.context,
        operation: "listChangeRequests",
        reference: input.headSelector,
      }).pipe(
        Effect.flatMap((target) =>
          azure.listPullRequests({
            cwd: input.cwd,
            ...target,
            headSelector: input.headSelector,
            ...(source !== undefined ? { source } : {}),
            state: input.state,
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
          }),
        ),
        Effect.map((items) => items.map(toChangeRequest)),
        Effect.mapError(
          (error) =>
            new SourceControlProviderError({
              provider: SourceControlProviderKind.make("azure-devops"),
              operation: "listChangeRequests",
              command: error.command,
              cwd: input.cwd,
              reference: SourceControlProvider.transportSafeSourceControlErrorValue(
                input.headSelector,
              ),
              detail: error.detail,
              cause: error,
            }),
        ),
      );
    },
    getChangeRequest: (input) =>
      requireAzureDevOpsRepositoryTarget({
        cwd: input.cwd,
        context: input.context,
        operation: "getChangeRequest",
        reference: input.reference,
      }).pipe(
        Effect.flatMap((target) =>
          azure
            .getPullRequest({
              cwd: input.cwd,
              organization: target.organization,
              reference: input.reference,
            })
            .pipe(
              Effect.flatMap((changeRequest) =>
                requireAzureDevOpsChangeRequestTarget({
                  cwd: input.cwd,
                  operation: "getChangeRequest",
                  reference: input.reference,
                  target,
                  changeRequest,
                }),
              ),
            ),
        ),
        Effect.map(toChangeRequest),
        Effect.mapError(
          (error) =>
            new SourceControlProviderError({
              provider: SourceControlProviderKind.make("azure-devops"),
              operation: "getChangeRequest",
              command: error.command,
              cwd: input.cwd,
              reference: SourceControlProvider.transportSafeSourceControlErrorValue(
                input.reference,
              ),
              detail: error.detail,
              cause: error,
            }),
        ),
      ),
    createChangeRequest: (input) => {
      const source = SourceControlProvider.sourceControlRefFromInput(input);
      return requireAzureDevOpsRepositoryTarget({
        cwd: input.cwd,
        context: input.context,
        operation: "createChangeRequest",
        reference: input.headSelector,
      }).pipe(
        Effect.flatMap((target) =>
          azure.createPullRequest({
            cwd: input.cwd,
            ...target,
            baseBranch: input.baseRefName,
            headSelector: input.headSelector,
            ...(source !== undefined ? { source } : {}),
            ...(input.target !== undefined ? { target: input.target } : {}),
            title: input.title,
            bodyFile: input.bodyFile,
          }),
        ),
        Effect.mapError(
          (error) =>
            new SourceControlProviderError({
              provider: SourceControlProviderKind.make("azure-devops"),
              operation: "createChangeRequest",
              command: error.command,
              cwd: input.cwd,
              reference: SourceControlProvider.transportSafeSourceControlErrorValue(
                input.headSelector,
              ),
              detail: error.detail,
              cause: error,
            }),
        ),
      );
    },
    getRepositoryCloneUrls: (input) => {
      const target: Effect.Effect<
        {
          readonly repository: string;
          readonly organization?: string;
          readonly project?: string;
        },
        SourceControlProviderError
      > = input.context
        ? requireAzureDevOpsRepositoryTarget({
            cwd: input.cwd,
            context: input.context,
            operation: "getRepositoryCloneUrls",
          })
        : (() => {
            const target = input.providerBaseUrl
              ? azureDevOpsRepositoryTargetFromPublication({
                  providerBaseUrl: input.providerBaseUrl,
                  repository: input.repository,
                })
              : null;
            return target
              ? Effect.succeed(target)
              : Effect.fail(
                  new SourceControlProviderError({
                    provider: SourceControlProviderKind.make("azure-devops"),
                    operation: "getRepositoryCloneUrls",
                    cwd: input.cwd,
                    repository: SourceControlProvider.transportSafeSourceControlErrorValue(
                      input.repository,
                    ),
                    detail:
                      "An explicit Azure organization endpoint and project repository path are required.",
                  }),
                );
          })();
      return target.pipe(
        Effect.flatMap((resolvedTarget) =>
          azure.getRepositoryCloneUrls({ cwd: input.cwd, ...resolvedTarget }),
        ),
        Effect.mapError(
          (error) =>
            new SourceControlProviderError({
              provider: SourceControlProviderKind.make("azure-devops"),
              operation: "getRepositoryCloneUrls",
              command: error.command,
              cwd: input.cwd,
              repository: SourceControlProvider.transportSafeSourceControlErrorValue(
                input.repository,
              ),
              detail: error.detail,
              cause: error,
            }),
        ),
      );
    },
    createRepository: (input) => {
      const target = azureDevOpsRepositoryTargetFromPublication(input);
      if (target === null) {
        return Effect.fail(
          new SourceControlProviderError({
            provider: SourceControlProviderKind.make("azure-devops"),
            operation: "createRepository",
            cwd: input.cwd,
            repository: SourceControlProvider.transportSafeSourceControlErrorValue(
              input.repository,
            ),
            detail:
              "Azure DevOps publication requires an explicit organization, project, and repository.",
          }),
        );
      }
      return azure.createRepository({ ...input, ...target }).pipe(
        Effect.mapError(
          (error) =>
            new SourceControlProviderError({
              provider: SourceControlProviderKind.make("azure-devops"),
              operation: "createRepository",
              command: error.command,
              cwd: input.cwd,
              repository: SourceControlProvider.transportSafeSourceControlErrorValue(
                input.repository,
              ),
              detail: error.detail,
              cause: error,
            }),
        ),
      );
    },
    getDefaultBranch: (input) =>
      requireAzureDevOpsRepositoryTarget({
        cwd: input.cwd,
        context: input.context,
        operation: "getDefaultBranch",
      }).pipe(
        Effect.flatMap((target) => azure.getDefaultBranch({ cwd: input.cwd, ...target })),
        Effect.mapError(
          (error) =>
            new SourceControlProviderError({
              provider: SourceControlProviderKind.make("azure-devops"),
              operation: "getDefaultBranch",
              command: error.command,
              cwd: input.cwd,
              detail: error.detail,
              cause: error,
            }),
        ),
      ),
    checkoutChangeRequest: (input) =>
      requireAzureDevOpsRepositoryTarget({
        cwd: input.cwd,
        context: input.context,
        operation: "checkoutChangeRequest",
        reference: input.reference,
      }).pipe(
        Effect.flatMap((target) =>
          azure
            .getPullRequest({
              cwd: input.cwd,
              organization: target.organization,
              reference: input.reference,
            })
            .pipe(
              Effect.flatMap((changeRequest) =>
                requireAzureDevOpsChangeRequestTarget({
                  cwd: input.cwd,
                  operation: "checkoutChangeRequest",
                  reference: input.reference,
                  target,
                  changeRequest,
                }),
              ),
              Effect.andThen(
                azure.checkoutPullRequest({
                  cwd: input.cwd,
                  organization: target.organization,
                  reference: input.reference,
                  remoteName: "origin",
                }),
              ),
            ),
        ),
        Effect.mapError(
          (error) =>
            new SourceControlProviderError({
              provider: SourceControlProviderKind.make("azure-devops"),
              operation: "checkoutChangeRequest",
              command: error.command,
              cwd: input.cwd,
              reference: SourceControlProvider.transportSafeSourceControlErrorValue(
                input.reference,
              ),
              detail: error.detail,
              cause: error,
            }),
        ),
      ),
  });
});
