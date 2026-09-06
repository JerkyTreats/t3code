import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { environmentCatalog } from "../connection/catalog";
import { resumeThreadPrimaryConnection } from "../environments/primary/threadAuth";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { useAtomCommand } from "../state/use-atom-command";
import {
  HostedPairingRouteSurface,
  PairingPendingSurface,
  PairingRouteSurface,
} from "../components/auth/PairingRouteSurface";

export const Route = createFileRoute("/pair")({
  beforeLoad: async ({ context }) => {
    const { authGateState } = context;
    if (authGateState.status === "hosted-pairing") {
      return {
        authGateState,
      };
    }

    if (authGateState.status === "authenticated" || authGateState.status === "hosted-static") {
      throw redirect({ to: "/", replace: true });
    }
    return {
      authGateState,
    };
  },
  component: PairRouteView,
  pendingComponent: PairRoutePendingView,
});

function PairRouteView() {
  const { authGateState } = Route.useRouteContext();
  const navigate = useNavigate();
  const retryPrimaryConnection = useAtomCommand(environmentCatalog.retryNow);

  if (!authGateState) {
    return null;
  }

  if (authGateState.status === "hosted-pairing") {
    return <HostedPairingRouteSurface />;
  }

  return (
    <PairingRouteSurface
      auth={authGateState.auth}
      onAuthenticated={async () => {
        await resumeThreadPrimaryConnection({
          readPrimaryEnvironmentId: () => appAtomRegistry.get(primaryEnvironmentIdAtom),
          retry: retryPrimaryConnection,
        });
        await navigate({ to: "/", replace: true });
      }}
      {...(authGateState.errorMessage ? { initialErrorMessage: authGateState.errorMessage } : {})}
    />
  );
}

function PairRoutePendingView() {
  return <PairingPendingSurface />;
}
