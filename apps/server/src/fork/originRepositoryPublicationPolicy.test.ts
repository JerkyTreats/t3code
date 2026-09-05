import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  publicationRepositoryTarget,
  preflightPublication,
  validateRepositoryCloneUrls,
} from "./originRepositoryPublicationPolicy.ts";
import type * as GitVcsDriver from "../vcs/GitVcsDriver.ts";

const endpoint = "https://git.example.test:8443";
const origin = `${endpoint}/acme/web.git`;
const target = publicationRepositoryTarget({
  provider: "github",
  providerBaseUrl: endpoint,
  repository: "acme/web",
})!;
const result = (stdout: string) => ({
  stdout,
  stderr: "",
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdoutTruncated: false,
  stderrTruncated: false,
  stdoutInvalidUtf8: false,
  stderrInvalidUtf8: false,
});

for (const scenario of [
  "requested-remote",
  "matching-remote",
  "push-urls",
  "push-redirect",
  "fetch-rewrite",
] as const) {
  it.effect(`replacement publication host refuses ${scenario} before any external call`, () =>
    Effect.gen(function* () {
      const input = {
        cwd: "/replacement",
        provider: "github" as const,
        remoteName: scenario === "requested-remote" ? "upstream" : "origin",
      };
      const hasOrigin = scenario === "push-urls" || scenario === "fetch-rewrite";
      const git: Pick<GitVcsDriver.GitVcsDriver["Service"], "execute" | "readConfigValue"> = {
        readConfigValue: (_cwd, key) =>
          Effect.succeed(
            key === "remote.origin.url" && hasOrigin
              ? origin
              : key === "remote.pushDefault" && scenario === "push-redirect"
                ? "upstream"
                : null,
          ),
        execute: ({ args }) =>
          Effect.succeed(
            result(
              args.includes("--show-current")
                ? "main"
                : args.includes("--push")
                  ? `${origin}\nhttps://git.example.test:9443/acme/web.git`
                  : args.includes("get-url")
                    ? scenario === "fetch-rewrite"
                      ? "https://other.example.test/acme/web.git"
                      : origin
                    : args.includes("-v")
                      ? `upstream ${origin} (fetch)`
                      : "",
            ),
          ),
      };
      let externalCalls = 0;
      yield* preflightPublication(git, input, target).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            externalCalls += 1;
          }),
        ),
        Effect.flip,
      );
      assert.equal(externalCalls, 0);
    }),
  );
}

it.effect("replacement publication host validates both returned clone transports", () =>
  Effect.gen(function* () {
    const urls = {
      nameWithOwner: "acme/web",
      url: origin,
      sshUrl: "ssh://git@git.example.test:8443/acme/web.git",
    };
    assert.deepStrictEqual(
      yield* validateRepositoryCloneUrls({
        operation: "lookupRepository",
        provider: "github",
        requestedTarget: target,
        urls,
      }),
      urls,
    );
    const error = yield* validateRepositoryCloneUrls({
      operation: "publishRepository",
      provider: "github",
      requestedTarget: target,
      urls: { ...urls, sshUrl: "ssh://git@git.example.test:9443/acme/web.git" },
    }).pipe(Effect.flip);
    assert.include(error.detail, "do not match");
  }),
);
