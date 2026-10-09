import type { McpCapability } from "./McpInvocationContext.ts";

const endpoints = {
  "/mcp": { capability: "orchestration", oauth: true },
  "/mcp/board": { capability: "board", oauth: false },
  "/mcp/preview": { capability: "preview", oauth: false },
  "/mcp/device": { capability: "device", oauth: false },
  "/mcp/pull-requests": { capability: "pull-requests", oauth: true },
} as const satisfies Record<
  string,
  { readonly capability: McpCapability; readonly oauth: boolean }
>;

export type McpEndpoint = keyof typeof endpoints;
export type McpCallerSource = "registry" | "oauth";

/** The source is established by the server's credential resolver, never by tool input. */
export const acceptsCallerSource = (endpoint: McpEndpoint, source: McpCallerSource): boolean =>
  source === "registry" || endpoints[endpoint].oauth;

export const admit = (input: {
  readonly endpoint: McpEndpoint;
  readonly source: McpCallerSource;
  readonly capabilities: ReadonlySet<McpCapability>;
}): "admitted" | "caller-source-denied" | "capability-denied" => {
  if (!acceptsCallerSource(input.endpoint, input.source)) return "caller-source-denied";
  return input.capabilities.has(endpoints[input.endpoint].capability)
    ? "admitted"
    : "capability-denied";
};
