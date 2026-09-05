import {
  requireAzureDevOpsRepositoryTarget,
  requireAzureDevOpsChangeRequestTarget,
} from "../fork/originHostedProviderPolicy.ts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { SourceControlProviderError, type ChangeRequest } from "@t3tools/contracts";

import * as AzureDevOpsCli from "./AzureDevOpsCli.ts";
import { azureDevOpsRepositoryTargetFromPublication } from "./AzureDevOpsRepositoryTarget.ts";
import * as SourceControlProvider from "./SourceControlProvider.ts";
import {
  combinedAuthOutput,
  firstSafeAuthLine,
  providerAuth,
  type SourceControlAuthProbeInput,
  type SourceControlCliDiscoverySpec,
} from "./SourceControlProviderDiscovery.ts";

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
  kind: "azure-devops",
  label: "Azure DevOps",
  executable: "az",
  versionArgs: ["--version"],
  authArgs: ["account", "show", "--query", "user.name", "-o", "tsv"],
  // `az` boots a fresh Python interpreter on every invocation, so even `az --version`
  // takes ~6s on Windows and overruns the default budget, leaving the provider reported
  // as missing on machines where it is installed. `gh` and `glab` answer in ~0.3s.
  probeTimeoutMs: 20_000,
  parseAuth: parseAzureAuth,
  installHint:
    "Install the Azure command-line tools (`az`), then enable Azure DevOps support with `az extension add --name azure-devops`.",
} satisfies SourceControlCliDiscoverySpec;

function toChangeRequest(summary: {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state: "open" | "closed" | "merged";
  readonly isDraft?: boolean;
  readonly updatedAt: ChangeRequest["updatedAt"];
}): ChangeRequest {
  return {
    provider: "azure-devops",
    number: summary.number,
    title: summary.title,
    url: summary.url,
    baseRefName: summary.baseRefName,
    headRefName: summary.headRefName,
    state: summary.state,
    ...(summary.isDraft === true ? { isDraft: true } : {}),
    updatedAt: summary.updatedAt,
    isCrossRepository: false,
  };
}

export const make = Effect.gen(function* () {
  const azure = yield* AzureDevOpsCli.AzureDevOpsCli;

  return SourceControlProvider.SourceControlProvider.of({
    kind: "azure-devops",
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
              provider: "azure-devops",
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
              provider: "azure-devops",
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
              provider: "azure-devops",
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
                    provider: "azure-devops",
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
              provider: "azure-devops",
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
            provider: "azure-devops",
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
              provider: "azure-devops",
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
              provider: "azure-devops",
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
              provider: "azure-devops",
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

export const layer = Layer.effect(SourceControlProvider.SourceControlProvider, make);
