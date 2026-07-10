import type { EnvironmentId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { ConnectionTargetKind, SupervisorConnectionState } from "./model.ts";

export const MAX_CONNECTION_DIAGNOSTICS_ENTRIES = 64;
export const MAX_RECENT_CONNECTION_EVENTS = 25;

const MAX_DIAGNOSTIC_TEXT_LENGTH = 500;
const MAX_DIAGNOSTIC_URL_LENGTH = 2_048;

export type ConnectionDiagnosticsPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type ConnectionDiagnosticsEventType =
  | "connecting"
  | "attempt"
  | "connected"
  | "disconnected"
  | "error";

export interface ConnectionDiagnosticsTarget {
  readonly environmentId: EnvironmentId;
  readonly kind: ConnectionTargetKind;
  readonly label: string;
  readonly origin: string | null;
}

export interface ConnectionDiagnosticsCounters {
  readonly connectionStartCount: number;
  readonly socketAttemptCount: number;
  readonly reconnectAttemptCount: number;
  readonly connectCount: number;
  readonly disconnectCount: number;
  readonly unexpectedDisconnectCount: number;
  readonly intentionalDisconnectCount: number;
  readonly errorCount: number;
}

export interface ConnectionDiagnosticsEvent {
  readonly id: string;
  readonly type: ConnectionDiagnosticsEventType;
  readonly observedAt: string;
  readonly phase: ConnectionDiagnosticsPhase;
  readonly socketUrl: string | null;
  readonly message: string | null;
  readonly closeCode: number | null;
  readonly closeReason: string | null;
  readonly intentional: boolean | null;
}

export interface ConnectionDiagnosticsEntry {
  readonly environmentId: EnvironmentId;
  readonly kind: ConnectionTargetKind;
  readonly label: string;
  readonly origin: string | null;
  readonly phase: ConnectionDiagnosticsPhase;
  readonly hasConnected: boolean;
  readonly firstObservedAt: string;
  readonly lastObservedAt: string;
  readonly connectedAt: string | null;
  readonly disconnectedAt: string | null;
  readonly lastSocketUrl: string | null;
  readonly lastError: string | null;
  readonly lastCloseCode: number | null;
  readonly lastCloseReason: string | null;
  readonly counters: ConnectionDiagnosticsCounters;
  readonly totalConnectedMs: number;
  readonly totalDisconnectedMs: number;
  readonly recentEvents: ReadonlyArray<ConnectionDiagnosticsEvent>;
}

export interface ConnectionDiagnosticsDurations {
  readonly connectedMs: number;
  readonly disconnectedMs: number;
}

export type RpcSessionDiagnosticEventInput =
  | {
      readonly type: "attempt";
      readonly observedAtMs: number;
      readonly socketUrl: string;
    }
  | {
      readonly type: "connected";
      readonly observedAtMs: number;
    }
  | {
      readonly type: "disconnected";
      readonly observedAtMs: number;
      readonly closeCode: number | null;
      readonly closeReason: string | null;
      readonly intentional: boolean;
      readonly wasConnected: boolean;
    };

export type RpcSessionDiagnosticEvent = RpcSessionDiagnosticEventInput & {
  readonly id: string;
};

const INITIAL_COUNTERS: ConnectionDiagnosticsCounters = Object.freeze({
  connectionStartCount: 0,
  socketAttemptCount: 0,
  reconnectAttemptCount: 0,
  connectCount: 0,
  disconnectCount: 0,
  unexpectedDisconnectCount: 0,
  intentionalDisconnectCount: 0,
  errorCount: 0,
});

export function sanitizeDiagnosticUrl(value: string): string {
  const truncated = value.slice(0, MAX_DIAGNOSTIC_URL_LENGTH);
  try {
    const url = new URL(truncated);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return truncated.replace(/\/\/[^/@\s]+@/u, "//").replace(/[?#].*$/u, "");
  }
}

export function sanitizeDiagnosticText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return normalized
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/giu, sanitizeDiagnosticUrl)
    .replace(/((?:wsTicket|ticket)\s*[=:]\s*)[^&\s,;]+/giu, "$1[redacted]")
    .slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH);
}

export function sanitizeDiagnosticOrigin(value: string | null | undefined): string | null {
  const normalized = sanitizeDiagnosticText(value);
  if (normalized === null) {
    return null;
  }
  try {
    return new URL(normalized).origin;
  } catch {
    return sanitizeDiagnosticUrl(normalized);
  }
}

