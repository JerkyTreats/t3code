// @effect-diagnostics nodeBuiltinImport:off -- Pi extensions run outside Effect; these tests exercise their native filesystem boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as NodeModule from "node:module";
import * as NodeVM from "node:vm";
import { assert, describe, expect, it } from "@effect/vitest";

import { PI_T3_MCP_EXTENSION_SOURCE, T3_MCP_SERVERS_ENV } from "./mcpExtensionSource.ts";
import { loadMcpBridge } from "./mcpBridge.testkit.ts";

type RequestHook = (
  event: { payload: unknown },
  ctx: { model: { provider: string } },
) => Record<string, unknown> | undefined;

interface SkillCommand {
  readonly name: string;
  readonly source: string;
  readonly sourceInfo: { readonly path: string };
}

type InputHook = (
  event: { text: string; images?: ReadonlyArray<unknown> },
  ctx: { ui: { notify: (message: string, level: string) => void } },
) => Promise<{ action: string; text: string; images?: ReadonlyArray<unknown> } | undefined>;

async function loadHooks(commands: ReadonlyArray<SkillCommand> = []) {
  const handlers = new Map<string, unknown>();
  // Execute the shipped extension with MCP disabled; this path needs no Typebox.
  const source = NodeModule.stripTypeScriptTypes(
    PI_T3_MCP_EXTENSION_SOURCE.replace(/^import .*;$/gm, "").replace(
      "export default async function",
      "async function",
    ),
  );
  await NodeVM.runInNewContext(`${source}\nt3McpExtension(pi)`, {
    process: { env: {} },
    NodeFSP,
    NodePath,
    // Frontmatter parsing belongs to Pi. These fixtures contain only skill bodies.
    stripFrontmatter: (content: string) => content,
    pi: {
      on: (name: string, handler: unknown) => handlers.set(name, handler),
      getCommands: () => commands,
    },
  });
  return handlers;
}

describe("Pi MCP tool results", () => {
  it("returns mixed screenshot blocks and typed script output without repeating structured text", async () => {
    const content = [
      { type: "text", text: "Browser screenshot" },
      { type: "image", data: "AAAA", mimeType: "image/png", _meta: { private: true } },
      { type: "text", text: "Screenshot captured" },
    ] as const;
    const result = { content, structuredContent: { count: 2 }, _meta: { private: true } };
    const bridge = await loadMcpBridge({ modern: true, result });
    const tool = bridge.tools.find((tool) => tool.name === "mcp__t3-code__preview_snapshot")!;
    const output = await tool.execute("snapshot", {});
    assert.deepEqual(output.content, [
      content[0],
      { type: "image", data: "AAAA", mimeType: "image/png" },
      content[2],
    ]);
    assert.deepEqual(output.structuredContent, { content, structuredContent: { count: 2 } });
    assert.deepEqual(tool.outputSchema, {
      type: "object",
      properties: {
        content: { type: "array", items: { type: "object" } },
        structuredContent: { type: "object", properties: { count: { type: "number" } } },
        isError: { type: "boolean" },
        _meta: { type: "object" },
      },
      required: ["content"],
    });
  });

  it.each([false, true])(
    "preserves image-only results and error status, isError=%s",
    async (isError) => {
      const image = { type: "image", data: "AAAA", mimeType: "image/png" };
      const result = { content: [image], isError };
      const bridge = await loadMcpBridge({ result });
      const output = await bridge.tools[0]!.execute("image", {});
      assert.deepEqual(output.content[0], image);
      assert.equal(output.content.length, isError ? 2 : 1);
      if (isError) assert.include(output.content[1]?.text ?? "", "returned an error");
      assert.equal(output.isError, isError ? true : undefined);
      assert.deepEqual(output.structuredContent, result);
    },
  );

  it("uses structured output as model text when content is empty", async () => {
    const result = { content: [], structuredContent: { count: 2 } };
    const bridge = await loadMcpBridge({ result });
    const output = await bridge.tools[0]!.execute("structured", {});
    assert.deepEqual(output.content, [{ type: "text", text: '{"count":2}' }]);
    assert.deepEqual(output.structuredContent, result);
  });

  it("propagates cancellation without returning a successful result", async () => {
    const bridge = await loadMcpBridge();
    const controller = new AbortController();
    controller.abort();
    await expect(bridge.tools[0]!.execute("cancelled", {}, controller.signal)).rejects.toThrow(
      "aborted",
    );
  });
});

