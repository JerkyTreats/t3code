export interface ThreadConversationActivity {
  readonly createdAt: string;
  readonly latestUserAuthoredMessageAt?: string | null;
  readonly latestUserMessageAt?: string | null;
  readonly latestAssistantResponseAt?: string | null;
}

/** Conversation recency changes only when a prompt or response is delivered. */
export function threadConversationTimestamp(thread: ThreadConversationActivity): string {
  const prompt =
    thread.latestUserAuthoredMessageAt === undefined
      ? thread.latestUserMessageAt
      : thread.latestUserAuthoredMessageAt;
  let latest = thread.createdAt;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const candidate of [prompt, thread.latestAssistantResponseAt]) {
    if (candidate == null) continue;
    const at = Date.parse(candidate);
    if (Number.isFinite(at) && at > latestMs) {
      latest = candidate;
      latestMs = at;
    }
  }
  return latest;
}

export function sortThreadsByConversation<
  T extends ThreadConversationActivity & { readonly id: string; readonly environmentId?: string },
>(threads: readonly T[]): T[] {
  return threads
    .map((thread) => ({ thread, at: Date.parse(threadConversationTimestamp(thread)) || 0 }))
    .sort(
      (left, right) =>
        right.at - left.at ||
        left.thread.id.localeCompare(right.thread.id) ||
        (left.thread.environmentId ?? "").localeCompare(right.thread.environmentId ?? ""),
    )
    .map(({ thread }) => thread);
}
