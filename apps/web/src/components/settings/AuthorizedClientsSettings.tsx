import { type ReactNode, memo } from "react";
import { managedCapabilityDenial, type AdvertisedEndpoint } from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { usePrimaryManagedPolicy } from "~/state/managedPolicy";
import { ManagedControl } from "../ManagedPolicy";
import { isTailscaleHttpsEndpoint } from "./ConnectionsSettings.logic";

// Fork F17: the embedded pairing-link and authorized-client inventory is absent. Device
// admission and lifecycle belong to the external Admin portal; only the desktop's
// advertised endpoint presentation remains here.

function endpointRowClassName(isAvailable: boolean) {
  return cn(
    "relative first:rounded-t-xl last:rounded-b-xl px-3 py-3 sm:px-4",
    !isAvailable && "bg-muted/15",
  );
}

type AdvertisedEndpointListRowProps = {
  endpoint: AdvertisedEndpoint;
  isDefault: boolean;
  onSetDefault: (endpoint: AdvertisedEndpoint) => void;
  onSetupTailscaleServe: (endpoint: AdvertisedEndpoint) => void;
  onDisableTailscaleServe: (endpoint: AdvertisedEndpoint) => void;
  isUpdatingTailscaleServe: boolean;
};

export const AdvertisedEndpointListRow = memo(function AdvertisedEndpointListRow({
  endpoint,
  isDefault,
  onSetDefault,
  onSetupTailscaleServe,
  onDisableTailscaleServe,
  isUpdatingTailscaleServe,
}: AdvertisedEndpointListRowProps) {
  const isAvailable = endpoint.status === "available";
  const needsTailscaleSetup = isTailscaleHttpsEndpoint(endpoint) && endpoint.status !== "available";
  const canDisableTailscaleServe =
    isTailscaleHttpsEndpoint(endpoint) && endpoint.status === "available";
  const shouldShowEndpointUrl = !needsTailscaleSetup;
  const remoteDenial = managedCapabilityDenial(usePrimaryManagedPolicy(), "remoteClients");
  return (
    <div className={endpointRowClassName(isAvailable)}>
      {isDefault ? (
        <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" aria-hidden />
      ) : null}
      <div className="flex min-h-7 min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-h-7 min-w-0 flex-1 items-center gap-3">
          <h3 className="shrink-0 text-sm leading-5 font-medium text-foreground">
            {endpoint.label}
          </h3>
          {shouldShowEndpointUrl ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <p className="min-w-0 truncate text-xs leading-5 text-muted-foreground">
                    {endpoint.httpBaseUrl}
                  </p>
                }
              />
              <TooltipPopup side="top">{endpoint.httpBaseUrl}</TooltipPopup>
            </Tooltip>
          ) : null}
          {!isAvailable ? (
            <span className="inline-flex h-6 shrink-0 items-center rounded-md border border-border/70 px-1.5 text-3xs text-muted-foreground">
              Setup required
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex min-h-7 shrink-0 items-center justify-end gap-2">
          {isDefault ? (
            <span className="inline-flex h-6 items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 text-3xs text-primary">
              Default
            </span>
          ) : null}
          {needsTailscaleSetup ? (
            <ManagedControl reason={remoteDenial}>
              <Button
                size="xs"
                variant="outline"
                onClick={() => onSetupTailscaleServe(endpoint)}
                disabled={isUpdatingTailscaleServe || remoteDenial !== undefined}
              >
                {isUpdatingTailscaleServe ? "Restarting…" : "Setup"}
              </Button>
            </ManagedControl>
          ) : null}
          {canDisableTailscaleServe ? (
            <Button
              size="xs"
              variant="destructive-outline"
              onClick={() => onDisableTailscaleServe(endpoint)}
              disabled={isUpdatingTailscaleServe}
            >
              {isUpdatingTailscaleServe ? "Restarting…" : "Disable"}
            </Button>
          ) : null}
          {!needsTailscaleSetup && !isDefault ? (
            <Button size="xs" variant="outline" onClick={() => onSetDefault(endpoint)}>
              Set as default
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export function NetworkAccessDescription({
  endpoint,
  hiddenEndpointCount,
  expanded,
  onToggleExpanded,
  fallback,
}: {
  endpoint: AdvertisedEndpoint | null;
  hiddenEndpointCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  fallback: ReactNode;
}) {
  if (!endpoint) {
    return fallback;
  }

  const summary = (
    <>
      <span className="min-w-0 truncate">{endpoint.httpBaseUrl}</span>
      {hiddenEndpointCount > 0 ? (
        <span className="shrink-0 text-xs font-medium">
          {expanded ? "Hide" : `+${hiddenEndpointCount}`}
        </span>
      ) : null}
    </>
  );

  return (
    <span className="inline-flex min-w-0 max-w-full items-baseline gap-1">
      <span className="shrink-0">Reachable at</span>
      {hiddenEndpointCount > 0 ? (
        <button
          type="button"
          className="inline-flex min-w-0 max-w-full items-baseline gap-2 border-b border-dotted border-muted-foreground/60 text-left text-muted-foreground underline-offset-4 hover:border-foreground hover:text-foreground"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
        >
          {summary}
        </button>
      ) : (
        <span className="inline-flex min-w-0 max-w-full items-baseline gap-2">{summary}</span>
      )}
    </span>
  );
}
