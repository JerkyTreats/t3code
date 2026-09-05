import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as AzureDevOpsCli from "./AzureDevOpsCli.ts";
import * as AzureDevOpsSourceControlProvider from "./AzureDevOpsSourceControlProvider.ts";

const originContext = {
  provider: {
    kind: "azure-devops" as const,
    name: "Azure DevOps",
    baseUrl: "https://dev.azure.com",
  },
  remoteName: "origin",
  remoteUrl: "https://dev.azure.com/fork/project/_git/repository",
};

function makeProvider(azure: Partial<AzureDevOpsCli.AzureDevOpsCli["Service"]>) {
  return AzureDevOpsSourceControlProvider.make.pipe(
    Effect.provide(Layer.mock(AzureDevOpsCli.AzureDevOpsCli)(azure)),
  );
}

it.effect("binds repository lookup to the explicit Azure organization", () =>
  Effect.gen(function* () {
    let received:
      | Parameters<AzureDevOpsCli.AzureDevOpsCli["Service"]["getRepositoryCloneUrls"]>[0]
      | null = null;
    const provider = yield* makeProvider({
      getRepositoryCloneUrls: (input) => {
        received = input;
        return Effect.succeed({
          nameWithOwner: "platform/repo",
          url: "https://dev.azure.com/acme/platform/_git/repo",
          sshUrl: "git@ssh.dev.azure.com:v3/acme/platform/repo",
        });
      },
    });

    yield* provider.getRepositoryCloneUrls({
      cwd: "/repo",
      providerBaseUrl: "https://dev.azure.com/acme",
      repository: "platform/repo",
    });

    assert.deepStrictEqual(received, {
      cwd: "/repo",
      organization: "https://dev.azure.com/acme",
      project: "platform",
      repository: "repo",
    });
  }),
);

it.effect("maps Azure DevOps PR summaries into provider-neutral change requests", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      getPullRequest: () =>
        Effect.succeed({
          number: 42,
          title: "Add Azure provider",
          url: "https://dev.azure.com/fork/project/_git/repository/pullrequest/42",
          baseRefName: "main",
          headRefName: "feature/source-control",
          state: "open",
          updatedAt: Option.none(),
        }),
    });

    const changeRequest = yield* provider.getChangeRequest({
      cwd: "/repo",
      context: originContext,
      reference: "42",
    });

    assert.deepStrictEqual(changeRequest, {
      provider: "azure-devops",
      number: 42,
      title: "Add Azure provider",
      url: "https://dev.azure.com/fork/project/_git/repository/pullrequest/42",
      baseRefName: "main",
      headRefName: "feature/source-control",
      state: "open",
      updatedAt: Option.none(),
      isCrossRepository: false,
    });
  }),
);

it.effect("adds change-request context while retaining Azure CLI causes", () =>
  Effect.gen(function* () {
    const cause = new AzureDevOpsCli.AzureDevOpsCommandFailedError({
      operation: "execute",
      command: "az",
      cwd: "/repo",
      argumentCount: 2,
      cause: new Error("raw upstream detail that should remain in the cause"),
    });
    const provider = yield* makeProvider({
      getPullRequest: () =>
        Effect.succeed({
          number: 42,
          title: "Origin PR",
          url: "https://dev.azure.com/fork/project/_git/repository/pullrequest/42",
          baseRefName: "main",
          headRefName: "feature/origin",
          state: "open",
          updatedAt: Option.none(),
        }),
      checkoutPullRequest: () => Effect.fail(cause),
    });

    const error = yield* provider
      .checkoutChangeRequest({ cwd: "/repo", context: originContext, reference: "#42" })
      .pipe(Effect.flip);

    assert.deepStrictEqual(
      {
        provider: error.provider,
        operation: error.operation,
        command: error.command,
        cwd: error.cwd,
        reference: error.reference,
        detail: error.detail,
      },
      {
        provider: "azure-devops",
        operation: "checkoutChangeRequest",
        command: "az",
        cwd: "/repo",
        reference: "#42",
        detail: "Azure DevOps CLI command failed.",
      },
    );
    assert.strictEqual(error.cause, cause);
    assert.equal(error.message.includes("raw upstream detail"), false);
  }),
);

it.effect("pins Azure DevOps PR creation to origin when another remote may be present", () =>
  Effect.gen(function* () {
    let createInput:
      | Parameters<AzureDevOpsCli.AzureDevOpsCli["Service"]["createPullRequest"]>[0]
      | null = null;
    const provider = yield* makeProvider({
      createPullRequest: (input) => {
        createInput = input;
        return Effect.void;
      },
    });

    yield* provider.createChangeRequest({
      cwd: "/repo",
      context: originContext,
      baseRefName: "main",
      headSelector: "feature/provider",
      title: "Provider PR",
      bodyFile: "/tmp/body.md",
    });

    assert.deepStrictEqual(createInput, {
      cwd: "/repo",
      organization: "https://dev.azure.com/fork",
      project: "project",
      repository: "repository",
      baseBranch: "main",
      headSelector: "feature/provider",
      title: "Provider PR",
      bodyFile: "/tmp/body.md",
    });
  }),
);

