import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import {
  decodeQueuedThreadMessage,
  encodeQueuedThreadMessage,
  groupQueuedThreadMessages,
  shouldRetryThreadOutboxDelivery,
  threadOutboxRetryDelayMs,
  type QueuedThreadMessage,
  type ThreadOutboxDeliveryStatus,
} from "@t3tools/client-runtime/state/thread-outbox";
import type { MessageId } from "@t3tools/contracts";

const DATABASE_NAME = "t3code:thread-outbox";
const DATABASE_VERSION = 1;
const STORE_NAME = "messages";

export interface WebThreadOutboxEntry {
  readonly message: QueuedThreadMessage;
  readonly status: ThreadOutboxDeliveryStatus;
  readonly attempt: number;
  readonly lastError: string | null;
  readonly retryAt: number | null;
}

export interface WebThreadOutboxSnapshot {
  readonly loaded: boolean;
  readonly entries: ReadonlyArray<WebThreadOutboxEntry>;
}

export interface WebThreadOutboxStorage {
  readonly load: () => Promise<ReadonlyArray<WebThreadOutboxEntry>>;
  readonly write: (entry: WebThreadOutboxEntry) => Promise<void>;
  readonly remove: (messageId: MessageId) => Promise<void>;
}

interface PersistedWebThreadOutboxEntry {
  readonly message: unknown;
  readonly terminalFailure?: {
    readonly attempt: number;
    readonly lastError: string;
  };
}

function persistedEntry(entry: WebThreadOutboxEntry): PersistedWebThreadOutboxEntry {
  return {
    message: encodeQueuedThreadMessage(entry.message),
    ...(entry.status === "terminal-failure" && entry.lastError
      ? { terminalFailure: { attempt: entry.attempt, lastError: entry.lastError } }
      : {}),
  };
}

function decodedEntry(value: unknown): WebThreadOutboxEntry {
  if (typeof value !== "object" || value === null || !("message" in value)) {
    throw new Error("Invalid persisted thread outbox entry.");
  }
  const stored = value as PersistedWebThreadOutboxEntry;
  const message = decodeQueuedThreadMessage(stored.message);
  const terminalFailure = stored.terminalFailure;
  // A renderer crash can leave a command in flight. Reload it as queued so the
  // server command receipt can safely resolve the same command identity again.
  return terminalFailure
    ? {
        message,
        status: "terminal-failure",
        attempt: terminalFailure.attempt,
        lastError: terminalFailure.lastError,
        retryAt: null,
      }
    : { message, status: "queued", attempt: 0, lastError: null, retryAt: null };
}

function requestResult<A>(request: IDBRequest<A>): Promise<A> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB failed.")),
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
    );
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted.")),
    );
  });
}

async function openThreadOutboxDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable. The message was not cleared from the composer.");
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME);
    }
  });
  return requestResult(request);
}

export const indexedDbWebThreadOutboxStorage: WebThreadOutboxStorage = {
  load: async () => {
    const database = await openThreadOutboxDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const values = await requestResult(transaction.objectStore(STORE_NAME).getAll());
      const entries: WebThreadOutboxEntry[] = [];
      for (const value of values) {
        try {
          entries.push(decodedEntry(value));
        } catch (error) {
          console.warn("[thread-outbox] ignored invalid persisted web message", error);
        }
      }
      return entries;
    } finally {
      database.close();
    }
  },
  write: async (entry) => {
    const database = await openThreadOutboxDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(persistedEntry(entry), entry.message.messageId);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  },
  remove: async (messageId) => {
    const database = await openThreadOutboxDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(messageId);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  },
};

const EMPTY_SNAPSHOT: WebThreadOutboxSnapshot = { loaded: false, entries: [] };

function sortEntries(
  entries: ReadonlyArray<WebThreadOutboxEntry>,
): ReadonlyArray<WebThreadOutboxEntry> {
  return [...entries].sort(
    (left, right) =>
      left.message.createdAt.localeCompare(right.message.createdAt) ||
      left.message.messageId.localeCompare(right.message.messageId),
  );
}

