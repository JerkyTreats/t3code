import type { ConnectionDiagnosticsEntry } from "@t3tools/client-runtime/state/connections";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { assessConnectionHealth, summarizeConnectionFleet } from "./connectionFlightRecorder.logic";

function entry(input: Partial<ConnectionDiagnosticsEntry> = {}): ConnectionDiagnosticsEntry {
  return {
    environmentId: EnvironmentId.make("leviathan"),
    kind: "PrimaryConnectionTarget",
    label: "leviathan",
    origin: "https://t3code.internal.jerkytreats.dev",
    phase: "connected",
    hasConnected: true,
    firstObservedAt: "2026-07-11T15:00:00.000Z",
    lastObservedAt: "2026-07-11T15:01:00.000Z",
    connectedAt: "2026-07-11T15:01:00.000Z",
    disconnectedAt: null,
    lastSocketUrl: "wss://t3code.internal.jerkytreats.dev/ws",
    lastError: null,
    lastCloseCode: null,
    lastCloseReason: null,
    lastAttemptDurationMs: 20,
    lastConnectionDurationMs: null,
    lastProbeAt: null,
    lastProbeDurationMs: null,
    lastProbeError: null,
    counters: {
      connectionStartCount: 1,
      socketAttemptCount: 1,
      failedOpenCount: 0,
      reconnectAttemptCount: 0,
      connectCount: 1,
      disconnectCount: 0,
      unexpectedDisconnectCount: 0,
      intentionalDisconnectCount: 0,
      probeCount: 0,
      probeFailureCount: 0,
      errorCount: 0,
    },
    totalConnectedMs: 60_000,
    totalDisconnectedMs: 0,
    recentEvents: [],
    ...input,
  };
}

describe("assessConnectionHealth", () => {
  it("calls repeated short connection loss flapping", () => {
    const result = assessConnectionHealth(
      entry({
        phase: "error",
        lastConnectionDurationMs: 15_500,
        counters: {
          ...entry().counters,
          socketAttemptCount: 8,
          connectCount: 8,
          disconnectCount: 8,
          unexpectedDisconnectCount: 8,
          reconnectAttemptCount: 7,
        },
      }),
    );

    expect(result.level).toBe("flapping");
    expect(result.failureRatio).toBe(1);
  });

  it("distinguishes a recovered connection from a clean session", () => {
    expect(
      assessConnectionHealth(
        entry({
          counters: {
            ...entry().counters,
            socketAttemptCount: 2,
            connectCount: 2,
            disconnectCount: 1,
            unexpectedDisconnectCount: 1,
            reconnectAttemptCount: 1,
          },
        }),
      ).level,
    ).toBe("recovering");
    expect(assessConnectionHealth(entry()).level).toBe("stable");
  });

  it("surfaces probe failure even while counters contain no socket drop", () => {
    expect(
      assessConnectionHealth(
        entry({
          lastProbeError: "health check timed out",
          counters: { ...entry().counters, probeCount: 1, probeFailureCount: 1 },
        }),
      ).level,
    ).toBe("degraded");
  });
});

describe("summarizeConnectionFleet", () => {
  it("reports failure classes separately", () => {
    const summary = summarizeConnectionFleet([
      entry({
        counters: {
          ...entry().counters,
          socketAttemptCount: 4,
          failedOpenCount: 1,
          probeCount: 2,
          probeFailureCount: 1,
        },
      }),
      entry({
        environmentId: EnvironmentId.make("remote"),
        phase: "error",
        lastConnectionDurationMs: 10_000,
        counters: {
          ...entry().counters,
          socketAttemptCount: 3,
          connectCount: 3,
          disconnectCount: 3,
          unexpectedDisconnectCount: 3,
          reconnectAttemptCount: 2,
        },
      }),
    ]);

    expect(summary).toMatchObject({
      liveCount: 1,
      attemptCount: 7,
      failedOpenCount: 1,
      unexpectedDropCount: 3,
      probeFailureCount: 1,
      flappingCount: 1,
    });
  });
});
