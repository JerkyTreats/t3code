// @effect-diagnostics nodeBuiltinImport:off
import { assert, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assertReleaseWorkflowSafety } from "./release-workflow-safety.ts";
import {
  CHECKOUT_ACTION as SERVER_IMAGE_CHECKOUT_ACTION,
  LOGIN_ACTION as SERVER_IMAGE_LOGIN_ACTION,
  SETUP_BUILDX_ACTION as SERVER_IMAGE_SETUP_BUILDX_ACTION,
  SETUP_NODE_ACTION as SERVER_IMAGE_SETUP_NODE_ACTION,
} from "./server-image-workflow-safety.ts";

const repositoryRoot = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const readOnlyWorkflow = `name: Read Only Check
on:
  pull_request:
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      - run: vp check
`;

const validServerImageWorkflow = NodeFS.readFileSync(
  NodePath.join(repositoryRoot, ".github", "workflows", "build-t3code-server-image.yml"),
  "utf8",
);

function withWorkflowFixture(
  workflows: Readonly<Record<string, string>>,
  run: (repositoryFixture: string) => void,
): void {
  const temporaryRoot = NodeFS.mkdtempSync(
    NodePath.join(NodeOS.tmpdir(), "release-workflow-safety-"),
  );
  const workflowDirectory = NodePath.join(temporaryRoot, ".github", "workflows");
  NodeFS.mkdirSync(workflowDirectory, { recursive: true });
  try {
    for (const [workflowFile, source] of Object.entries(workflows)) {
      NodeFS.writeFileSync(NodePath.join(workflowDirectory, workflowFile), source);
    }
    run(temporaryRoot);
  } finally {
    NodeFS.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function assertFixtureRejected(workflowFile: string, source: string, pattern: RegExp): void {
  withWorkflowFixture({ [workflowFile]: source }, (repositoryFixture) => {
    assert.throws(() => assertReleaseWorkflowSafety(repositoryFixture), pattern);
  });
}

it("accepts the current semantic workflow tree", () => {
  assert.doesNotThrow(() => assertReleaseWorkflowSafety(repositoryRoot));
});

it("does not require an exact workflow filename set", () => {
  withWorkflowFixture(
    {
      "first-check.yml": readOnlyWorkflow,
      "second-check.yaml": readOnlyWorkflow.replace("Read Only Check", "Another Check"),
    },
    (repositoryFixture) => {
      assert.doesNotThrow(() => assertReleaseWorkflowSafety(repositoryFixture));
    },
  );
});

it("binds the retained local APT action to its reviewed content", () => {
  const workflow = readOnlyWorkflow.replace(
    "      - run: vp check",
    "      - uses: ./.github/actions/setup-apt-mirrors",
  );
  withWorkflowFixture({ "check.yml": workflow }, (repositoryFixture) => {
    const actionDirectory = NodePath.join(
      repositoryFixture,
      ".github",
      "actions",
      "setup-apt-mirrors",
    );
    const actionFile = NodePath.join(actionDirectory, "action.yml");
    NodeFS.mkdirSync(actionDirectory, { recursive: true });
    NodeFS.copyFileSync(
      NodePath.join(repositoryRoot, ".github", "actions", "setup-apt-mirrors", "action.yml"),
      actionFile,
    );
    assert.doesNotThrow(() => assertReleaseWorkflowSafety(repositoryFixture));
    NodeFS.appendFileSync(actionFile, "\n# changed\n");
    assert.throws(
      () => assertReleaseWorkflowSafety(repositoryFixture),
      /does not match the reviewed source/,
    );
  });
});

it("rejects upstream targets", () => {
  assertFixtureRejected(
    "check.yml",
    `${readOnlyWorkflow}\n# github.com/pingdotgg/t3code\n`,
    /forbidden upstream repository target/,
  );
});

it("rejects workflow-level writes", () => {
  assertFixtureRejected(
    "check.yml",
    readOnlyWorkflow.replace("contents: read", "contents: write"),
    /workflow scope/,
  );
});

it("rejects omitted token permissions", () => {
  assertFixtureRejected(
    "check.yml",
    readOnlyWorkflow.replace("permissions:\n  contents: read\n", ""),
    /must explicitly declare read-only or empty permissions/,
  );
  assertFixtureRejected(
    "check.yml",
    readOnlyWorkflow.replace("    permissions:\n      contents: read\n", ""),
    /must explicitly declare read-only or empty permissions/,
  );
});

it("accepts explicit empty workflow or job permissions", () => {
  withWorkflowFixture(
    {
      "empty-workflow.yml": readOnlyWorkflow.replace(
        "permissions:\n  contents: read",
        "permissions: {}",
      ),
      "empty-job.yml": readOnlyWorkflow.replace(
        "    permissions:\n      contents: read",
        "    permissions: {}",
      ),
    },
    (repositoryFixture) => {
      assert.doesNotThrow(() => assertReleaseWorkflowSafety(repositoryFixture));
    },
  );
});

it("reserves all job write permissions for F20", () => {
  assertFixtureRejected(
    "check.yml",
    readOnlyWorkflow.replace(
      "    permissions:\n      contents: read",
      "    permissions:\n      issues: write",
    ),
    /outside the sole F20 image authority/,
  );
  assertFixtureRejected(
    "check.yml",
    readOnlyWorkflow.replace(
      "    runs-on: ubuntu-24.04\n    permissions:\n      contents: read",
      "    if: github.repository == 'JerkyTreats/t3code'\n    runs-on: ubuntu-24.04\n    permissions:\n      issues: write",
    ),
    /outside the sole F20 image authority/,
  );
});

it("rejects reusable workflow jobs including inherited secrets", () => {
  for (const reusableJob of [
    "    permissions:\n      contents: read\n    uses: example/repository/.github/workflows/check.yml@main",
    "    permissions:\n      contents: read\n    uses: example/repository/.github/workflows/check.yml@main\n    secrets: inherit",
  ]) {
    assertFixtureRejected(
      "check.yml",
      readOnlyWorkflow.replace(
        "    runs-on: ubuntu-24.04\n    permissions:\n      contents: read\n    steps:\n      - uses: actions/checkout@v6\n        with:\n          persist-credentials: false\n      - run: vp check",
        reusableJob,
      ),
      /unauthorized reusable workflow job/,
    );
  }
});

it("rejects credential-persisting checkout", () => {
  assertFixtureRejected(
    "check.yml",
    readOnlyWorkflow.replace("persist-credentials: false", "persist-credentials: true"),
    /persist-credentials to false/,
  );
});

it("rejects repository secrets outside the approved image workflow", () => {
  assertFixtureRejected(
    "check.yml",
    readOnlyWorkflow.replace(
      "- run: vp check",
      "- run: vp check\n        env:\n          TOKEN: ${{ secrets.TOKEN }}",
    ),
    /may not consume repository or implicit GitHub credentials/,
  );
  for (const credentialExpression of [
    "${{ secrets['TOKEN'] }}",
    "${{ toJSON(secrets) }}",
    "${{ github['token'] }}",
    "${{ toJSON(github).token }}",
  ]) {
    assertFixtureRejected(
      "check.yml",
      readOnlyWorkflow.replace(
        "- run: vp check",
        `- run: vp check
        env:
          TOKEN: ${credentialExpression}`,
      ),
      /may not consume repository or implicit GitHub credentials/,
    );
  }
  for (const credentialCondition of [
    "secrets.TOKEN != ''",
    "github.token",
    "github['token']",
    "toJSON(secrets) != '{}'",
  ]) {
    assertFixtureRejected(
      "check.yml",
      readOnlyWorkflow.replace(
        "    runs-on: ubuntu-24.04",
        `    if: ${credentialCondition}
    runs-on: ubuntu-24.04`,
      ),
      /may not consume repository or implicit GitHub credentials/,
    );
  }
  assertFixtureRejected(
    "check.yml",
    readOnlyWorkflow.replace(
      "- run: vp check",
      "- run: vp check\n        env:\n          TOKEN: ${{ github.token }}",
    ),
    /may not consume repository or implicit GitHub credentials/,
  );
});

it("rejects every workflow action outside the explicit allowlist", () => {
  for (const action of [
    "example/arbitrary-action@v1",
    "actions/create-github-app-token@v2",
    "docker/build-push-action@v7",
    "docker/login-action@v4",
    "softprops/action-gh-release@v2",
  ]) {
    assertFixtureRejected(
      "check.yml",
      readOnlyWorkflow.replace("actions/checkout@v6", action),
      /workflow action that is not allowlisted/,
    );
  }
});

it("rejects non-allowlisted and alternate publication command surfaces", () => {
  for (const command of [
    "echo new command surface",
    "node scripts/release-smoke.ts",
    "skopeo copy docker://source docker://destination",
    "crane push image.tar ghcr.io/example/image:latest",
    "buildah push image ghcr.io/example/image:latest",
    "oras push ghcr.io/example/image:latest artifact",
    "curl -X PUT https://ghcr.io/v2/example/manifests/latest",
    "gh api --method DELETE repos/example/repository/releases/1",
  ]) {
    assertFixtureRejected(
      "check.yml",
      readOnlyWorkflow.replace("vp check", command),
      /not allowlisted|unauthorized publication or deployment command/,
    );
  }
});

it("rejects commands smuggled through an allowlisted action input", () => {
  assertFixtureRejected(
    "check.yml",
    readOnlyWorkflow.replace(
      "      - run: vp check",
      `      - uses: reactivecircus/android-emulator-runner@v2
        with:
          script: gh api --method DELETE repos/example/repository/releases/1`,
    ),
    /command-bearing action input that is not allowlisted/,
  );
});

it("rejects package and deployment commands outside the approved image workflow", () => {
  for (const command of [
    "git push origin HEAD:main",
    "pnpm publish",
    "vp dlx vercel@53.1.1 deploy --prod",
    "eas update --channel production",
    "vp run deploy --stage prod",
  ]) {
    assertFixtureRejected(
      "check.yml",
      readOnlyWorkflow.replace("vp check", command),
      /unauthorized publication or deployment command/,
    );
  }
});

it("rejects unauthorized production triggers", () => {
  for (const trigger of [
    "pull_request_target",
    "workflow_run",
    "issues",
    "issue_comment",
    "schedule",
    "repository_dispatch",
    "release",
    "deployment",
    "deployment_status",
    "registry_package",
  ]) {
    assertFixtureRejected(
      "check.yml",
      readOnlyWorkflow.replace("pull_request:", `${trigger}:`),
      new RegExp(`unauthorized privileged trigger ${trigger}`),
    );
  }
});

it("rejects dynamic container namespaces", () => {
  assertFixtureRejected(
    "check.yml",
    `${readOnlyWorkflow}\nenv:\n  IMAGE_NAME: ghcr.io/\${{ github.repository_owner }}/server\n`,
    /dynamic container namespace/,
  );
});

it("accepts the exact-origin F20 image authority", () => {
  withWorkflowFixture(
    { "build-t3code-server-image.yml": validServerImageWorkflow },
    (repositoryFixture) => {
      assert.doesNotThrow(() => assertReleaseWorkflowSafety(repositoryFixture));
    },
  );
});

it("rejects every mutable action reference in the F20 writer", () => {
  for (const [approved, mutable] of [
    [SERVER_IMAGE_CHECKOUT_ACTION, "actions/checkout@v6"],
    [SERVER_IMAGE_SETUP_NODE_ACTION, "actions/setup-node@v6"],
    [SERVER_IMAGE_SETUP_BUILDX_ACTION, "docker/setup-buildx-action@v4"],
    [SERVER_IMAGE_LOGIN_ACTION, "docker/login-action@v4"],
  ] as const) {
    assertFixtureRejected(
      "build-t3code-server-image.yml",
      validServerImageWorkflow.replace(approved, mutable),
      /workflow action that is not allowlisted/,
    );
  }
});

it("rejects incorrect F20 authority", () => {
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "github.repository == 'JerkyTreats/t3code'",
      "github.repository == 'example/repository'",
    ),
    /exact publication guard/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace("github.ref == 'refs/heads/main'", "github.ref != ''"),
    /exact publication guard/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "(github.event_name == 'push' || github.event_name == 'workflow_dispatch')",
      "(github.event_name == 'push' || github.event_name == 'workflow_dispatch') || true",
    ),
    /exact publication guard/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace("packages: write", "packages: read"),
    /permissions must be exactly/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "ghcr.io/jerkytreats/t3code-server",
      "ghcr.io/example/repository",
    ),
    /exact origin container namespace/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace("${{ secrets.GITHUB_TOKEN }}", "${{ secrets.PACKAGE_TOKEN }}"),
    /registry login must use only the exact GHCR GitHub token authority/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "${{ secrets.GITHUB_TOKEN }}",
      "${{ secrets.GITHUB_TOKEN || secrets.PACKAGE_TOKEN }}",
    ),
    /registry login must use only the exact GHCR GitHub token authority/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "  IMAGE_NAME: ghcr.io/jerkytreats/t3code-server",
      "  IMAGE_NAME: ghcr.io/jerkytreats/t3code-server\n  EXTRA_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
    ),
    /approved GitHub token exactly once/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "  IMAGE_NAME: ghcr.io/jerkytreats/t3code-server",
      "  IMAGE_NAME: ghcr.io/jerkytreats/t3code-server\n  EXTRA_TOKEN: ${{ github['token'] }}",
    ),
    /approved GitHub token exactly once/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace("${IMAGE_NAME}:main", "ghcr.io/example/repository:main"),
    /workflow command that is not allowlisted/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "${IMAGE_NAME}:main",
      "${IMAGE_NAME}:main,ghcr.io/example/repository:latest",
    ),
    /workflow command that is not allowlisted/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "      - name: Log in to GHCR",
      `      - uses: ${SERVER_IMAGE_LOGIN_ACTION}\n      - name: Log in to GHCR`,
    ),
    /one exact registry login and one exact artifact promotion command/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "      - name: Log in to GHCR",
      "      - uses: actions/create-github-app-token@v2\n      - name: Log in to GHCR",
    ),
    /workflow action that is not allowlisted/,
  );
  assertFixtureRejected(
    "build-t3code-server-image.yml",
    validServerImageWorkflow.replace(
      "      - name: Log in to GHCR",
      "      - run: pnpm publish\n      - name: Log in to GHCR",
    ),
    /unauthorized publication or deployment command/,
  );
});

it("requires the desktop workflow to remain validation only", () => {
  const current = NodeFS.readFileSync(
    NodePath.join(repositoryRoot, ".github", "workflows", "desktop-artifact-validation.yml"),
    "utf8",
  );
  assertFixtureRejected(
    "desktop-artifact-validation.yml",
    current.replace("github.ref == 'refs/heads/main'", "true"),
    /exact origin and exact main ref/,
  );
  assertFixtureRejected(
    "desktop-artifact-validation.yml",
    current.replace(
      "      - name: Build unsigned Linux artifact\n        run: vp run dist:desktop:linux",
      "      - uses: actions/upload-artifact@v7\n      - name: Build unsigned Linux artifact\n        run: vp run dist:desktop:linux",
    ),
    /may not upload/,
  );
});
