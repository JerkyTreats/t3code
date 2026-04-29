import { createFileRoute } from "@tanstack/react-router";

import { PairingPendingSurface, PairingRouteSurface } from "../components/auth/PairingRouteSurface";
import { refreshServerAuthGateState, useServerAuthGateState } from "../serverAuthBootstrap";

export const Route = createFileRoute("/pair")({
  component: PairRouteView,
});

function PairRouteView() {
  const authGateState = useServerAuthGateState();

  if (authGateState.status === "booting") {
    return <PairingPendingSurface />;
  }

  if (authGateState.status === "authenticated") {
    return <PairingPendingSurface />;
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
