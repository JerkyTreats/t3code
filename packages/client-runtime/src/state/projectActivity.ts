import type { ThreadSortInput } from "./threadSort.ts";

export type ProjectActivityInput = ThreadSortInput & {
  readonly latestUserAuthoredMessageAt?: string | null;
  readonly latestPublishedResponseAt?: string | null;
};

/** Project activity advances only on a user prompt or a published response.
 * Older shells use their available user-message stamp. General updates never
 * advance the anchor, even before a thread receives its first prompt.
 */
export function getProjectThreadSortTimestamp(
  thread: ProjectActivityInput,
  sortOrder: "created_at" | "updated_at",
): number {
  const timestamps =
    sortOrder === "created_at"
      ? [thread.createdAt]
      : [
          thread.createdAt,
          thread.latestUserAuthoredMessageAt === undefined
            ? thread.latestUserMessageAt
            : thread.latestUserAuthoredMessageAt,
          thread.latestPublishedResponseAt,
          ...(thread.latestUserAuthoredMessageAt === undefined
            ? (thread.messages ?? [])
                .filter((message) => message.role === "user")
                .map((message) => message.createdAt)
            : []),
        ];
  return timestamps.reduce((latest, value) => {
    const timestamp = value == null ? NaN : Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, Number.NEGATIVE_INFINITY);
}
