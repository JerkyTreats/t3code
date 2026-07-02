import "../../index.css";

import { scopeThreadRef } from "@t3tools/client-runtime";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import { render } from "vitest-browser-react";

const ENVIRONMENT_ID = EnvironmentId.make("environment-git-panel-browser");
const PROJECT_ID = ProjectId.make("project-git-panel-browser");
const THREAD_ID = ThreadId.make("thread-git-panel-browser");
const THREAD_REF = scopeThreadRef(ENVIRONMENT_ID, THREAD_ID);
const REPO_CWD = "/repo/project";
const NOW_ISO = "2026-05-30T12:00:00.000Z";

const consoleErrorSpy = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

  return {
    ...actual,
    useNavigate: () => vi.fn(() => Promise.resolve()),
  };
});

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");

  return {
    ...actual,
    useIsMutating: vi.fn(() => 0),
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    })),
    useQuery: vi.fn((options: { __kind?: string }) => {
      if (options.__kind === "git-branches") {
        return {
          data: {
            refs: [
              {
                name: "main",
                current: true,
                isDefault: true,
                isRemote: false,
                worktreePath: null,
              },
            ],
            isRepo: true,
            hasPrimaryRemote: true,
            nextCursor: null,
            totalCount: 1,
          },
          error: null,
        };
      }

      if (options.__kind === "github-status") {
        return {
          data: {
            installed: true,
            authenticated: false,
            login: null,
            repo: null,
          },
          error: null,
        };
      }

      if (options.__kind === "github-issues") {
        return {
          data: { issues: [], hasMore: false },
          error: null,
        };
      }

      return { data: null, error: null };
    }),
    useQueryClient: vi.fn(() => ({})),
  };
});

vi.mock("~/environmentApi", () => ({
  ensureEnvironmentApi: vi.fn(),
  readEnvironmentApi: vi.fn(() => ({
    git: {
      mergeBranches: vi.fn(),
      abortMerge: vi.fn(),
    },
    github: {
      status: vi.fn(),
      login: vi.fn(),
      listIssues: vi.fn(),
      createIssue: vi.fn(),
      closeIssue: vi.fn(),
      reopenIssue: vi.fn(),
    },
    sourceControl: {
      publishRepository: vi.fn(),
    },
  })),
}));

vi.mock("~/localApi", () => ({
  ensureLocalApi: vi.fn(() => {
    throw new Error("ensureLocalApi is not implemented in this browser test.");
  }),
  readLocalApi: vi.fn(() => null),
}));

vi.mock("~/lib/gitReactQuery", () => ({
  gitAbortMergeMutationOptions: vi.fn(() => ({ __kind: "abort-merge" })),
  gitBranchesQueryOptions: vi.fn(() => ({ __kind: "git-branches" })),
  gitCreateWorktreeMutationOptions: vi.fn(() => ({ __kind: "create-worktree" })),
  gitInitMutationOptions: vi.fn(() => ({ __kind: "init" })),
  gitMergeBranchesMutationOptions: vi.fn(() => ({ __kind: "merge-branches" })),
  gitMutationKeys: {
    abortMerge: vi.fn(() => ["abort-merge"]),
    mergeBranches: vi.fn(() => ["merge-branches"]),
    pull: vi.fn(() => ["pull"]),
    runStackedAction: vi.fn(() => ["run-stacked-action"]),
  },
  gitPullMutationOptions: vi.fn(() => ({ __kind: "pull" })),
  gitRemoveWorktreeMutationOptions: vi.fn(() => ({ __kind: "remove-worktree" })),
  gitRunStackedActionMutationOptions: vi.fn(() => ({ __kind: "run-stacked-action" })),
  invalidateGitQueries: vi.fn(() => Promise.resolve()),
  sourceControlPublishRepositoryMutationOptions: vi.fn(() => ({ __kind: "publish-repository" })),
}));

vi.mock("~/lib/gitStatusState", () => ({
  useGitStatus: vi.fn(() => ({
    data: {
      isRepo: true,
      sourceControlProvider: {
        kind: "github",
        name: "GitHub",
        baseUrl: "https://github.com",
      },
      hasPrimaryRemote: true,
      isDefaultRef: true,
      refName: "main",
      hasWorkingTreeChanges: false,
      workingTree: { files: [], insertions: 0, deletions: 0 },
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      merge: { inProgress: false, conflictedFiles: [] },
      pr: null,
    },
    error: null,
    isPending: false,
  })),
}));

