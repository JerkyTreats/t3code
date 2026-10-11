// @effect-diagnostics nodeBuiltinImport:off -- Executes the shipped Pi extension at its native JavaScript boundary.
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeVM from "node:vm";
import { PI_T3_MCP_EXTENSION_SOURCE, T3_MCP_SERVERS_ENV } from "./mcpExtensionSource.ts";

interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: unknown;
  readonly outputSchema?: unknown;
  readonly exposure?: string;
  readonly promptSnippet?: string;
  readonly promptGuidelines?: ReadonlyArray<string>;
  readonly execute: (
    id: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<{
    readonly content: ReadonlyArray<{
      readonly type: string;
      readonly text?: string;
      readonly data?: string;
      readonly mimeType?: string;
    }>;
    readonly details: { readonly server: string; readonly tool: string };
    readonly structuredContent?: unknown;
    readonly isError?: boolean;
  }>;
}

type AgentStartHook = (
  event: { systemPrompt: string },
  ctx: { ui: { notify: (message: string, severity: string) => void } },
) => Promise<{ systemPrompt: string }>;

export async function loadMcpBridge(
  options: {
    readonly modern?: boolean;
    readonly result?: unknown;
    readonly toolSearchAvailable?: boolean;
    readonly toolSearchDisabled?: boolean;
    readonly allowsTool?: (name: string) => boolean;
    readonly runtimeMode?: string;
    readonly servers?: ReadonlyArray<{
      readonly name: string;
      readonly endpoint: string;
      readonly authorizationHeader: string;
    }>;
    readonly serverConfig?: string;
    readonly catalogs?: Readonly<
      Record<
        string,
        ReadonlyArray<{
          readonly name: string;
          readonly annotations?: { readonly readOnlyHint: boolean };
          readonly inputSchema?: Record<string, unknown>;
        }>
      >
    >;
    readonly failEndpointOnce?: string;
    readonly failMethod?: string;
    readonly failCloseEndpoint?: string;
    readonly blockToolCalls?: boolean;
  } = {},
) {
  const handlers = new Map<string, AgentStartHook>();
  const tools: RegisteredTool[] = [];
  const requests: Array<{ readonly method: string; readonly params?: unknown }> = [];
  let activeTools = ["read"];
  let failedOnce = false;
  let bridgeSourcePath = "/fixture/pi-t3-extension.ts";
  const transports: Array<{
    readonly url: string;
    readonly authorization: string;
    readonly signal: AbortSignal | undefined;
    readonly sessionId: string | undefined;
    readonly method: string;
  }> = [];
  const servers: Array<{ readonly name: string; readonly config: Record<string, unknown> }> = [];
  const catalog = [
    {
      name: "orchestrator_capabilities",
      description: "Discover available providers and models.",
      annotations: { readOnlyHint: true },
    },
    { name: "delegate_task", description: "Delegate work to another agent." },
    {
      name: "task_status",
      description: "Check delegated work.",
      annotations: { readOnlyHint: false },
    },
    { name: "preview_snapshot", description: "Inspect the collaborative browser." },
  ].map((tool) => ({
    ...tool,
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object", properties: { count: { type: "number" } } },
  }));
  const source = NodeModule.stripTypeScriptTypes(
    PI_T3_MCP_EXTENSION_SOURCE.replace(/^import .*;$/gm, "").replace(
      "export default async function",
      "async function",
    ),
  );
  await NodeVM.runInNewContext(`${source}\nt3McpExtension(pi)`, {
    process: {
      env: {
        [T3_MCP_SERVERS_ENV]:
          options.serverConfig ??
          JSON.stringify(
            options.servers ?? [
              {
                name: "t3-code",
                endpoint: "http://fixture.invalid/mcp",
                authorizationHeader: "Bearer fixture-token",
              },
            ],
          ),
        T3_PI_MCP_EXTENSION_PATH: "/fixture/pi-t3-extension.ts",
        T3_PI_RUNTIME_MODE: options.runtimeMode,
      },
    },
    AbortSignal,
    AbortController,
    NodePath,
    Type: { Unsafe: (schema: unknown) => schema },
    fetch: async (
      url: string,
      requestOptions: {
        method: string;
        body?: string;
        headers: Record<string, string>;
        signal?: AbortSignal;
      },
    ) => {
      requestOptions.signal?.throwIfAborted();
      transports.push({
        url,
        authorization: requestOptions.headers.authorization!,
        sessionId: requestOptions.headers["mcp-session-id"],
        method: requestOptions.method,
        signal: requestOptions.signal,
      });
      if (requestOptions.method === "DELETE") {
        if (url === options.failCloseEndpoint) throw new Error("fixture close failure");
        return new Response(null, { status: 202 });
      }
      const request = JSON.parse(requestOptions.body!) as {
        id: number;
        method: string;
        params?: unknown;
      };
      if (
        request.method === (options.failMethod ?? "initialize") &&
        url === options.failEndpointOnce &&
        !failedOnce
      ) {
        failedOnce = true;
        return new Response("fixture unavailable", { status: 503 });
      }
      if (request.method === "tools/call" && options.blockToolCalls) {
        return new Promise<Response>((_resolve, reject) => {
          requestOptions.signal!.addEventListener(
            "abort",
            () => reject(new Error("fixture aborted")),
            { once: true },
          );
        });
      }
      requests.push(request);
      const result =
        request.method === "tools/list"
          ? { tools: options.catalogs?.[url] ?? catalog }
          : request.method === "tools/call"
            ? (options.result ?? { content: [{ type: "text", text: "browser snapshot" }] })
            : {};
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
        headers: { "content-type": "application/json", "mcp-session-id": "session:" + url },
      });
    },
    pi: {
      on: (name: string, handler: AgentStartHook) => handlers.set(name, handler),
      registerTool: (tool: RegisteredTool) => {
        if (options.allowsTool && !options.allowsTool(tool.name)) return;
        const index = tools.findIndex((current) => current.name === tool.name);
        if (index === -1) tools.push(tool);
        else tools[index] = tool;
      },
      getActiveTools: () => activeTools,
      setActiveTools: (names: string[]) => {
        activeTools = names.filter((name) => options.allowsTool?.(name) ?? true);
      },
      getAllTools: () => [
        ...tools.map((tool) => ({ name: tool.name, sourceInfo: { path: bridgeSourcePath } })),
        ...(options.toolSearchAvailable &&
        !options.toolSearchDisabled &&
        (options.allowsTool?.("tool_search") ?? true)
          ? [{ name: "tool_search", sourceInfo: { path: "builtin:tool-search" } }]
          : []),
      ],
      ...(options.modern
        ? {
            registerMcpServer: (name: string, config: Record<string, unknown>) =>
              servers.push({ name, config }),
            unregisterMcpServer: () => servers.splice(0),
          }
        : {}),
    },
  });
  return {
    handlers,
    tools,
    setBridgeSourcePath: (path: string) => {
      bridgeSourcePath = path;
    },
    requests,
    servers,
    transports,
    getActiveTools: () => activeTools,
    restoreActiveTools: (names: string[]) => {
      activeTools = names;
    },
  };
}