export function createWebThreadOutboxManager(storage: WebThreadOutboxStorage) {
  let snapshot = EMPTY_SNAPSHOT;
  let loadPromise: Promise<void> | null = null;
  let mutationQueue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  const publish = (entries: ReadonlyArray<WebThreadOutboxEntry>, loaded = snapshot.loaded) => {
    snapshot = { loaded, entries: sortEntries(entries) };
    for (const listener of listeners) {
      listener();
    }
  };
  const serialize = <A>(mutation: () => Promise<A>): Promise<A> => {
    const result = mutationQueue.then(mutation, mutation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const replace = (
    messageId: MessageId,
    update: (entry: WebThreadOutboxEntry) => WebThreadOutboxEntry,
  ) =>
    publish(
      snapshot.entries.map((entry) =>
        entry.message.messageId === messageId ? update(entry) : entry,
      ),
    );

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load: () => {
      if (loadPromise !== null) {
        return loadPromise;
      }
      loadPromise = serialize(async () => {
        const persisted = await storage.load();
        const currentByMessageId = new Map(
          snapshot.entries.map((entry) => [entry.message.messageId, entry]),
        );
        for (const entry of persisted) {
          if (!currentByMessageId.has(entry.message.messageId)) {
            currentByMessageId.set(entry.message.messageId, entry);
          }
        }
        publish([...currentByMessageId.values()], true);
      }).catch((error) => {
        loadPromise = null;
        throw error;
      });
      return loadPromise;
    },
    enqueue: (message: QueuedThreadMessage) =>
      serialize(async () => {
        const entry: WebThreadOutboxEntry = {
          message,
          status: "queued",
          attempt: 0,
          lastError: null,
          retryAt: null,
        };
        // Never publish the queued intent until its full payload is durable.
        await storage.write(entry);
        publish([
          ...snapshot.entries.filter(
            (candidate) => candidate.message.messageId !== message.messageId,
          ),
          entry,
        ]);
      }),
    markSending: (messageId: MessageId) =>
      replace(messageId, (entry) => ({ ...entry, status: "sending", retryAt: null })),
    markRetrying: (messageId: MessageId, error: string, now = Date.now()) => {
      replace(messageId, (entry) => {
        const attempt = entry.attempt + 1;
        return {
          ...entry,
          status: "retrying",
          attempt,
          lastError: error,
          retryAt: now + threadOutboxRetryDelayMs(attempt),
        };
      });
    },
    markTerminalFailure: (messageId: MessageId, error: string) =>
      serialize(async () => {
        const entry = snapshot.entries.find(
          (candidate) => candidate.message.messageId === messageId,
        );
        if (!entry) {
          return;
        }
        const failed: WebThreadOutboxEntry = {
          ...entry,
          status: "terminal-failure",
          attempt: entry.attempt + 1,
          lastError: error,
          retryAt: null,
        };
        await storage.write(failed);
        replace(messageId, () => failed);
      }),
    retryTerminalFailure: (messageId: MessageId) =>
      serialize(async () => {
        const entry = snapshot.entries.find(
          (candidate) => candidate.message.messageId === messageId,
        );
        if (!entry || entry.status !== "terminal-failure") return;
        const queued: WebThreadOutboxEntry = {
          ...entry,
          status: "queued",
          lastError: null,
          retryAt: null,
        };
        await storage.write(queued);
        replace(messageId, () => queued);
      }),
    discard: (messageId: MessageId) =>
      serialize(async () => {
        await storage.remove(messageId);
        publish(snapshot.entries.filter((entry) => entry.message.messageId !== messageId));
      }),
    acknowledge: (messageId: MessageId) =>
      serialize(async () => {
        // A successful receipt is the only point where crash recovery no longer
        // needs the command payload.
        await storage.remove(messageId);
        replace(messageId, (entry) => ({
          ...entry,
          status: "acknowledged",
          lastError: null,
          retryAt: null,
        }));
      }),
    removeAcknowledged: (messageId: MessageId) =>
      publish(
        snapshot.entries.filter(
          (entry) => entry.message.messageId !== messageId || entry.status !== "acknowledged",
        ),
      ),
  };
}

export const webThreadOutboxManager = createWebThreadOutboxManager(indexedDbWebThreadOutboxStorage);

export function queuedEntriesByThread(
  entries: ReadonlyArray<WebThreadOutboxEntry>,
): Record<string, ReadonlyArray<WebThreadOutboxEntry>> {
  const groupedMessages = groupQueuedThreadMessages(entries.map((entry) => entry.message));
  const entriesById = new Map(entries.map((entry) => [entry.message.messageId, entry]));
  return Object.fromEntries(
    Object.entries(groupedMessages).map(([key, messages]) => [
      key,
      messages.flatMap((message) => {
        const entry = entriesById.get(message.messageId);
        return entry ? [entry] : [];
      }),
    ]),
  );
}

export function buildThreadOutboxStartTurnInput(
  message: QueuedThreadMessage,
): StartThreadTurnInput {
  return {
    commandId: message.commandId,
    threadId: message.threadId,
    message: {
      messageId: message.messageId,
      role: "user",
      text: message.text,
      attachments: message.attachments,
    },
    ...(message.modelSelection ? { modelSelection: message.modelSelection } : {}),
    ...(message.titleSeed ? { titleSeed: message.titleSeed } : {}),
    runtimeMode: message.runtimeMode ?? "full-access",
    interactionMode: message.interactionMode ?? "default",
    createdAt: message.createdAt,
  };
}

export function classifyThreadOutboxFailure(input: {
  readonly error: unknown;
  readonly interrupted: boolean;
}): "retry" | "terminal-failure" {
  return input.interrupted || shouldRetryThreadOutboxDelivery(input.error)
    ? "retry"
    : "terminal-failure";
}