describe("Pi MCP tool exposure", () => {
  it("keeps orchestration direct and optional bridge tools discoverable on modern Pi", async () => {
    const bridge = await loadMcpBridge({ modern: true, toolSearchAvailable: true });
    await bridge.handlers.get("session_start")!(
      { systemPrompt: "" },
      { ui: { notify: () => undefined } },
    );
    const start = bridge.handlers.get("before_agent_start");
    assert.isDefined(start);
    const prompt = await start!(
      { systemPrompt: "Pi system prompt" },
      { ui: { notify: () => undefined } },
    );
    assert.include(prompt.systemPrompt, "orchestrator_capabilities");
    assert.equal(bridge.servers.length, 0);
    assert.equal(bridge.tools.length, 8);
    assert.deepEqual(bridge.getActiveTools(), ["read", "tool_search"]);
    assert.deepEqual(
      bridge.tools
        .filter((tool) => tool.exposure !== "hidden")
        .map((tool) => [tool.name, tool.exposure]),
      [
        ["mcp__t3-code__orchestrator_capabilities", "direct"],
        ["mcp__t3-code__delegate_task", "direct"],
        ["mcp__t3-code__task_status", "direct"],
        ["mcp__t3-code__preview_snapshot", "deferred"],
      ],
    );
    assert.deepEqual(
      bridge.tools.filter((tool) => tool.exposure === "hidden").map((tool) => tool.name),
      [
        "mcp__t3_code__orchestrator_capabilities",
        "mcp__t3_code__delegate_task",
        "mcp__t3_code__task_status",
        "mcp__t3_code__preview_snapshot",
      ],
    );
    const result = await bridge.tools
      .find((tool) => tool.name === "mcp__t3-code__preview_snapshot")!
      .execute("call-1", { depth: 2 });
    assert.equal(result.content[0]?.text, "browser snapshot");
    assert.equal(bridge.requests.at(-1)?.method, "tools/call");
  });

  it.each(["legacy Pi", "disabled tool search"])(
    "keeps tool execution available with %s",
    async (mode) => {
      const bridge = await loadMcpBridge({
        modern: mode !== "legacy Pi",
        toolSearchAvailable: mode === "disabled tool search",
        toolSearchDisabled: mode === "disabled tool search",
      });
      if (mode !== "legacy Pi") {
        const start = bridge.handlers.get("session_start");
        await start!({ systemPrompt: "Pi system prompt" }, { ui: { notify: () => undefined } });
      }
      assert.equal(bridge.tools.filter((tool) => tool.exposure !== "hidden").length, 4);
      assert.isTrue(
        bridge.tools
          .filter((tool) => tool.exposure !== "hidden")
          .every((tool) => tool.exposure === undefined || tool.exposure === "direct"),
      );
      const tool = bridge.tools.find((tool) => tool.name === "mcp__t3-code__preview_snapshot");
      assert.isDefined(tool);
      const controller = new AbortController();
      const result = await tool!.execute("call-1", { depth: 2 }, controller.signal);
      assert.equal(result.content[0]?.text, "browser snapshot");
      assert.isFalse(bridge.transports.at(-1)?.signal?.aborted);
      controller.abort();
      assert.isTrue(bridge.transports.at(-1)?.signal?.aborted);
      assert.equal(bridge.transports.at(-1)?.url, "http://fixture.invalid/mcp");
      assert.equal(bridge.transports.at(-1)?.authorization, "Bearer fixture-token");
      assert.deepEqual(JSON.parse(JSON.stringify(bridge.requests.at(-1))), {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "preview_snapshot", arguments: { depth: 2 } },
      });
      assert.isUndefined(tool?.promptSnippet);
      assert.isUndefined(tool?.promptGuidelines);
    },
  );

  it("preserves legacy wildcard tool selection", async () => {
    const bridge = await loadMcpBridge({
      modern: true,
      toolSearchAvailable: true,
      allowsTool: (name) =>
        name === "read" || name === "tool_search" || name.startsWith("mcp__t3-code__"),
    });
    await bridge.handlers.get("session_start")!(
      { systemPrompt: "" },
      { ui: { notify: () => undefined } },
    );
    assert.equal(bridge.tools.length, 4);
    assert.equal(bridge.tools.filter((tool) => tool.exposure === "direct").length, 3);
    const tool = bridge.tools.find((tool) => tool.name === "mcp__t3-code__preview_snapshot");
    assert.isDefined(tool);
    assert.equal((await tool!.execute("selected", {})).content[0]?.text, "browser snapshot");
  });

  it.each([false, true])(
    "reconciles tree loadouts while honoring search exclusion: %s",
    async (excludeSearch) => {
      const bridge = await loadMcpBridge({
        modern: true,
        toolSearchAvailable: true,
        allowsTool: (name) =>
          name !== "mcp__t3-code__delegate_task" && (!excludeSearch || name !== "tool_search"),
      });
      await bridge.handlers.get("session_start")!(
        { systemPrompt: "" },
        { ui: { notify: () => undefined } },
      );
      bridge.restoreActiveTools([
        "read",
        "mcp__t3-code__task_status",
        "mcp__t3-code__preview_snapshot",
      ]);
      const tree = bridge.handlers.get("session_tree");
      assert.isDefined(tree);
      await tree!({ systemPrompt: "" }, { ui: { notify: () => undefined } });
      assert.deepEqual(bridge.getActiveTools(), [
        "read",
        "mcp__t3-code__task_status",
        "mcp__t3-code__preview_snapshot",
        ...(!excludeSearch ? ["tool_search"] : []),
      ]);
      assert.isFalse(
        bridge.tools.some(
          (tool) => tool.exposure !== "hidden" && tool.name.endsWith("__delegate_task"),
        ),
      );
    },
  );
});

