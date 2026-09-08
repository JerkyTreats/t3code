export interface VoiceSubmission {
  readonly environmentId: string;
  readonly threadId: string;
  readonly messageId: string;
  readonly createdAt: string;
}

export interface VoiceReplySnapshot {
  readonly environmentId: string;
  readonly threadId: string;
  readonly latestTurn: {
    readonly turnId: string;
    readonly state: string;
    readonly requestedAt: string;
    readonly assistantMessageId: string | null;
  } | null;
  readonly messages: ReadonlyArray<{
    readonly id: string;
    readonly role: string;
    readonly text: string;
    readonly turnId: string | null;
    readonly streaming: boolean;
    readonly createdAt: string;
  }>;
}

const key = (input: Pick<VoiceSubmission, "environmentId" | "threadId" | "messageId">) =>
  JSON.stringify([input.environmentId, input.threadId, input.messageId]);

/** Device-memory admission only: snapshots and reconnects cannot opt historical turns into speech. */
export class VoiceReplyTracker {
  private readonly pending = new Map<string, VoiceSubmission>();
  private readonly activeThreads = new Map<string, number>();

  /** Keeps a same-thread route handoff from looking like the user left the thread. */
  activateThread(environmentId: string, threadId: string): () => void {
    const threadKey = JSON.stringify([environmentId, threadId]);
    this.activeThreads.set(threadKey, (this.activeThreads.get(threadKey) ?? 0) + 1);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const remaining = (this.activeThreads.get(threadKey) ?? 1) - 1;
      if (remaining > 0) this.activeThreads.set(threadKey, remaining);
      else this.activeThreads.delete(threadKey);
      queueMicrotask(() => {
        if (!this.activeThreads.has(threadKey)) this.clearThread(environmentId, threadId);
      });
    };
  }

  register(input: VoiceSubmission): void {
    this.pending.set(key(input), input);
    // A disconnected client must not retain an unbounded history of abandoned submissions.
    if (this.pending.size > 100) {
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) this.pending.delete(oldest);
    }
  }

  forget(input: Pick<VoiceSubmission, "environmentId" | "threadId" | "messageId">): void {
    this.pending.delete(key(input));
  }

  clear(): void {
    this.pending.clear();
  }

  clearThread(environmentId: string, threadId: string): void {
    for (const [id, entry] of this.pending) {
      if (entry.environmentId === environmentId && entry.threadId === threadId) {
        this.pending.delete(id);
      }
    }
  }

  consume(
    snapshot: VoiceReplySnapshot,
  ): { readonly messageId: string; readonly text: string } | null {
    const turn = snapshot.latestTurn;
    if (turn === null || turn.state === "running") return null;
    for (const [id, entry] of this.pending) {
      if (entry.environmentId !== snapshot.environmentId || entry.threadId !== snapshot.threadId) {
        continue;
      }
      const user = snapshot.messages.find(
        (message) => message.id === entry.messageId && message.role === "user",
      );
      if (user === undefined) continue;
      // The server canonicalizes the initiating command time onto both projections,
      // while the client's pre-dispatch registration can be a few milliseconds earlier.
      if (user.turnId !== turn.turnId && user.createdAt !== turn.requestedAt) continue;
      if (turn.state !== "completed") {
        this.pending.delete(id);
        continue;
      }
      const reply = snapshot.messages.find((message) => message.id === turn.assistantMessageId);
      if (
        reply === undefined ||
        reply.role !== "assistant" ||
        reply.streaming ||
        reply.turnId !== turn.turnId
      ) {
        continue;
      }
      this.pending.delete(id);
      return reply.text.trim().length === 0 ? null : { messageId: reply.id, text: reply.text };
    }
    return null;
  }
}