vi.mock("~/lib/sourceControlDiscoveryState", () => ({
  useSourceControlDiscovery: vi.fn(() => ({
    data: { sourceControlProviders: [] },
    error: null,
    isLoading: false,
  })),
}));

vi.mock("~/lib/githubReactQuery", () => ({
  githubCloseIssueMutationOptions: vi.fn(() => ({ __kind: "close-issue" })),
  githubCreateIssueMutationOptions: vi.fn(() => ({ __kind: "create-issue" })),
  githubIssuesQueryOptions: vi.fn(() => ({ __kind: "github-issues" })),
  githubLoginMutationOptions: vi.fn(() => ({ __kind: "github-login" })),
  githubReopenIssueMutationOptions: vi.fn(() => ({ __kind: "reopen-issue" })),
  githubStatusQueryOptions: vi.fn(() => ({ __kind: "github-status" })),
  invalidateGitHubQueries: vi.fn(() => Promise.resolve()),
}));

import GitPanel from "./GitPanel";
import { useStore } from "~/store";

function createSnapshot(): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    projects: [
      {
        id: PROJECT_ID,
        title: "Project",
        workspaceRoot: REPO_CWD,
        repositoryIdentity: null,
        defaultModelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5",
        },
        scripts: [],
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
      },
    ],
    threads: [
      {
        id: THREAD_ID,
        projectId: PROJECT_ID,
        title: "Git panel thread",
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "main",
        worktreePath: null,
        issueLink: null,
        latestTurn: null,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        archivedAt: null,
        deletedAt: null,
        messages: [],
        activities: [],
        proposedPlans: [],
        checkpoints: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: NOW_ISO,
        },
      },
    ],
    updatedAt: NOW_ISO,
  };
}

function syncStoreSnapshot() {
  const snapshot = createSnapshot();
  useStore.getState().syncServerShellSnapshot(
    {
      snapshotSequence: snapshot.snapshotSequence,
      projects: snapshot.projects.map((project) => ({
        id: project.id,
        title: project.title,
        workspaceRoot: project.workspaceRoot,
        repositoryIdentity: project.repositoryIdentity,
        defaultModelSelection: project.defaultModelSelection,
        scripts: project.scripts,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
      threads: snapshot.threads.map((thread) => ({
        id: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        branch: thread.branch,
        worktreePath: thread.worktreePath,
        issueLink: thread.issueLink,
        latestTurn: thread.latestTurn,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        archivedAt: thread.archivedAt,
        session: thread.session,
        latestUserMessageAt: null,
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        hasActionableProposedPlan: false,
        activePlanProgress: null,
        latestRuntimeActivityAt: null,
        statusSummaryUpdatedAt: null,
      })),
      updatedAt: snapshot.updatedAt,
    },
    ENVIRONMENT_ID,
  );
  useStore.getState().syncServerThreadDetail(snapshot.threads[0]!, ENVIRONMENT_ID);
}

describe("GitPanel", () => {
  beforeEach(() => {
    useStore.setState({
      activeEnvironmentId: null,
      environmentStateById: {},
    });
    syncStoreSnapshot();
    consoleErrorSpy.mockClear();
    vi.spyOn(console, "error").mockImplementation((...args) => {
      consoleErrorSpy(...args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("mounts without an external store snapshot update loop", async () => {
    await render(
      <GitPanel activeThreadRef={THREAD_REF} repoCwd={REPO_CWD} workspaceCwd={REPO_CWD} />,
    );

    await expect.element(page.getByText("Git", { exact: true })).toBeInTheDocument();
    await expect.element(page.getByText("Commit & Push", { exact: true })).toBeInTheDocument();

    const errorMessages = consoleErrorSpy.mock.calls.map((call) => call.join(" "));
    expect(errorMessages).not.toContainEqual(expect.stringContaining("getSnapshot"));
    expect(errorMessages).not.toContainEqual(expect.stringContaining("Maximum update depth"));
  });
});
