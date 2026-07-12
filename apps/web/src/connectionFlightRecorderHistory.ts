import type {
  ConnectionDiagnosticsEntry,
  ConnectionDiagnosticsEvent,
} from "@t3tools/client-runtime/state/connections";

const STORAGE_KEY = "t3code:connection-flight-recorder:v1";
const MAX_RECORDED_EVENTS = 256;

export interface RecordedConnectionEvent {
  readonly key: string;
  readonly sessionId: string;
  readonly environmentId: string;
  readonly environmentLabel: string;
  readonly event: ConnectionDiagnosticsEvent;
}

export interface ConnectionFlightRecorderSnapshot {
  readonly events: ReadonlyArray<RecordedConnectionEvent>;
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
    ["connecting", "attempt", "connected", "disconnected", "error"].includes(String(event.type)) &&
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

function decodeStoredEvents(value: string | null): ReadonlyArray<RecordedConnectionEvent> {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((candidate) => {
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
  } catch {
    return [];
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
  let snapshot: ConnectionFlightRecorderSnapshot = {
    events: decodeStoredEvents(storage.read()).slice(0, MAX_RECORDED_EVENTS),
  };
  const listeners = new Set<() => void>();

  const publish = (events: ReadonlyArray<RecordedConnectionEvent>) => {
    snapshot = { events };
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
      if (
        nextEvents.length === snapshot.events.length &&
        nextEvents.every((event, index) => event.key === snapshot.events[index]?.key)
      ) {
        return;
      }
      storage.write(JSON.stringify(nextEvents));
      publish(nextEvents);
    },
    clear: () => {
      storage.remove();
      publish([]);
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
