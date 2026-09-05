import type { RepositoryIdentity } from "@t3tools/contracts";
import { normalizeGitRemoteMutationTarget, normalizeGitRemoteUrl } from "@t3tools/shared/git";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import { originPushRedirectError } from "./originGitPolicy.ts";
import { isOriginRemoteName } from "./originOnlySourceControlPolicy.ts";

export type OriginRepositoryMutationAuthorityFailureReason =
  | "expected-identity-invalid"
  | "origin-unavailable"
  | "origin-changed"
  | "push-url-disagrees"
  | "inspection-failed"
  | "push-redirect";

export class OriginRepositoryMutationAuthorityError extends Schema.TaggedErrorClass<OriginRepositoryMutationAuthorityError>()(
  "OriginRepositoryMutationAuthorityError",
  {
    reason: Schema.Literals([
      "expected-identity-invalid",
      "origin-unavailable",
      "origin-changed",
      "push-url-disagrees",
      "inspection-failed",
      "push-redirect",
    ]),
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export interface OriginRepositoryMutationAuthorityInput {
  readonly cwd: string;
  readonly expectedIdentity: RepositoryIdentity;
}

export class OriginRepositoryMutationAuthority extends Context.Service<
  OriginRepositoryMutationAuthority,
  {
    readonly authorize: (
      input: OriginRepositoryMutationAuthorityInput,
    ) => Effect.Effect<void, OriginRepositoryMutationAuthorityError>;
  }
>()("t3/fork/OriginRepositoryMutationAuthority") {}

const REMOTE_INSPECTION_TIMEOUT_MS = 5_000;
const REMOTE_INSPECTION_MAX_OUTPUT_BYTES = 64_000;

function failure(
  reason: OriginRepositoryMutationAuthorityFailureReason,
  detail: string,
  cause?: unknown,
): OriginRepositoryMutationAuthorityError {
  return new OriginRepositoryMutationAuthorityError({
    reason,
    detail,
    ...(cause === undefined ? {} : { cause }),
  });
}

function remoteUrls(stdout: string): ReadonlyArray<string> {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export const make = Effect.gen(function* () {
  const process = yield* VcsProcess.VcsProcess;

  const inspectOriginUrls = Effect.fn("OriginRepositoryMutationAuthority.inspectOriginUrls")(
    function* (input: {
      readonly cwd: string;
      readonly direction: "fetch" | "push";
    }): Effect.fn.Return<ReadonlyArray<string>, OriginRepositoryMutationAuthorityError> {
      const args =
        input.direction === "fetch"
          ? ["remote", "get-url", "--all", "origin"]
          : ["remote", "get-url", "--push", "--all", "origin"];
      const result = yield* process
        .run({
          operation: `authorize origin ${input.direction} URLs`,
          command: "git",
          args,
          cwd: input.cwd,
          allowNonZeroExit: true,
          timeoutMs: REMOTE_INSPECTION_TIMEOUT_MS,
          maxOutputBytes: REMOTE_INSPECTION_MAX_OUTPUT_BYTES,
        })
        .pipe(
          Effect.mapError((cause) =>
            failure(
              "inspection-failed",
              "The exact origin repository identity could not be verified.",
              cause,
            ),
          ),
        );

      if (result.exitCode !== 0 || result.stdoutTruncated || result.stdoutInvalidUtf8 === true) {
        return yield* failure(
          input.direction === "fetch" ? "origin-unavailable" : "inspection-failed",
          "The exact origin repository identity could not be verified.",
        );
      }

      const urls = remoteUrls(result.stdout);
      if (urls.length === 0) {
        return yield* failure(
          input.direction === "fetch" ? "origin-unavailable" : "inspection-failed",
          "The exact origin repository identity could not be verified.",
        );
      }
      return urls;
    },
  );

  const inspect = Effect.fn("OriginRepositoryMutationAuthority.inspect")(function* (
    cwd: string,
    args: ReadonlyArray<string>,
    optional = false,
  ) {
    const result = yield* process
      .run({
        operation: "authorize origin push configuration",
        command: "git",
        args,
        cwd,
        allowNonZeroExit: true,
        timeoutMs: REMOTE_INSPECTION_TIMEOUT_MS,
        maxOutputBytes: REMOTE_INSPECTION_MAX_OUTPUT_BYTES,
      })
      .pipe(
        Effect.mapError((cause) =>
          failure("inspection-failed", "Origin push configuration could not be verified.", cause),
        ),
      );
    if (
      result.stdoutTruncated ||
      result.stdoutInvalidUtf8 ||
      (result.exitCode !== 0 && !(optional && result.exitCode === 1))
    )
      return yield* failure(
        "inspection-failed",
        "Origin push configuration could not be verified.",
      );
    return result.stdout.trim();
  });

  const authorize = Effect.fn("OriginRepositoryMutationAuthority.authorize")(function* (
    input: OriginRepositoryMutationAuthorityInput,
  ): Effect.fn.Return<void, OriginRepositoryMutationAuthorityError> {
    const expectedRemoteUrl = input.expectedIdentity.locator.remoteUrl.trim();
    const expectedCanonicalKey = normalizeGitRemoteUrl(input.expectedIdentity.canonicalKey);
    const expectedMutationTarget = normalizeGitRemoteMutationTarget(expectedRemoteUrl);
    if (
      !isOriginRemoteName(input.expectedIdentity.locator.remoteName) ||
      expectedRemoteUrl.length === 0 ||
      expectedCanonicalKey.length === 0 ||
      normalizeGitRemoteUrl(expectedRemoteUrl) !== expectedCanonicalKey ||
      expectedMutationTarget.length === 0
    ) {
      return yield* failure(
        "expected-identity-invalid",
        "The projected repository identity is not an exact origin identity.",
      );
    }

    const fetchUrls = yield* inspectOriginUrls({ cwd: input.cwd, direction: "fetch" });
    if (
      fetchUrls.some(
        (remoteUrl) => normalizeGitRemoteMutationTarget(remoteUrl) !== expectedMutationTarget,
      )
    ) {
      return yield* failure(
        "origin-changed",
        "The origin repository changed. Refresh the workspace and retry.",
      );
    }

    const pushUrls = yield* inspectOriginUrls({ cwd: input.cwd, direction: "push" });
    if (
      pushUrls.some(
        (remoteUrl) => normalizeGitRemoteMutationTarget(remoteUrl) !== expectedMutationTarget,
      )
    ) {
      return yield* failure(
        "push-url-disagrees",
        "Origin fetch and push repository identities disagree.",
      );
    }
    const branch = yield* inspect(input.cwd, ["branch", "--show-current"]);
    const globalRedirect = yield* inspect(
      input.cwd,
      ["config", "--get", "remote.pushDefault"],
      true,
    );
    const branchRedirect = branch
      ? yield* inspect(input.cwd, ["config", "--get", `branch.${branch}.pushRemote`], true)
      : "";
    const redirect = originPushRedirectError(branchRedirect, globalRedirect);
    if (redirect) return yield* failure("push-redirect", redirect);
  });

  return OriginRepositoryMutationAuthority.of({ authorize });
});

export const layer = Layer.effect(OriginRepositoryMutationAuthority, make);
