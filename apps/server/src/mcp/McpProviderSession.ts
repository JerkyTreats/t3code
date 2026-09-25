import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import type { McpCapability } from "./McpInvocationContext.ts";

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly capabilities: ReadonlySet<McpCapability>;
  readonly endpoint: string;
  readonly boardEndpoint?: string;
  readonly previewEndpoint?: string;
  readonly deviceEndpoint?: string;
  readonly authorizationHeader: string;
  readonly agentDeviceEnvironment?: Readonly<Record<string, string>>;
}

export interface McpProviderServerAttachment {
  readonly name: "t3-code" | "t3-code-preview" | "t3-code-device" | "t3-code-pull-requests";
  readonly endpoint: string;
  readonly authorizationHeader: string;
  /** Capabilities the credential grants ("preview", "device"). */
  readonly capabilities: ReadonlySet<string>;
  /**
   * Set when the session may drive devices. Adapters spread this into the
   * provider subprocess environment so the `agent-device` CLI is on PATH and
   * already pointed at the server's daemon; the agent never handles a token.
   */
  readonly agentDeviceEnvironment?: Readonly<Record<string, string>>;
}

/** Provider env with the device variables applied over `base`, or `base` untouched. */
export function withAgentDeviceEnvironment(
  base: NodeJS.ProcessEnv,
  config: Pick<McpProviderSessionConfig, "agentDeviceEnvironment"> | undefined,
): NodeJS.ProcessEnv {
  const extra = config?.agentDeviceEnvironment;
  if (!extra) return base;
  const separator = extra.PATH_SEPARATOR ?? ":";
  const basePath = base.PATH ?? base.Path;
  const { PATH: shimDir, PATH_SEPARATOR: _separator, ...rest } = extra;
  return {
    ...base,
    ...rest,
    ...(shimDir ? { PATH: basePath ? `${shimDir}${separator}${basePath}` : shimDir } : {}),
  };
}

/** Each toolkit is attached only when its credential grants that capability. */
export function getMcpProviderServerAttachments(
  config: McpProviderSessionConfig,
): ReadonlyArray<McpProviderServerAttachment> {
  const attachments: McpProviderServerAttachment[] = [];
  const attach = (name: McpProviderServerAttachment["name"], endpoint: string) =>
    attachments.push({
      name,
      endpoint,
      authorizationHeader: config.authorizationHeader,
      capabilities: config.capabilities,
      ...(config.agentDeviceEnvironment
        ? { agentDeviceEnvironment: config.agentDeviceEnvironment }
        : {}),
    });
  if (config.capabilities.has("board") && config.boardEndpoint)
    attach("t3-code", config.boardEndpoint);
  if (config.capabilities.has("preview") && config.previewEndpoint)
    attach("t3-code-preview", config.previewEndpoint);
  if (config.capabilities.has("device") && config.deviceEndpoint)
    attach("t3-code-device", config.deviceEndpoint);
  if (config.capabilities.has("pull-requests")) attach("t3-code-pull-requests", config.endpoint);
  return attachments;
}

const sessionsByThread = new Map<ThreadId, McpProviderSessionConfig>();

export function setMcpProviderSession(config: McpProviderSessionConfig): void {
  sessionsByThread.set(config.threadId, config);
}

export function readMcpProviderSession(threadId: ThreadId): McpProviderSessionConfig | undefined {
  return sessionsByThread.get(threadId);
}

export function clearMcpProviderSession(threadId: ThreadId): void {
  sessionsByThread.delete(threadId);
}

export function clearAllMcpProviderSessions(): void {
  sessionsByThread.clear();
}