it.effect("requires an organization-qualified endpoint for Azure repository creation", () =>
  Effect.gen(function* () {
    let createCalls = 0;
    const provider = yield* makeProvider({
      createRepository: () =>
        Effect.sync(() => {
          createCalls += 1;
          return {
            nameWithOwner: "project/repository",
            url: "https://dev.azure.com/org/project/_git/repository",
            sshUrl: "git@ssh.dev.azure.com:v3/org/project/repository",
          };
        }),
    });

    const error = yield* provider
      .createRepository({
        cwd: "/repo",
        providerBaseUrl: "https://dev.azure.com",
        repository: "project/repository",
        visibility: "private",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "explicit organization");
    assert.equal(createCalls, 0);
  }),
);

it.effect("rejects Azure DevOps PR creation without an exact origin context", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      createPullRequest: () => Effect.die("must not be called"),
    });

    const error = yield* provider
      .createChangeRequest({
        cwd: "/repo",
        context: { ...originContext, remoteName: "upstream" },
        baseRefName: "main",
        headSelector: "feature/provider",
        title: "Provider PR",
        bodyFile: "/tmp/body.md",
      })
      .pipe(Effect.flip);

    assert.include(error.detail, "exact Azure DevOps origin");
  }),
);

it.effect("pins Azure default branch lookup to origin", () =>
  Effect.gen(function* () {
    let defaultBranchInput:
      | Parameters<AzureDevOpsCli.AzureDevOpsCli["Service"]["getDefaultBranch"]>[0]
      | null = null;
    const provider = yield* makeProvider({
      getDefaultBranch: (input) => {
        defaultBranchInput = input;
        return Effect.succeed("main");
      },
    });

    const defaultBranch = yield* provider.getDefaultBranch({
      cwd: "/repo",
      context: originContext,
    });

    assert.strictEqual(defaultBranch, "main");
    assert.deepStrictEqual(defaultBranchInput, {
      cwd: "/repo",
      organization: "https://dev.azure.com/fork",
      project: "project",
      repository: "repository",
    });
  }),
);

it.effect("pins Azure listing and checkout preflight to origin", () =>
  Effect.gen(function* () {
    let listInput:
      | Parameters<AzureDevOpsCli.AzureDevOpsCli["Service"]["listPullRequests"]>[0]
      | null = null;
    let getInput: Parameters<AzureDevOpsCli.AzureDevOpsCli["Service"]["getPullRequest"]>[0] | null =
      null;
    let checkoutInput:
      | Parameters<AzureDevOpsCli.AzureDevOpsCli["Service"]["checkoutPullRequest"]>[0]
      | null = null;
    const provider = yield* makeProvider({
      listPullRequests: (input) => {
        listInput = input;
        return Effect.succeed([]);
      },
      getPullRequest: (input) => {
        getInput = input;
        return Effect.succeed({
          number: 42,
          title: "Origin PR",
          url: "https://dev.azure.com/fork/project/_git/repository/pullrequest/42",
          baseRefName: "main",
          headRefName: "feature/origin",
          state: "open",
          updatedAt: Option.none(),
        });
      },
      checkoutPullRequest: (input) => {
        checkoutInput = input;
        return Effect.void;
      },
    });

    yield* provider.listChangeRequests({
      cwd: "/repo",
      context: originContext,
      headSelector: "feature/origin",
      state: "open",
    });
    yield* provider.checkoutChangeRequest({
      cwd: "/repo",
      context: originContext,
      reference: "42",
    });

    assert.deepStrictEqual(listInput, {
      cwd: "/repo",
      organization: "https://dev.azure.com/fork",
      project: "project",
      repository: "repository",
      headSelector: "feature/origin",
      state: "open",
    });
    assert.deepStrictEqual(getInput, {
      cwd: "/repo",
      organization: "https://dev.azure.com/fork",
      reference: "42",
    });
    assert.deepStrictEqual(checkoutInput, {
      cwd: "/repo",
      organization: "https://dev.azure.com/fork",
      reference: "42",
      remoteName: "origin",
    });
  }),
);

it.effect("rejects Azure checkout when the pull request belongs to another repository", () =>
  Effect.gen(function* () {
    let checkoutCalls = 0;
    const provider = yield* makeProvider({
      getPullRequest: () =>
        Effect.succeed({
          number: 42,
          title: "Upstream PR",
          url: "https://dev.azure.com/upstream/project/_git/repository/pullrequest/42",
          baseRefName: "main",
          headRefName: "feature/upstream",
          state: "open",
          updatedAt: Option.none(),
        }),
      checkoutPullRequest: () => {
        return Effect.sync(() => {
          checkoutCalls += 1;
        });
      },
    });

    const error = yield* provider
      .checkoutChangeRequest({ cwd: "/repo", context: originContext, reference: "42" })
      .pipe(Effect.flip);

    assert.include(error.detail, "outside origin");
    assert.strictEqual(checkoutCalls, 0);
  }),
);
