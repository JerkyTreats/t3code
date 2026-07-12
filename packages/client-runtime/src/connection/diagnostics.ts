import type { EnvironmentId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { ConnectionTargetKind, SupervisorConnectionState } from "./model.ts";

export const MAX_CONNECTION_DIAGNOSTICS_ENTRIES = 64;
export const MAX_RECENT_CONNECTION_EVENTS = 25;

const MAX_DIAGNOSTIC_TEXT_LENGTH = 500;
const MAX_DIAGNOSTIC_URL_LENGTH = 2_048;
const DIAGNOSTIC_URL = /\b(?:https?|wss?):\/\/[^\s"'<>]+/giu;
const SENSITIVE_JSON_FIELD =
  /(["'](?:access[_-]?token|api[_-]?key|authorization|bearer|client[_-]?secret|cookies?|credentials?|dpop|pairing[_ -]?(?:code|token)|password|passwd|refresh[_-]?token|secret|set-cookie|token|ticket|wsTicket)["']\s*:\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,}\]\s]+)/giu;
const AUTHORIZATION_VALUE =
  /\b(authorization\s*[:=]\s*)(?:bearer\s+)?(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/giu;
const COOKIE_VALUE = /\b((?:set-)?cookies?\s*:\s*)[^\r\n]+/giu;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const SENSITIVE_ASSIGNMENT =
  /\b(access[_-]?token|api[_-]?key|bearer|client[_-]?secret|cookies?|credentials?|dpop|pairing[_ -]?(?:code|token)|password|passwd|refresh[_-]?token|secret|set-cookie|token|ticket|wsTicket)(\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/giu;
const PAIRING_CODE_VALUE =
  /\b(pairing[_ -]?code)\s+(?:is\s+)?(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z0-9._~+/-]{4,})/giu;

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
  | "error"
  | "probe";

export interface ConnectionDiagnosticsTarget {
  readonly environmentId: EnvironmentId;
  readonly kind: ConnectionTargetKind;
  readonly label: string;
  readonly origin: string | null;
}

export interface ConnectionDiagnosticsCounters {
  readonly connectionStartCount: number;
  readonly socketAttemptCount: number;
  readonly failedOpenCount: number;
  readonly reconnectAttemptCount: number;
  readonly connectCount: number;
  readonly disconnectCount: number;
  readonly unexpectedDisconnectCount: number;
  readonly intentionalDisconnectCount: number;
  readonly probeCount: number;
  readonly probeFailureCount: number;
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
  readonly attemptDurationMs: number | null;
  readonly connectionDurationMs: number | null;
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
  readonly lastAttemptDurationMs: number | null;
  readonly lastConnectionDurationMs: number | null;
  readonly lastProbeAt: string | null;
  readonly lastProbeDurationMs: number | null;
  readonly lastProbeError: string | null;
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
      readonly attemptDurationMs?: number;
    }
  | {
      readonly type: "disconnected";
      readonly observedAtMs: number;
      readonly closeCode: number | null;
      readonly closeReason: string | null;
      readonly intentional: boolean;
      readonly wasConnected: boolean;
      readonly attemptDurationMs?: number;
      readonly connectionDurationMs?: number | null;
    };

export type RpcSessionDiagnosticEvent = RpcSessionDiagnosticEventInput & {
  readonly id: string;
};

export interface RpcSessionProbeDiagnosticEvent {
  readonly id: string;
  readonly observedAtMs: number;
  readonly durationMs: number;
  readonly error: string | null;
}

const INITIAL_COUNTERS: ConnectionDiagnosticsCounters = Object.freeze({
  connectionStartCount: 0,
  socketAttemptCount: 0,
  failedOpenCount: 0,
  reconnectAttemptCount: 0,
  connectCount: 0,
  disconnectCount: 0,
  unexpectedDisconnectCount: 0,
  intentionalDisconnectCount: 0,
  probeCount: 0,
  probeFailureCount: 0,
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
    .replace(DIAGNOSTIC_URL, sanitizeDiagnosticUrl)
    .replace(SENSITIVE_JSON_FIELD, '$1"[redacted]"')
    .replace(COOKIE_VALUE, "$1[redacted]")
    .replace(AUTHORIZATION_VALUE, "$1[redacted]")
    .replace(BEARER_VALUE, "Bearer [redacted]")
    .replace(SENSITIVE_ASSIGNMENT, "$1$2[redacted]")
    .replace(PAIRING_CODE_VALUE, "$1 [redacted]")
    .replace(/\s+/gu, " ")
    .slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH);
}

export function rememberProcessedSessionEventId(
  processed: ReadonlySet<string>,
  eventId: string,
): readonly [isNew: boolean, processed: ReadonlySet<string>] {
  if (processed.has(eventId)) {
    return [false, processed];
  }
  return [true, new Set([...processed, eventId].slice(-MAX_RECENT_CONNECTION_EVENTS))];
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
  if (observedAt < current.lastObservedAt) {
    return installEntry(entries, applyTarget(current, target, observedAt));
  }
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
        attemptDurationMs: null,
        connectionDurationMs: null,
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
        attemptDurationMs: null,
        connectionDurationMs: null,
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
  if (current.recentEvents.some((candidate) => candidate.id === event.id)) return entries;
  let next = applyTarget(current, target, observedAt);
  const isLatestObservation = observedAt >= current.lastObservedAt;

  switch (event.type) {
    case "attempt": {
      const socketUrl = sanitizeDiagnosticUrl(event.socketUrl);
      next = appendDiagnosticsEvent(
        {
          ...applyPhaseTransition(next, "connecting", observedAt),
          ...(isLatestObservation ? { lastSocketUrl: socketUrl } : {}),
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
          attemptDurationMs: null,
          connectionDurationMs: null,
        },
      );
      break;
    }
    case "connected":
      next = appendDiagnosticsEvent(
        {
          ...applyPhaseTransition(next, "connected", observedAt),
          ...(isLatestObservation
            ? {
                connectedAt: observedAt,
                disconnectedAt: null,
                hasConnected: true,
                lastError: null,
                lastAttemptDurationMs: event.attemptDurationMs ?? null,
              }
            : {}),
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
          attemptDurationMs: event.attemptDurationMs ?? null,
          connectionDurationMs: null,
        },
      );
      break;
    case "disconnected": {
      const shouldCountDisconnect = event.wasConnected;
      const phase = !event.wasConnected && next.phase === "error" ? "error" : "disconnected";
      const closeReason = sanitizeDiagnosticText(event.closeReason);
      next = appendDiagnosticsEvent(
        {
          ...applyPhaseTransition(next, phase, observedAt),
          ...(isLatestObservation
            ? {
                connectedAt: null,
                disconnectedAt: phase === "disconnected" ? observedAt : next.disconnectedAt,
                lastCloseCode: event.closeCode,
                lastCloseReason: closeReason,
                lastAttemptDurationMs: event.attemptDurationMs ?? next.lastAttemptDurationMs,
                lastConnectionDurationMs: event.connectionDurationMs ?? null,
              }
            : {}),
          counters: {
            ...next.counters,
            failedOpenCount:
              next.counters.failedOpenCount + (!event.wasConnected && !event.intentional ? 1 : 0),
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
          attemptDurationMs: event.attemptDurationMs ?? null,
          connectionDurationMs: event.connectionDurationMs ?? null,
        },
      );
      break;
    }
  }

  return installEntry(entries, next);
}

export function recordRpcSessionProbeDiagnosticEvent(
  entries: ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry>,
  target: ConnectionDiagnosticsTarget,
  event: RpcSessionProbeDiagnosticEvent,
): ReadonlyMap<EnvironmentId, ConnectionDiagnosticsEntry> {
  const observedAt = DateTime.formatIso(DateTime.makeUnsafe(event.observedAtMs));
  const current =
    entries.get(target.environmentId) ?? createConnectionDiagnosticsEntry(target, observedAt);
  if (current.recentEvents.some((candidate) => candidate.id === event.id)) return entries;
  const error = sanitizeDiagnosticText(event.error);
  const isLatestObservation = observedAt >= current.lastObservedAt;
  const next = applyTarget(
    appendDiagnosticsEvent(
      {
        ...current,
        ...(isLatestObservation
          ? {
              lastProbeAt: observedAt,
              lastProbeDurationMs: Math.max(0, event.durationMs),
              lastProbeError: error,
            }
          : {}),
        counters: {
          ...current.counters,
          probeCount: current.counters.probeCount + 1,
          probeFailureCount: current.counters.probeFailureCount + (error === null ? 0 : 1),
        },
      },
      {
        id: event.id,
        type: "probe",
        observedAt,
        phase: current.phase,
        socketUrl: null,
        message: error,
        closeCode: null,
        closeReason: null,
        intentional: null,
        attemptDurationMs: Math.max(0, event.durationMs),
        connectionDurationMs: null,
      },
    ),
    target,
    observedAt,
  );
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
    lastAttemptDurationMs: null,
    lastConnectionDurationMs: null,
    lastProbeAt: null,
    lastProbeDurationMs: null,
    lastProbeError: null,
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
    lastObservedAt: observedAt > entry.lastObservedAt ? observedAt : entry.lastObservedAt,
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
    lastObservedAt:
      event.observedAt > entry.lastObservedAt ? event.observedAt : entry.lastObservedAt,
    recentEvents: [event, ...entry.recentEvents].slice(0, MAX_RECENT_CONNECTION_EVENTS),
  };
}

function applyPhaseTransition(
  entry: ConnectionDiagnosticsEntry,
  nextPhase: ConnectionDiagnosticsPhase,
  observedAt: string,
): ConnectionDiagnosticsEntry {
  if (observedAt < entry.lastObservedAt) return entry;
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