export function recordSupervisorConnectionState(
  entries: ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry>,
  target: ConnectionDiagnosticsTarget,
  state: SupervisorConnectionState,
  observedAtMs: number,
): ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry> {
  const observedAt = DateTime.formatIso(DateTime.makeUnsafe(observedAtMs));
  const current =
    entries.get(target.environmentId) ?? createConnectionDiagnosticsEntry(target, observedAt);
  const phase = supervisorDiagnosticsPhase(state);
  const lastError = sanitizeDiagnosticText(state.lastFailure?.message);
  let next = applyPhaseTransition(current, phase, observedAt);
  next = applyTarget(next, target, observedAt);

  if (phase === "connecting" && current.phase !== "connecting") {
    next = appendDiagnosticsEvent(
      {
        ...next,
        counters: {
          ...next.counters,
          connectionStartCount: next.counters.connectionStartCount + 1,
        },
      },
      {
        id: `state:${state.generation}:${state.attempt}:${observedAt}`,
        type: "connecting",
        observedAt,
        phase,
        socketUrl: null,
        message: null,
        closeCode: null,
        closeReason: null,
        intentional: null,
      },
    );
  }

  if (
    phase === "error" &&
    lastError !== null &&
    (lastError !== current.lastError || current.phase !== "error")
  ) {
    next = appendDiagnosticsEvent(
      {
        ...next,
        lastError,
        counters: {
          ...next.counters,
          errorCount: next.counters.errorCount + 1,
        },
      },
      {
        id: `error:${state.generation}:${state.attempt}:${observedAt}`,
        type: "error",
        observedAt,
        phase: "error",
        socketUrl: null,
        message: lastError,
        closeCode: null,
        closeReason: null,
        intentional: null,
      },
    );
  }

  return installEntry(entries, next);
}

export function recordRpcSessionDiagnosticEvent(
  entries: ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry>,
  target: ConnectionDiagnosticsTarget,
  event: RpcSessionDiagnosticEvent,
): ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry> {
  const observedAt = DateTime.formatIso(DateTime.makeUnsafe(event.observedAtMs));
  const current =
    entries.get(target.environmentId) ?? createConnectionDiagnosticsEntry(target, observedAt);
  let next = applyTarget(current, target, observedAt);

  switch (event.type) {
    case "attempt": {
      const socketUrl = sanitizeDiagnosticUrl(event.socketUrl);
      next = appendDiagnosticsEvent(
        {
          ...applyPhaseTransition(next, "connecting", observedAt),
          lastSocketUrl: socketUrl,
          counters: {
            ...next.counters,
            socketAttemptCount: next.counters.socketAttemptCount + 1,
            reconnectAttemptCount:
              next.counters.reconnectAttemptCount + (next.hasConnected ? 1 : 0),
          },
        },
        {
          id: event.id,
          type: "attempt",
          observedAt,
          phase: "connecting",
          socketUrl,
          message: null,
          closeCode: null,
          closeReason: null,
          intentional: null,
        },
      );
      break;
    }
    case "connected":
      next = appendDiagnosticsEvent(
        {
          ...applyPhaseTransition(next, "connected", observedAt),
          connectedAt: observedAt,
          disconnectedAt: null,
          hasConnected: true,
          lastError: null,
          counters: {
            ...next.counters,
            connectCount: next.counters.connectCount + 1,
          },
        },
        {
          id: event.id,
          type: "connected",
          observedAt,
          phase: "connected",
          socketUrl: null,
          message: null,
          closeCode: null,
          closeReason: null,
          intentional: null,
        },
      );
      break;
    case "disconnected": {
      const shouldCountDisconnect = event.wasConnected && next.phase !== "disconnected";
      const phase = !event.wasConnected && next.phase === "error" ? "error" : "disconnected";
      const closeReason = sanitizeDiagnosticText(event.closeReason);
      next = appendDiagnosticsEvent(
        {
          ...applyPhaseTransition(next, phase, observedAt),
          connectedAt: null,
          disconnectedAt: phase === "disconnected" ? observedAt : next.disconnectedAt,
          lastCloseCode: event.closeCode,
          lastCloseReason: closeReason,
          counters: {
            ...next.counters,
            disconnectCount: next.counters.disconnectCount + (shouldCountDisconnect ? 1 : 0),
            intentionalDisconnectCount:
              next.counters.intentionalDisconnectCount +
              (shouldCountDisconnect && event.intentional ? 1 : 0),
            unexpectedDisconnectCount:
              next.counters.unexpectedDisconnectCount +
              (shouldCountDisconnect && !event.intentional ? 1 : 0),
          },
        },
        {
          id: event.id,
          type: "disconnected",
          observedAt,
          phase,
          socketUrl: null,
          message: null,
          closeCode: event.closeCode,
          closeReason,
          intentional: event.intentional,
        },
      );
      break;
    }
  }

  return installEntry(entries, next);
}

export function removeConnectionDiagnosticsEntry(
  entries: ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry>,
  environmentId: EnvironmentId,
): ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry> {
  if (!entries.has(environmentId)) {
    return entries;
  }
  const next = new Map(entries);
  next.delete(environmentId);
  return next;
}

export function getConnectionDiagnosticsDurations(
  entry: ConnectionDiagnosticsEntry,
  nowMs: number,
): ConnectionDiagnosticsDurations {
  const connectedSinceMs =
    entry.phase === "connected" && entry.connectedAt !== null
      ? Math.max(0, nowMs - Date.parse(entry.connectedAt))
      : 0;
  const disconnectedSinceMs =
    (entry.phase === "connecting" || entry.phase === "disconnected" || entry.phase === "error") &&
    entry.disconnectedAt !== null
      ? Math.max(0, nowMs - Date.parse(entry.disconnectedAt))
      : 0;
  return {
    connectedMs: entry.totalConnectedMs + connectedSinceMs,
    disconnectedMs: entry.totalDisconnectedMs + disconnectedSinceMs,
  };
}

