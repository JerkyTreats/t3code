import type {
  ConnectionDiagnosticsEntry,
  ConnectionDiagnosticsEvent,
} from "@t3tools/client-runtime/state/connections";

const STORAGE_KEY = "t3code:connection-flight-recorder:v1";
const MAX_RECORDED_EVENTS = 256;
const MAX_RECORDED_ENTRIES = 64;

export interface RecordedConnectionEvent {
  readonly key: string;
  readonly sessionId: string;
  readonly environmentId: string;
  readonly environmentLabel: string;
  readonly event: ConnectionDiagnosticsEvent;
}

export interface RecordedConnectionEntry {
  readonly key: string;
  readonly sessionId: string;
  readonly entry: ConnectionDiagnosticsEntry;
}

export interface ConnectionFlightRecorderSnapshot {
  readonly events: ReadonlyArray<RecordedConnectionEvent>;
  readonly entries: ReadonlyArray<RecordedConnectionEntry>;
}

export interface ConnectionFlightRecorderStorage {
  readonly read: () => string | null;
  readonly write: (value: string) => void;
  readonly remove: () => void;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isConnectionDiagnosticsEvent(value: unknown): value is ConnectionDiagnosticsEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    ["connecting", "attempt", "connected", "disconnected", "error", "probe"].includes(
      String(event.type),
    ) &&
    typeof event.observedAt === "string" &&
    ["idle", "connecting", "connected", "disconnected", "error"].includes(String(event.phase)) &&
    isNullableString(event.socketUrl) &&
    isNullableString(event.message) &&
    isNullableNumber(event.closeCode) &&
    isNullableString(event.closeReason) &&
    (event.intentional === null || typeof event.intentional === "boolean") &&
    isNullableNumber(event.attemptDurationMs) &&
    isNullableNumber(event.connectionDurationMs)
  );
}

function decodeRecordedEvents(value: unknown): ReadonlyArray<RecordedConnectionEvent> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const record = candidate as Record<string, unknown>;
    return typeof record.key === "string" &&
      typeof record.sessionId === "string" &&
      typeof record.environmentId === "string" &&
      typeof record.environmentLabel === "string" &&
      isConnectionDiagnosticsEvent(record.event)
      ? [record as unknown as RecordedConnectionEvent]
      : [];
  });
}

function isConnectionDiagnosticsEntry(value: unknown): value is ConnectionDiagnosticsEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.environmentId === "string" &&
    typeof entry.label === "string" &&
    typeof entry.phase === "string" &&
    typeof entry.counters === "object" &&
    Array.isArray(entry.recentEvents) &&
    entry.recentEvents.every(isConnectionDiagnosticsEvent)
  );
}

function decodeRecordedEntries(value: unknown): ReadonlyArray<RecordedConnectionEntry> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const record = candidate as Record<string, unknown>;
    return typeof record.key === "string" &&
      typeof record.sessionId === "string" &&
      isConnectionDiagnosticsEntry(record.entry)
      ? [record as unknown as RecordedConnectionEntry]
      : [];
  });
}

function decodeStoredSnapshot(value: string | null): ConnectionFlightRecorderSnapshot {
  if (value === null) return { events: [], entries: [] };
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return { events: decodeRecordedEvents(parsed), entries: [] };
    if (typeof parsed !== "object" || parsed === null) return { events: [], entries: [] };
    const stored = parsed as Record<string, unknown>;
    return {
      events: decodeRecordedEvents(stored.events),
      entries: decodeRecordedEntries(stored.entries),
    };
  } catch {
    return { events: [], entries: [] };
  }
}

function makeSessionId(): string {
  const timeOrigin = typeof performance === "undefined" ? 0 : performance.timeOrigin;
  return `${timeOrigin}:${Date.now()}`;
}

export function createConnectionFlightRecorder(
  storage: ConnectionFlightRecorderStorage,
  sessionId = makeSessionId(),
) {
  const stored = decodeStoredSnapshot(storage.read());
  let snapshot: ConnectionFlightRecorderSnapshot = {
    events: stored.events.slice(0, MAX_RECORDED_EVENTS),
    entries: stored.entries.slice(0, MAX_RECORDED_ENTRIES),
  };
  const listeners = new Set<() => void>();

  const publish = (
    events: ReadonlyArray<RecordedConnectionEvent>,
    entries: ReadonlyArray<RecordedConnectionEntry>,
  ) => {
    snapshot = { events, entries };
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    record: (entries: ReadonlyArray<ConnectionDiagnosticsEntry>) => {
      const nextByKey = new Map(snapshot.events.map((event) => [event.key, event]));
      for (const entry of entries) {
        for (const event of entry.recentEvents) {
          const key = `${sessionId}:${entry.environmentId}:${event.id}`;
          nextByKey.set(key, {
            key,
            sessionId,
            environmentId: entry.environmentId,
            environmentLabel: entry.label,
            event,
          });
        }
      }
      const nextEvents = [...nextByKey.values()]
        .toSorted((left, right) => right.event.observedAt.localeCompare(left.event.observedAt))
        .slice(0, MAX_RECORDED_EVENTS);
      const nextEntriesByKey = new Map(snapshot.entries.map((entry) => [entry.key, entry]));
      for (const entry of entries) {
        const key = `${sessionId}:${entry.environmentId}`;
        nextEntriesByKey.set(key, { key, sessionId, entry });
      }
      const nextEntries = [...nextEntriesByKey.values()]
        .toSorted((left, right) =>
          right.entry.lastObservedAt.localeCompare(left.entry.lastObservedAt),
        )
        .slice(0, MAX_RECORDED_ENTRIES);
      if (
        nextEvents.length === snapshot.events.length &&
        nextEvents.every((event, index) => event.key === snapshot.events[index]?.key) &&
        nextEntries.length === snapshot.entries.length &&
        nextEntries.every(
          (entry, index) =>
            entry.key === snapshot.entries[index]?.key &&
            entry.entry.lastObservedAt === snapshot.entries[index]?.entry.lastObservedAt,
        )
      ) {
        return;
      }
      storage.write(JSON.stringify({ version: 2, events: nextEvents, entries: nextEntries }));
      publish(nextEvents, nextEntries);
    },
    clear: () => {
      storage.remove();
      publish([], []);
    },
  };
}

const browserStorage: ConnectionFlightRecorderStorage = {
  read: () => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  write: (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Diagnostics persistence must never disrupt the application runtime.
    }
  },
  remove: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Diagnostics persistence must never disrupt the application runtime.
    }
  },
};

export const connectionFlightRecorder = createConnectionFlightRecorder(browserStorage);
