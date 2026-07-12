import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  resolveThreadOutboxDeliveryAction,
  threadOutboxKey,
} from "@t3tools/client-runtime/state/thread-outbox";
import type { MessageId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { useEnvironments } from "../state/environments";
import { useThreadShells } from "../state/entities";
import { environmentShellStatusMapAtom } from "../state/shell";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import {
  buildThreadOutboxStartTurnInput,
  classifyThreadOutboxFailure,
  queuedEntriesByThread,
  webThreadOutboxManager,
  type WebThreadOutboxEntry,
  type WebThreadOutboxSnapshot,
} from "../threadOutbox";

const EMPTY_SERVER_SNAPSHOT: WebThreadOutboxSnapshot = { loaded: false, entries: [] };

export function useWebThreadOutboxSnapshot(): WebThreadOutboxSnapshot {
  return useSyncExternalStore(
    webThreadOutboxManager.subscribe,
    webThreadOutboxManager.getSnapshot,
    () => EMPTY_SERVER_SNAPSHOT,
  );
}

export function useWebThreadOutboxEntries(
  environmentId: string,
  threadId: string,
): ReadonlyArray<WebThreadOutboxEntry> {
  const snapshot = useWebThreadOutboxSnapshot();
  return useMemo(
    () => queuedEntriesByThread(snapshot.entries)[`${environmentId}:${threadId}`] ?? [],
    [environmentId, snapshot.entries, threadId],
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ThreadOutboxCoordinator() {
  const startThreadTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const snapshot = useWebThreadOutboxSnapshot();
  const { environments } = useEnvironments();
  const threads = useThreadShells();
  const shellStatuses = useAtomValue(environmentShellStatusMapAtom);
  const dispatchingMessageIdRef = useRef<MessageId | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    void webThreadOutboxManager.load().catch((error) => {
      console.error("[thread-outbox] failed to load durable web messages", error);
    });
  }, []);

  const connectedEnvironmentIds = useMemo(
    () =>
      new Set(
        environments
          .filter((environment) => environment.connection.phase === "connected")
          .map((environment) => environment.environmentId),
      ),
    [environments],
  );
  const threadByKey = useMemo(
    () =>
      new Map(threads.map((thread) => [threadOutboxKey(thread.environmentId, thread.id), thread])),
    [threads],
  );

  useEffect(() => {
    if (!snapshot.loaded || dispatchingMessageIdRef.current !== null) {
      return;
    }

    const queues = Object.values(queuedEntriesByThread(snapshot.entries));
    let nextEntry: WebThreadOutboxEntry | null = null;
    let orphanedEntry: WebThreadOutboxEntry | null = null;
    let nextRetryAt: number | null = null;
    const now = Date.now();
    for (const queue of queues) {
      const entry = queue[0];
      if (!entry || entry.status === "acknowledged") {
        continue;
      }
      const environmentConnected = connectedEnvironmentIds.has(entry.message.environmentId);
      const thread = threadByKey.get(
        threadOutboxKey(entry.message.environmentId, entry.message.threadId),
      );
      const threadBusy =
        thread?.session?.status === "running" || thread?.session?.status === "starting";
      const deliveryAction = resolveThreadOutboxDeliveryAction({
        threadExists: thread !== undefined,
        shellStatus: shellStatuses.get(entry.message.environmentId) ?? "empty",
        environmentConnected,
        threadBusy,
      });
      if (deliveryAction === "remove") {
        orphanedEntry = entry;
        break;
      }
      if (entry.status === "terminal-failure" || deliveryAction === "wait") continue;
      if (entry.retryAt !== null && entry.retryAt > now) {
        nextRetryAt = nextRetryAt === null ? entry.retryAt : Math.min(nextRetryAt, entry.retryAt);
        continue;
      }
      if (
        nextEntry === null ||
        entry.message.createdAt.localeCompare(nextEntry.message.createdAt) < 0
      ) {
        nextEntry = entry;
      }
    }

    if (orphanedEntry !== null) {
      const messageId = orphanedEntry.message.messageId;
      dispatchingMessageIdRef.current = messageId;
      void webThreadOutboxManager
        .discard(messageId)
        .catch((error) => {
          console.error("[thread-outbox] failed to discard orphaned durable web message", error);
        })
        .finally(() => {
          dispatchingMessageIdRef.current = null;
          setRetryTick((current) => current + 1);
        });
      return;
    }

    if (nextEntry === null) {
      if (nextRetryAt === null) {
        return;
      }
      const timer = window.setTimeout(
        () => setRetryTick((current) => current + 1),
        Math.max(0, nextRetryAt - now),
      );
      return () => window.clearTimeout(timer);
    }

    const entry = nextEntry;
    dispatchingMessageIdRef.current = entry.message.messageId;
    webThreadOutboxManager.markSending(entry.message.messageId);
    // Stable command and message ids make a retry safe when the previous
    // connection closed after the server accepted the command but before ack.
    void startThreadTurn({
      environmentId: entry.message.environmentId,
      input: buildThreadOutboxStartTurnInput(entry.message),
    })
      .then(async (result) => {
        if (result._tag !== "Failure") {
          await webThreadOutboxManager.acknowledge(entry.message.messageId);
          window.setTimeout(
            () => webThreadOutboxManager.removeAcknowledged(entry.message.messageId),
            2_000,
          );
          return;
        }

        const error = squashAtomCommandFailure(result);
        const classification = classifyThreadOutboxFailure({
          error,
          interrupted: Cause.hasInterruptsOnly(result.cause),
        });
        if (classification === "retry") {
          webThreadOutboxManager.markRetrying(entry.message.messageId, errorText(error));
          return;
        }
        await webThreadOutboxManager.markTerminalFailure(entry.message.messageId, errorText(error));
      })
      .catch((error) => {
        webThreadOutboxManager.markRetrying(entry.message.messageId, errorText(error));
      })
      .finally(() => {
        dispatchingMessageIdRef.current = null;
        setRetryTick((current) => current + 1);
      });
  }, [
    connectedEnvironmentIds,
    retryTick,
    snapshot.entries,
    snapshot.loaded,
    shellStatuses,
    startThreadTurn,
    threadByKey,
  ]);

  return null;
}
