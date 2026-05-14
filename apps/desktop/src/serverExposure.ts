import type { NetworkInterfaceInfo } from "node:os";
import type {
  AdvertisedEndpoint,
  AdvertisedEndpointProvider,
  DesktopServerExposureMode,
} from "@t3tools/contracts";

type NetworkInterfacesLike = NodeJS.Dict<NetworkInterfaceInfo[]>;

export interface DesktopServerExposure {
  readonly mode: DesktopServerExposureMode;
  readonly bindHost: string;
  readonly localHttpUrl: string;
  readonly localWsUrl: string;
  readonly endpointUrl: string | null;
  readonly advertisedHost: string | null;
}

export interface DesktopAdvertisedEndpointInput {
  readonly port: number;
  readonly exposure: DesktopServerExposure;
}

const DESKTOP_ENDPOINT_PROVIDER: AdvertisedEndpointProvider = {
  id: "desktop",
  label: "Desktop",
  kind: "local-network",
};

export function resolveLanAdvertisedHost(
  networkInterfaces: NetworkInterfacesLike,
  explicitHost: string | undefined,
): string | null {
  if (explicitHost) {
    return explicitHost;
  }

  for (const addresses of Object.values(networkInterfaces)) {
    if (!addresses) {
      continue;
    }

    for (const address of addresses) {
      if (address.family === "IPv4" && !address.internal) {
        return address.address;
      }
    }
  }

  return null;
}

export function resolveDesktopServerExposure(input: {
  readonly mode: DesktopServerExposureMode;
  readonly port: number;
  readonly networkInterfaces: NetworkInterfacesLike;
  readonly advertisedHostOverride?: string | undefined;
}): DesktopServerExposure {
  const localHttpUrl = `http://127.0.0.1:${input.port}`;
  const localWsUrl = `ws://127.0.0.1:${input.port}`;

  if (input.mode === "local-only") {
    return {
      mode: input.mode,
      bindHost: "127.0.0.1",
      localHttpUrl,
      localWsUrl,
      endpointUrl: null,
      advertisedHost: null,
    };
  }

  const advertisedHost = resolveLanAdvertisedHost(
    input.networkInterfaces,
    input.advertisedHostOverride,
  );

  return {
    mode: input.mode,
    bindHost: "0.0.0.0",
    localHttpUrl,
    localWsUrl,
    endpointUrl: advertisedHost === null ? null : `http://${advertisedHost}:${input.port}`,
    advertisedHost,
  };
}

export function resolveDesktopCoreAdvertisedEndpoints(
  input: DesktopAdvertisedEndpointInput,
): readonly AdvertisedEndpoint[] {
  const endpoints: AdvertisedEndpoint[] = [
    {
      id: `desktop-loopback:${input.port}`,
      label: "This machine",
      httpBaseUrl: input.exposure.localHttpUrl,
      provider: DESKTOP_ENDPOINT_PROVIDER,
      source: "desktop",
      reachability: "local-network",
      status: "available",
      description: "Loopback endpoint for this desktop app.",
    },
  ];

  if (input.exposure.endpointUrl) {
    endpoints.push({
      id: `desktop-lan:${input.exposure.endpointUrl}`,
      label: "Local network",
      httpBaseUrl: input.exposure.endpointUrl,
      provider: DESKTOP_ENDPOINT_PROVIDER,
      source: "desktop",
      reachability: "local-network",
      status: "available",
      description: "Reachable from devices on the same network.",
    });
  }

  return endpoints;
}
