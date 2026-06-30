import { describe, expect, it } from "vite-plus/test";

import type { WsConnectionStatus } from "../rpc/wsConnectionState";
import {
  getConnectionIssueToastKind,
  shouldAutoReconnect,
  shouldRenderConnectionIssueToast,
  shouldRenderRecoveredConnectionToast,
  shouldRestartStalledReconnect,
} from "./WebSocketConnectionSurface.logic";

function makeStatus(overrides: Partial<WsConnectionStatus> = {}): WsConnectionStatus {
  return {
    attemptCount: 0,
    closeCode: null,
    closeReason: null,
    connectionLabel: null,
    connectedAt: null,
    disconnectedAt: null,
    hasConnected: false,
    lastError: null,
    lastErrorAt: null,
    nextRetryAt: null,
    online: true,
    phase: "idle",
    reconnectAttemptCount: 0,
    reconnectMaxAttempts: 8,
    reconnectPhase: "idle",
    socketUrl: null,
    ...overrides,
  };
}

describe("WebSocketConnectionSurface.logic", () => {
  it("forces reconnect on online when the app was offline", () => {
    expect(
      shouldAutoReconnect(
        makeStatus({
          disconnectedAt: "2026-04-03T20:00:00.000Z",
          online: false,
          phase: "disconnected",
        }),
        "online",
      ),
    ).toBe(true);
  });

  it("forces reconnect on focus only for previously connected disconnected states", () => {
    expect(
      shouldAutoReconnect(
        makeStatus({
          hasConnected: true,
          online: true,
          phase: "disconnected",
          reconnectAttemptCount: 3,
          reconnectPhase: "waiting",
        }),
        "focus",
      ),
    ).toBe(true);

    expect(
      shouldAutoReconnect(
        makeStatus({
          hasConnected: false,
          online: true,
          phase: "disconnected",
          reconnectAttemptCount: 1,
          reconnectPhase: "waiting",
        }),
        "focus",
      ),
    ).toBe(false);
  });

  it("forces reconnect on focus for exhausted reconnect loops", () => {
    expect(
      shouldAutoReconnect(
        makeStatus({
          hasConnected: true,
          online: true,
          phase: "disconnected",
          reconnectAttemptCount: 8,
          reconnectPhase: "exhausted",
        }),
        "focus",
      ),
    ).toBe(true);
  });

  it("restarts a stalled reconnect window after the scheduled retry time passes", () => {
    expect(
      shouldRestartStalledReconnect(
        makeStatus({
          hasConnected: true,
          nextRetryAt: "2026-04-03T20:00:01.000Z",
          online: true,
          phase: "disconnected",
          reconnectAttemptCount: 3,
          reconnectPhase: "waiting",
        }),
        "2026-04-03T20:00:01.000Z",
      ),
    ).toBe(true);

    expect(
      shouldRestartStalledReconnect(
        makeStatus({
          hasConnected: true,
          nextRetryAt: "2026-04-03T20:00:01.000Z",
          online: true,
          phase: "disconnected",
          reconnectAttemptCount: 3,
          reconnectPhase: "attempting",
        }),
        "2026-04-03T20:00:01.000Z",
      ),
    ).toBe(false);
  });

  it("suppresses transient reconnect toasts until the grace window elapses", () => {
    const status = makeStatus({
      disconnectedAt: "2026-04-03T20:00:00.000Z",
      hasConnected: true,
      phase: "disconnected",
      reconnectAttemptCount: 1,
      reconnectPhase: "waiting",
    });

    expect(getConnectionIssueToastKind(status)).toBe("reconnecting");
    expect(shouldRenderConnectionIssueToast(status, false)).toBe(false);
    expect(shouldRenderConnectionIssueToast(status, true)).toBe(true);
  });

  it("only shows recovered toasts after a disconnect toast was displayed", () => {
    expect(
      shouldRenderRecoveredConnectionToast({
        disconnectToastWasDisplayed: false,
        previousDisconnectedAt: "2026-04-03T20:00:00.000Z",
        previousUiState: "reconnecting",
        uiState: "connected",
      }),
    ).toBe(false);

    expect(
      shouldRenderRecoveredConnectionToast({
        disconnectToastWasDisplayed: true,
        previousDisconnectedAt: "2026-04-03T20:00:00.000Z",
        previousUiState: "reconnecting",
        uiState: "connected",
      }),
    ).toBe(true);
  });
});
