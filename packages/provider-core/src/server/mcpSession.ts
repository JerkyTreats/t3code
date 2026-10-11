import type { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

export interface McpProviderSessionConfig {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly capabilities?: ReadonlySet<string>;
  readonly browserToolsAvailable: boolean;
  readonly endpoint: string;
  readonly previewEndpoint?: string;
  readonly deviceEndpoint?: string;
  readonly pullRequestsEndpoint?: string;
  readonly authorizationHeader: string;
  readonly agentDeviceEnvironment?: Readonly<Record<string, string>>;
}

export interface McpProviderServerAttachment {
  readonly name: "t3-code" | "t3-code-preview" | "t3-code-device" | "t3-code-pull-requests";
  readonly endpoint: string;
  readonly authorizationHeader: string;
  /**
   * Whether this credential includes the "preview" capability. Adapters read
   * it to keep developer instructions truthful: when the user withholds agent
   * browser access, the prompt must not advertise `preview_*` tools that every
   * call would reject.
   */
  readonly browserToolsAvailable: boolean;
  /** Explicit server-issued toolkit grants. */
  readonly capabilities?: ReadonlySet<string>;
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
  const capabilities =
    config.capabilities ??
    new Set([
      "orchestration",
      "worktree",
      "pull-requests",
      ...(config.browserToolsAvailable ? ["preview"] : []),
    ]);
  const siblingEndpoint = (name: string) =>
    `${config.endpoint.replace(/\/mcp\/?$/, "")}/mcp/${name}`;
  const attach = (name: McpProviderServerAttachment["name"], endpoint: string) =>
    attachments.push({
      name,
      endpoint,
      authorizationHeader: config.authorizationHeader,
      capabilities,
      browserToolsAvailable: capabilities.has("preview"),
      ...(config.agentDeviceEnvironment
        ? { agentDeviceEnvironment: config.agentDeviceEnvironment }
        : {}),
    });
  if (capabilities.has("orchestration")) attach("t3-code", config.endpoint);
  if (capabilities.has("preview"))
    attach("t3-code-preview", config.previewEndpoint ?? siblingEndpoint("preview"));
  if (capabilities.has("device"))
    attach("t3-code-device", config.deviceEndpoint ?? siblingEndpoint("device"));
  if (capabilities.has("pull-requests"))
    attach(
      "t3-code-pull-requests",
      config.pullRequestsEndpoint ?? siblingEndpoint("pull-requests"),
    );
  return attachments;
}
