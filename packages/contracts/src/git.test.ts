import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  GitAbortMergeInput,
  GitAbortMergeResult,
  GitMergeBranchesInput,
  GitMergeBranchesResult,
  VcsCreateWorktreeInput,
  GitPreparePullRequestThreadInput,
  GitRunStackedActionResult,
  GitRunStackedActionInput,
  GitResolvePullRequestResult,
} from "./git.ts";

const decodeCreateWorktreeInput = Schema.decodeUnknownSync(VcsCreateWorktreeInput);
const decodePreparePullRequestThreadInput = Schema.decodeUnknownSync(
  GitPreparePullRequestThreadInput,
);
const decodeRunStackedActionInput = Schema.decodeUnknownSync(GitRunStackedActionInput);
const decodeRunStackedActionResult = Schema.decodeUnknownSync(GitRunStackedActionResult);
const decodeResolvePullRequestResult = Schema.decodeUnknownSync(GitResolvePullRequestResult);
const decodeMergeBranchesInput = Schema.decodeUnknownSync(GitMergeBranchesInput);
const decodeMergeBranchesResult = Schema.decodeUnknownSync(GitMergeBranchesResult);
const decodeAbortMergeInput = Schema.decodeUnknownSync(GitAbortMergeInput);
const decodeAbortMergeResult = Schema.decodeUnknownSync(GitAbortMergeResult);

describe("VcsCreateWorktreeInput", () => {
  it("accepts omitted newRefName for existing-refName worktrees", () => {
    const parsed = decodeCreateWorktreeInput({
      cwd: "/repo",
      refName: "feature/existing",
      path: "/tmp/worktree",
    });

    expect(parsed.newRefName).toBeUndefined();
    expect(parsed.refName).toBe("feature/existing");
  });

  it("accepts baseRefName metadata for a new worktree ref", () => {
    const parsed = decodeCreateWorktreeInput({
      cwd: "/repo",
      refName: "0123456789abcdef",
      newRefName: "feature/new",
      baseRefName: "origin/main",
      path: "/tmp/worktree",
    });

    expect(parsed.baseRefName).toBe("origin/main");
  });
});

describe("GitPreparePullRequestThreadInput", () => {
  it("accepts pull request references and mode", () => {
    const parsed = decodePreparePullRequestThreadInput({
      cwd: "/repo",
      reference: "#42",
      mode: "worktree",
    });

    expect(parsed.reference).toBe("#42");
    expect(parsed.mode).toBe("worktree");
  });
});

describe("GitResolvePullRequestResult", () => {
  it("decodes resolved pull request metadata", () => {
    const parsed = decodeResolvePullRequestResult({
      pullRequest: {
        number: 42,
        title: "PR threads",
        url: "https://github.com/pingdotgg/codething-mvp/pull/42",
        baseBranch: "main",
        headBranch: "feature/pr-threads",
        state: "open",
      },
    });

    expect(parsed.pullRequest.number).toBe(42);
    expect(parsed.pullRequest.headBranch).toBe("feature/pr-threads");
  });
});

describe("GitRunStackedActionInput", () => {
  it("accepts explicit stacked actions and requires a client-provided actionId", () => {
    const parsed = decodeRunStackedActionInput({
      actionId: "action-1",
      cwd: "/repo",
      action: "create_pr",
    });

    expect(parsed.actionId).toBe("action-1");
    expect(parsed.action).toBe("create_pr");
  });

  it("accepts promotion metadata and GitHub issue links", () => {
    const parsed = decodeRunStackedActionInput({
      actionId: "action-2",
      cwd: "/repo",
      action: "promote",
      targetBranch: "main",
      issueLink: {
        repoNameWithOwner: "JerkyTreats/t3code-omarchy",
        number: 12,
        title: "Replay upstream",
        url: "https://github.com/JerkyTreats/t3code-omarchy/issues/12",
        state: "open",
      },
    });

    expect(parsed.action).toBe("promote");
    expect(parsed.targetBranch).toBe("main");
    expect(parsed.issueLink?.number).toBe(12);
  });
});

describe("GitRunStackedActionResult", () => {
  it("decodes a server-authored completion toast", () => {
    const parsed = decodeRunStackedActionResult({
      action: "commit_push",
      branch: {
        status: "created",
        name: "feature/server-owned-toast",
      },
      commit: {
        status: "created",
        commitSha: "89abcdef01234567",
        subject: "feat: move toast state into git manager",
      },
      push: {
        status: "pushed",
        branch: "feature/server-owned-toast",
        upstreamBranch: "origin/feature/server-owned-toast",
      },
      pr: {
        status: "skipped_not_requested",
      },
      toast: {
        title: "Pushed 89abcde to origin/feature/server-owned-toast",
        description: "feat: move toast state into git manager",
        cta: {
          kind: "run_action",
          label: "Create PR",
          action: {
            kind: "create_pr",
          },
        },
      },
    });

    expect(parsed.toast.cta.kind).toBe("run_action");
    if (parsed.toast.cta.kind === "run_action") {
      expect(parsed.toast.cta.action.kind).toBe("create_pr");
    }
  });

  it("decodes promotion completion metadata", () => {
    const parsed = decodeRunStackedActionResult({
      action: "promote",
      branch: {
        status: "skipped_not_requested",
      },
      commit: {
        status: "skipped_not_requested",
      },
      push: {
        status: "skipped_not_requested",
      },
      pr: {
        status: "skipped_not_requested",
      },
      promote: {
        status: "promoted",
        sourceBranch: "feature/replay",
        targetBranch: "main",
        branchDeleted: true,
      },
      toast: {
        title: "Promoted feature/replay into main",
        cta: {
          kind: "none",
        },
      },
    });

    expect(parsed.promote?.status).toBe("promoted");
  });
});

describe("Git merge contracts", () => {
  it("decodes merge and abort inputs", () => {
    expect(
      decodeMergeBranchesInput({
        cwd: "/repo",
        sourceBranch: "feature/replay",
        targetBranch: "main",
      }).targetBranch,
    ).toBe("main");

    expect(decodeAbortMergeInput({ cwd: "/repo" }).cwd).toBe("/repo");
  });

  it("decodes merge and abort results", () => {
    expect(
      decodeMergeBranchesResult({
        status: "conflicted",
        sourceBranch: "feature/replay",
        targetBranch: "main",
        targetWorktreePath: "/repo",
        conflictedFiles: ["apps/web/src/App.tsx"],
      }).conflictedFiles,
    ).toEqual(["apps/web/src/App.tsx"]);

    expect(
      decodeAbortMergeResult({
        status: "aborted",
        cwd: "/repo",
      }).status,
    ).toBe("aborted");
  });
});
