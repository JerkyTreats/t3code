import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  isProviderInstancePickerReady,
  isProviderInstancePickerVisible,
  resolveSelectableProviderInstance,
  getDefaultProviderInstanceModel,
  getConfiguredProviderInstanceDriver,
  getProviderInstanceInteractionModeToggle,
  resolveProviderDriverKindForInstanceSelection,
  resolveProviderDriverKindForTarget,
} from "./providerInstances";

function provider(input: {
  provider: ProviderDriverKind;
  instanceId: string;
  enabled?: boolean;
  availability?: ServerProvider["availability"];
  displayName?: string;
  status?: ServerProvider["status"];
  models?: ServerProvider["models"];
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: input.provider,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    enabled: input.enabled ?? true,
    installed: true,
    version: null,
    status: input.status ?? "ready",
    ...(input.availability ? { availability: input.availability } : {}),
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: input.models ?? [],
    slashCommands: [],
    skills: [],
  };
}

describe("isProviderInstancePickerReady", () => {
  it("rejects a disabled instance even while its last probe status is ready", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: "codex",
        enabled: false,
      }),
    ]);

    expect(entry?.status).toBe("ready");
    expect(entry && isProviderInstancePickerReady(entry)).toBe(false);
  });

  it("accepts an enabled, available, ready instance", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex" }),
    ]);

    expect(entry && isProviderInstancePickerReady(entry)).toBe(true);
  });
});

describe("getProviderInstanceInteractionModeToggle", () => {
  it("uses the exact custom instance instead of the driver default", () => {
    const entries = deriveProviderInstanceEntries([
      {
        ...provider({
          provider: ProviderDriverKind.make("codex"),
          instanceId: "codex",
        }),
        showInteractionModeToggle: true,
      },
      {
        ...provider({
          provider: ProviderDriverKind.make("codex"),
          instanceId: "codex_personal",
        }),
        showInteractionModeToggle: false,
      },
    ]);

    expect(
      getProviderInstanceInteractionModeToggle(
        entries.find((entry) => entry.instanceId === "codex_personal"),
      ),
    ).toBe(false);
  });
});

describe("isProviderInstancePickerVisible", () => {
  it("keeps enabled instances in the rail and removes disabled instances", () => {
    const [enabledEntry, disabledEntry] = deriveProviderInstanceEntries([
      provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex" }),
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claudeAgent",
        enabled: false,
      }),
    ]);

    expect(enabledEntry && isProviderInstancePickerVisible(enabledEntry)).toBe(true);
    expect(disabledEntry && isProviderInstancePickerVisible(disabledEntry)).toBe(false);
  });
});

describe("applyProviderInstanceSettings", () => {
  it("uses settings when a streamed snapshot still reports a disabled default as enabled", () => {
    const entries = deriveProviderInstanceEntries([
      provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex" }),
    ]);
    const [entry] = applyProviderInstanceSettings(entries, {
      providerInstances: {
        [ProviderInstanceId.make("codex")]: {
          driver: ProviderDriverKind.make("codex"),
          enabled: false,
        },
      },
      providers: {} as never,
    });

    expect(entry?.enabled).toBe(false);
  });

  it("treats a removed custom instance snapshot as disabled", () => {
    const entries = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claude_work",
      }),
    ]);
    const [entry] = applyProviderInstanceSettings(entries, {
      providerInstances: {},
      providers: {} as never,
    });

    expect(entry?.enabled).toBe(false);
  });
});

describe("deriveProviderInstanceEntries", () => {
  it("uses explicit instance id and driver kind from the snapshot", () => {
    const snapshot = provider({
      provider: ProviderDriverKind.make("codex"),
      instanceId: "codex_personal",
    });
    const [entry] = deriveProviderInstanceEntries([snapshot]);

    expect(entry?.instanceId).toBe("codex_personal");
    expect(entry?.driverKind).toBe("codex");
    expect(entry?.isDefault).toBe(false);
  });
});

