import { describe, expect, it } from "vitest";
import type { ServerProvider } from "@t3tools/contracts";

import {
  deriveProviderInstanceEntries,
  getProviderInstanceEntry,
  resolveSelectableProviderInstance,
} from "./providerInstances";

function createProvider(
  provider: ServerProvider["provider"],
  overrides: Partial<ServerProvider> = {},
): ServerProvider {
  return {
    provider,
    enabled: true,
    installed: true,
    version: "1.0.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-05-12T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...overrides,
  };
}

describe("providerInstances compatibility shim", () => {
  it("projects each provider as a default instance entry", () => {
    const entries = deriveProviderInstanceEntries([
      createProvider("codex", { displayName: "Codex Stable" }),
      createProvider("cursor"),
    ]);

    expect(entries).toEqual([
      expect.objectContaining({
        instanceId: "codex",
        driverKind: "codex",
        displayName: "Codex Stable",
        isDefault: true,
      }),
      expect.objectContaining({
        instanceId: "cursor",
        driverKind: "cursor",
        displayName: "Cursor",
        isDefault: true,
      }),
    ]);
  });

  it("falls back to the first enabled provider instance", () => {
    const providers = [createProvider("codex", { enabled: false }), createProvider("claudeAgent")];

    expect(getProviderInstanceEntry(providers, "claudeAgent")?.instanceId).toBe("claudeAgent");
    expect(resolveSelectableProviderInstance(providers, "codex")).toBe("claudeAgent");
    expect(resolveSelectableProviderInstance(providers, undefined)).toBe("claudeAgent");
  });
});
