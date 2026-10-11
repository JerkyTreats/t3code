import * as Effect from "effect/Effect";

export const REVIEW_THREAD_PULL_REQUEST_GRAPHQL_QUERY = `query($owner: String!, $name: String!, $number: Int!, $subjectId: ID!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } }
  node(id: $subjectId) {
    id
    ... on PullRequestReviewThread { pullRequest { id } }
  }
}`;

export function requireOriginReviewThread<E>(
  proof: Effect.Effect<boolean, E>,
  failure: E,
): Effect.Effect<void, E> {
  return proof.pipe(Effect.flatMap((belongs) => (belongs ? Effect.void : Effect.fail(failure))));
}
