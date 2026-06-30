import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo } from "react";
import { create } from "zustand";

export const PRIMARY_CONNECTION_DIAGNOSTICS_KEY = "primary";
const MAX_CONNECTION_DIAGNOSTICS_ENTRIES = 64;
const MAX_RECENT_CONNECTION_EVENTS = 25;

export type ConnectionDiagnosticsTargetKind = "primary" | "saved";
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
  readonly key: string;
  readonly kind: ConnectionDiagnosticsTargetKind;
  readonly environmentId?: EnvironmentId | null;
  readonly label?: string | null;
  readonly origin?: string | null;
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
  readonly key: string;
  readonly kind: ConnectionDiagnosticsTargetKind;
  readonly environmentId: EnvironmentId | null;
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

interface ConnectionDiagnosticsStoreState {
  readonly byKey: Record<string, ConnectionDiagnosticsEntry>;
  readonly reset: () => void;
}

interface RecordConnectionDiagnosticsBaseInput {
  readonly target: ConnectionDiagnosticsTarget;
  readonly observedAtMs?: number;
}

interface RecordConnectionDiagnosticsConnectingInput extends RecordConnectionDiagnosticsBaseInput {
  readonly message?: string | null;
}

interface RecordConnectionDiagnosticsAttemptInput extends RecordConnectionDiagnosticsBaseInput {
  readonly socketUrl: string;
}

interface RecordConnectionDiagnosticsDisconnectedInput extends RecordConnectionDiagnosticsBaseInput {
  readonly closeCode?: number | null;
  readonly closeReason?: string | null;
  readonly intentional?: boolean;
  readonly message?: string | null;
}

interface RecordConnectionDiagnosticsErrorInput extends RecordConnectionDiagnosticsBaseInput {
  readonly message: string;
}

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

let nextEventSequence = 0;

export const useConnectionDiagnosticsStore = create<ConnectionDiagnosticsStoreState>()((set) => ({
  byKey: {},
  reset: () => {
    nextEventSequence = 0;
    set({ byKey: {} });
  },
}));

export function savedEnvironmentConnectionDiagnosticsKey(environmentId: EnvironmentId): string {
  return `saved:${environmentId}`;
}

export function primaryConnectionDiagnosticsTarget(input?: {
  readonly label?: string | null;
  readonly origin?: string | null;
}): ConnectionDiagnosticsTarget {
  return {
    key: PRIMARY_CONNECTION_DIAGNOSTICS_KEY,
    kind: "primary",
    environmentId: null,
    label: input?.label ?? "This environment",
    origin: input?.origin ?? null,
  };
}

export function savedEnvironmentConnectionDiagnosticsTarget(
  environmentId: EnvironmentId,
  input?: { readonly label?: string | null; readonly origin?: string | null },
): ConnectionDiagnosticsTarget {
  return {
    key: savedEnvironmentConnectionDiagnosticsKey(environmentId),
    kind: "saved",
    environmentId,
    label: input?.label ?? null,
    origin: input?.origin ?? null,
  };
}

export function getConnectionDiagnosticsSnapshot(): ReadonlyArray<ConnectionDiagnosticsEntry> {
  return selectConnectionDiagnosticsEntries(useConnectionDiagnosticsStore.getState().byKey);
}

export function subscribeConnectionDiagnostics(
  listener: (entries: ReadonlyArray<ConnectionDiagnosticsEntry>) => void,
): () => void {
  return useConnectionDiagnosticsStore.subscribe((state) => {
    listener(selectConnectionDiagnosticsEntries(state.byKey));
  });
}

export function useConnectionDiagnosticsEntries(): ReadonlyArray<ConnectionDiagnosticsEntry> {
  const byKey = useConnectionDiagnosticsStore((state) => state.byKey);
  return useMemo(() => selectConnectionDiagnosticsEntries(byKey), [byKey]);
}

export function resetConnectionDiagnosticsForTests(): void {
  useConnectionDiagnosticsStore.getState().reset();
}

export function recordConnectionDiagnosticsConnecting(
  input: RecordConnectionDiagnosticsConnectingInput,
): void {
  updateConnectionDiagnostics(input, (entry, observedAt) => {
    const nextEntry = applyPhaseTransition(entry, "connecting", observedAt);
    if (entry.phase === "connecting") {
      return {
        ...nextEntry,
        label: resolveTargetLabel(input.target, entry),
        origin: input.target.origin ?? entry.origin,
        lastObservedAt: observedAt,
      };
    }

    return appendDiagnosticsEvent(
      {
        ...nextEntry,
        counters: {
          ...nextEntry.counters,
          connectionStartCount: nextEntry.counters.connectionStartCount + 1,
        },
      },
      input.target,
      {
        type: "connecting",
        observedAt,
        phase: "connecting",
        message: input.message ?? null,
      },
    );
  });
}

