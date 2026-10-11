import { SourceControlProviderKind } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  bitbucketOriginHostFailure,
  selectBitbucketOrigin,
  originChangeRequestSelector,
  gitHubRepositoryTargetFromSelector,
  requireGitHubRepository,
  requireGitLabRepositoryTarget,
  requireAzureDevOpsRepositoryTarget,
} from "@t3tools/source-control-core/server/fork/originHostedProviderPolicy";

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
        provider: {
          kind: SourceControlProviderKind.make("github"),
          name: "GitHub",
          baseUrl: "https://github.example.test:8443",
        },
      },
    });
    assert.equal(github, "github.example.test:8443/acme/web");
    const gitlab = yield* requireGitLabRepositoryTarget({
      cwd: common.cwd,
      operation: common.operation,
      context: {
        remoteName: "origin",
        remoteUrl: "https://gitlab.example.test:9443/acme/nested/web.git",
        provider: {
          kind: SourceControlProviderKind.make("gitlab"),
          name: "GitLab",
          baseUrl: "https://gitlab.example.test:9443",
        },
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
        provider: {
          kind: SourceControlProviderKind.make("azure-devops"),
          name: "Azure",
          baseUrl: "https://dev.azure.com:8443",
        },
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
        provider: {
          kind: SourceControlProviderKind.make("github"),
          name: "GitHub",
          baseUrl: "https://github.com",
        },
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

const bitbucketContext = {
  remoteName: "origin",
  remoteUrl: "git@bitbucket.org:acme/web.git",
  provider: {
    kind: SourceControlProviderKind.make("bitbucket"),
    name: "Bitbucket",
    baseUrl: "https://bitbucket.org",
  },
};

it.each<{
  name: string;
  input: Parameters<typeof selectBitbucketOrigin>[0];
  expected: ReturnType<typeof selectBitbucketOrigin>;
}>([
  {
    name: "bound context wins over conflicting local remotes",
    input: {
      context: bitbucketContext,
      apiHost: "api.bitbucket.org",
      remotes: [{ name: "origin", url: "https://wrong.test/other/repo" }],
    },
    expected: { kind: "target", url: bitbucketContext.remoteUrl },
  },
  {
    name: "unbound context requests local inspection",
    input: {
      context: { ...bitbucketContext, remoteName: "upstream" },
      apiHost: "api.bitbucket.org",
    },
    expected: { kind: "inspect-remotes" },
  },
  {
    name: "local fallback ignores upstream and case variants",
    input: {
      apiHost: "api.bitbucket.org",
      remotes: [
        { name: "upstream", url: bitbucketContext.remoteUrl },
        { name: "Origin", url: bitbucketContext.remoteUrl },
      ],
    },
    expected: { kind: "missing-origin" },
  },
  {
    name: "local literal origin retains its port",
    input: {
      apiHost: "bitbucket.example.test:8443",
      remotes: [{ name: "origin", url: "https://bitbucket.example.test:8443/acme/web.git" }],
    },
    expected: { kind: "target", url: "https://bitbucket.example.test:8443/acme/web.git" },
  },
  {
    name: "malformed bound context refuses without fallback",
    input: {
      context: { ...bitbucketContext, remoteUrl: "invalid" },
      apiHost: "api.bitbucket.org",
      remotes: [{ name: "origin", url: bitbucketContext.remoteUrl }],
    },
    expected: { kind: "host-refused", failure: { reason: "origin-context-required" } },
  },
  {
    name: "malformed local origin stays unavailable",
    input: { apiHost: "api.bitbucket.org", remotes: [{ name: "origin", url: "invalid" }] },
    expected: { kind: "missing-origin" },
  },
  {
    name: "foreign local origin cannot use the configured endpoint",
    input: {
      apiHost: "bitbucket.example.test:8443",
      remotes: [{ name: "origin", url: "https://bitbucket.example.test:9443/acme/web.git" }],
    },
    expected: {
      kind: "host-refused",
      failure: { reason: "origin-host-mismatch", originHost: "bitbucket.example.test:9443" },
    },
  },
])("Bitbucket replacement host selection: $name", ({ input, expected }) => {
  assert.deepStrictEqual(selectBitbucketOrigin(input), expected);
});

describe.each(["github", "gitlab"] as const)("origin selectors for %s", (provider) => {
  const host = `${provider}.example.test:8443`;
  const repository = provider === "github" ? "acme/web" : "acme/nested/web";
  const suffix = provider === "github" ? "pull/42" : "-/merge_requests/42";
  const input = {
    provider: SourceControlProviderKind.make(provider),
    repository: `${host}/${repository}`,
  };

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
});

it("decodes explicit GitHub origin selectors and rejects implicit or malformed targets", () => {
  assert.deepStrictEqual(gitHubRepositoryTargetFromSelector("github.example.test:8443/Acme/Web"), {
    host: "github.example.test:8443",
    owner: "Acme",
    name: "Web",
  });
  for (const repository of [
    "acme/web",
    "https://github.com/acme/web",
    "github.com/acme/web/other",
    "user@github.com/acme/web",
    "github.com/acme/web?other",
    "github.com/acme/web#other",
    "",
  ]) {
    assert.strictEqual(gitHubRepositoryTargetFromSelector(repository), null);
  }
});