describe("Pi tool discovery permissions", () => {
  it("retains read-only provenance for every independently attached toolkit", async () => {
    const endpoints = ["http://fixture.invalid/main", "http://fixture.invalid/preview"];
    const bridge = await loadMcpBridge({
      modern: true,
      runtimeMode: "approval-required",
      servers: [
        { name: "t3-code", endpoint: endpoints[0]!, authorizationHeader: "Bearer synthetic-main" },
        {
          name: "t3-code-preview",
          endpoint: endpoints[1]!,
          authorizationHeader: "Bearer synthetic-preview",
        },
      ],
      catalogs: Object.fromEntries(
        endpoints.map((endpoint) => [
          endpoint,
          [
            {
              name: "read_state",
              annotations: { readOnlyHint: true },
              inputSchema: { type: "object", properties: {} },
            },
            {
              name: "mutate_state",
              annotations: { readOnlyHint: false },
              inputSchema: { type: "object", properties: {} },
            },
          ],
        ]),
      ),
    });
    const hook = bridge.handlers.get("tool_call") as unknown as (
      event: { toolName: string; input: unknown },
      ctx: { ui: { confirm: () => Promise<boolean> } },
    ) => Promise<{ block: true } | undefined>;
    const ctx = { ui: { confirm: async () => false } };
    for (const server of ["t3-code", "t3-code-preview"]) {
      assert.isUndefined(await hook({ toolName: `mcp__${server}__read_state`, input: {} }, ctx));
      assert.isTrue(
        (await hook({ toolName: `mcp__${server}__mutate_state`, input: {} }, ctx))?.block,
      );
    }
    bridge.setBridgeSourcePath("/fixture/foreign-extension.ts");
    assert.isTrue(
      (await hook({ toolName: "mcp__t3-code-preview__read_state", input: {} }, ctx))?.block,
    );
  });

  it.each(["approval-required", "auto-accept-edits", "auto"])(
    "allows annotated T3 reads in %s while gating mutations and replacements",
    async (runtimeMode) => {
      const bridge = await loadMcpBridge({ modern: true, runtimeMode });
      const hook = bridge.handlers.get("tool_call") as unknown as (
        event: { toolName: string; input: unknown },
        ctx: { ui: { confirm: (title: string) => Promise<boolean> } },
      ) => Promise<{ block: true; reason: string } | undefined>;
      const confirmations: string[] = [];
      const ctx = {
        ui: {
          confirm: async (title: string) => {
            confirmations.push(title);
            return false;
          },
        },
      };
      for (const prefix of ["mcp__t3-code__", "mcp__t3_code__"]) {
        assert.isUndefined(
          await hook({ toolName: prefix + "orchestrator_capabilities", input: {} }, ctx),
        );
        assert.equal(
          (await hook({ toolName: prefix + "delegate_task", input: {} }, ctx))?.block,
          true,
        );
        // task_status acknowledges result delivery, and is intentionally not read-only.
        assert.equal(
          (await hook({ toolName: prefix + "task_status", input: {} }, ctx))?.block,
          true,
        );
      }
      assert.equal(confirmations.length, 4);
      bridge.setBridgeSourcePath("/user/extensions/replacement.ts");
      assert.equal(
        (await hook({ toolName: "mcp__t3-code__orchestrator_capabilities", input: {} }, ctx))
          ?.block,
        true,
      );
      assert.equal(
        (await hook({ toolName: "mcp__other__orchestrator_capabilities", input: {} }, ctx))?.block,
        true,
      );
      assert.equal(confirmations.length, 6);
    },
  );

  it("allows discovery without confirmation and still gates the discovered tool", async () => {
    type ToolCallHook = (
      event: { toolName: string; input: unknown },
      ctx: {
        signal: AbortSignal;
        ui: {
          confirm: (
            title: string,
            detail: string,
            options: { signal: AbortSignal },
          ) => Promise<boolean>;
        };
      },
    ) => Promise<{ block: true; reason: string } | undefined>;
    let toolCall: ToolCallHook | undefined;
    let searchPath = "builtin:tool-search";
    const source = NodeModule.stripTypeScriptTypes(
      PI_T3_MCP_EXTENSION_SOURCE.replace(/^import .*;$/gm, "").replace(
        "export default async function",
        "async function",
      ),
    );
    await NodeVM.runInNewContext(`${source}\nt3McpExtension(pi)`, {
      process: { env: { T3_PI_RUNTIME_MODE: "approval-required" } },
      pi: {
        on: (name: string, handler: ToolCallHook) => {
          if (name === "tool_call") toolCall = handler;
        },
        getAllTools: () => [{ name: "tool_search", sourceInfo: { path: searchPath } }],
      },
    });
    assert.isDefined(toolCall);
    const confirmations: string[] = [];
    const controller = new AbortController();
    const ctx = {
      signal: controller.signal,
      ui: {
        confirm: async (title: string, _detail: string, options: { signal: AbortSignal }) => {
          assert.strictEqual(options.signal, controller.signal);
          confirmations.push(title);
          return false;
        },
      },
    };
    assert.isUndefined(
      await toolCall!({ toolName: "tool_search", input: { query: "preview_snapshot" } }, ctx),
    );
    assert.equal(confirmations.length, 0);
    const result = await toolCall!({ toolName: "mcp__t3-code__preview_snapshot", input: {} }, ctx);
    assert.equal(result?.block, true);
    assert.deepEqual(confirmations, ["Allow mcp__t3-code__preview_snapshot?"]);

    // An extension that replaces the search builtin is not known to be read-only.
    searchPath = "/extensions/custom-search.ts";
    const replaced = await toolCall!({ toolName: "tool_search", input: {} }, ctx);
    assert.equal(replaced?.block, true);
    assert.equal(confirmations.at(-1), "Allow tool_search?");
  });
});

