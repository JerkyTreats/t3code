// @effect-diagnostics nodeBuiltinImport:off
import { assert, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  assertServerImagePublicationSafety,
  CHECKOUT_ACTION,
  LOGIN_ACTION,
  SCANNER_DEPENDENCY_BOOTSTRAP,
  SERVER_IMAGE_DOCKERFILE_PATH,
  SERVER_IMAGE_DOCKERIGNORE_PATH,
  SERVER_IMAGE_WORKFLOW_PATH,
  SETUP_BUILDX_ACTION,
  SETUP_NODE_ACTION,
} from "./server-image-workflow-safety.ts";

const repositoryRoot = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function makeFixture(): string {
  const fixtureRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-image-safety-"));
  for (const relativePath of [
    SERVER_IMAGE_WORKFLOW_PATH,
    SERVER_IMAGE_DOCKERFILE_PATH,
    SERVER_IMAGE_DOCKERIGNORE_PATH,
  ]) {
    const sourcePath = NodePath.join(repositoryRoot, relativePath);
    const targetPath = NodePath.join(fixtureRoot, relativePath);
    NodeFS.mkdirSync(NodePath.dirname(targetPath), { recursive: true });
    NodeFS.copyFileSync(sourcePath, targetPath);
  }
  return fixtureRoot;
}

function replaceFixtureSource(
  fixtureRoot: string,
  relativePath: string,
  expected: string,
  replacement: string,
): void {
  const path = NodePath.join(fixtureRoot, relativePath);
  const source = NodeFS.readFileSync(path, "utf8");
  assert.include(source, expected);
  NodeFS.writeFileSync(path, source.replace(expected, replacement));
}

