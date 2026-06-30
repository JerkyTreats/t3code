import {
  getWsConnectionUiState,
  type WsConnectionStatus,
  type WsConnectionUiState,
} from "../rpc/wsConnectionState";

export const WS_DISCONNECT_TOAST_GRACE_MS = 1_500;

export type WsAutoReconnectTrigger = "focus" | "online";
type ConnectionIssueToastKind = "exhausted" | "offline" | "reconnecting";

export function shouldAutoReconnect(
  status: WsConnectionStatus,
  trigger: WsAutoReconnectTrigger,
): boolean {
  const uiState = getWsConnectionUiState(status);

  if (trigger === "online") {
    return (
      uiState === "offline" ||
      uiState === "reconnecting" ||
      uiState === "error" ||
      status.reconnectPhase === "exhausted"
    );
  }

  return (
    status.online &&
    status.hasConnected &&
    (uiState === "reconnecting" || status.reconnectPhase === "exhausted")
  );
}

export function shouldRestartStalledReconnect(
  status: WsConnectionStatus,
  expectedNextRetryAt: string,
): boolean {
  return (
    status.reconnectPhase === "waiting" &&
    status.nextRetryAt === expectedNextRetryAt &&
    status.online &&
    status.hasConnected
  );
}

export function getConnectionIssueToastKind(
  status: WsConnectionStatus,
): ConnectionIssueToastKind | null {
  const uiState = getWsConnectionUiState(status);

  if (uiState === "offline" && status.disconnectedAt !== null) {
    return "offline";
  }

  if (status.hasConnected && status.reconnectPhase === "exhausted") {
    return "exhausted";
  }

  if (status.hasConnected && uiState === "reconnecting") {
    return "reconnecting";
  }

  return null;
}

export function shouldRenderConnectionIssueToast(
  status: WsConnectionStatus,
  graceElapsed: boolean,
): boolean {
  return graceElapsed && getConnectionIssueToastKind(status) !== null;
}

export function shouldRenderRecoveredConnectionToast({
  disconnectToastWasDisplayed,
  previousDisconnectedAt,
  previousUiState,
  uiState,
}: {
  readonly disconnectToastWasDisplayed: boolean;
  readonly previousDisconnectedAt: string | null;
  readonly previousUiState: WsConnectionUiState;
  readonly uiState: WsConnectionUiState;
}): boolean {
  return (
    disconnectToastWasDisplayed &&
    uiState === "connected" &&
    (previousUiState === "offline" || previousUiState === "reconnecting") &&
    previousDisconnectedAt !== null
  );
}
