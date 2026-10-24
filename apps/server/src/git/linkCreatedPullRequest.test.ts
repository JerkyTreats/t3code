import { SourceControlProviderKind } from "@t3tools/contracts";
import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type GitRunStackedActionResult,
  type OrchestrationV2ServerCommand as OrchestrationCommand,
  type OrchestrationProjectShell,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import {
  type PullRequestTestThread,
  v2PullRequestThread,
} from "../orchestration-v2/testkit/pullRequestFixtures.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { refreshPushedPullRequests } from "./refreshPushedPullRequests.ts";
import * as PullRequestService from "../pullRequest/PullRequestService.ts";
import { createdPullRequestKey, linkCreatedPullRequest } from "./linkCreatedPullRequest.ts";

const PROJECT_ID = ProjectId.make("project-1");
const THREAD_ID = ThreadId.make("thread-1");
const commandId = Effect.succeed(CommandId.make("server:pr-created-link:test"));

const project: OrchestrationProjectShell = {
  id: PROJECT_ID,
  title: "Project",
  workspaceRoot: "/workspace/project",
  defaultModelSelection: null,
  scripts: [],
  repositoryIdentity: {
    canonicalKey: "github.acme.test/platform/api",
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "git@github.acme.test:Platform/API.git",
    },
    provider: SourceControlProviderKind.make("github"),
    displayName: "Platform/API",
    owner: "Platform",
    name: "API",
  },
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const thread: PullRequestTestThread = {
  id: THREAD_ID,
  projectId: PROJECT_ID,
  title: "Thread",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  pullRequests: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  latestUserMessageAt: "2026-08-20T00:00:00.000Z",
};

function prResult(pr: GitRunStackedActionResult["pr"]): Pick<GitRunStackedActionResult, "pr"> {
  return { pr };
}

const layerDependenciesFor = (
  dispatch: Orchestrator.OrchestratorV2Shape["dispatch"],
  threadShell: PullRequestTestThread | null = thread,
) =>
  Layer.mergeAll(
    Layer.mock(ProjectService.ProjectService)({
      getShell: () => Effect.succeedSome(project),
    }),
    Layer.mock(Orchestrator.OrchestratorV2)({
      getThreadShell: () => Effect.succeed(threadShell ? v2PullRequestThread(threadShell) : null),
      dispatch,
    }),
  );

const recordingDispatch = Effect.fn("recordingDispatch")(function* () {
  const commands = yield* Ref.make<ReadonlyArray<OrchestrationCommand>>([]);
  const dispatch: Orchestrator.OrchestratorV2Shape["dispatch"] = (command) =>
    Ref.update(commands, (recorded) => [...recorded, command]).pipe(
      Effect.as({ sequence: 1, storedEvents: [] }),
    );
  return { commands, dispatch };
});