async function loadRequestHook(): Promise<RequestHook> {
  const handlers = new Map<string, RequestHook>();
  // Execute the shipped extension with MCP disabled; this path needs no Typebox.
  const source = NodeModule.stripTypeScriptTypes(
    PI_T3_MCP_EXTENSION_SOURCE.replace(/^import .*;$/gm, "").replace(
      "export default async function",
      "async function",
    ),
  );
  await NodeVM.runInNewContext(`${source}\nt3McpExtension(pi)`, {
    process: { env: {} },
    pi: { on: (name: string, handler: RequestHook) => handlers.set(name, handler) },
  });
  const hook = handlers.get("before_provider_request");
  assert.isDefined(hook);
  return hook!;
}

describe("Pi upstream output-budget workaround", () => {
  it.each(["max_tokens", "max_completion_tokens"])(
    "caps %s without changing the conversation or tools",
    async (key) => {
      const hook = await loadRequestHook();
      const payload = {
        model: "moonshotai/kimi-k2.6",
        messages: [{ role: "user", content: "hello" }],
        tools: [{ type: "function", function: { name: "read" } }],
        [key]: 231_969,
      };
      const result = hook({ payload }, { model: { provider: "openrouter" } });
      assert.equal(result?.[key], 32_768);
      assert.strictEqual(result?.messages, payload.messages);
      assert.strictEqual(result?.tools, payload.tools);
      assert.equal(result?.model, payload.model);
      assert.equal(payload[key], 231_969);
    },
  );

  it("preserves smaller budgets and other providers' payloads", async () => {
    const hook = await loadRequestHook();
    for (const payload of [{ max_tokens: 8192 }, { max_completion_tokens: 32_768 }, {}, null]) {
      assert.isUndefined(hook({ payload }, { model: { provider: "openrouter" } }));
    }
    assert.isUndefined(
      hook({ payload: { max_tokens: 231_969 } }, { model: { provider: "anthropic" } }),
    );
  });
});

