import { describe, expect, it } from "@effect/vitest";

import * as Effect from "effect/Effect";
import * as SourceControlProvider from "../sourceControl/SourceControlProvider.ts";
import { OriginRepositoryMutationAuthorityError } from "./OriginRepositoryMutationAuthority.ts";
import {
  pickOriginSourceControlContext,
  bindOriginProviderContext,
} from "./sourceControlContextPolicy.ts";

describe("sourceControlContextPolicy", () => {
  it("selects a supported exact origin", () => {
    expect(
      pickOriginSourceControlContext([
        { name: "upstream", url: "https://github.com/upstream/project.git" },
        { name: "origin", url: "git@github.com:fork/project.git" },
      ]),
    ).toMatchObject({
      provider: { kind: "github" },
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
        kind: "github",
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
