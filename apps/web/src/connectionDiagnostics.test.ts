import type { EnvironmentId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  getConnectionDiagnosticsDurations,
  getConnectionDiagnosticsSnapshot,
  primaryConnectionDiagnosticsTarget,
  recordConnectionDiagnosticsAttempt,
  recordConnectionDiagnosticsConnected,
  recordConnectionDiagnosticsConnecting,
  recordConnectionDiagnosticsDisconnected,
  recordConnectionDiagnosticsError,
  resetConnectionDiagnosticsForTests,
  savedEnvironmentConnectionDiagnosticsTarget,
  subscribeConnectionDiagnostics,
} from "./connectionDiagnostics";

const ENVIRONMENT_ID = "env-diagnostics-test" as EnvironmentId;

describe("connectionDiagnostics", () => {
  beforeEach(() => {
    resetConnectionDiagnosticsForTests();
  });

  it("records socket attempts, reconnect attempts, disconnects, errors, and durations", () => {
    const target = savedEnvironmentConnectionDiagnosticsTarget(ENVIRONMENT_ID, {
      label: "leviathan",
      origin: "https://t3code.internal.jerkytreats.dev/",
    });

    recordConnectionDiagnosticsConnecting({
      target,
      observedAtMs: 1_000,
    });
    recordConnectionDiagnosticsAttempt({
      target,
      socketUrl: "wss://t3code.internal.jerkytreats.dev/ws?wsTicket=secret-token",
      observedAtMs: 2_000,
    });
    recordConnectionDiagnosticsConnected({
      target,
      observedAtMs: 3_000,
    });
    recordConnectionDiagnosticsDisconnected({
      target,
      closeCode: 1006,
      closeReason: "abnormal close",
      observedAtMs: 8_000,
    });
    recordConnectionDiagnosticsAttempt({
      target,
      socketUrl: "wss://t3code.internal.jerkytreats.dev/ws?wsTicket=secret-token-2",
      observedAtMs: 9_000,
    });
    recordConnectionDiagnosticsError({
      target,
      message: "Unable to resolve the T3 server WebSocket URL.",
      observedAtMs: 10_000,
    });

    const [entry] = getConnectionDiagnosticsSnapshot();
    expect(entry).toMatchObject({
      label: "leviathan",
      origin: "https://t3code.internal.jerkytreats.dev",
      phase: "error",
      lastSocketUrl: "wss://t3code.internal.jerkytreats.dev/ws",
      lastCloseCode: 1006,
      lastCloseReason: "abnormal close",
      lastError: "Unable to resolve the T3 server WebSocket URL.",
      counters: {
        connectionStartCount: 1,
        socketAttemptCount: 2,
        reconnectAttemptCount: 1,
        connectCount: 1,
        disconnectCount: 1,
        unexpectedDisconnectCount: 1,
        intentionalDisconnectCount: 0,
        errorCount: 1,
      },
    });
    expect(entry?.recentEvents.map((event) => event.type)).toEqual([
      "error",
      "attempt",
      "disconnected",
      "connected",
      "attempt",
      "connecting",
    ]);
    expect(entry?.recentEvents.find((event) => event.type === "attempt")?.socketUrl).toBe(
      "wss://t3code.internal.jerkytreats.dev/ws",
    );
    expect(JSON.stringify(entry)).not.toContain("secret-token");
    expect(entry ? getConnectionDiagnosticsDurations(entry, 10_000) : null).toEqual({
      connectedMs: 5_000,
      disconnectedMs: 2_000,
    });
  });

  it("distinguishes intentional disconnects from unexpected drops", () => {
    const target = primaryConnectionDiagnosticsTarget();

    recordConnectionDiagnosticsAttempt({
      target,
      socketUrl: "ws://localhost:13773/ws",
      observedAtMs: 1_000,
    });
    recordConnectionDiagnosticsConnected({ target, observedAtMs: 2_000 });
    recordConnectionDiagnosticsDisconnected({
      target,
      closeCode: 1000,
      closeReason: "client shutdown",
      intentional: true,
      observedAtMs: 3_000,
    });

    const [entry] = getConnectionDiagnosticsSnapshot();
    expect(entry?.counters).toMatchObject({
      disconnectCount: 1,
      intentionalDisconnectCount: 1,
      unexpectedDisconnectCount: 0,
    });
    expect(entry?.recentEvents[0]).toMatchObject({
      type: "disconnected",
      intentional: true,
    });
  });

  it("keeps initial connection errors classified as errors instead of drops", () => {
    const target = primaryConnectionDiagnosticsTarget();

    recordConnectionDiagnosticsAttempt({
      target,
      socketUrl: "ws://localhost:13773/ws?wsTicket=local-secret",
      observedAtMs: 1_000,
    });
    recordConnectionDiagnosticsError({
      target,
      message: "Unable to connect to the T3 server WebSocket.",
      observedAtMs: 2_000,
    });
    recordConnectionDiagnosticsDisconnected({
      target,
      closeCode: 1006,
      closeReason: "server unavailable",
      observedAtMs: 3_000,
    });

    const [entry] = getConnectionDiagnosticsSnapshot();
    expect(entry).toMatchObject({
      phase: "error",
      lastSocketUrl: "ws://localhost:13773/ws",
      lastCloseCode: 1006,
      counters: {
        disconnectCount: 0,
        unexpectedDisconnectCount: 0,
        errorCount: 1,
      },
    });
    expect(entry?.recentEvents[0]).toMatchObject({
      type: "disconnected",
      phase: "error",
      closeCode: 1006,
    });
    expect(JSON.stringify(entry)).not.toContain("local-secret");
  });

  it("caps retained target entries while keeping the primary target", () => {
    recordConnectionDiagnosticsAttempt({
      target: primaryConnectionDiagnosticsTarget(),
      socketUrl: "ws://localhost:13773/ws",
      observedAtMs: 1_000,
    });

    for (let index = 0; index < 80; index += 1) {
      recordConnectionDiagnosticsAttempt({
        target: savedEnvironmentConnectionDiagnosticsTarget(
          `${ENVIRONMENT_ID}-${index}` as EnvironmentId,
          { label: `Remote ${index}` },
        ),
        socketUrl: `wss://remote-${index}.example.test/ws`,
        observedAtMs: 2_000 + index,
      });
    }

    const entries = getConnectionDiagnosticsSnapshot();
    expect(entries).toHaveLength(64);
    expect(entries.some((entry) => entry.key === "primary")).toBe(true);
    expect(entries.some((entry) => entry.key === `saved:${ENVIRONMENT_ID}-0`)).toBe(false);
    expect(entries.some((entry) => entry.key === `saved:${ENVIRONMENT_ID}-79`)).toBe(true);
  });

  it("notifies raw subscribers with sorted realtime snapshots", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConnectionDiagnostics(listener);

    recordConnectionDiagnosticsAttempt({
      target: savedEnvironmentConnectionDiagnosticsTarget(ENVIRONMENT_ID, { label: "Remote" }),
      socketUrl: "wss://remote.example.test/ws",
      observedAtMs: 1_000,
    });

    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject([
      {
        label: "Remote",
        counters: {
          socketAttemptCount: 1,
        },
      },
    ]);
  });
});
