import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  bitbucketOriginHostFailure,
  originChangeRequestSelector,
  requireGitHubRepository,
  requireGitLabRepositoryTarget,
  requireAzureDevOpsRepositoryTarget,
} from "./originHostedProviderPolicy.ts";

it.effect("alternate provider hosts receive exact origin selectors with ports", () =>
  Effect.gen(function* () {
    const common = {
      cwd: "/replacement",
      operation: "getDefaultBranch" as const,
      reference: undefined,
    };
    const github = yield* requireGitHubRepository({
      ...common,
      context: {
        remoteName: "origin",
        remoteUrl: "https://github.example.test:8443/acme/web.git",
        provider: { kind: "github", name: "GitHub", baseUrl: "https://github.example.test:8443" },
      },
    });
    assert.equal(github, "github.example.test:8443/acme/web");
    const gitlab = yield* requireGitLabRepositoryTarget({
      cwd: common.cwd,
      operation: common.operation,
      context: {
        remoteName: "origin",
        remoteUrl: "https://gitlab.example.test:9443/acme/nested/web.git",
        provider: { kind: "gitlab", name: "GitLab", baseUrl: "https://gitlab.example.test:9443" },
      },
    });
    assert.deepStrictEqual(gitlab, {
      host: "gitlab.example.test:9443",
      repository: "acme/nested/web",
    });
    const azure = yield* requireAzureDevOpsRepositoryTarget({
      cwd: common.cwd,
      operation: common.operation,
      context: {
        remoteName: "origin",
        remoteUrl: "https://dev.azure.com:8443/acme/project/_git/web",
        provider: { kind: "azure-devops", name: "Azure", baseUrl: "https://dev.azure.com:8443" },
      },
    });
    assert.deepStrictEqual(azure, {
      organization: "https://dev.azure.com:8443/acme",
      project: "project",
      repository: "web",
    });
    const error = yield* requireGitHubRepository({
      ...common,
      context: {
        remoteName: "upstream",
        remoteUrl: "https://github.com/acme/web.git",
        provider: { kind: "github", name: "GitHub", baseUrl: "https://github.com" },
      },
    }).pipe(Effect.flip);
    assert.include(error.detail, "exact GitHub origin");
  }),
);

it("Bitbucket endpoint authority preserves custom ports and the cloud API mapping", () => {
  assert.isNull(bitbucketOriginHostFailure("bitbucket.org", "api.bitbucket.org"));
  assert.isNull(
    bitbucketOriginHostFailure("bitbucket.example.test:8443", "bitbucket.example.test:8443"),
  );
  assert.deepStrictEqual(
    bitbucketOriginHostFailure("bitbucket.example.test:9443", "bitbucket.example.test:8443"),
    { reason: "origin-host-mismatch", originHost: "bitbucket.example.test:9443" },
  );
  assert.deepStrictEqual(bitbucketOriginHostFailure(undefined, "api.bitbucket.org"), {
    reason: "origin-context-required",
  });
});

for (const provider of ["github", "gitlab"] as const) {
  const host = `${provider}.example.test:8443`;
  const repository = provider === "github" ? "acme/web" : "acme/nested/web";
  const suffix = provider === "github" ? "pull/42" : "-/merge_requests/42";
  const input = { provider, repository: `${host}/${repository}` };

  it(`${provider} replacement host receives only origin-bound numeric URL selectors`, () => {
    assert.equal(
      originChangeRequestSelector({
        ...input,
        reference: `https://${host}/${repository}/${suffix}?view=all#note`,
      }),
      "42",
    );
    for (const reference of ["42", "#42", "feature/origin-branch"]) {
      assert.equal(originChangeRequestSelector({ ...input, reference }), reference);
    }
    if (provider === "github") {
      for (const reference of ["owner:feature/origin-branch", "owner-2:fix", "owner:123"]) {
        assert.equal(originChangeRequestSelector({ ...input, reference }), reference);
      }
    }
  });

  it(`${provider} refuses foreign and malformed URLs without executing a host`, () => {
    const references = [
      `https://${host}/other/web/${suffix}`,
      `https://${host}/${repository}-other/${suffix}`,
      `https://other.example.test:8443/${repository}/${suffix}`,
      `https://${provider}.example.test:9443/${repository}/${suffix}`,
      `https://${provider}.example.test/${repository}/${suffix}`,
      `https://credential@${host}/${repository}/${suffix}`,
      `https://${host}/${repository}/issues/42`,
      `ssh://${host}/${repository}/${suffix}`,
      `//${host}/${repository}/${suffix}`,
      "https://[invalid",
    ];
    for (const reference of references) {
      const selector = originChangeRequestSelector({ ...input, reference });
      assert.isNull(selector, reference);
    }
  });
}