export function selectConnectionDiagnosticsEntries(
  entries: ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry>,
): ReadonlyArray<ConnectionDiagnosticsEntry> {
  return [...entries.values()].toSorted((left, right) => {
    const leftPrimary = left.kind === "PrimaryConnectionTarget";
    const rightPrimary = right.kind === "PrimaryConnectionTarget";
    if (leftPrimary !== rightPrimary) {
      return leftPrimary ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

function supervisorDiagnosticsPhase(state: SupervisorConnectionState): ConnectionDiagnosticsPhase {
  switch (state.phase) {
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "backoff":
    case "blocked":
      return "error";
    case "available":
    case "offline":
      return "disconnected";
  }
}

function createConnectionDiagnosticsEntry(
  target: ConnectionDiagnosticsTarget,
  observedAt: string,
): ConnectionDiagnosticsEntry {
  return {
    environmentId: target.environmentId,
    kind: target.kind,
    label: sanitizeDiagnosticText(target.label) ?? target.environmentId,
    origin: sanitizeDiagnosticOrigin(target.origin),
    phase: "idle",
    hasConnected: false,
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    connectedAt: null,
    disconnectedAt: null,
    lastSocketUrl: null,
    lastError: null,
    lastCloseCode: null,
    lastCloseReason: null,
    counters: INITIAL_COUNTERS,
    totalConnectedMs: 0,
    totalDisconnectedMs: 0,
    recentEvents: [],
  };
}

function applyTarget(
  entry: ConnectionDiagnosticsEntry,
  target: ConnectionDiagnosticsTarget,
  observedAt: string,
): ConnectionDiagnosticsEntry {
  return {
    ...entry,
    kind: target.kind,
    label: sanitizeDiagnosticText(target.label) ?? entry.label,
    origin: sanitizeDiagnosticOrigin(target.origin) ?? entry.origin,
    lastObservedAt: observedAt,
  };
}

function appendDiagnosticsEvent(
  entry: ConnectionDiagnosticsEntry,
  event: ConnectionDiagnosticsEvent,
): ConnectionDiagnosticsEntry {
  if (entry.recentEvents.some((candidate) => candidate.id === event.id)) {
    return entry;
  }
  return {
    ...entry,
    lastObservedAt: event.observedAt,
    recentEvents: [event, ...entry.recentEvents].slice(0, MAX_RECENT_CONNECTION_EVENTS),
  };
}

function applyPhaseTransition(
  entry: ConnectionDiagnosticsEntry,
  nextPhase: ConnectionDiagnosticsPhase,
  observedAt: string,
): ConnectionDiagnosticsEntry {
  if (entry.phase === nextPhase) {
    return {
      ...entry,
      lastObservedAt: observedAt,
    };
  }

  const observedAtMs = Date.parse(observedAt);
  let totalConnectedMs = entry.totalConnectedMs;
  let totalDisconnectedMs = entry.totalDisconnectedMs;
  if (entry.phase === "connected" && entry.connectedAt !== null) {
    totalConnectedMs += Math.max(0, observedAtMs - Date.parse(entry.connectedAt));
  }
  if (nextPhase === "connected" && entry.disconnectedAt !== null) {
    totalDisconnectedMs += Math.max(0, observedAtMs - Date.parse(entry.disconnectedAt));
  }

  return {
    ...entry,
    phase: nextPhase,
    totalConnectedMs,
    totalDisconnectedMs,
    lastObservedAt: observedAt,
  };
}

function installEntry(
  entries: ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry>,
  entry: ConnectionDiagnosticsEntry,
): ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry> {
  const next = new Map(entries);
  next.set(entry.environmentId, entry);
  if (next.size <= MAX_CONNECTION_DIAGNOSTICS_ENTRIES) {
    return next;
  }

  const primaryEnvironmentIds = new Set(
    [...next.values()]
      .filter((candidate) => candidate.kind === "PrimaryConnectionTarget")
      .toSorted((left, right) => Date.parse(right.lastObservedAt) - Date.parse(left.lastObservedAt))
      .slice(0, 1)
      .map((candidate) => candidate.environmentId),
  );
  const retainedEnvironmentIds = new Set(
    [...next.values()]
      .filter((candidate) => !primaryEnvironmentIds.has(candidate.environmentId))
      .toSorted((left, right) => Date.parse(right.lastObservedAt) - Date.parse(left.lastObservedAt))
      .slice(0, MAX_CONNECTION_DIAGNOSTICS_ENTRIES - primaryEnvironmentIds.size)
      .map((candidate) => candidate.environmentId),
  );

  return new Map(
    [...next.values()]
      .filter(
        (candidate) =>
          primaryEnvironmentIds.has(candidate.environmentId) ||
          retainedEnvironmentIds.has(candidate.environmentId),
      )
      .map((candidate) => [candidate.environmentId, candidate] as const),
  );
}
