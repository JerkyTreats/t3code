import { SourceControlProviderKind } from "@t3tools/contracts";
import { requireGitLabPullRequestTarget } from "@t3tools/source-control-core/server/fork/originHostedProviderPolicy";
import type { GitLabRepositoryTarget } from "@t3tools/source-control-core/server/fork/GitLabRepositoryTarget";
import * as Effect from "effect/Effect";
import type {
  PullRequestCapabilities,
  PullRequestReaction,
  PullRequestViewerPermissions,
} from "@t3tools/contracts";

import * as GitLabPullRequestCli from "./GitLabPullRequestCli.ts";
import {
  PullRequestProviderError,
  type PullRequestProviderFailure,
  type ProviderChangeRequestActivity,
  type ProviderChangeRequestDetail,
  type PullRequestProviderApi,
  type ProviderRepositoryRef,
} from "@t3tools/source-control-core/server/PullRequestProvider";
import { definition } from "../shared/definition.ts";

const CAPABILITIES: PullRequestCapabilities = {
  diff: true,
  comment: true,
  actions: [...definition.changeRequestActions],
  mergeMethods: ["merge", "squash", "rebase"],
  // GitLab has no merge-target-into-source operation.
  updateMethods: ["rebase"],
  search: true,
  reactions: true,
  // GitLab's viewed marks live in browser-local storage.
  viewedFiles: "environment",
  review: {
    inlineComment: true,
    reply: true,
    resolve: true,
    // GitLab has no requested-changes verdict.
    verdicts: ["comment", "approve"],
  },
  reviewers: { request: true, listCandidates: true },
  edit: { changeRequest: true, comment: true },
};

const UNAVAILABLE_REQUIREMENT = {
  missing:
    "GitLab CLI (`glab`) is required to browse change requests on this host. Install it from https://gitlab.com/gitlab-org/cli and reload.",
  unauthenticated: "GitLab CLI is not authenticated. Run `glab auth login` and retry.",
};

/**
 * The actions `user.can_merge` answers for. Rebasing writes to the source branch rather than to
 * the target, so it is not literally the same permission — but GitLab reports nothing narrower,
 * and someone it will not let land this change has no business rewriting its branch either.
 */
const MERGE_ACTIONS: ReadonlySet<string> = new Set([
  "merge",
  "update-branch",
  "enable-auto-merge",
  "disable-auto-merge",
]);

/** Authors may close/reopen/change draft state regardless of role; REST omits authorship. */
export function gitLabViewerPermissions(input: {
  readonly viewerCanMerge: boolean;
}): PullRequestViewerPermissions {
  return {
    actions: CAPABILITIES.actions.filter(
      (action) => !MERGE_ACTIONS.has(action) || input.viewerCanMerge,
    ),
    comment: true,
    resolve: true,
    verdicts: CAPABILITIES.review.verdicts,
    requestReviewers: true,
    ...(input.viewerCanMerge ? { updateMethods: CAPABILITIES.updateMethods } : {}),
  };
}

function gitLabProviderFailure(
  error: GitLabPullRequestCli.GitLabPullRequestCliError,
): PullRequestProviderFailure {
  if (error._tag === "GitLabCliUnavailableError") return { reason: "missing-tool" };
  if (error._tag === "GitLabCliAuthenticationError") return { reason: "unauthenticated" };
  if (error._tag === "GitLabCliRateLimitError") return { reason: "rate-limited" };
  if (error._tag === "GitLabMergeRequestNotFoundError") return { reason: "not-found" };
  return { reason: "failed" };
}

