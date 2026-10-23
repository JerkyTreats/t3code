import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { getMcpProviderServerAttachments, withAgentDeviceEnvironment } from "./mcpSession.ts";

it("attaches only admitted toolkit endpoints", () => {
  const config = {
    environmentId: EnvironmentId.make("synthetic-environment"),
    threadId: ThreadId.make("synthetic-thread"),
    providerSessionId: "synthetic-session",
    providerInstanceId: ProviderInstanceId.make("codex"),
    endpoint: "http://127.0.0.1:43123/mcp",
    previewEndpoint: "http://127.0.0.1:43123/mcp/preview",
    authorizationHeader: "Bearer synthetic-token",
    browserToolsAvailable: false,
  };
  const previewCapabilities = new Set(["preview"] as const);
  expect(getMcpProviderServerAttachments({ ...config, capabilities: previewCapabilities })).toEqual(
    [
      {
        name: "t3-code-preview",
        endpoint: config.previewEndpoint,
        authorizationHeader: config.authorizationHeader,
        capabilities: previewCapabilities,
        browserToolsAvailable: true,
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

it("keeps orchestration, browser, device and pull request attachments independent", () => {
  const config = {
    environmentId: EnvironmentId.make("synthetic-environment"),
    threadId: ThreadId.make("synthetic-thread"),
    providerSessionId: "synthetic-session",
    providerInstanceId: ProviderInstanceId.make("codex"),
    endpoint: "http://127.0.0.1:43123/mcp",
    authorizationHeader: "Bearer synthetic-token",
    browserToolsAvailable: false,
  };
  const cases = [
    [[], []],
    [["orchestration"], ["t3-code"]],
    [["preview"], ["t3-code-preview"]],
    [["device"], ["t3-code-device"]],
    [["pull-requests"], ["t3-code-pull-requests"]],
    [
      ["orchestration", "preview", "device", "pull-requests"],
      ["t3-code", "t3-code-preview", "t3-code-device", "t3-code-pull-requests"],
    ],
  ] as const;
  for (const [grants, names] of cases) {
    const attachments = getMcpProviderServerAttachments({
      ...config,
      capabilities: new Set(grants),
    });
    expect(attachments.map((attachment) => attachment.name)).toEqual(names);
    expect(
      attachments.every(
        (attachment) => attachment.browserToolsAvailable === new Set<string>(grants).has("preview"),
      ),
    ).toBe(true);
  }
  const defaults = getMcpProviderServerAttachments(config);
  expect(defaults.map((attachment) => attachment.name)).toEqual([
    "t3-code",
    "t3-code-pull-requests",
  ]);
});
