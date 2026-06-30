import {
  WsTransport as BaseWsTransport,
  type WsProtocolLifecycleHandlers,
  type WsRpcProtocolSocketUrlProvider,
  type WsTransportOptions,
} from "@t3tools/client-runtime";
import { createWsRpcProtocolLayer as createSharedWsRpcProtocolLayer } from "@t3tools/client-runtime";

import {
  primaryConnectionDiagnosticsTarget,
  recordConnectionDiagnosticsAttempt,
  recordConnectionDiagnosticsConnected,
  recordConnectionDiagnosticsDisconnected,
  recordConnectionDiagnosticsError,
} from "../connectionDiagnostics";
import { ClientTracingLive } from "../observability/clientTracing";
import {
  acknowledgeRpcRequest,
  clearAllTrackedRpcRequests,
  trackRpcRequestSent,
} from "./requestLatencyState";
import {
  recordWsConnectionAttempt,
  recordWsConnectionClosed,
  recordWsConnectionErrored,
  recordWsConnectionOpened,
} from "./wsConnectionState";

export interface WebWsTransportRuntimeOptions {
  readonly trackGlobalConnectionState?: boolean;
}

function createWsRpcProtocolLayer(
  url: WsRpcProtocolSocketUrlProvider,
  handlers?: WsProtocolLifecycleHandlers,
  options?: WebWsTransportRuntimeOptions,
) {
  const trackGlobalConnectionState = options?.trackGlobalConnectionState ?? true;

  return createSharedWsRpcProtocolLayer(url, handlers, {
    ...(trackGlobalConnectionState
      ? {
          telemetryLifecycle: {
            onAttempt: (socketUrl: string) => {
              recordConnectionDiagnosticsAttempt({
                target: primaryConnectionDiagnosticsTarget(),
                socketUrl,
              });
              recordWsConnectionAttempt(socketUrl);
            },
            onOpen: () => {
              recordConnectionDiagnosticsConnected({
                target: primaryConnectionDiagnosticsTarget(),
              });
              recordWsConnectionOpened();
            },
            onError: (message: string) => {
              clearAllTrackedRpcRequests();
              recordConnectionDiagnosticsError({
                target: primaryConnectionDiagnosticsTarget(),
                message,
              });
              recordWsConnectionErrored(message);
            },
            onClose: (
              details: { readonly code: number; readonly reason: string },
              context: { readonly intentional: boolean },
            ) => {
              clearAllTrackedRpcRequests();
              recordConnectionDiagnosticsDisconnected({
                target: primaryConnectionDiagnosticsTarget(),
                closeCode: details.code,
                closeReason: details.reason,
                intentional: context.intentional,
              });
              if (context.intentional) {
                return;
              }
              recordWsConnectionClosed(details);
            },
          },
        }
      : {}),
    requestTelemetry: {
      onRequestSent: trackRpcRequestSent,
      onRequestAcknowledged: acknowledgeRpcRequest,
      onClearTrackedRequests: clearAllTrackedRpcRequests,
    },
  });
}

function makeWebWsTransportOptions(
  runtimeOptions?: WebWsTransportRuntimeOptions,
): WsTransportOptions {
  return {
    tracingLayer: ClientTracingLive,
    createProtocolLayer: (url, handlers) => createWsRpcProtocolLayer(url, handlers, runtimeOptions),
    onBeforeReconnect: () => clearAllTrackedRpcRequests(),
  };
}

export class WsTransport extends BaseWsTransport {
  constructor(
    url: WsRpcProtocolSocketUrlProvider,
    lifecycleHandlers?: WsProtocolLifecycleHandlers,
    runtimeOptions?: WebWsTransportRuntimeOptions,
  ) {
    super(url, lifecycleHandlers, makeWebWsTransportOptions(runtimeOptions));
  }
}
