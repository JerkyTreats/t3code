import type { ProviderDriverKind, ProviderInteractionMode } from "@t3tools/contracts";

import type { McpCapability } from "../mcp/McpInvocationContext.ts";
import { resolveBoardInteractionPolicy } from "./InteractionPolicy.ts";

const BOARD_PROVIDER_KINDS: ReadonlySet<string> = new Set([
  "codex",
  "claudeAgent",
  "cursor",
  "grok",
  "opencode",
]);

/** Driver kinds select capability; user-defined instance IDs never grant it. */
export function resolveProviderMcpCapabilities(input: {
  readonly provider: ProviderDriverKind;
  readonly interactionMode?: ProviderInteractionMode | undefined;
  readonly previewEnabled: boolean;
}): ReadonlySet<McpCapability> {
  const capabilities = new Set<McpCapability>();
  if (BOARD_PROVIDER_KINDS.has(input.provider)) {
    capabilities.add("board");
    if (resolveBoardInteractionPolicy(input.interactionMode).boardWriteEnabled) {
      capabilities.add("board-write");
    }
  }
  if (input.previewEnabled) capabilities.add("preview");
  return capabilities;
}
