import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import type { McpCapability } from "./McpInvocationContext.ts";

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly capabilities: ReadonlySet<McpCapability>;
  readonly boardEndpoint?: string | undefined;
  readonly previewEndpoint?: string | undefined;
  readonly authorizationHeader: string;
}

export interface McpProviderServerAttachment {
  readonly name: "t3-code" | "t3-code-preview";
  readonly endpoint: string;
  readonly authorizationHeader: string;
}

/** Each toolkit requires both its admitted capability and its own endpoint. */
export function getMcpProviderServerAttachments(
  config: McpProviderSessionConfig,
): ReadonlyArray<McpProviderServerAttachment> {
  const attachments: McpProviderServerAttachment[] = [];
  if (config.capabilities.has("board") && config.boardEndpoint) {
    attachments.push({
      name: "t3-code",
      endpoint: config.boardEndpoint,
      authorizationHeader: config.authorizationHeader,
    });
  }
  if (config.capabilities.has("preview") && config.previewEndpoint) {
    attachments.push({
      name: "t3-code-preview",
      endpoint: config.previewEndpoint,
      authorizationHeader: config.authorizationHeader,
    });
  }
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
