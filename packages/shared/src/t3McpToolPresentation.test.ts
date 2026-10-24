import { describe, expect, it } from "vite-plus/test";

import {
  T3_MCP_TOOL_NAMES,
  resolveT3McpToolDefinition,
  resolveT3McpToolPresentation,
} from "./t3McpToolPresentation.ts";

describe("resolveT3McpToolPresentation", () => {
  it("recognizes every T3 tool across provider prefixes and completion suffixes", () => {
    for (const tool of T3_MCP_TOOL_NAMES) {
      const presentation = resolveT3McpToolPresentation(tool);
      for (const prefix of [
        "mcp__t3-code__",
        "mcp__t3_code__",
        "mcp__t3code__",
        "T3-code.",
        "t3_code/",
        "t3code:",
        "mcp_t3-code_",
        "T3 Code ",
        "t3-code · ",
      ]) {
        expect(resolveT3McpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveT3McpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });

  it("preserves labels, icons and summaries across independently admitted toolkit servers", () => {
    const namespaces = [
      ["preview", "preview_open"],
      ["preview", "t3_preview_list"],
      ["device", "device_list"],
      ["pull-requests", "link_pull_request"],
      ["pull-requests", "list_thread_pull_requests"],
    ] as const;
    for (const [toolkit, tool] of namespaces) {
      const definition = resolveT3McpToolDefinition(tool);
      expect(definition).not.toBeNull();
      const server = `t3-code-${toolkit}`;
      for (const name of [
        `mcp__${server}__${tool}`,
        `mcp__${server.replaceAll("-", "_")}__${tool}`,
        `${server}.${tool}`,
        `${server}/${tool}`,
        `${server} · ${tool}`,
        `mcp_${server}_${tool}`,
      ]) {
        expect(resolveT3McpToolDefinition(name), name).toEqual(definition);
        expect(resolveT3McpToolPresentation(`${name} completed`), name).toEqual(
          resolveT3McpToolPresentation(tool),
        );
      }
    }
    expect(resolveT3McpToolPresentation("mcp__t3-code-unknown__preview_open")).toBeNull();
    expect(resolveT3McpToolPresentation("t3-code-unknown.preview_open")).toBeNull();
    expect(resolveT3McpToolPresentation("mcp__unknown-server__not_a_real_tool")).toBeNull();
  });

  it("matches OpenCode 2's per-thread server names, whose thread ids hold underscores", () => {
    expect(
      resolveT3McpToolPresentation("t3-code-thread_opencode2-adapter_delegate_task")?.displayName,
    ).toBe("Delegate a child task");
    expect(resolveT3McpToolPresentation("t3-code-thread_opencode2-adapter_not_a_tool")).toBeNull();
  });
});
