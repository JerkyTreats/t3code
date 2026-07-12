import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";

import {
  createConnectionFlightRecorder,
  type ConnectionFlightRecorderStorage,
} from "./connectionFlightRecorderHistory";
import type { ConnectionDiagnosticsEntry } from "@t3tools/client-runtime/state/connections";

function entry(eventId: string, observedAt: string): ConnectionDiagnosticsEntry {
  return {
    environmentId: EnvironmentId.make("leviathan"),
    kind: "RelayConnectionTarget",
    label: "leviathan",
    origin: "https://t3code.internal.jerkytreats.dev",
    phase: "disconnected",
    hasConnected: true,
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    connectedAt: null,
    disconnectedAt: observedAt,
    lastSocketUrl: "wss://t3code.internal.jerkytreats.dev/ws",
    lastError: null,
    lastCloseCode: 1006,
    lastCloseReason: null,
    lastAttemptDurationMs: null,
    lastConnectionDurationMs: 15_000,
    lastProbeAt: null,
    lastProbeDurationMs: null,
    lastProbeError: null,
    counters: {
      connectionStartCount: 1,
      socketAttemptCount: 1,
      failedOpenCount: 0,
      reconnectAttemptCount: 1,
      connectCount: 1,
      disconnectCount: 1,
      unexpectedDisconnectCount: 1,
      intentionalDisconnectCount: 0,
      probeCount: 0,
      probeFailureCount: 0,
      errorCount: 0,
    },
    totalConnectedMs: 15_000,
    totalDisconnectedMs: 0,
    recentEvents: [
      {
        id: eventId,
        type: "disconnected",
        observedAt,
        phase: "disconnected",
        socketUrl: null,
        message: null,
        closeCode: 1006,
        closeReason: null,
        intentional: false,
        attemptDurationMs: null,
        connectionDurationMs: 15_000,
      },
    ],
  };
}

function memoryStorage(initial: string | null = null) {
  let value = initial;
  const storage: ConnectionFlightRecorderStorage = {
    read: () => value,
    write: (next) => {
      value = next;
    },
    remove: () => {
      value = null;
    },
  };
  return { storage, read: () => value };
}

describe("connection flight recorder history", () => {
  it("retains transport events across renderer sessions", () => {
    const memory = memoryStorage();
    const first = createConnectionFlightRecorder(memory.storage, "renderer-one");
    first.record([entry("event-1", "2026-07-12T10:00:00.000Z")]);

    const restarted = createConnectionFlightRecorder(memory.storage, "renderer-two");
    restarted.record([entry("event-1", "2026-07-12T10:01:00.000Z")]);

    expect(restarted.getSnapshot().events).toHaveLength(2);
    expect(restarted.getSnapshot().events.map((event) => event.sessionId)).toEqual([
      "renderer-two",
      "renderer-one",
    ]);
    expect(restarted.getSnapshot().entries.map((entry) => entry.sessionId)).toEqual([
      "renderer-two",
      "renderer-one",
    ]);
  });

  it("deduplicates repeated observations in one renderer session", () => {
    const memory = memoryStorage();
    const recorder = createConnectionFlightRecorder(memory.storage, "renderer-one");
    const observed = entry("event-1", "2026-07-12T10:00:00.000Z");
    recorder.record([observed]);
    const firstWrite = memory.read();
    recorder.record([observed]);

    expect(recorder.getSnapshot().events).toHaveLength(1);
    expect(memory.read()).toBe(firstWrite);
  });

  it("clears persisted history", () => {
    const memory = memoryStorage();
    const recorder = createConnectionFlightRecorder(memory.storage, "renderer-one");
    recorder.record([entry("event-1", "2026-07-12T10:00:00.000Z")]);
    recorder.clear();

    expect(memory.read()).toBeNull();
    expect(recorder.getSnapshot().events).toEqual([]);
    expect(recorder.getSnapshot().entries).toEqual([]);
  });
});