export function recordConnectionDiagnosticsAttempt(
  input: RecordConnectionDiagnosticsAttemptInput,
): void {
  updateConnectionDiagnostics(input, (entry, observedAt) => {
    const nextEntry = applyPhaseTransition(entry, "connecting", observedAt);
    const isReconnectAttempt = entry.hasConnected;
    const socketUrl = redactDiagnosticUrl(input.socketUrl);
    return appendDiagnosticsEvent(
      {
        ...nextEntry,
        lastSocketUrl: socketUrl,
        counters: {
          ...nextEntry.counters,
          socketAttemptCount: nextEntry.counters.socketAttemptCount + 1,
          reconnectAttemptCount:
            nextEntry.counters.reconnectAttemptCount + (isReconnectAttempt ? 1 : 0),
        },
      },
      input.target,
      {
        type: "attempt",
        observedAt,
        phase: "connecting",
        socketUrl,
      },
    );
  });
}

export function recordConnectionDiagnosticsConnected(
  input: RecordConnectionDiagnosticsBaseInput,
): void {
  updateConnectionDiagnostics(input, (entry, observedAt) => {
    const nextEntry = applyPhaseTransition(entry, "connected", observedAt);
    return appendDiagnosticsEvent(
      {
        ...nextEntry,
        connectedAt: observedAt,
        disconnectedAt: null,
        hasConnected: true,
        lastError: null,
        counters: {
          ...nextEntry.counters,
          connectCount: nextEntry.counters.connectCount + 1,
        },
      },
      input.target,
      {
        type: "connected",
        observedAt,
        phase: "connected",
      },
    );
  });
}

export function recordConnectionDiagnosticsDisconnected(
  input: RecordConnectionDiagnosticsDisconnectedInput,
): void {
  updateConnectionDiagnostics(input, (entry, observedAt) => {
    const intentional = input.intentional === true;
    const preserveInitialError = entry.phase === "error" && !entry.hasConnected && !intentional;
    const shouldCountDisconnect = !preserveInitialError && entry.phase !== "disconnected";
    const shouldCountUnexpectedDisconnect =
      shouldCountDisconnect && !intentional && entry.hasConnected;
    const nextEntry = applyPhaseTransition(
      entry,
      preserveInitialError ? "error" : "disconnected",
      observedAt,
    );
    return appendDiagnosticsEvent(
      {
        ...nextEntry,
        connectedAt: null,
        disconnectedAt: preserveInitialError ? nextEntry.disconnectedAt : observedAt,
        lastCloseCode: input.closeCode ?? null,
        lastCloseReason: normalizeOptionalString(input.closeReason),
        counters: {
          ...nextEntry.counters,
          disconnectCount: nextEntry.counters.disconnectCount + (shouldCountDisconnect ? 1 : 0),
          intentionalDisconnectCount:
            nextEntry.counters.intentionalDisconnectCount +
            (shouldCountDisconnect && intentional ? 1 : 0),
          unexpectedDisconnectCount:
            nextEntry.counters.unexpectedDisconnectCount +
            (shouldCountUnexpectedDisconnect ? 1 : 0),
        },
      },
      input.target,
      {
        type: "disconnected",
        observedAt,
        phase: preserveInitialError ? "error" : "disconnected",
        closeCode: input.closeCode ?? null,
        closeReason: normalizeOptionalString(input.closeReason),
        intentional,
        message: input.message ?? null,
      },
    );
  });
}

export function recordConnectionDiagnosticsError(
  input: RecordConnectionDiagnosticsErrorInput,
): void {
  updateConnectionDiagnostics(input, (entry, observedAt) => {
    const nextEntry = applyPhaseTransition(entry, "error", observedAt);
    return appendDiagnosticsEvent(
      {
        ...nextEntry,
        connectedAt: null,
        disconnectedAt: nextEntry.disconnectedAt ?? observedAt,
        lastError: input.message,
        counters: {
          ...nextEntry.counters,
          errorCount: nextEntry.counters.errorCount + 1,
        },
      },
      input.target,
      {
        type: "error",
        observedAt,
        phase: "error",
        message: input.message,
      },
    );
  });
}