describe("createdPullRequestKey", () => {
  it("links a recognisable URL only when it matches origin", () => {
    expect(
      createdPullRequestKey(
        prResult({
          status: "created",
          number: 12,
          url: "https://github.acme.test/Platform/API/pull/12",
        }),
        project,
      ),
    ).toEqual({
      host: "github.acme.test",
      repository: "platform/api",
      number: 12,
      url: "https://github.acme.test/Platform/API/pull/12",
    });
    expect(
      createdPullRequestKey(
        prResult({ status: "created", number: 12, url: "https://github.com/Other/Fork/pull/12" }),
        project,
      ),
    ).toBeNull();
  });

  it("links exact custom ports and Azure native identities while rejecting foreign targets", () => {
    const cases = [
      {
        provider: SourceControlProviderKind.make("github"),
        remote: "https://github.example.test:8443/team/repo.git",
        url: "https://github.example.test:8443/team/repo/pull/12",
        host: "github.example.test:8443",
        repository: "team/repo",
      },
      {
        provider: SourceControlProviderKind.make("gitlab"),
        remote: "https://gitlab.example.test:8443/team/repo.git",
        url: "https://gitlab.example.test:8443/team/repo/-/merge_requests/12",
        host: "gitlab.example.test:8443",
        repository: "team/repo",
      },
      {
        provider: SourceControlProviderKind.make("forgejo"),
        remote: "https://forge.example.test:8443/team/repo.git",
        url: "https://forge.example.test:8443/team/repo/pulls/12",
        host: "forge.example.test:8443",
        repository: "team/repo",
      },
      {
        provider: SourceControlProviderKind.make("azure-devops"),
        remote: "https://dev.azure.com/org/project/_git/repo",
        url: "https://dev.azure.com/org/project/_git/repo/pullrequest/12",
        host: "dev.azure.com",
        repository: "repo",
      },
      {
        provider: SourceControlProviderKind.make("azure-devops"),
        remote: "git@ssh.dev.azure.com:v3/org/project/repo",
        url: "https://dev.azure.com/org/project/_git/repo/pullrequest/12",
        host: "ssh.dev.azure.com",
        repository: "repo",
      },
      {
        provider: SourceControlProviderKind.make("azure-devops"),
        remote: "https://org.visualstudio.com/project/_git/repo",
        url: "https://dev.azure.com/org/project/_git/repo/pullrequest/12",
        host: "org.visualstudio.com",
        repository: "repo",
      },
    ];
    for (const item of cases) {
      const boundProject = {
        ...project,
        repositoryIdentity: {
          ...project.repositoryIdentity!,
          provider: item.provider,
          locator: { source: "git-remote" as const, remoteName: "origin", remoteUrl: item.remote },
        },
      };
      expect(
        createdPullRequestKey(
          prResult({ status: "created", number: 12, url: item.url }),
          boundProject,
        ),
      ).toEqual({ host: item.host, repository: item.repository, number: 12, url: item.url });
      const foreign = item.url.includes(":8443")
        ? item.url.replace(":8443", ":9443")
        : item.url.replace("/org/project/", "/other/project/");
      expect(
        createdPullRequestKey(
          prResult({ status: "created", number: 12, url: foreign }),
          boundProject,
        ),
      ).toBeNull();
    }
  });

  it("refuses an unreadable URL", () => {
    expect(
      createdPullRequestKey(
        prResult({ status: "opened_existing", number: 3, url: "https://ghe.internal/x/3" }),
        project,
      ),
    ).toBeNull();
    expect(
      createdPullRequestKey(
        prResult({ status: "created", number: 3, url: "https://ghe.internal/x/3" }),
        undefined,
      ),
    ).toBeNull();
  });
});

describe("linkCreatedPullRequest", () => {
  it.effect("links a created pull request to the thread with source created", () =>
    Effect.gen(function* () {
      const { commands, dispatch } = yield* recordingDispatch();
      yield* linkCreatedPullRequest({
        threadId: THREAD_ID,
        result: prResult({
          status: "created",
          number: 42,
          url: "https://github.acme.test/Platform/API/pull/42",
        }),
        commandId,
      }).pipe(Effect.provide(layerDependenciesFor(dispatch)));

      expect(yield* Ref.get(commands)).toEqual([
        {
          type: "thread.pull-request.link",
          commandId: "server:pr-created-link:test",
          threadId: THREAD_ID,
          host: "github.acme.test",
          repository: "platform/api",
          number: 42,
          url: "https://github.acme.test/Platform/API/pull/42",
          source: "created",
        },
      ]);
    }),
  );
});

it.effect(
  "refreshes PR readers after a push from a thread or project, but not a local commit",
  () =>
    Effect.gen(function* () {
      const refreshed: string[] = [];
      const layerDependencies = Layer.mergeAll(
        Layer.mock(Orchestrator.OrchestratorV2)({
          getThreadShell: () => Effect.succeed(v2PullRequestThread(thread)),
        }),
        Layer.mock(ProjectStore.ProjectStoreV2)({
          listShells: () => Effect.succeed([project]),
        }),
        Layer.mock(PullRequestService.PullRequestService)({
          refreshAfterTurn: (id) =>
            Effect.sync(() => {
              refreshed.push(id);
            }),
        }),
      );
      yield* refreshPushedPullRequests(
        { cwd: "/worktree", threadId: THREAD_ID },
        { push: { status: "pushed" } },
      ).pipe(Effect.provide(layerDependencies));
      yield* refreshPushedPullRequests(
        { cwd: project.workspaceRoot },
        { push: { status: "pushed" } },
      ).pipe(Effect.provide(layerDependencies));
      yield* refreshPushedPullRequests({ cwd: "/unrelated" }, { push: { status: "pushed" } }).pipe(
        Effect.provide(layerDependencies),
      );
      yield* refreshPushedPullRequests(
        { cwd: project.workspaceRoot, threadId: THREAD_ID },
        { push: { status: "skipped_not_requested" } },
      ).pipe(Effect.provide(layerDependencies));
      yield* refreshPushedPullRequests(
        { cwd: "/draft-worktree", projectId: PROJECT_ID },
        { push: { status: "pushed" } },
      ).pipe(Effect.provide(layerDependencies));
      expect(refreshed).toEqual([PROJECT_ID, PROJECT_ID, PROJECT_ID]);
    }),
);
