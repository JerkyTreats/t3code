import { SourceControlProviderKind } from "@t3tools/contracts";
import { originForgejoChangeRequestNumber } from "@t3tools/source-control-core/server/fork/originHostedProviderPolicy";
import { describe, expect, it } from "@effect/vitest";

import * as Effect from "effect/Effect";
import * as SourceControlProvider from "@t3tools/source-control-core/server/SourceControlProvider";
import { OriginRepositoryMutationAuthorityError } from "./OriginRepositoryMutationAuthority.ts";
import {
  originAdmitsThreadPullRequest,
  pickOriginSourceControlContext,
  bindOriginProviderContext,
} from "./sourceControlContextPolicy.ts";

describe("sourceControlContextPolicy", () => {
  it("keeps Forgejo pull request selectors within the exact origin", () => {
    const context = {
      provider: {
        kind: SourceControlProviderKind.make("forgejo"),
        name: "Forgejo",
        baseUrl: "https://forge.example:8443",
      },
      remoteName: "origin",
      remoteUrl: "https://forge.example:8443/owner/repo.git",
    };
    expect(originForgejoChangeRequestNumber(context, "7")).toBe("7");
    expect(originForgejoChangeRequestNumber(context, "#7")).toBe("7");
    expect(
      originForgejoChangeRequestNumber(context, "https://forge.example:8443/owner/repo/pulls/7"),
    ).toBe("7");
    expect(
      originForgejoChangeRequestNumber(
        context,
        "https://forge.example:8443/owner/repo/pulls/7/files?w=1#diff",
      ),
    ).toBe("7");
    expect(
      originForgejoChangeRequestNumber(
        { ...context, remoteUrl: "https://forge.example:8443/git/owner/repo.git" },
        "https://forge.example:8443/git/owner/repo/pulls/7/commits",
      ),
    ).toBe("7");
    for (const reference of [
      "https://forge.example:8443/owner/other/pulls/7",
      "https://other.example:8443/owner/repo/pulls/7",
      "https://forge.example/owner/repo/pulls/7",
      "https://forge.example:8443/owner/repo/pulls/not-a-number",
    ]) {
      expect(originForgejoChangeRequestNumber(context, reference)).toBeNull();
    }
    expect(
      originForgejoChangeRequestNumber({ ...context, remoteName: "upstream" }, "7"),
    ).toBeNull();
    expect(originForgejoChangeRequestNumber(undefined, "7")).toBeNull();
  });

  it("selects a supported exact origin", () => {
    expect(
      pickOriginSourceControlContext([
        { name: "upstream", url: "https://github.com/upstream/project.git" },
        { name: "origin", url: "git@github.com:fork/project.git" },
      ]),
    ).toMatchObject({
      provider: { kind: SourceControlProviderKind.make("github") },
      remoteName: "origin",
      remoteUrl: "git@github.com:fork/project.git",
    });
  });

  it("fails closed without a supported exact origin", () => {
    expect(
      pickOriginSourceControlContext([
        { name: "upstream", url: "https://github.com/upstream/project.git" },
      ]),
    ).toBeNull();
    expect(
      pickOriginSourceControlContext([{ name: "origin", url: "file:///srv/git/project.git" }]),
    ).toBeNull();
  });
});

it.effect(
  "replacement registry binding refuses mutation before provider calls and pins context",
  () =>
    Effect.gen(function* () {
      const context = pickOriginSourceControlContext([
        { name: "origin", url: "https://github.example.test:8443/acme/web.git" },
      ])!;
      let providerCalls = 0;
      let authorized = false;
      const provider = SourceControlProvider.SourceControlProvider.of({
        kind: SourceControlProviderKind.make("github"),
        createChangeRequest: (input) =>
          Effect.sync(() => {
            providerCalls += 1;
            expect(input.context).toEqual(context);
            return { url: "https://github.example.test:8443/acme/web/pull/1" };
          }),
        listChangeRequests: () => Effect.die("unused"),
        getChangeRequest: () => Effect.die("unused"),
        getRepositoryCloneUrls: () => Effect.die("unused"),
        createRepository: () => Effect.die("unused"),
        getDefaultBranch: () => Effect.die("unused"),
        checkoutChangeRequest: () => Effect.die("unused"),
      });
      const bound = bindOriginProviderContext(provider, context, {
        authorize: () =>
          authorized
            ? Effect.void
            : Effect.fail(
                new OriginRepositoryMutationAuthorityError({
                  reason: "origin-changed",
                  detail: "Origin changed",
                }),
              ),
      });
      const input = {
        cwd: "/replacement",
        baseRefName: "main",
        headSelector: "feature",
        title: "Change",
        bodyFile: "/tmp/body",
        context: { ...context, remoteName: "upstream" },
      };
      yield* bound.createChangeRequest(input).pipe(Effect.flip);
      expect(providerCalls).toBe(0);
      authorized = true;
      yield* bound.createChangeRequest(input);
      expect(providerCalls).toBe(1);
    }),
);

describe("originAdmitsThreadPullRequest", () => {
  const identity = (remoteUrl: string, provider: string) => ({
    canonicalKey: "synthetic",
    locator: { source: "git-remote" as const, remoteName: "origin", remoteUrl },
    provider: SourceControlProviderKind.make(provider),
  });

  it("admits only the exact origin repository, port and number", () => {
    const github = identity("git@github.com:team/repo.git", "github");
    expect(
      originAdmitsThreadPullRequest(github, {
        url: "https://github.com/team/repo/pull/12",
        number: 12,
      }),
    ).toBe(true);
    for (const target of [
      { url: "https://github.com/other/repo/pull/12", number: 12 },
      { url: "https://github.com/team/repo/pull/12", number: 13 },
      { url: "https://github.example.test/team/repo/pull/12", number: 12 },
      { url: "https://git.cafe/team/repo/pull/12", number: 12 },
      { url: "not a url", number: 12 },
    ]) {
      expect(originAdmitsThreadPullRequest(github, target)).toBe(false);
    }
    const ported = identity("https://gitlab.example.test:8443/team/repo.git", "gitlab");
    expect(
      originAdmitsThreadPullRequest(ported, {
        url: "https://gitlab.example.test:8443/team/repo/-/merge_requests/3",
        number: 3,
      }),
    ).toBe(true);
    expect(
      originAdmitsThreadPullRequest(ported, {
        url: "https://gitlab.example.test:9443/team/repo/-/merge_requests/3",
        number: 3,
      }),
    ).toBe(false);
  });

  it("refuses every target without an exact origin identity", () => {
    const target = { url: "https://github.com/team/repo/pull/12", number: 12 };
    expect(originAdmitsThreadPullRequest(null, target)).toBe(false);
    expect(
      originAdmitsThreadPullRequest(
        {
          ...identity("git@github.com:team/repo.git", "github"),
          locator: {
            source: "git-remote",
            remoteName: "upstream",
            remoteUrl: "git@github.com:team/repo.git",
          },
        },
        target,
      ),
    ).toBe(false);
  });
});
