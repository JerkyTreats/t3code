import type {
  ConnectionDiagnosticsEntry,
  ConnectionDiagnosticsEvent,
  ConnectionDiagnosticsPhase,
} from "@t3tools/client-runtime/state/connections";
import { getConnectionDiagnosticsDurations } from "@t3tools/client-runtime/state/connections";
import { ActivityIcon, RadioTowerIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";

import { connectionFlightRecorder } from "../../connectionFlightRecorderHistory";
import { cn } from "../../lib/utils";
import { formatElapsedDurationLabel } from "../../timestampFormat";
import { SettingsSection, useRelativeTimeTick } from "./settingsLayout";
import {
  assessConnectionHealth,
  connectionEventDurationMs,
  summarizeConnectionFleet,
  type ConnectionHealthLevel,
} from "./connectionFlightRecorder.logic";
import { Button } from "../ui/button";

const MAX_VISIBLE_ENTRIES = 16;
const MAX_VISIBLE_EVENTS = 24;

function formatDuration(valueMs: number | null): string {
  if (valueMs === null) return "—";
  if (valueMs < 1_000) return `${Math.round(valueMs)}ms`;
  const seconds = valueMs / 1_000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function phaseLabel(phase: ConnectionDiagnosticsPhase): string {
  switch (phase) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Opening";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Retrying";
    case "idle":
      return "Idle";
  }
}

function healthTone(level: ConnectionHealthLevel): string {
  switch (level) {
    case "stable":
      return "border-success/35 bg-success/[0.06] text-success";
    case "recovering":
      return "border-sky-500/35 bg-sky-500/[0.06] text-sky-500";
    case "degraded":
      return "border-warning/35 bg-warning/[0.07] text-warning";
    case "flapping":
      return "border-destructive/40 bg-destructive/[0.07] text-destructive";
    case "offline":
      return "border-border bg-muted/20 text-muted-foreground";
  }
}

function describeEvent(event: ConnectionDiagnosticsEvent): string {
  const duration = connectionEventDurationMs(event);
  switch (event.type) {
    case "connecting":
      return "Connection cycle started";
    case "attempt":
      return "WebSocket open requested";
    case "connected":
      return duration === null
        ? "Transport ready"
        : `Transport ready in ${formatDuration(duration)}`;
    case "disconnected": {
      const outcome = event.intentional ? "Intentional close" : "Unexpected close";
      const code = event.closeCode === null ? null : `code ${event.closeCode}`;
      const lifetime =
        event.connectionDurationMs === null ? null : formatDuration(event.connectionDurationMs);
      return [outcome, lifetime, code, event.closeReason].filter(Boolean).join(" · ");
    }
    case "error":
      return event.message ?? "Connection error";
  }
}

export function ConnectionFlightRecorder({
  entries,
}: {
  readonly entries: ReadonlyArray<ConnectionDiagnosticsEntry>;
}) {
  const nowMs = useRelativeTimeTick(1_000);
  const recorded = useSyncExternalStore(
    connectionFlightRecorder.subscribe,
    connectionFlightRecorder.getSnapshot,
    connectionFlightRecorder.getSnapshot,
  );
  const visibleEntries = useMemo(() => {
    const primary = entries.filter((entry) => entry.kind === "PrimaryConnectionTarget");
    const remotes = entries
      .filter((entry) => entry.kind !== "PrimaryConnectionTarget")
      .toSorted(
        (left, right) => Date.parse(right.lastObservedAt) - Date.parse(left.lastObservedAt),
      );
    return [...primary, ...remotes].slice(0, MAX_VISIBLE_ENTRIES);
  }, [entries]);
  const summary = summarizeConnectionFleet(entries);
  const events = recorded.events.slice(0, MAX_VISIBLE_EVENTS);
  const headline =
    summary.flappingCount > 0
      ? `${summary.flappingCount} flapping connection${summary.flappingCount === 1 ? "" : "s"}`
      : summary.failedOpenCount + summary.unexpectedDropCount + summary.probeFailureCount > 0
        ? "Failures recorded"
        : "No connection faults recorded";

  return (
    <SettingsSection title="Connection flight recorder">
      <div className="border-b border-border/60 bg-muted/10 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
                summary.flappingCount > 0
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-success/35 bg-success/10 text-success",
              )}
            >
              {summary.flappingCount > 0 ? (
                <TriangleAlertIcon className="size-4" />
              ) : (
                <ShieldCheckIcon className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{headline}</p>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Structured transport transitions only. Credentials, prompt text, and RPC payloads
                are excluded.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/65 px-3 py-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              <RadioTowerIcon className="size-3" />
              {summary.liveCount}/{entries.length} live
            </div>
            {recorded.events.length > 0 ? (
              <Button size="xs" variant="ghost" onClick={() => connectionFlightRecorder.clear()}>
                Clear recording
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-border/60 lg:grid-cols-5">
        {[
          ["Attempts", summary.attemptCount],
          ["Failed opens", summary.failedOpenCount],
          ["Unexpected drops", summary.unexpectedDropCount],
          ["Failed probes", summary.probeFailureCount],
          ["Flapping", summary.flappingCount],
        ].map(([label, value]) => (
          <div key={label} className="border-r border-border/60 px-4 py-3 last:border-r-0 sm:px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              {label}
            </p>
            <p className="mt-1 font-mono text-lg tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {visibleEntries.map((entry) => {
        const health = assessConnectionHealth(entry);
        const durations = getConnectionDiagnosticsDurations(entry, nowMs);
        const detail = entry.lastSocketUrl ?? entry.origin;
        return (
          <div
            key={entry.environmentId}
            className="border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-5"
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      healthTone(health.level),
                    )}
                  >
                    {health.label}
                  </span>
                  <h3 className="truncate text-sm font-semibold text-foreground">{entry.label}</h3>
                  <span className="text-[11px] text-muted-foreground">
                    {phaseLabel(entry.phase)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{health.detail}</p>
                {detail ? (
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70">
                    {detail}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-x-5 gap-y-2 text-xs sm:grid-cols-6">
                {[
                  ["Open", formatDuration(entry.lastAttemptDurationMs)],
                  ["Lifetime", formatDuration(entry.lastConnectionDurationMs)],
                  ["Probe", formatDuration(entry.lastProbeDurationMs)],
                  ["Close", entry.lastCloseCode ?? "—"],
                  ["Up", formatDuration(durations.connectedMs)],
                  ["Down", formatDuration(durations.disconnectedMs)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-16">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      {label}
                    </p>
                    <p className="mt-0.5 truncate font-mono tabular-nums text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <div className="border-t border-border/60 bg-muted/[0.08]">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 sm:px-5">
          <ActivityIcon className="size-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold text-foreground">State transition timeline</h3>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
            latest {events.length} of {recorded.events.length}
          </span>
        </div>
        {events.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground sm:px-5">
            No lifecycle events recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {events.map(({ key, environmentLabel, event }) => (
              <div
                key={key}
                className="grid gap-1 px-4 py-2.5 text-xs sm:grid-cols-[6.5rem_8rem_minmax(0,1fr)] sm:px-5"
              >
                <p className="font-mono tabular-nums text-muted-foreground/60">
                  {formatElapsedDurationLabel(event.observedAt, nowMs)} ago
                </p>
                <p className="truncate font-medium text-foreground">{environmentLabel}</p>
                <p className="min-w-0 truncate text-muted-foreground">{describeEvent(event)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
