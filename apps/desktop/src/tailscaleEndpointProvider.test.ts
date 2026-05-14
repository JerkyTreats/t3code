import { describe, expect, it } from "vitest";

import {
  resolveTailscaleAdvertisedEndpoints,
  resolveTailscaleIpAdvertisedEndpoints,
  resolveTailscaleMagicDnsAdvertisedEndpoint,
} from "./tailscaleEndpointProvider.ts";

describe("resolveTailscaleIpAdvertisedEndpoints", () => {
  it("returns private Tailnet IPv4 endpoints", () => {
    expect(
      resolveTailscaleIpAdvertisedEndpoints({
        port: 3773,
        networkInterfaces: {
          tailscale0: [
            {
              address: "100.101.102.103",
              family: "IPv4",
              internal: false,
              netmask: "255.255.255.255",
              cidr: "100.101.102.103/32",
              mac: "00:00:00:00:00:00",
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: "tailscale-ip:http://100.101.102.103:3773",
        label: "Tailscale IP",
        httpBaseUrl: "http://100.101.102.103:3773",
        provider: {
          id: "tailscale",
          label: "Tailscale",
          kind: "private-network",
          isAddon: true,
        },
        source: "desktop-addon",
        reachability: "private-network",
        status: "available",
        description: "Reachable from devices on the same Tailnet.",
      },
    ]);
  });
});

describe("resolveTailscaleMagicDnsAdvertisedEndpoint", () => {
  it("marks the endpoint available when the probe succeeds", async () => {
    await expect(
      resolveTailscaleMagicDnsAdvertisedEndpoint({
        dnsName: "demo.tail123.ts.net",
        serveEnabled: true,
        probe: async () => true,
      }),
    ).resolves.toEqual({
      id: "tailscale-magicdns:https://demo.tail123.ts.net/",
      label: "Tailscale HTTPS",
      httpBaseUrl: "https://demo.tail123.ts.net/",
      provider: {
        id: "tailscale",
        label: "Tailscale",
        kind: "private-network",
        isAddon: true,
      },
      source: "desktop-addon",
      reachability: "private-network",
      hostedHttpsCompatibility: "compatible",
      status: "available",
      description: "HTTPS endpoint served by Tailscale Serve.",
    });
  });
});

describe("resolveTailscaleAdvertisedEndpoints", () => {
  it("combines Tailnet IPs and MagicDNS endpoints from status json", async () => {
    await expect(
      resolveTailscaleAdvertisedEndpoints({
        port: 3773,
        serveEnabled: true,
        networkInterfaces: {
          tailscale0: [
            {
              address: "100.101.102.103",
              family: "IPv4",
              internal: false,
              netmask: "255.255.255.255",
              cidr: "100.101.102.103/32",
              mac: "00:00:00:00:00:00",
            },
          ],
        },
        statusJson: JSON.stringify({
          Self: {
            DNSName: "demo.tail123.ts.net.",
          },
        }),
        probe: async () => false,
      }),
    ).resolves.toEqual([
      {
        id: "tailscale-ip:http://100.101.102.103:3773",
        label: "Tailscale IP",
        httpBaseUrl: "http://100.101.102.103:3773",
        provider: {
          id: "tailscale",
          label: "Tailscale",
          kind: "private-network",
          isAddon: true,
        },
        source: "desktop-addon",
        reachability: "private-network",
        status: "available",
        description: "Reachable from devices on the same Tailnet.",
      },
      {
        id: "tailscale-magicdns:https://demo.tail123.ts.net/",
        label: "Tailscale HTTPS",
        httpBaseUrl: "https://demo.tail123.ts.net/",
        provider: {
          id: "tailscale",
          label: "Tailscale",
          kind: "private-network",
          isAddon: true,
        },
        source: "desktop-addon",
        reachability: "private-network",
        hostedHttpsCompatibility: "requires-configuration",
        status: "unavailable",
        description: "MagicDNS hostname. Configure Tailscale Serve for HTTPS access.",
      },
    ]);
  });
});
