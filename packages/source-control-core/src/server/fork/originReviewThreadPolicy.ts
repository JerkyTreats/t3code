import * as Effect from "effect/Effect";

/**
 * The provider's answer to "which pull request does this review thread hang on", read beside the
 * origin pull request. GitHub's typed `OriginReviewThreadPullRequest` document returns this shape.
 */
export interface ReviewThreadPullRequestProof {
  readonly repository: { readonly pullRequest: { readonly id: string } | null } | null;
  readonly node:
    | {
        readonly __typename: "PullRequestReviewThread";
        readonly pullRequest: { readonly id: string };
      }
    | { readonly __typename: string }
    | null;
}

/** A thread belongs only when it hangs on the origin pull request the caller named. */
export function isOriginReviewThread(proof: ReviewThreadPullRequestProof): boolean {
  const expected = proof.repository?.pullRequest?.id ?? null;
  const node = proof.node;
  const actual =
    node !== null && node.__typename === "PullRequestReviewThread" && "pullRequest" in node
      ? node.pullRequest.id
      : null;
  return expected !== null && actual !== null && expected === actual;
}

/** Run a review-thread mutation only after the membership proof succeeds. */
export function requireOriginReviewThread<E, F, R>(
  proof: Effect.Effect<boolean, E, R>,
  failure: F,
): Effect.Effect<void, E | F, R> {
  return proof.pipe(
    Effect.flatMap((belongs): Effect.Effect<void, F> =>
      belongs ? Effect.void : Effect.fail(failure),
    ),
  );
}