async function loadInputHook(commands: ReadonlyArray<SkillCommand>) {
  const handlers = await loadHooks(commands);
  const hook = handlers.get("input");
  assert.isDefined(hook);
  return hook as InputHook;
}

describe("Pi skill references", () => {
  it("loads every selected skill once while preserving inline prose, whitespace, and images", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pi-skill-mentions-"));
    try {
      const alpha = NodePath.join(directory, "alpha.md");
      const beta = NodePath.join(directory, "beta.md");
      await NodeFSP.writeFile(alpha, "ALPHA_INSTRUCTIONS");
      await NodeFSP.writeFile(beta, "BETA_INSTRUCTIONS");
      const hook = await loadInputHook([
        { name: "skill:alpha", source: "skill", sourceInfo: { path: alpha } },
        { name: "skill:beta", source: "skill", sourceInfo: { path: beta } },
      ]);
      const text =
        "Please use the $alpha philosophy, then $beta and $alpha\n```ts\n  const x = 1;\n```";
      const images = [{ type: "image", data: "fixture" }];
      const result = await hook({ text, images }, { ui: { notify: assert.fail } });
      assert.equal(result?.action, "transform");
      assert.isTrue(result?.text.startsWith(text + "\n\n"));
      assert.equal(result?.text.split("ALPHA_INSTRUCTIONS").length, 2);
      assert.equal(result?.text.split("BETA_INSTRUCTIONS").length, 2);
      assert.include(result?.text ?? "", `References are relative to ${directory}.`);
      assert.strictEqual(result?.images, images);
    } finally {
      await NodeFSP.rm(directory, { recursive: true });
    }
  });

  it("leaves unknown references and native skill commands for Pi", async () => {
    const hook = await loadInputHook([
      { name: "skill:alpha", source: "skill", sourceInfo: { path: "/unused" } },
    ]);
    // Punctuation-adjacent references are plain text in the composer, not selected chips.
    for (const text of [
      "Explain $HOME",
      "/skill:alpha use $alpha",
      "Hello",
      "$missing",
      "Use $alpha, then continue",
      "Use ($alpha)",
    ]) {
      assert.isUndefined(await hook({ text }, { ui: { notify: assert.fail } }));
    }
  });

  it("loads additional chips without duplicating a leading native skill", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pi-skill-mentions-"));
    try {
      const path = NodePath.join(directory, "beta.md");
      await NodeFSP.writeFile(path, "BETA_INSTRUCTIONS");
      const hook = await loadInputHook([
        { name: "skill:alpha", source: "skill", sourceInfo: { path: "/unused" } },
        { name: "skill:beta", source: "skill", sourceInfo: { path } },
      ]);
      const text = "/skill:alpha use $alpha and $beta";
      const result = await hook({ text }, { ui: { notify: assert.fail } });
      assert.isTrue(result?.text.startsWith(text + "\n\n"));
      assert.notInclude(result?.text ?? "", '<skill name="alpha"');
      assert.include(result?.text ?? "", "BETA_INSTRUCTIONS");
    } finally {
      await NodeFSP.rm(directory, { recursive: true });
    }
  });

  it("reports an unreadable skill without deleting its reference or other selected instructions", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pi-skill-mentions-"));
    try {
      const path = NodePath.join(directory, "readable.md");
      await NodeFSP.writeFile(path, "READABLE_INSTRUCTIONS");
      const hook = await loadInputHook([
        {
          name: "skill:missing",
          source: "skill",
          sourceInfo: { path: NodePath.join(directory, "missing.md") },
        },
        { name: "skill:readable", source: "skill", sourceInfo: { path } },
      ]);
      const notices: string[] = [];
      const text = "Use $missing and $readable";
      const result = await hook(
        { text },
        {
          ui: {
            notify: (message) => {
              notices.push(message);
            },
          },
        },
      );
      assert.isTrue(result?.text.startsWith(text + "\n\n"));
      assert.include(result?.text ?? "", "READABLE_INSTRUCTIONS");
      assert.equal(notices.length, 1);
      assert.include(notices[0] ?? "", "Could not load skill missing");
    } finally {
      await NodeFSP.rm(directory, { recursive: true });
    }
  });
});

