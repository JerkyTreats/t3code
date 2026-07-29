import { assert, describe, it } from "vite-plus/test";

import { buildGitStackedActionRpcInput } from "./sourceControlActions";

describe("buildGitStackedActionRpcInput", () => {
  it("preserves the selected promotion target", () => {
    assert.deepEqual(
      buildGitStackedActionRpcInput({
        actionId: "transport-action",
        cwd: "/repo",
        action: "promote",
        commitMessage: "Promote feature work",
        targetBranch: "main",
        issueLink: {
          repoNameWithOwner: "JerkyTreats/t3code",
          number: 29,
          title: "Refresh Git refs",
          url: "https://github.com/JerkyTreats/t3code/issues/29",
          state: "open",
        },
        filePaths: ["src/index.ts"],
      }),
      {
        actionId: "transport-action",
        cwd: "/repo",
        action: "promote",
        commitMessage: "Promote feature work",
        targetBranch: "main",
        issueLink: {
          repoNameWithOwner: "JerkyTreats/t3code",
          number: 29,
          title: "Refresh Git refs",
          url: "https://github.com/JerkyTreats/t3code/issues/29",
          state: "open",
        },
        filePaths: ["src/index.ts"],
      },
    );
  });

  it("keeps ordinary stacked action payloads unchanged", () => {
    assert.deepEqual(
      buildGitStackedActionRpcInput({
        actionId: "transport-action",
        cwd: "/repo",
        action: "commit_push_pr",
        featureBranch: true,
      }),
      {
        actionId: "transport-action",
        cwd: "/repo",
        action: "commit_push_pr",
        featureBranch: true,
      },
    );
  });
});
