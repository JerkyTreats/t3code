import type { EnvironmentId, OrchestrationThreadSyncV2Windows, ThreadId } from "@t3tools/contracts";
import { useMemo } from "react";
import { create } from "zustand";

const MAX_THREAD_SYNC_DIAGNOSTICS_ENTRIES = 50;

export type ThreadSyncDiagnosticsVersion = "v1" | "v2";
export type ThreadSyncDiagnosticsPhase = "waiting" | "subscribed" | "disposed";

export interface ThreadSyncDiagnosticsEntry {
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly version: ThreadSyncDiagnosticsVersion | null;
  readonly phase: ThreadSyncDiagnosticsPhase;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly subscribeCount: number;
  readonly snapshotCount: number;
  readonly eventCount: number;
  readonly deferredActivityPayloads: number;
  readonly lastSnapshotBytes: number | null;
  readonly lastEventBytes: number | null;
  readonly lastSnapshotWindows: OrchestrationThreadSyncV2Windows | null;
}

interface ThreadSyncDiagnosticsStoreState {
  readonly byKey: Record<string, ThreadSyncDiagnosticsEntry>;
  readonly reset: () => void;
}

interface ThreadSyncTargetInput {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

interface RecordThreadSyncSubscriptionInput extends ThreadSyncTargetInput {
  readonly version: ThreadSyncDiagnosticsVersion;
}

interface RecordThreadSyncSnapshotInput extends ThreadSyncTargetInput {
  readonly version: ThreadSyncDiagnosticsVersion;
  readonly estimatedSerializedBytes?: number | null;
  readonly deferredActivityPayloads?: number;
  readonly windows?: OrchestrationThreadSyncV2Windows | null;
}

interface RecordThreadSyncEventInput extends ThreadSyncTargetInput {
  readonly version: ThreadSyncDiagnosticsVersion;
  readonly estimatedSerializedBytes?: number | null;
  readonly deferredActivityPayloads?: number;
}

export const useThreadSyncDiagnosticsStore = create<ThreadSyncDiagnosticsStoreState>()((set) => ({
  byKey: {},
  reset: () => set({ byKey: {} }),
}));

export function threadSyncDiagnosticsKey(environmentId: EnvironmentId, threadId: ThreadId): string {
  return `${environmentId}:${threadId}`;
}

export function getThreadSyncDiagnosticsSnapshot(): ReadonlyArray<ThreadSyncDiagnosticsEntry> {
  return selectThreadSyncDiagnosticsEntries(useThreadSyncDiagnosticsStore.getState().byKey);
}

export function subscribeThreadSyncDiagnostics(
  listener: (entries: ReadonlyArray<ThreadSyncDiagnosticsEntry>) => void,
): () => void {
  return useThreadSyncDiagnosticsStore.subscribe((state) => {
    listener(selectThreadSyncDiagnosticsEntries(state.byKey));
  });
}

export function useThreadSyncDiagnosticsEntries(): ReadonlyArray<ThreadSyncDiagnosticsEntry> {
  const byKey = useThreadSyncDiagnosticsStore((state) => state.byKey);
  return useMemo(() => selectThreadSyncDiagnosticsEntries(byKey), [byKey]);
}

export function resetThreadSyncDiagnosticsForTests(): void {
  useThreadSyncDiagnosticsStore.getState().reset();
}

export function recordThreadSyncWaiting(input: ThreadSyncTargetInput): void {
  updateThreadSyncDiagnostics(input, (entry, observedAt) => ({
    ...entry,
    phase: "waiting",
    lastObservedAt: observedAt,
  }));
}

export function recordThreadSyncSubscription(input: RecordThreadSyncSubscriptionInput): void {
  updateThreadSyncDiagnostics(input, (entry, observedAt) => ({
    ...entry,
    version: input.version,
    phase: "subscribed",
    lastObservedAt: observedAt,
    subscribeCount: entry.subscribeCount + 1,
  }));
}

export function recordThreadSyncSnapshot(input: RecordThreadSyncSnapshotInput): void {
  updateThreadSyncDiagnostics(input, (entry, observedAt) => ({
    ...entry,
    version: input.version,
    phase: "subscribed",
    lastObservedAt: observedAt,
    snapshotCount: entry.snapshotCount + 1,
    deferredActivityPayloads:
      entry.deferredActivityPayloads + (input.deferredActivityPayloads ?? 0),
    lastSnapshotBytes: input.estimatedSerializedBytes ?? entry.lastSnapshotBytes,
    lastSnapshotWindows: input.windows ?? entry.lastSnapshotWindows,
  }));
}

export function recordThreadSyncEvent(input: RecordThreadSyncEventInput): void {
  updateThreadSyncDiagnostics(input, (entry, observedAt) => ({
    ...entry,
    version: input.version,
    phase: "subscribed",
    lastObservedAt: observedAt,
    eventCount: entry.eventCount + 1,
    deferredActivityPayloads:
      entry.deferredActivityPayloads + (input.deferredActivityPayloads ?? 0),
    lastEventBytes: input.estimatedSerializedBytes ?? entry.lastEventBytes,
  }));
}

export function recordThreadSyncDisposed(input: ThreadSyncTargetInput): void {
  updateThreadSyncDiagnostics(input, (entry, observedAt) => ({
    ...entry,
    phase: "disposed",
    lastObservedAt: observedAt,
  }));
}

function selectThreadSyncDiagnosticsEntries(
  byKey: Record<string, ThreadSyncDiagnosticsEntry>,
): ReadonlyArray<ThreadSyncDiagnosticsEntry> {
  return Object.values(byKey).toSorted((left, right) =>
    right.lastObservedAt.localeCompare(left.lastObservedAt),
  );
}

function updateThreadSyncDiagnostics(
  input: ThreadSyncTargetInput,
  update: (entry: ThreadSyncDiagnosticsEntry, observedAt: string) => ThreadSyncDiagnosticsEntry,
): void {
  const key = threadSyncDiagnosticsKey(input.environmentId, input.threadId);
  const observedAt = new Date().toISOString();
  useThreadSyncDiagnosticsStore.setState((state) => {
    const current = state.byKey[key] ?? createThreadSyncDiagnosticsEntry(input, key, observedAt);
    const nextEntry = update(current, observedAt);
    const nextEntries = Object.values({
      ...state.byKey,
      [key]: nextEntry,
    })
      .toSorted((left, right) => right.lastObservedAt.localeCompare(left.lastObservedAt))
      .slice(0, MAX_THREAD_SYNC_DIAGNOSTICS_ENTRIES);

    return {
      byKey: Object.fromEntries(nextEntries.map((entry) => [entry.key, entry] as const)),
    };
  });
}

function createThreadSyncDiagnosticsEntry(
  input: ThreadSyncTargetInput,
  key: string,
  observedAt: string,
): ThreadSyncDiagnosticsEntry {
  return {
    key,
    environmentId: input.environmentId,
    threadId: input.threadId,
    version: null,
    phase: "waiting",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    subscribeCount: 0,
    snapshotCount: 0,
    eventCount: 0,
    deferredActivityPayloads: 0,
    lastSnapshotBytes: null,
    lastEventBytes: null,
    lastSnapshotWindows: null,
  };
}
