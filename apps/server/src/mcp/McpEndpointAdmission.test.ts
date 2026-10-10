import { expect, it } from "@effect/vitest";

import * as McpEndpointAdmission from "./McpEndpointAdmission.ts";
import { ALL_MCP_CAPABILITIES, type McpCapability } from "./McpInvocationContext.ts";

const cases = [
  { endpoint: "/mcp", capability: "orchestration", oauth: true },
  { endpoint: "/mcp/preview", capability: "preview", oauth: false },
  { endpoint: "/mcp/device", capability: "device", oauth: false },
  { endpoint: "/mcp/pull-requests", capability: "pull-requests", oauth: true },
] as const;

it.each(
  cases.flatMap((entry) =>
    (["registry", "oauth"] as const).map((source) => ({
      ...entry,
      source,
    })),
  ),
)(
  "$endpoint admits $source only with its exact endpoint grant and allowed source",
  ({ endpoint, capability, oauth, source }) => {
    const sourceAllowed = source === "registry" || oauth;
    expect(McpEndpointAdmission.acceptsCallerSource(endpoint, source)).toBe(sourceAllowed);
    for (let mask = 0; mask < 2 ** ALL_MCP_CAPABILITIES.length; mask++) {
      const capabilities = new Set<McpCapability>(
        ALL_MCP_CAPABILITIES.filter((_, index) => (mask & (1 << index)) !== 0),
      );
      const result = McpEndpointAdmission.admit({ endpoint, source, capabilities });
      expect(result, `grants: ${[...capabilities].join(", ")}`).toBe(
        !sourceAllowed
          ? "caller-source-denied"
          : capabilities.has(capability)
            ? "admitted"
            : "capability-denied",
      );
    }
  },
);
