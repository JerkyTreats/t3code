import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveProviderMcpCapabilities } from "./ProviderCapabilityPolicy.ts";

describe("provider MCP capability admission", () => {
  it.each(["codex", "claudeAgent", "cursor", "grok", "opencode"])(
    "admits %s Board independently of preview and reduces writes in Plan mode",
    (kind) => {
      const provider = ProviderDriverKind.make(kind);
      expect(resolveProviderMcpCapabilities({ provider, previewEnabled: false })).toEqual(
        new Set(["board", "board-write"]),
      );
      expect(
        resolveProviderMcpCapabilities({
          provider,
          interactionMode: "plan",
          previewEnabled: false,
        }),
      ).toEqual(new Set(["board"]));
      expect(
        resolveProviderMcpCapabilities({
          provider,
          interactionMode: "default",
          previewEnabled: true,
        }),
      ).toEqual(new Set(["board", "board-write", "preview"]));
      expect(
        resolveProviderMcpCapabilities({ provider, interactionMode: "plan", previewEnabled: true }),
      ).toEqual(new Set(["board", "preview"]));
    },
  );

  it.each(["antigravity", "future_driver", "codex_personal", "Codex"])(
    "does not infer Board support for %s",
    (kind) => {
      const provider = ProviderDriverKind.make(kind);
      for (const interactionMode of [undefined, "default", "plan"] as const) {
        expect(
          resolveProviderMcpCapabilities({ provider, interactionMode, previewEnabled: true }),
        ).toEqual(new Set(["preview"]));
        expect(
          resolveProviderMcpCapabilities({ provider, interactionMode, previewEnabled: false }),
        ).toEqual(new Set());
      }
    },
  );
});
