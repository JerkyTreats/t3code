import type {
  ConnectionDiagnosticsEntry,
  ConnectionDiagnosticsEvent,
} from "@t3tools/client-runtime/state/connections";

export type ConnectionHealthLevel = "stable" | "recovering" | "degraded" | "flapping" | "offline";

export interface ConnectionHealthAssessment {
  readonly level: ConnectionHealthLevel;
  readonly label: string;
  readonly detail: string;
  readonly failureRatio: number;
}

export interface ConnectionFleetSummary {
  readonly liveCount: number;
  readonly attemptCount: number;
  readonly failedOpenCount: number;
  readonly unexpectedDropCount: number;
  readonly probeFailureCount: number;
  readonly flappingCount: number;
}

export function assessConnectionHealth(
  entry: ConnectionDiagnosticsEntry,
): ConnectionHealthAssessment {
  const failures = entry.counters.failedOpenCount + entry.counters.unexpectedDisconnectCount;
  const failureRatio = failures / Math.max(1, entry.counters.socketAttemptCount);
  const shortLived =
    entry.lastConnectionDurationMs !== null && entry.lastConnectionDurationMs < 30_000;

  if (entry.counters.unexpectedDisconnectCount >= 2 && shortLived && failureRatio >= 0.25) {
    return {
      level: "flapping",
      label: "Flapping",
      detail: "Repeated short-lived connections are forcing full reconnect cycles.",
      failureRatio,
    };
  }
  if (entry.counters.failedOpenCount >= 2 && failureRatio >= 0.5) {
    return {
      level: "flapping",
      label: "Open failures",
      detail: "Most recent socket attempts did not reach a usable session.",
      failureRatio,
    };
  }
  if (entry.phase === "connected" && failures > 0) {
    return {
      level: "recovering",
      label: "Recovered",
      detail: "Connected now, with earlier failures retained in this recording.",
      failureRatio,
    };
  }
  if (
    entry.phase === "error" ||
    entry.counters.probeFailureCount > 0 ||
    entry.lastProbeError !== null
  ) {
    return {
      level: "degraded",
      label: "Degraded",
      detail: entry.lastProbeError ?? entry.lastError ?? "Connection health checks are failing.",
      failureRatio,
    };
  }
  if (entry.phase !== "connected") {
    return {
      level: "offline",
      label: entry.phase === "connecting" ? "Opening" : "Offline",
      detail:
        entry.phase === "connecting"
          ? "A socket attempt is in progress."
          : "No active transport is available.",
      failureRatio,
    };
  }
  return {
    level: "stable",
    label: "Stable",
    detail: "No failed opens, unexpected drops, or failed probes recorded.",
    failureRatio,
  };
}

export function summarizeConnectionFleet(
  entries: ReadonlyArray<ConnectionDiagnosticsEntry>,
): ConnectionFleetSummary {
  return entries.reduce<ConnectionFleetSummary>(
    (summary, entry) => ({
      liveCount: summary.liveCount + (entry.phase === "connected" ? 1 : 0),
      attemptCount: summary.attemptCount + entry.counters.socketAttemptCount,
      failedOpenCount: summary.failedOpenCount + entry.counters.failedOpenCount,
      unexpectedDropCount: summary.unexpectedDropCount + entry.counters.unexpectedDisconnectCount,
      probeFailureCount: summary.probeFailureCount + entry.counters.probeFailureCount,
      flappingCount:
        summary.flappingCount + (assessConnectionHealth(entry).level === "flapping" ? 1 : 0),
    }),
    {
      liveCount: 0,
      attemptCount: 0,
      failedOpenCount: 0,
      unexpectedDropCount: 0,
      probeFailureCount: 0,
      flappingCount: 0,
    },
  );
}

export function connectionEventDurationMs(event: ConnectionDiagnosticsEvent): number | null {
  return event.connectionDurationMs ?? event.attemptDurationMs;
}
