import { createFileRoute } from "@tanstack/react-router";

import {
  HostedPairingRouteSurface,
  PairingPendingSurface,
  PairingRouteSurface,
  PairingUnavailableSurface,
} from "../components/auth/PairingRouteSurface";
import { readHostedPairingRequest } from "../hostedPairing";
import { refreshServerAuthGateState, useServerAuthGateState } from "../serverAuthBootstrap";

export const Route = createFileRoute("/pair")({
  component: PairRouteView,
});

function PairRouteView() {
  if (readHostedPairingRequest()) {
    return <HostedPairingRouteSurface />;
  }

  const authGateState = useServerAuthGateState();

  if (authGateState.status === "booting") {
    return <PairingPendingSurface />;
  }

  if (authGateState.status === "authenticated") {
    return <PairingPendingSurface />;
  }

  if (authGateState.status === "unavailable") {
    return <PairingUnavailableSurface errorMessage={authGateState.errorMessage} />;
  }

  return (
    <PairingRouteSurface
      auth={authGateState.auth}
      onAuthenticated={() => {
        void refreshServerAuthGateState();
      }}
      {...(authGateState.errorMessage ? { initialErrorMessage: authGateState.errorMessage } : {})}
    />
  );
}