export function getConnectionDiagnosticsDurations(
  entry: ConnectionDiagnosticsEntry,
  nowMs = Date.now(),
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
  byKey: Record<string, ConnectionDiagnosticsEntry>,
): ReadonlyArray<ConnectionDiagnosticsEntry> {
  return Object.values(byKey).toSorted((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "primary" ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

function updateConnectionDiagnostics(
  input: RecordConnectionDiagnosticsBaseInput,
  updater: (entry: ConnectionDiagnosticsEntry, observedAt: string) => ConnectionDiagnosticsEntry,
) {
  const observedAtMs = input.observedAtMs ?? Date.now();
  const observedAt = new Date(observedAtMs).toISOString();
  useConnectionDiagnosticsStore.setState((state) => {
    const current =
      state.byKey[input.target.key] ?? createConnectionDiagnosticsEntry(input.target, observedAt);
    const next = updater(current, observedAt);
    return {
      byKey: pruneConnectionDiagnosticsEntries({
        ...state.byKey,
        [next.key]: next,
      }),
    };
  });
}

function createConnectionDiagnosticsEntry(
  target: ConnectionDiagnosticsTarget,
  observedAt: string,
): ConnectionDiagnosticsEntry {
  return {
    key: target.key,
    kind: target.kind,
    environmentId: target.environmentId ?? null,
    label: normalizeOptionalString(target.label) ?? fallbackTargetLabel(target),
    origin: normalizeDiagnosticOrigin(target.origin),
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

function appendDiagnosticsEvent(
  entry: ConnectionDiagnosticsEntry,
  target: ConnectionDiagnosticsTarget,
  event: Omit<
    ConnectionDiagnosticsEvent,
    "closeCode" | "closeReason" | "id" | "intentional" | "message" | "socketUrl"
  > &
    Partial<
      Pick<
        ConnectionDiagnosticsEvent,
        "closeCode" | "closeReason" | "intentional" | "message" | "socketUrl"
      >
    >,
): ConnectionDiagnosticsEntry {
  nextEventSequence += 1;
  const nextEvent: ConnectionDiagnosticsEvent = {
    id: `${event.observedAt}:${nextEventSequence}`,
    type: event.type,
    observedAt: event.observedAt,
    phase: event.phase,
    socketUrl: event.socketUrl ?? null,
    message: event.message ?? null,
    closeCode: event.closeCode ?? null,
    closeReason: event.closeReason ?? null,
    intentional: event.intentional ?? null,
  };

  return {
    ...entry,
    label: resolveTargetLabel(target, entry),
    origin: normalizeDiagnosticOrigin(target.origin) ?? entry.origin,
    lastObservedAt: event.observedAt,
    recentEvents: [nextEvent, ...entry.recentEvents].slice(0, MAX_RECENT_CONNECTION_EVENTS),
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

function fallbackTargetLabel(target: ConnectionDiagnosticsTarget): string {
  if (target.kind === "primary") {
    return "This environment";
  }
  return target.environmentId ?? "Remote environment";
}

function resolveTargetLabel(
  target: ConnectionDiagnosticsTarget,
  current: ConnectionDiagnosticsEntry,
): string {
  return normalizeOptionalString(target.label) ?? current.label;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeDiagnosticOrigin(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return redactDiagnosticUrl(normalized);
  }
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

function pruneConnectionDiagnosticsEntries(
  byKey: Record<string, ConnectionDiagnosticsEntry>,
): Record<string, ConnectionDiagnosticsEntry> {
  const entries = Object.values(byKey);
  if (entries.length <= MAX_CONNECTION_DIAGNOSTICS_ENTRIES) {
    return byKey;
  }

  const keep = new Set<string>([PRIMARY_CONNECTION_DIAGNOSTICS_KEY]);
  const availableSavedEntryCount = MAX_CONNECTION_DIAGNOSTICS_ENTRIES - keep.size;
  for (const entry of entries
    .filter((candidate) => candidate.key !== PRIMARY_CONNECTION_DIAGNOSTICS_KEY)
    .toSorted((left, right) => Date.parse(right.lastObservedAt) - Date.parse(left.lastObservedAt))
    .slice(0, availableSavedEntryCount)) {
    keep.add(entry.key);
  }

  return Object.fromEntries(
    entries.filter((entry) => keep.has(entry.key)).map((entry) => [entry.key, entry]),
  );
}