const independentServers = [
  {
    name: "t3-code",
    endpoint: "http://fixture.invalid/mcp",
    authorizationHeader: "Bearer main-token",
  },
  {
    name: "t3-code-preview",
    endpoint: "http://fixture.invalid/mcp/preview",
    authorizationHeader: "Bearer preview-token",
  },
  {
    name: "t3-code-device",
    endpoint: "http://fixture.invalid/mcp/device",
    authorizationHeader: "Bearer device-token",
  },
  {
    name: "t3-code-pull-requests",
    endpoint: "http://fixture.invalid/mcp/pull-requests",
    authorizationHeader: "Bearer pr-token",
  },
];
const independentCatalogs = Object.fromEntries(
  independentServers.map(({ endpoint }) => [
    endpoint,
    [{ name: "shared_tool", inputSchema: { type: "object", properties: {} } }],
  ]),
);
const sessionEvent = { systemPrompt: "" };
const sessionContext = { ui: { notify: () => undefined } };

describe("Pi independent MCP endpoints", () => {
  it("routes matching tool names to their own credentials, session and native namespace", async () => {
    const bridge = await loadMcpBridge({
      modern: true,
      servers: independentServers,
      catalogs: independentCatalogs,
    });
    assert.equal(bridge.servers.length, 0);
    assert.equal(bridge.tools.length, 8);
    for (const server of independentServers) {
      const publicName = "mcp__" + server.name + "__shared_tool";
      const canonicalName = "mcp__" + server.name.replaceAll("-", "_") + "__shared_tool";
      assert.equal(bridge.tools.find(({ name }) => name === canonicalName)?.exposure, "hidden");
      const tool = bridge.tools.find(({ name }) => name === publicName)!;
      assert.equal(tool.exposure, "deferred");
      const result = await tool.execute("routed-call", { source: server.name });
      assert.deepEqual(JSON.parse(JSON.stringify(result.details)), {
        server: server.name,
        tool: "shared_tool",
      });
      assert.equal(bridge.transports.at(-1)?.url, server.endpoint);
      assert.equal(bridge.transports.at(-1)?.authorization, server.authorizationHeader);
      assert.equal(bridge.transports.at(-1)?.sessionId, "session:" + server.endpoint);
      assert.deepEqual(JSON.parse(JSON.stringify(bridge.requests.at(-1)?.params)), {
        name: "shared_tool",
        arguments: { source: server.name },
      });
    }
  });

  it.each(independentServers.slice(1))(
    "connects $name without orchestration or other toolkits",
    async (server) => {
      const bridge = await loadMcpBridge({ servers: [server], catalogs: independentCatalogs });
      assert.deepEqual(
        bridge.tools.map(({ name }) => name),
        ["mcp__" + server.name + "__shared_tool"],
      );
      assert.isUndefined(bridge.handlers.get("before_agent_start"));
      assert.isTrue(bridge.transports.every(({ url }) => url === server.endpoint));
    },
  );

  it.each(["[]", "{}", "not-json", '[{"name":"t3-code"}]'])(
    "does not connect absent or malformed grants: %s",
    async (serverConfig) => {
      const bridge = await loadMcpBridge({ serverConfig });
      assert.equal(bridge.transports.length, 0);
      assert.equal(bridge.tools.length, 0);
      assert.isUndefined(bridge.handlers.get("before_agent_start"));
    },
  );

  it.each(["initialize", "tools/list"])(
    "retries only the unavailable endpoint after %s while preserving healthy clients",
    async (failMethod) => {
      const bridge = await loadMcpBridge({
        servers: independentServers,
        catalogs: independentCatalogs,
        failEndpointOnce: independentServers[1]!.endpoint,
        failMethod,
      });
      assert.equal(bridge.tools.length, 3);
      const closedFailed = bridge.transports.filter(({ method }) => method === "DELETE");
      assert.equal(closedFailed.length, failMethod === "tools/list" ? 1 : 0);
      if (closedFailed[0]) {
        assert.equal(closedFailed[0].url, independentServers[1]!.endpoint);
        assert.equal(closedFailed[0].sessionId, "session:" + independentServers[1]!.endpoint);
      }
      const healthyRequests = bridge.transports.filter(
        ({ url }) => url === independentServers[0]!.endpoint,
      ).length;
      await bridge.handlers.get("session_start")!(sessionEvent, sessionContext);
      assert.equal(bridge.tools.length, 4);
      assert.equal(
        bridge.transports.filter(({ url }) => url === independentServers[0]!.endpoint).length,
        healthyRequests,
      );
    },
  );

  it("aborts work and closes every session once even when one close fails", async () => {
    const bridge = await loadMcpBridge({
      servers: independentServers,
      catalogs: independentCatalogs,
      failCloseEndpoint: independentServers[0]!.endpoint,
      blockToolCalls: true,
    });
    const pending = bridge.tools[0]!.execute("pending-call", {}).then(
      () => "completed",
      () => "aborted",
    );
    const pendingSignal = bridge.transports.at(-1)!.signal;
    await bridge.handlers.get("session_shutdown")!(sessionEvent, sessionContext);
    assert.equal(await pending, "aborted");
    assert.isTrue(pendingSignal?.aborted);
    const deletes = bridge.transports.filter(({ method }) => method === "DELETE");
    assert.deepEqual(
      deletes.map(({ url }) => url).sort(),
      independentServers.map(({ endpoint }) => endpoint).sort(),
    );
    for (const server of independentServers) {
      const closed = deletes.find(({ url }) => url === server.endpoint)!;
      assert.equal(closed.authorization, server.authorizationHeader);
      assert.equal(closed.sessionId, "session:" + server.endpoint);
    }
    const count = bridge.transports.length;
    await bridge.handlers.get("session_shutdown")!(sessionEvent, sessionContext);
    await bridge.handlers.get("session_start")!(sessionEvent, sessionContext);
    assert.equal(bridge.transports.length, count);
    assert.equal(
      await bridge.tools[0]!.execute("closed-call", {}).then(
        () => "completed",
        () => "closed",
      ),
      "closed",
    );
    assert.equal(bridge.transports.length, count);
  });
});