describe("resolveSelectableProviderInstance", () => {
  it("returns the requested instance when it is enabled and available", () => {
    const requested = ProviderInstanceId.make("claude_work");
    const providers = [
      provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex" }),
      provider({ provider: ProviderDriverKind.make("claudeAgent"), instanceId: requested }),
    ];

    expect(resolveSelectableProviderInstance(providers, requested)).toBe(requested);
  });

  it("prefers a ready fallback over an earlier initializing instance", () => {
    const disabled = ProviderInstanceId.make("codex");
    const fallback = ProviderInstanceId.make("claudeAgent");
    const providers = [
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: disabled,
        enabled: false,
      }),
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: "codex_starting",
        status: "warning",
      }),
      provider({ provider: ProviderDriverKind.make("claudeAgent"), instanceId: fallback }),
    ];

    expect(resolveSelectableProviderInstance(providers, disabled)).toBe(fallback);
  });

  it("does not return disabled, unavailable, or unknown instances when none are sendable", () => {
    const disabled = ProviderInstanceId.make("codex");
    const unavailable = ProviderInstanceId.make("claudeAgent");
    const unknown = ProviderInstanceId.make("removed_instance");
    const providers = [
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: disabled,
        enabled: false,
      }),
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: unavailable,
        availability: "unavailable",
      }),
    ];

    expect(resolveSelectableProviderInstance(providers, disabled)).toBeUndefined();
    expect(resolveSelectableProviderInstance(providers, unavailable)).toBeUndefined();
    expect(resolveSelectableProviderInstance(providers, unknown)).toBeUndefined();
  });

  it("does not invent a fallback when only errored instances remain", () => {
    const errored = ProviderInstanceId.make("codex");
    const providers = [
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: errored,
        status: "error",
      }),
    ];

    expect(resolveSelectableProviderInstance(providers, undefined)).toBeUndefined();
    expect(resolveSelectableProviderInstance(providers, errored)).toBe(errored);
  });
});

describe("getDefaultProviderInstanceModel", () => {
  it("uses the default declared by the exact instance", () => {
    const [entry] = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("codex"),
        instanceId: "codex",
        models: [
          { slug: "first", name: "First", isCustom: false, capabilities: null },
          {
            slug: "preferred",
            name: "Preferred",
            isCustom: false,
            capabilities: null,
            isDefault: true,
          },
        ],
      }),
    ]);

    expect(entry && getDefaultProviderInstanceModel(entry)?.slug).toBe("preferred");
  });
});

describe("getConfiguredProviderInstanceDriver", () => {
  it("recognizes a legacy built-in target before snapshots arrive", () => {
    expect(
      getConfiguredProviderInstanceDriver(
        {
          providerInstances: {},
          providers: {
            codex: { enabled: true },
          } as never,
        },
        ProviderInstanceId.make("codex"),
      ),
    ).toBe("codex");
  });

  it("does not recognize a disabled explicit instance", () => {
    expect(
      getConfiguredProviderInstanceDriver(
        {
          providerInstances: {
            [ProviderInstanceId.make("claude_work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
              enabled: false,
            },
          },
          providers: {} as never,
        },
        ProviderInstanceId.make("claude_work"),
      ),
    ).toBeUndefined();
  });
});

describe("resolveProviderDriverKindForInstanceSelection", () => {
  it("maps custom provider instance ids back to their driver kind", () => {
    const providers = [
      provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex" }),
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claude_openrouter",
        displayName: "Claude OpenRouter",
      }),
    ];
    const entries = deriveProviderInstanceEntries(providers);

    expect(
      resolveProviderDriverKindForInstanceSelection(
        entries,
        providers,
        ProviderInstanceId.make("claude_openrouter"),
      ),
    ).toBe("claudeAgent");
  });

  it("does not guess a provider kind when the instance selection is unknown", () => {
    const providers = [
      provider({ provider: ProviderDriverKind.make("codex"), instanceId: "codex", enabled: false }),
      provider({ provider: ProviderDriverKind.make("claudeAgent"), instanceId: "claudeAgent" }),
    ];
    const entries = deriveProviderInstanceEntries(providers);

    expect(
      resolveProviderDriverKindForInstanceSelection(
        entries,
        providers,
        ProviderInstanceId.make("removed_instance"),
      ),
    ).toBeUndefined();
  });
});

describe("resolveProviderDriverKindForTarget", () => {
  it("uses the final fallback instance driver instead of the rejected target driver", () => {
    const entries = deriveProviderInstanceEntries([
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claudeAgent",
      }),
    ]);

    expect(
      resolveProviderDriverKindForTarget(
        entries,
        {
          providerInstances: {},
          providers: {} as never,
        },
        ProviderInstanceId.make("claudeAgent"),
        ProviderDriverKind.make("codex"),
      ),
    ).toBe("claudeAgent");
  });

  it("uses configured instance identity before snapshot hydration", () => {
    expect(
      resolveProviderDriverKindForTarget(
        [],
        {
          providerInstances: {
            [ProviderInstanceId.make("claude_work")]: {
              driver: ProviderDriverKind.make("claudeAgent"),
            },
          },
          providers: {} as never,
        },
        ProviderInstanceId.make("claude_work"),
        ProviderDriverKind.make("codex"),
      ),
    ).toBe("claudeAgent");
  });
});