export const make = Effect.gen(function* () {
  const cli = yield* GitLabPullRequestCli.GitLabPullRequestCli;

  const fail = (operation: string) => (error: GitLabPullRequestCli.GitLabPullRequestCliError) =>
    new PullRequestProviderError({
      provider: SourceControlProviderKind.make("gitlab"),
      operation,
      ...gitLabProviderFailure(error),
      detail: error.detail,
      cause: error,
    });

  // Optional endpoints may lose part of the activity, but an unusable CLI or account must
  // reach the caller so it can report authentication failures and pause a throttled host.
  const recoverRead = <A>(
    read: Effect.Effect<A, GitLabPullRequestCli.GitLabPullRequestCliError>,
    fallback: A,
  ) =>
    read.pipe(
      Effect.catch((error) => {
        const { reason } = gitLabProviderFailure(error);
        return reason === "rate-limited" ||
          reason === "unauthenticated" ||
          reason === "missing-tool"
          ? Effect.fail(error)
          : Effect.succeed(fallback);
      }),
    );

  // Fork F06: every hosted call is bound to the exact origin host and repository derived from
  // the repository reference's origin locator, never to the caller's repository string.
  const onOrigin = <A, E>(
    operation: string,
    input: ProviderRepositoryRef,
    use: (target: GitLabRepositoryTarget) => Effect.Effect<A, E>,
  ) =>
    requireGitLabPullRequestTarget({ operation, origin: input.origin }).pipe(Effect.flatMap(use));

  const provider: PullRequestProviderApi = {
    kind: SourceControlProviderKind.make("gitlab"),
    capabilities: CAPABILITIES,
    unavailableRequirement: UNAVAILABLE_REQUIREMENT,

    getViewer: (input) =>
      cli
        .getViewerUsername({ cwd: input.cwd, host: input.host })
        .pipe(Effect.mapError(fail("getViewer"))),

    listChangeRequests: (input) =>
      onOrigin("listChangeRequests", input, (target) =>
        cli
          .listMergeRequests({
            cwd: input.cwd,
            ...target,
            state: input.state,
            involvement: input.involvement,
            viewer: input.viewer,
            limit: input.limit,
            query: input.query,
            cursor: input.cursor,
            filters: input.filters,
          })
          .pipe(
            Effect.mapError(fail("listChangeRequests")),
            Effect.map((batch) => ({ ...batch, continues: true })),
          ),
      ),

    getChangeRequestChecks: (input) =>
      onOrigin("getChangeRequestChecks", input, (target) =>
        cli.getMergeRequestDetail({ ...input, ...target }).pipe(
          Effect.map(({ state, checks }) => ({ state, checks })),
          Effect.mapError(fail("getChangeRequestChecks")),
        ),
      ),

    // Merge settings only affect the detail panel's actions.
    getChangeRequestPreview: (input) =>
      onOrigin("getChangeRequestPreview", input, (target) =>
        cli
          .getMergeRequestDetail({ ...input, ...target })
          .pipe(Effect.mapError(fail("getChangeRequestPreview"))),
      ),

    getChangeRequestSummary: (input) =>
      onOrigin("getChangeRequestSummary", input, (target) =>
        cli
          .getMergeRequestDetail({ ...input, ...target })
          .pipe(Effect.mapError(fail("getChangeRequestSummary"))),
      ),

    getChangeRequest: (input) =>
      onOrigin("getChangeRequest", input, (target) =>
        Effect.all(
          [
            cli.getMergeRequestDetail({ ...input, ...target }),
            cli.getProjectMergeCapabilities({ cwd: input.cwd, ...target }),
          ],
          { concurrency: 2 },
        ).pipe(
          Effect.mapError(fail("getChangeRequest")),
          Effect.map(([mergeRequest, mergeCapabilities]): ProviderChangeRequestDetail => ({
            ...mergeRequest,
            mergeCapabilities,
            viewerPermissions: gitLabViewerPermissions(mergeRequest),
            // Missing divergence counts mean unknown, not up to date.
            baseComparison:
              mergeRequest.divergedCommits === undefined
                ? "unknown"
                : mergeRequest.divergedCommits > 0
                  ? "behind"
                  : "up-to-date",
            ...(mergeRequest.divergedCommits === undefined
              ? {}
              : { behindBy: mergeRequest.divergedCommits }),
          })),
        ),
      ),

    getChangeRequestActivity: (input) =>
      onOrigin("getChangeRequestActivity", input, (target) => {
        const exactInput = { cwd: input.cwd, ...target, number: input.number };
        return Effect.all(
          [
            recoverRead(cli.listNotes(exactInput), { comments: [], truncated: true }),
            recoverRead(cli.listCommits(exactInput), []),
            recoverRead(cli.listDiscussions(exactInput), { threads: [], truncated: true }),
            recoverRead(cli.listReactions(exactInput), {
              reactions: [] as ReadonlyArray<PullRequestReaction>,
              reactionsByNoteId: new Map<string, ReadonlyArray<PullRequestReaction>>(),
            }),
          ],
          { concurrency: 4 },
        ).pipe(
          Effect.mapError(fail("getChangeRequestActivity")),
          Effect.map(([notes, commits, discussions, awards]): ProviderChangeRequestActivity => ({
            reactions: awards.reactions,
            comments: notes.comments.map((comment) => ({
              ...comment,
              reactions: awards.reactionsByNoteId.get(comment.id) ?? [],
            })),
            commentCount: notes.comments.length,
            commentsTruncated: notes.truncated || discussions.truncated,
            reviewThreads: discussions.threads.map((thread) => ({
              ...thread,
              comments: thread.comments.map((comment) => ({
                ...comment,
                reactions: awards.reactionsByNoteId.get(comment.id) ?? [],
              })),
            })),
            commits,
          })),
        );
      }),

    getViewerPermissions: (input) =>
      onOrigin("getViewerPermissions", input, (target) =>
        cli
          .getMergeRequestDetail({ ...input, ...target })
          .pipe(Effect.mapError(fail("getViewerPermissions")), Effect.map(gitLabViewerPermissions)),
      ),

    getDiff: (input) =>
      onOrigin("getDiff", input, (target) =>
        cli.getMergeRequestDiff({ ...input, ...target }).pipe(Effect.mapError(fail("getDiff"))),
      ),

    getDiffFileContents: (input) =>
      onOrigin("getDiffFileContents", input, (target) =>
        cli
          .getMergeRequestDiffFileContents({ ...input, ...target })
          .pipe(Effect.mapError(fail("getDiffFileContents"))),
      ),

    getFileRevisions: (input) =>
      onOrigin("getFileRevisions", input, (target) =>
        cli.getFileRevisions({ ...input, ...target }).pipe(
          Effect.mapError(fail("getFileRevisions")),
          Effect.map((revisions) => ({ revisions })),
        ),
      ),

    // MR reviewers are users; groups belong to approval rules.
    listReviewerCandidates: (input) =>
      onOrigin("listReviewerCandidates", input, (target) =>
        cli
          .listReviewerCandidates({ cwd: input.cwd, ...target, number: input.number })
          .pipe(Effect.mapError(fail("listReviewerCandidates"))),
      ),

    listRepositoryLabels: (input) =>
      onOrigin("listRepositoryLabels", input, (target) =>
        cli
          .listProjectLabels({ cwd: input.cwd, ...target, search: input.query })
          .pipe(Effect.mapError(fail("listRepositoryLabels"))),
      ),

    searchRepositoryAuthors: (input) =>
      onOrigin("searchRepositoryAuthors", input, (target) =>
        cli
          .listProjectUsers({ cwd: input.cwd, ...target, search: input.query })
          .pipe(Effect.mapError(fail("searchRepositoryAuthors"))),
      ),

    setReviewerRequest: (input) =>
      onOrigin("setReviewerRequest", input, (target) =>
        cli
          .setReviewerRequest({
            cwd: input.cwd,
            ...target,
            number: input.number,
            reviewers: input.reviewers,
            requested: input.requested,
          })
          .pipe(Effect.mapError(fail("setReviewerRequest"))),
      ),

    runAction: (input) =>
      onOrigin("runAction", input, (target) =>
        cli
          .runMergeRequestAction({
            cwd: input.cwd,
            ...target,
            number: input.number,
            action: input.action,
            ...(input.mergeMethod === undefined ? {} : { mergeMethod: input.mergeMethod }),
          })
          .pipe(Effect.mapError(fail("runAction"))),
      ),

    updateChangeRequest: (input) =>
      onOrigin("updateChangeRequest", input, (target) =>
        cli
          .updateMergeRequest({
            cwd: input.cwd,
            ...target,
            number: input.number,
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.body === undefined ? {} : { description: input.body }),
          })
          .pipe(Effect.mapError(fail("updateChangeRequest"))),
      ),

    comment: (input) =>
      onOrigin("comment", input, (target) =>
        cli.commentOnMergeRequest({ ...input, ...target }).pipe(Effect.mapError(fail("comment"))),
      ),

    updateComment: (input) =>
      onOrigin("updateComment", input, (target) =>
        cli
          .updateNote({
            cwd: input.cwd,
            ...target,
            number: input.number,
            noteId: input.commentId,
            body: input.body,
          })
          .pipe(Effect.mapError(fail("updateComment"))),
      ),

    submitReview: (input) =>
      onOrigin("submitReview", input, (target) =>
        cli.submitReview({ ...input, ...target }).pipe(Effect.mapError(fail("submitReview"))),
      ),

    replyToThread: (input) =>
      onOrigin("replyToThread", input, (target) =>
        cli
          .replyToDiscussion({
            cwd: input.cwd,
            ...target,
            number: input.number,
            discussionId: input.threadId,
            body: input.body,
          })
          .pipe(Effect.mapError(fail("replyToThread"))),
      ),

    setReaction: (input) =>
      onOrigin("setReaction", input, (target) =>
        cli
          .setReaction({
            cwd: input.cwd,
            ...target,
            number: input.number,
            ...(input.subjectId === undefined ? {} : { noteId: input.subjectId }),
            content: input.content,
            reacted: input.reacted,
          })
          .pipe(Effect.mapError(fail("setReaction"))),
      ),

    setThreadResolution: (input) =>
      onOrigin("setThreadResolution", input, (target) =>
        cli
          .setDiscussionResolution({
            cwd: input.cwd,
            ...target,
            number: input.number,
            discussionId: input.threadId,
            resolved: input.resolved,
          })
          .pipe(Effect.mapError(fail("setThreadResolution"))),
      ),
  };

  return provider;
});
