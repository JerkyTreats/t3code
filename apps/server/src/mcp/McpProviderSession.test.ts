import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import {
  getMcpProviderServerAttachments,
  withAgentDeviceEnvironment,
} from "./McpProviderSession.ts";

it("attaches only admitted toolkit endpoints", () => {
  const config = {
    environmentId: EnvironmentId.make("synthetic-environment"),
    threadId: ThreadId.make("synthetic-thread"),
    providerSessionId: "synthetic-session",
    providerInstanceId: ProviderInstanceId.make("codex"),
    endpoint: "http://127.0.0.1:43123/mcp/pull-requests",
    boardEndpoint: "http://127.0.0.1:43123/mcp",
    previewEndpoint: "http://127.0.0.1:43123/mcp/preview",
    authorizationHeader: "Bearer synthetic-token",
  };
  const boardCapabilities = new Set(["board"] as const);
  expect(getMcpProviderServerAttachments({ ...config, capabilities: boardCapabilities })).toEqual([
    {
      name: "t3-code",
      endpoint: config.boardEndpoint,
      authorizationHeader: config.authorizationHeader,
      capabilities: boardCapabilities,
    },
  ]);
  const previewCapabilities = new Set(["preview"] as const);
  expect(getMcpProviderServerAttachments({ ...config, capabilities: previewCapabilities })).toEqual(
    [
      {
        name: "t3-code-preview",
        endpoint: config.previewEndpoint,
        authorizationHeader: config.authorizationHeader,
        capabilities: previewCapabilities,
      },
    ],
  );
});

describe("device CLI environment", () => {
  it("preserves provider credentials and commands while routing devices to the owned daemon", () => {
    const environment = withAgentDeviceEnvironment(
      { PATH: "/provider/bin:/usr/bin", PROVIDER_KEY: "fixture" },
      {
        agentDeviceEnvironment: {
          PATH: "/t3/device/bin",
          PATH_SEPARATOR: ":",
          AGENT_DEVICE_DAEMON_BASE_URL: "http://127.0.0.1:9000",
          AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
        },
      },
    );
    expect(environment).toEqual({
      PATH: "/t3/device/bin:/provider/bin:/usr/bin",
      PROVIDER_KEY: "fixture",
      AGENT_DEVICE_DAEMON_BASE_URL: "http://127.0.0.1:9000",
      AGENT_DEVICE_DAEMON_AUTH_TOKEN: "fixture-device",
    });
  });

  it("does not grant CLI access when device access was not supplied", () => {
    const environment = { PATH: "/usr/bin", PROVIDER_KEY: "fixture" };
    expect(withAgentDeviceEnvironment(environment, undefined)).toBe(environment);
    expect(withAgentDeviceEnvironment(environment, {})).toBe(environment);
  });
});
