import { GlobeIcon, LinkIcon, RefreshCwIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type {
  AdvertisedEndpoint,
  DesktopDiscoveredSshHost,
  DesktopServerExposureState,
  DesktopServerExposureMode,
  PersistedSavedEnvironmentRecord,
} from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";

import { ensureLocalApi } from "../../localApi";
import { connectDesktopSshEnvironment, removeSavedEnvironment } from "../../environments/runtime";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { cn } from "../../lib/utils";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const EMPTY_ADVERTISED_ENDPOINTS: readonly AdvertisedEndpoint[] = [];
const EMPTY_SAVED_ENVIRONMENTS: readonly PersistedSavedEnvironmentRecord[] = [];
const EMPTY_SSH_HOSTS: readonly DesktopDiscoveredSshHost[] = [];

function createExposureStateFallback(): DesktopServerExposureState {
  return {
    mode: "local-only",
    endpointUrl: null,
    advertisedHost: null,
  };
}

function describeExposureMode(mode: DesktopServerExposureMode): string {
  return mode === "network-accessible"
    ? "The desktop server listens on all interfaces for pairing and remote access."
    : "The desktop server only listens on loopback for local use on this machine.";
}

function formatConnectedAt(value: string | null): string {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatSshTarget(host: DesktopDiscoveredSshHost): string {
  const authority = host.username ? `${host.username}@${host.hostname}` : host.hostname;
  return host.port ? `${authority}:${host.port}` : authority;
}

function makeSshHostKey(host: DesktopDiscoveredSshHost): string {
  return `${host.source}:${host.alias}:${host.hostname}:${host.port ?? ""}`;
}

function useConnectionsSnapshot() {
  return useQuery({
    queryKey: ["connections", "snapshot"],
    queryFn: async () => {
      const registry = await ensureLocalApi().persistence.getSavedEnvironmentRegistry();
      const exposure =
        typeof window.desktopBridge?.getServerExposureState === "function"
          ? await window.desktopBridge.getServerExposureState()
          : createExposureStateFallback();
      const advertisedEndpoints =
        typeof window.desktopBridge?.getAdvertisedEndpoints === "function"
          ? await window.desktopBridge.getAdvertisedEndpoints()
          : [];
      const sshHosts =
        typeof window.desktopBridge?.discoverSshHosts === "function"
          ? await window.desktopBridge.discoverSshHosts()
          : [];

      return {
        exposure,
        advertisedEndpoints,
        registry,
        sshHosts,
      };
    },
    staleTime: 15_000,
  });
}

export function ConnectionsSettings() {
  const snapshotQuery = useConnectionsSnapshot();
  const [isUpdatingExposure, setIsUpdatingExposure] = useState(false);
  const [isUpdatingTailscale, setIsUpdatingTailscale] = useState(false);
  const [connectingSshHostKey, setConnectingSshHostKey] = useState<string | null>(null);
  const [sshErrorMessage, setSshErrorMessage] = useState<string | null>(null);
  const [reconnectingEnvironmentId, setReconnectingEnvironmentId] = useState<string | null>(null);
  const [removingEnvironmentId, setRemovingEnvironmentId] = useState<string | null>(null);
  const [savedEnvironmentErrorMessage, setSavedEnvironmentErrorMessage] = useState<string | null>(
    null,
  );

  const snapshotData = snapshotQuery.data;
  const exposure = snapshotData?.exposure ?? createExposureStateFallback();
  const advertisedEndpoints = snapshotData?.advertisedEndpoints ?? EMPTY_ADVERTISED_ENDPOINTS;
  const registry = snapshotData?.registry ?? EMPTY_SAVED_ENVIRONMENTS;
  const sshHosts = snapshotData?.sshHosts ?? EMPTY_SSH_HOSTS;
  const networkAccessible = exposure.mode === "network-accessible";
  const exposureUnavailable = typeof window.desktopBridge?.getServerExposureState !== "function";
  const tailscaleToggleUnavailable =
    typeof window.desktopBridge?.setTailscaleServeEnabled !== "function";

  const refresh = useCallback(() => {
    void snapshotQuery.refetch();
  }, [snapshotQuery]);

  const connectSshHost = useCallback(
    async (host: DesktopDiscoveredSshHost) => {
      setSshErrorMessage(null);
      const hostKey = makeSshHostKey(host);
      setConnectingSshHostKey(hostKey);
      try {
        await connectDesktopSshEnvironment(
          {
            alias: host.alias,
            hostname: host.hostname,
            username: host.username,
            port: host.port,
          },
          { label: host.alias },
        );
        await snapshotQuery.refetch();
      } catch (error) {
        setSshErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setConnectingSshHostKey(null);
      }
    },
    [snapshotQuery],
  );

  const forgetSavedEnvironment = useCallback(
    async (environmentId: string) => {
      setSavedEnvironmentErrorMessage(null);
      setRemovingEnvironmentId(environmentId);
      try {
        await removeSavedEnvironment(
          environmentId as PersistedSavedEnvironmentRecord["environmentId"],
        );
        await snapshotQuery.refetch();
      } catch (error) {
        setSavedEnvironmentErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setRemovingEnvironmentId(null);
      }
    },
    [snapshotQuery],
  );

  const reconnectSavedEnvironment = useCallback(
    async (record: PersistedSavedEnvironmentRecord) => {
      if (!record.desktopSsh) {
        return;
      }

      setSavedEnvironmentErrorMessage(null);
      setReconnectingEnvironmentId(record.environmentId);
      try {
        await connectDesktopSshEnvironment(record.desktopSsh, {
          label: record.label,
        });
        await snapshotQuery.refetch();
      } catch (error) {
        setSavedEnvironmentErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setReconnectingEnvironmentId(null);
      }
    },
    [snapshotQuery],
  );

  const setExposureMode = useCallback(
    async (checked: boolean) => {
      if (typeof window.desktopBridge?.setServerExposureMode !== "function") {
        return;
      }
      setIsUpdatingExposure(true);
      try {
        await window.desktopBridge.setServerExposureMode(
          checked ? "network-accessible" : "local-only",
        );
        await snapshotQuery.refetch();
      } finally {
        setIsUpdatingExposure(false);
      }
    },
    [snapshotQuery],
  );

  const setTailscaleServeEnabled = useCallback(
    async (checked: boolean) => {
      if (typeof window.desktopBridge?.setTailscaleServeEnabled !== "function") {
        return;
      }
      setIsUpdatingTailscale(true);
      try {
        await window.desktopBridge.setTailscaleServeEnabled({
          enabled: checked,
          ...(exposure.tailscaleServePort === undefined
            ? {}
            : { port: exposure.tailscaleServePort }),
        });
        await snapshotQuery.refetch();
      } finally {
        setIsUpdatingTailscale(false);
      }
    },
    [exposure.tailscaleServePort, snapshotQuery],
  );

  const savedEnvironmentRows = useMemo(
    () =>
      registry.map((record: PersistedSavedEnvironmentRecord) => (
        <SettingsRow
          key={record.environmentId}
          title={record.label}
          description={record.httpBaseUrl}
          status={
            <>
              <span className="block break-all font-mono text-[11px] text-foreground">
                {record.wsBaseUrl}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Last connected: {formatConnectedAt(record.lastConnectedAt)}
              </span>
            </>
          }
          control={
            <div className="flex items-center gap-2">
              {record.desktopSsh ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reconnectingEnvironmentId !== null || removingEnvironmentId !== null}
                  onClick={() => void reconnectSavedEnvironment(record)}
                >
                  {reconnectingEnvironmentId === record.environmentId
                    ? "Reconnecting..."
                    : "Reconnect"}
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={reconnectingEnvironmentId !== null || removingEnvironmentId !== null}
                onClick={() => void forgetSavedEnvironment(record.environmentId)}
              >
                {removingEnvironmentId === record.environmentId ? "Forgetting..." : "Forget"}
              </Button>
            </div>
          }
        />
      )),
    [
      forgetSavedEnvironment,
      reconnectSavedEnvironment,
      reconnectingEnvironmentId,
      registry,
      removingEnvironmentId,
    ],
  );

  const advertisedEndpointRows = useMemo(
    () =>
      advertisedEndpoints.map((endpoint: AdvertisedEndpoint) => (
        <SettingsRow
          key={endpoint.id}
          title={endpoint.label}
          description={endpoint.description ?? endpoint.provider.label}
          status={
            <>
              <span className="block break-all font-mono text-[11px] text-foreground">
                {endpoint.httpBaseUrl}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {endpoint.provider.label} • {endpoint.status} • {endpoint.reachability}
              </span>
            </>
          }
        />
      )),
    [advertisedEndpoints],
  );

  const sshHostRows = useMemo(
    () =>
      sshHosts.map((host: DesktopDiscoveredSshHost) =>
        (() => {
          const hostKey = makeSshHostKey(host);
          const savedRecord = registry.find(
            (record) =>
              record.desktopSsh?.alias === host.alias &&
              record.desktopSsh?.hostname === host.hostname &&
              record.desktopSsh?.username === host.username &&
              record.desktopSsh?.port === host.port,
          );

          return (
            <SettingsRow
              key={hostKey}
              title={host.alias}
              description={formatSshTarget(host)}
              status={
                <>
                  <span className="block text-[11px] text-muted-foreground">{host.source}</span>
                  {savedRecord ? (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      Saved as {savedRecord.label}
                    </span>
                  ) : null}
                </>
              }
              control={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={connectingSshHostKey !== null}
                  onClick={() => void connectSshHost(host)}
                >
                  {connectingSshHostKey === hostKey
                    ? "Connecting..."
                    : savedRecord
                      ? "Reconnect"
                      : "Connect"}
                </Button>
              }
            />
          );
        })(),
      ),
    [connectSshHost, connectingSshHostKey, registry, sshHosts],
  );

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Server Exposure"
        icon={<GlobeIcon className="size-3.5" />}
        headerAction={
          <Button variant="outline" size="sm" disabled={snapshotQuery.isFetching} onClick={refresh}>
            <RefreshCwIcon
              className={cn("mr-2 size-4", snapshotQuery.isFetching && "animate-spin")}
            />
            Refresh
          </Button>
        }
      >
        <SettingsRow
          title="Network access"
          description={
            exposureUnavailable
              ? "Desktop exposure controls are only available inside the desktop app."
              : describeExposureMode(exposure.mode)
          }
          status={
            <>
              <span className="block text-[11px] text-muted-foreground">Mode: {exposure.mode}</span>
              {exposure.endpointUrl ? (
                <span className="mt-1 block break-all font-mono text-[11px] text-foreground">
                  {exposure.endpointUrl}
                </span>
              ) : null}
              {exposure.advertisedHost ? (
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Advertised host: {exposure.advertisedHost}
                </span>
              ) : null}
            </>
          }
          control={
            <Switch
              checked={networkAccessible}
              disabled={exposureUnavailable || isUpdatingExposure}
              onCheckedChange={(checked) => void setExposureMode(Boolean(checked))}
              aria-label="Enable desktop network access"
            />
          }
        />
        <SettingsRow
          title="Tailscale Serve"
          description={
            tailscaleToggleUnavailable
              ? "Tailscale controls are only available inside the desktop app."
              : "Expose an HTTPS endpoint on your Tailnet when Tailscale is available."
          }
          status={
            <>
              <span className="block text-[11px] text-muted-foreground">
                Enabled: {exposure.tailscaleServeEnabled ? "yes" : "no"}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                HTTPS port: {exposure.tailscaleServePort ?? 443}
              </span>
            </>
          }
          control={
            <Switch
              checked={exposure.tailscaleServeEnabled === true}
              disabled={tailscaleToggleUnavailable || isUpdatingTailscale}
              onCheckedChange={(checked) => void setTailscaleServeEnabled(Boolean(checked))}
              aria-label="Enable Tailscale Serve"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Advertised Endpoints" icon={<GlobeIcon className="size-3.5" />}>
        {advertisedEndpointRows.length > 0 ? (
          advertisedEndpointRows
        ) : (
          <SettingsRow
            title="No advertised endpoints"
            description="Published desktop endpoints will appear here when the desktop bridge exposes them."
          />
        )}
      </SettingsSection>

      <SettingsSection title="Saved Environments" icon={<LinkIcon className="size-3.5" />}>
        {savedEnvironmentErrorMessage ? (
          <SettingsRow
            title="Saved environment update failed"
            description={savedEnvironmentErrorMessage}
          />
        ) : null}
        {savedEnvironmentRows.length > 0 ? (
          savedEnvironmentRows
        ) : (
          <SettingsRow
            title="No saved environments"
            description="Paired and remote environments will appear here after they are connected."
            status={snapshotQuery.error instanceof Error ? snapshotQuery.error.message : undefined}
          />
        )}
      </SettingsSection>

      <SettingsSection title="SSH Hosts" icon={<LinkIcon className="size-3.5" />}>
        {sshErrorMessage ? (
          <SettingsRow title="SSH connection failed" description={sshErrorMessage} />
        ) : null}
        {sshHostRows.length > 0 ? (
          sshHostRows
        ) : (
          <SettingsRow
            title="No SSH hosts discovered"
            description="SSH config aliases and known hosts will appear here when the desktop bridge exposes them."
          />
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
