import type { EnvironmentId, OrchestrationThreadSyncV2Windows, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export const THREAD_SYNC_DIAGNOSTICS_ENTRY_LIMIT = 50;
const DIAGNOSTIC_IDENTIFIER_LIMIT = 128;
const DIAGNOSTIC_MESSAGE_LIMIT = 512;
const DIAGNOSTIC_MESSAGE_INPUT_LIMIT = 4096;
const SENSITIVE_ASSIGNMENT = /\b(authorization|bearer|password|secret|token)\s*[:=]\s*[^\s,;]+/giu;
const DIAGNOSTIC_URL = /(?:https?|wss?|file):\/\/[^\s]+/giu;

export type ThreadSyncDiagnosticsVersion = "v1" | "v2";
export type ThreadSyncDiagnosticsPhase =
  | "waiting"
  | "subscribing"
  | "hydrating"
  | "live"
  | "error"
  | "disposed";

export interface ThreadSyncDiagnosticsEntry {
  readonly key: string;
  readonly environmentId: string;
  readonly threadId: string;
  readonly version: ThreadSyncDiagnosticsVersion | null;
  readonly phase: ThreadSyncDiagnosticsPhase;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly subscribeCount: number;
  readonly snapshotCount: number;
  readonly eventCount: number;
  readonly hydrationRequestCount: number;
  readonly deferredActivityPayloads: number;
  readonly lastSnapshotBytes: number | null;
  readonly lastEventBytes: number | null;
  readonly lastSnapshotWindows: OrchestrationThreadSyncV2Windows | null;
  readonly lastError: string | null;
}

interface ThreadSyncTargetInput {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

interface ThreadSyncVersionInput extends ThreadSyncTargetInput {
  readonly version: ThreadSyncDiagnosticsVersion;
}

interface RecordThreadSyncSnapshotInput extends ThreadSyncVersionInput {
  readonly estimatedSerializedBytes?: number | null;
  readonly deferredActivityPayloads?: number;
  readonly windows?: OrchestrationThreadSyncV2Windows | null;
}

interface RecordThreadSyncEventInput extends ThreadSyncVersionInput {
  readonly estimatedSerializedBytes?: number | null;
  readonly deferredActivityPayloads?: number;
}

interface RecordThreadSyncHydrationInput extends ThreadSyncVersionInput {
  readonly requestCount: number;
}

interface RecordThreadSyncErrorInput extends ThreadSyncTargetInput {
  readonly version: ThreadSyncDiagnosticsVersion | null;
  readonly error: unknown;
}

type DiagnosticsListener = (entries: ReadonlyArray<ThreadSyncDiagnosticsEntry>) => void;

let entriesByKey = new Map<string, ThreadSyncDiagnosticsEntry>();
const listeners = new Set<DiagnosticsListener>();
let lastObservedAtMs = 0;

export function getThreadSyncDiagnosticsSnapshot(): ReadonlyArray<ThreadSyncDiagnosticsEntry> {
  return sortEntries(entriesByKey.values());
}

export function subscribeThreadSyncDiagnostics(listener: DiagnosticsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetThreadSyncDiagnosticsForTests(): void {
  entriesByKey = new Map();
  lastObservedAtMs = 0;
  notifyListeners();
}

export function recordThreadSyncWaiting(input: ThreadSyncTargetInput): void {
  updateEntry(input, (entry, observedAt) => ({
    ...entry,
    version: null,
    phase: "waiting",
    lastObservedAt: observedAt,
    lastError: null,
  }));
}

export function recordThreadSyncSubscription(input: ThreadSyncVersionInput): void {
  updateEntry(input, (entry, observedAt) => ({
    ...entry,
    version: input.version,
    phase: "subscribing",
    lastObservedAt: observedAt,
    subscribeCount: entry.subscribeCount + 1,
    lastError: null,
  }));
}

export function recordThreadSyncSnapshot(input: RecordThreadSyncSnapshotInput): void {
  updateEntry(input, (entry, observedAt) => ({
    ...entry,
    version: input.version,
    phase: "live",
    lastObservedAt: observedAt,
    snapshotCount: entry.snapshotCount + 1,
    deferredActivityPayloads:
      entry.deferredActivityPayloads + sanitizeCount(input.deferredActivityPayloads),
    lastSnapshotBytes: sanitizeNullableCount(
      input.estimatedSerializedBytes,
      entry.lastSnapshotBytes,
    ),
    lastSnapshotWindows: input.windows ?? entry.lastSnapshotWindows,
    lastError: null,
  }));
}

export function recordThreadSyncEvent(input: RecordThreadSyncEventInput): void {
  updateEntry(input, (entry, observedAt) => ({
    ...entry,
    version: input.version,
    phase: "live",
    lastObservedAt: observedAt,
    eventCount: entry.eventCount + 1,
    deferredActivityPayloads:
      entry.deferredActivityPayloads + sanitizeCount(input.deferredActivityPayloads),
    lastEventBytes: sanitizeNullableCount(input.estimatedSerializedBytes, entry.lastEventBytes),
    lastError: null,
  }));
}

export function recordThreadSyncHydration(input: RecordThreadSyncHydrationInput): void {
  updateEntry(input, (entry, observedAt) => ({
    ...entry,
    version: input.version,
    phase: "hydrating",
    lastObservedAt: observedAt,
    hydrationRequestCount: entry.hydrationRequestCount + sanitizeCount(input.requestCount),
    lastError: null,
  }));
}

export function recordThreadSyncLive(input: ThreadSyncVersionInput): void {
  updateEntry(input, (entry, observedAt) => ({
    ...entry,
    version: input.version,
    phase: "live",
    lastObservedAt: observedAt,
    lastError: null,
  }));
}

export function recordThreadSyncError(input: RecordThreadSyncErrorInput): void {
  updateEntry(input, (entry, observedAt) => ({
    ...entry,
    version: input.version,
    phase: "error",
    lastObservedAt: observedAt,
    lastError: sanitizeDiagnosticError(input.error),
  }));
}

export function recordThreadSyncDisposed(input: ThreadSyncTargetInput): void {
  updateEntry(input, (entry, observedAt) => ({
    ...entry,
    phase: "disposed",
    lastObservedAt: observedAt,
  }));
}

function updateEntry(
  input: ThreadSyncTargetInput,
  update: (entry: ThreadSyncDiagnosticsEntry, observedAt: string) => ThreadSyncDiagnosticsEntry,
): void {
  const environmentId = sanitizeDiagnosticIdentifier(input.environmentId);
  const threadId = sanitizeDiagnosticIdentifier(input.threadId);
  const key = `${environmentId}:${threadId}`;
  const observedAtMs = Math.max(DateTime.toEpochMillis(DateTime.nowUnsafe()), lastObservedAtMs + 1);
  lastObservedAtMs = observedAtMs;
  const observedAt = DateTime.formatIso(DateTime.makeUnsafe(observedAtMs));
  const current =
    entriesByKey.get(key) ??
    createThreadSyncDiagnosticsEntry(key, environmentId, threadId, observedAt);
  const next = new Map(entriesByKey);
  next.set(key, update(current, observedAt));
  entriesByKey = new Map(
    sortEntries(next.values())
      .slice(0, THREAD_SYNC_DIAGNOSTICS_ENTRY_LIMIT)
      .map((entry) => [entry.key, entry] as const),
  );
  notifyListeners();
}

function notifyListeners(): void {
  if (listeners.size === 0) {
    return;
  }
  const snapshot = getThreadSyncDiagnosticsSnapshot();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function sortEntries(
  entries: Iterable<ThreadSyncDiagnosticsEntry>,
): ReadonlyArray<ThreadSyncDiagnosticsEntry> {
  return [...entries].toSorted((left, right) =>
    right.lastObservedAt.localeCompare(left.lastObservedAt),
  );
}

function createThreadSyncDiagnosticsEntry(
  key: string,
  environmentId: string,
  threadId: string,
  observedAt: string,
): ThreadSyncDiagnosticsEntry {
  return {
    key,
    environmentId,
    threadId,
    version: null,
    phase: "waiting",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    subscribeCount: 0,
    snapshotCount: 0,
    eventCount: 0,
    hydrationRequestCount: 0,
    deferredActivityPayloads: 0,
    lastSnapshotBytes: null,
    lastEventBytes: null,
    lastSnapshotWindows: null,
    lastError: null,
  };
}

function sanitizeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function sanitizeNullableCount(
  value: number | null | undefined,
  fallback: number | null,
): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function sanitizeDiagnosticIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9._:/-]+/gu, "_").slice(0, DIAGNOSTIC_IDENTIFIER_LIMIT);
}

function sanitizeDiagnosticError(error: unknown): string {
  const message = (error instanceof Error ? error.message : "Unknown thread sync failure.").slice(
    0,
    DIAGNOSTIC_MESSAGE_INPUT_LIMIT,
  );
  const sanitized = message
    .replace(DIAGNOSTIC_URL, redactDiagnosticUrl)
    .replace(SENSITIVE_ASSIGNMENT, "$1=[redacted]")
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  return (sanitized || "Unknown thread sync failure.").slice(0, DIAGNOSTIC_MESSAGE_LIMIT);
}

function redactDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.replace(/[?#].*$/u, "");
  }
}
