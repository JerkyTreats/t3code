import { describe, expect, it } from "@effect/vitest";
import {
  CommandId,
  EnvironmentId,
  MessageId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";

import {
  buildThreadOutboxStartTurnInput,
  classifyThreadOutboxFailure,
  createWebThreadOutboxManager,
  queuedEntriesByThread,
  type WebThreadOutboxEntry,
  type WebThreadOutboxStorage,
} from "./threadOutbox";
import type { QueuedThreadMessage } from "@t3tools/client-runtime/state/thread-outbox";

function message(input: {
  readonly messageId: string;
  readonly createdAt: string;
}): QueuedThreadMessage {
  return {
    environmentId: EnvironmentId.make("leviathan"),
    threadId: ThreadId.make("thread-1"),
    messageId: MessageId.make(input.messageId),
    commandId: CommandId.make(`command-${input.messageId}`),
    text: `text-${input.messageId}`,
    attachments: [
      {
        type: "image",
        id: `image-${input.messageId}`,
        name: "capture.png",
        mimeType: "image/png",
        sizeBytes: 3,
        dataUrl: "data:image/png;base64,AQID",
      },
    ],
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6-codex",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    titleSeed: "Durable message",
    createdAt: input.createdAt,
  };
}

function memoryStorage() {
  const stored = new Map<MessageId, WebThreadOutboxEntry>();
  const storage: WebThreadOutboxStorage = {
    load: async () => [...stored.values()],
    write: async (entry) => {
      stored.set(entry.message.messageId, structuredClone(entry));
    },
    remove: async (messageId) => {
      stored.delete(messageId);
    },
  };
  return { storage, stored };
}

describe("web thread outbox", () => {
  it("persists text and attachment data before publishing the queued intent", async () => {
    let releaseWrite!: () => void;
    const blockedWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const storage: WebThreadOutboxStorage = {
      load: async () => [],
      write: async () => blockedWrite,
      remove: async () => undefined,
    };
    const manager = createWebThreadOutboxManager(storage);
    const queued = message({ messageId: "message-1", createdAt: "2026-07-11T10:00:00.000Z" });

    const enqueue = manager.enqueue(queued);
    await Promise.resolve();
    expect(manager.getSnapshot().entries).toEqual([]);

    releaseWrite();
    await enqueue;
    expect(manager.getSnapshot().entries[0]?.message.attachments[0]?.dataUrl).toBe(
      "data:image/png;base64,AQID",
    );
  });

  it("recovers a crash before acknowledgement and retries with stable identities", async () => {
    const { storage } = memoryStorage();
    const queued = message({ messageId: "message-1", createdAt: "2026-07-11T10:00:00.000Z" });
    const firstProcess = createWebThreadOutboxManager(storage);
    await firstProcess.enqueue(queued);
    firstProcess.markSending(queued.messageId);

    const restartedProcess = createWebThreadOutboxManager(storage);
    await restartedProcess.load();
    const recovered = restartedProcess.getSnapshot().entries[0];
    expect(recovered?.status).toBe("queued");

    const firstAttempt = buildThreadOutboxStartTurnInput(recovered!.message);
    restartedProcess.markRetrying(queued.messageId, "Socket is not connected", 0);
    const retryAttempt = buildThreadOutboxStartTurnInput(
      restartedProcess.getSnapshot().entries[0]!.message,
    );
    expect(retryAttempt.commandId).toBe(firstAttempt.commandId);
    expect(retryAttempt.message.messageId).toBe(firstAttempt.message.messageId);
    expect(retryAttempt.message.attachments).toEqual(firstAttempt.message.attachments);
  });

  it("classifies an ambiguous transport acknowledgement for retry", () => {
    expect(
      classifyThreadOutboxFailure({
        error: new Error("Socket is not connected"),
        interrupted: false,
      }),
    ).toBe("retry");
    expect(
      classifyThreadOutboxFailure({
        error: new Error("Thread no longer exists"),
        interrupted: false,
      }),
    ).toBe("terminal-failure");
  });

  it("drains each thread in FIFO order with a deterministic tie break", async () => {
    const { storage } = memoryStorage();
    const manager = createWebThreadOutboxManager(storage);
    const laterId = message({ messageId: "message-2", createdAt: "2026-07-11T10:00:00.000Z" });
    const earlierId = message({ messageId: "message-1", createdAt: "2026-07-11T10:00:00.000Z" });

    await manager.enqueue(laterId);
    await manager.enqueue(earlierId);

    expect(queuedEntriesByThread(manager.getSnapshot().entries)["leviathan:thread-1"]).toEqual([
      expect.objectContaining({ message: earlierId }),
      expect.objectContaining({ message: laterId }),
    ]);
  });

  it("removes durable state only after acknowledgement", async () => {
    const { storage, stored } = memoryStorage();
    const manager = createWebThreadOutboxManager(storage);
    const queued = message({ messageId: "message-1", createdAt: "2026-07-11T10:00:00.000Z" });
    await manager.enqueue(queued);
    manager.markSending(queued.messageId);

    expect(stored.has(queued.messageId)).toBe(true);
    await manager.acknowledge(queued.messageId);
    expect(stored.has(queued.messageId)).toBe(false);
    expect(manager.getSnapshot().entries[0]?.status).toBe("acknowledged");
  });
});
