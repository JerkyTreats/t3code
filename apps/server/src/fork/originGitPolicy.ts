import { GitCommandError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { normalizeGitRemoteMutationTarget } from "@t3tools/shared/git";
import { isOriginRemoteName, ORIGIN_REMOTE_NAME } from "./originOnlySourceControlPolicy.ts";

export type OriginGitRead = (
  operation: string,
  cwd: string,
  args: ReadonlyArray<string>,
  allowNonZeroExit?: boolean,
) => Effect.Effect<string, GitCommandError>;
const gitCommandContext = (input: {
  operation: string;
  cwd: string;
  args: ReadonlyArray<string>;
}) => ({
  operation: input.operation,
  cwd: input.cwd,
  command: "git",
  argumentCount: input.args.length,
});

export function originUrlConfigurationError(
  fetchStdout: string,
  pushStdout: string,
): string | null {
  const urls = (text: string) =>
    text
      .split(/\r?\n/u)
      .map((url) => url.trim())
      .filter(Boolean);
  const fetchUrls = urls(fetchStdout);
  const pushUrls = urls(pushStdout);
  const target = normalizeGitRemoteMutationTarget(fetchUrls[0] ?? "");
  if (!target || fetchUrls.some((url) => normalizeGitRemoteMutationTarget(url) !== target))
    return "Origin-only policy requires an unambiguous origin fetch URL.";
  if (
    pushUrls.length === 0 ||
    pushUrls.some((url) => normalizeGitRemoteMutationTarget(url) !== target)
  )
    return "Origin-only policy rejected origin because its push URL differs from its fetch URL.";
  return null;
}

export const requireOriginTracking = (input: {
  cwd: string;
  operation: string;
  remoteName: string | null | undefined;
  required?: boolean;
}): Effect.Effect<void, GitCommandError> =>
  (input.remoteName == null && !input.required) || isOriginRemoteName(input.remoteName)
    ? Effect.void
    : Effect.fail(
        new GitCommandError({
          operation: input.operation,
          cwd: input.cwd,
          command: "git",
          argumentCount: 0,
          detail: "Origin-only policy rejected the configured upstream because it is not origin.",
        }),
      );

export const requireOriginRequestedRemote = (input: {
  cwd: string;
  operation: string;
  remoteName: string | null;
}): Effect.Effect<void, GitCommandError> =>
  input.remoteName === null || isOriginRemoteName(input.remoteName)
    ? Effect.void
    : Effect.fail(
        new GitCommandError({
          operation: input.operation,
          cwd: input.cwd,
          command: "git",
          argumentCount: 0,
          detail: "Origin-only policy permits publishing only through the origin remote.",
        }),
      );

export const requireOriginProductRemote = Effect.fn("OriginGitPolicy.requireOriginProductRemote")(
  function* (
    runGitStdout: OriginGitRead,
    cwd: string,
    branchName: string,
    operation: string,
    args: ReadonlyArray<string>,
  ) {
    const originFetchUrls = yield* runGitStdout(
      "OriginGitPolicy.fetchUrls",
      cwd,
      ["remote", "get-url", "--all", ORIGIN_REMOTE_NAME],
      true,
    );
    if (originFetchUrls.trim().length === 0) {
      return yield* new GitCommandError({
        ...gitCommandContext({ operation, cwd, args }),
        detail: "Origin-only policy requires a literal origin remote.",
      });
    }

    const [fetchUrl, pushUrls, branchPushRemote, pushDefaultRemote] = yield* Effect.all(
      [
        Effect.succeed(originFetchUrls),
        runGitStdout("GitVcsDriver.requireOriginProductRemote.pushUrls", cwd, [
          "remote",
          "get-url",
          "--push",
          "--all",
          ORIGIN_REMOTE_NAME,
        ]),
        runGitStdout(
          "GitVcsDriver.requireOriginProductRemote.branchPushRemote",
          cwd,
          ["config", "--get", `branch.${branchName}.pushRemote`],
          true,
        ).pipe(Effect.map((stdout) => stdout.trim())),
        runGitStdout(
          "GitVcsDriver.requireOriginProductRemote.pushDefaultRemote",
          cwd,
          ["config", "--get", "remote.pushDefault"],
          true,
        ).pipe(Effect.map((stdout) => stdout.trim())),
      ],
      { concurrency: "unbounded" },
    );

    const urlError = originUrlConfigurationError(fetchUrl, pushUrls);
    if (urlError)
      return yield* new GitCommandError({
        ...gitCommandContext({ operation, cwd, args }),
        detail: urlError,
      });
    const redirectError = originPushRedirectError(branchPushRemote, pushDefaultRemote);
    if (redirectError)
      return yield* new GitCommandError({
        ...gitCommandContext({ operation, cwd, args }),
        detail: redirectError,
      });

    return ORIGIN_REMOTE_NAME;
  },
);

export function originPushRedirectError(
  branchPushRemote: string,
  pushDefaultRemote: string,
): string | null {
  if (branchPushRemote.trim() && !isOriginRemoteName(branchPushRemote.trim()))
    return "Origin-only policy rejected the branch pushRemote redirect.";
  if (pushDefaultRemote.trim() && !isOriginRemoteName(pushDefaultRemote.trim()))
    return "Origin-only policy rejected the remote.pushDefault redirect.";
  return null;
}