function withFixture(run: (fixtureRoot: string) => void): void {
  const fixtureRoot = makeFixture();
  try {
    run(fixtureRoot);
  } finally {
    NodeFS.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function assertWorkflowMutationRejected(expected: string, replacement: string): void {
  withFixture((fixtureRoot) => {
    replaceFixtureSource(fixtureRoot, SERVER_IMAGE_WORKFLOW_PATH, expected, replacement);
    assert.throws(() => assertServerImagePublicationSafety(fixtureRoot));
  });
}

it("accepts the exact build-once origin image publication surface", () => {
  assert.doesNotThrow(() => assertServerImagePublicationSafety(repositoryRoot));
});

it("rejects weakened repository or main-ref authority", () => {
  assertWorkflowMutationRejected(
    "github.repository == 'JerkyTreats/t3code' &&",
    "github.repository != '' &&",
  );
  assertWorkflowMutationRejected("github.ref == 'refs/heads/main' &&", "github.ref != '' &&");
});

it("rejects alternate triggers and manual publication inputs", () => {
  assertWorkflowMutationRejected(
    "on:\n  workflow_dispatch:\n",
    "on:\n  workflow_dispatch:\n  schedule:\n    - cron: '0 0 * * *'\n",
  );
  assertWorkflowMutationRejected(
    "  workflow_dispatch:\n",
    "  workflow_dispatch:\n    inputs:\n      target:\n        type: string\n",
  );
});

it("rejects any broader permission grant", () => {
  assertWorkflowMutationRejected(
    "permissions:\n  contents: read\n",
    "permissions:\n  contents: read\n  packages: write\n",
  );
  assertWorkflowMutationRejected(
    "      packages: write\n",
    "      packages: write\n      id-token: write\n",
  );
});

it("rejects credential persistence and alternate login authority", () => {
  assertWorkflowMutationRejected("persist-credentials: false", "persist-credentials: true");
  assertWorkflowMutationRejected("registry: ghcr.io", "registry: registry.example.invalid");
  assertWorkflowMutationRejected(
    "password: ${{ secrets.GITHUB_TOKEN }}",
    "password: ${{ secrets.PACKAGE_TOKEN }}",
  );
});

it("requires immutable revisions for every action in the package-write job", () => {
  for (const [approved, mutable] of [
    [CHECKOUT_ACTION, "actions/checkout@v6"],
    [SETUP_NODE_ACTION, "actions/setup-node@v6"],
    [SETUP_BUILDX_ACTION, "docker/setup-buildx-action@v4"],
    [LOGIN_ACTION, "docker/login-action@v4"],
  ] as const) {
    assertWorkflowMutationRejected(`uses: ${approved}`, `uses: ${mutable}`);
  }
});

it("requires the exact lifecycle-free scanner dependency bootstrap", () => {
  assertWorkflowMutationRejected(
    `run: ${SCANNER_DEPENDENCY_BOOTSTRAP}`,
    "run: corepack pnpm install --frozen-lockfile --filter @t3tools/scripts",
  );
  assertWorkflowMutationRejected("node-version-file: package.json", "node-version: latest");
});

it("rejects arbitrary actions instead of relying on an action denylist", () => {
  for (const action of [
    "example/arbitrary-action@v1",
    "docker/build-push-action@v7",
    "actions/github-script@v8",
    "softprops/action-gh-release@v2",
  ]) {
    assertWorkflowMutationRejected(
      "      - name: Verify global release authority\n        run: node scripts/lib/release-workflow-safety.ts",
      `      - name: Unapproved action\n        uses: ${action}`,
    );
  }
});

it("rejects arbitrary commands instead of relying on a publication denylist", () => {
  for (const command of [
    "skopeo copy source destination",
    "crane push image.tar registry.example/repository:tag",
    "buildah push image registry.example/repository:tag",
    "curl -X PUT https://registry.example/v2/repository/manifests/tag",
    "gh api --method POST /repos/example/repository/releases",
    "docker push registry.example/repository:tag",
    "node scripts/unapproved-command.ts",
  ]) {
    assertWorkflowMutationRejected(
      "run: node scripts/lib/release-workflow-safety.ts",
      `run: ${command}`,
    );
  }
});

it("requires smoke before login and promotion without a rebuild", () => {
  assertWorkflowMutationRejected(
    "      - name: Build and smoke exact candidate artifact\n        id: candidate\n        run: node scripts/server-image-smoke.ts",
    "      - name: Rebuild candidate\n        id: candidate\n        run: docker buildx build --push .",
  );
  assertWorkflowMutationRejected(
    `      - name: Log in to GHCR\n        uses: ${LOGIN_ACTION}`,
    `      - name: Log in to GHCR\n        uses: ${LOGIN_ACTION}\n\n      - name: Hidden rebuild\n        run: docker buildx build --push .`,
  );
});

it("requires preserved artifact digests and divergent immutable-tag rejection", () => {
  assertWorkflowMutationRejected("copy --all --preserve-digests", "copy --all");
  assertWorkflowMutationRejected(
    'echo "Refusing to overwrite divergent immutable tag ${target}." >&2',
    'echo "Overwriting ${target}." >&2',
  );
  assertWorkflowMutationRejected(
    'promote_immutable "${IMAGE_NAME}:sha-${GITHUB_SHA}"',
    '"${skopeo[@]}" copy oci-archive:/candidate.oci "docker://${IMAGE_NAME}:sha-${GITHUB_SHA}"',
  );
});

it("parses Dockerfile instructions so comments cannot satisfy the contract", () => {
  withFixture((fixtureRoot) => {
    replaceFixtureSource(
      fixtureRoot,
      SERVER_IMAGE_DOCKERFILE_PATH,
      "FROM node:24-bookworm-slim@sha256:",
      "# FROM node:24-bookworm-slim@sha256:",
    );
    assert.throws(
      () => assertServerImagePublicationSafety(fixtureRoot),
      /instructions must exactly match/,
    );
  });
});

it("rejects mutable base images and unpinned package inputs", () => {
  withFixture((fixtureRoot) => {
    replaceFixtureSource(
      fixtureRoot,
      SERVER_IMAGE_DOCKERFILE_PATH,
      "node:24-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848",
      "node:24-bookworm-slim",
    );
    assert.throws(() => assertServerImagePublicationSafety(fixtureRoot));
  });
  withFixture((fixtureRoot) => {
    replaceFixtureSource(
      fixtureRoot,
      SERVER_IMAGE_DOCKERFILE_PATH,
      "git=1:2.39.5-0+deb12u3",
      "git",
    );
    assert.throws(() => assertServerImagePublicationSafety(fixtureRoot));
  });
});

it("rejects extra install, copy, user, entrypoint, and command instructions", () => {
  for (const instruction of [
    "RUN npm install --global example@latest",
    "COPY credentials.json /app/credentials.json",
    "USER root",
    'ENTRYPOINT ["sh"]',
    'CMD ["sh"]',
  ]) {
    withFixture((fixtureRoot) => {
      replaceFixtureSource(
        fixtureRoot,
        SERVER_IMAGE_DOCKERFILE_PATH,
        "USER node",
        `${instruction}\n\nUSER node`,
      );
      assert.throws(
        () => assertServerImagePublicationSafety(fixtureRoot),
        /instructions must exactly match/,
      );
    });
  }
});

it("requires the checksum-pinned default Codex provider runtime", () => {
  withFixture((fixtureRoot) => {
    replaceFixtureSource(
      fixtureRoot,
      SERVER_IMAGE_DOCKERFILE_PATH,
      "CODEX_HOME=/data/codex",
      "CODEX_HOME=/tmp/codex",
    );
    assert.throws(() => assertServerImagePublicationSafety(fixtureRoot));
  });
  withFixture((fixtureRoot) => {
    replaceFixtureSource(
      fixtureRoot,
      SERVER_IMAGE_DOCKERFILE_PATH,
      "sha256:d28b4fd4bd9f07ea71083d0cc40c579595cebbd4c10bc8ca98a6d385432e7255",
      `sha256:${"0".repeat(64)}`,
    );
    assert.throws(() => assertServerImagePublicationSafety(fixtureRoot));
  });
  withFixture((fixtureRoot) => {
    replaceFixtureSource(
      fixtureRoot,
      SERVER_IMAGE_DOCKERFILE_PATH,
      "codex-cli 0.147.0",
      "codex-cli 0.148.0",
    );
    assert.throws(() => assertServerImagePublicationSafety(fixtureRoot));
  });
});

it("rejects every Docker ignore negation rule", () => {
  for (const negation of ["!.env", "!secrets/**", "!apps/server/private.json"]) {
    withFixture((fixtureRoot) => {
      const path = NodePath.join(fixtureRoot, SERVER_IMAGE_DOCKERIGNORE_PATH);
      NodeFS.appendFileSync(path, `${negation}\n`);
      assert.throws(
        () => assertServerImagePublicationSafety(fixtureRoot),
        /must not contain negation rules/,
      );
    });
  }
});

it("requires Docker-recursive private configuration and state exclusions", () => {
  for (const [recursivePattern, rootPattern, protectedPath] of [
    ["**/.codex", ".codex", "apps/web/.codex/instructions.md"],
    ["**/.env.*", ".env.*", "apps/web/.env.local"],
    ["**/.npmrc", ".npmrc", "packages/example/.npmrc"],
    ["**/.t3", ".t3", "apps/server/.t3/userdata/example"],
  ] as const) {
    withFixture((fixtureRoot) => {
      replaceFixtureSource(
        fixtureRoot,
        SERVER_IMAGE_DOCKERIGNORE_PATH,
        `${recursivePattern}\n`,
        `${rootPattern}\n`,
      );
      assert.throws(
        () => assertServerImagePublicationSafety(fixtureRoot),
        new RegExp(`must exclude ${protectedPath.replaceAll(/[./]/gu, "\\$&")}`),
      );
    });
  }
});

it("rejects exclusions that remove required server image build inputs", () => {
  for (const manifest of ["package.json", "pnpm-workspace.yaml"]) {
    withFixture((fixtureRoot) => {
      const path = NodePath.join(fixtureRoot, SERVER_IMAGE_DOCKERIGNORE_PATH);
      NodeFS.appendFileSync(path, `${manifest}\n`);
      assert.throws(
        () => assertServerImagePublicationSafety(fixtureRoot),
        new RegExp(`must include ${manifest.replaceAll(".", "\\.")}`),
      );
    });
  }
  withFixture((fixtureRoot) => {
    const path = NodePath.join(fixtureRoot, SERVER_IMAGE_DOCKERIGNORE_PATH);
    NodeFS.appendFileSync(path, "**/*.ts\n");
    assert.throws(
      () => assertServerImagePublicationSafety(fixtureRoot),
      /must include apps\/server\/src\/bin\.ts/,
    );
  });
});

it("rejects Docker syntax outside the bounded safety matcher before matching", () => {
  for (const pattern of [
    "[p]ackage.json",
    "package.jso?",
    "package\\.json",
    "packages\\example\\.npmrc",
    "apps/../package.json",
    "/package.json",
    "./package.json",
    "apps//server/src/bin.ts",
    "package.json/",
    "apps/**",
  ]) {
    withFixture((fixtureRoot) => {
      const path = NodePath.join(fixtureRoot, SERVER_IMAGE_DOCKERIGNORE_PATH);
      NodeFS.appendFileSync(path, `${pattern}\n`);
      assert.throws(
        () => assertServerImagePublicationSafety(fixtureRoot),
        /Unsupported Docker ignore pattern/,
      );
    });
  }
});

it("requires the exact server userdata exclusion", () => {
  withFixture((fixtureRoot) => {
    replaceFixtureSource(fixtureRoot, SERVER_IMAGE_DOCKERIGNORE_PATH, "apps/server/userdata\n", "");
    assert.throws(
      () => assertServerImagePublicationSafety(fixtureRoot),
      /missing apps\/server\/userdata/,
    );
  });
});
