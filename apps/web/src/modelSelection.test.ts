import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS, type UnifiedSettings } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";
import { deriveProviderInstanceEntries } from "./providerInstances";
import {
  getAppModelOptionsForInstance,
  isAppModelSelectionUnavailableForInstance,
  resolveAppModelSelectionForInstance,
  resolveAppModelSelectionState,
} from "./modelSelection";

function provider(input: {
  provider?: ProviderDriverKind;
  instanceId: string;
  models?: ReadonlyArray<string>;
}): ServerProvider {
  const driver =
    input.provider ??
    (input.instanceId.startsWith("claude_")
      ? ProviderDriverKind.make("claudeAgent")
      : ProviderDriverKind.make("codex"));
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver,
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: (input.models ?? []).map((slug) => ({
      slug,
      name: slug,
      isCustom: false,
      capabilities: {},
    })),
    slashCommands: [],
    skills: [],
  };
}

function settingsWithProviderInstances(): UnifiedSettings {
  return {
    ...DEFAULT_UNIFIED_SETTINGS,
    providerInstances: {
      [ProviderInstanceId.make("claudeAgent")]: {
        driver: ProviderDriverKind.make("claudeAgent"),
        config: { customModels: [] },
      },
      [ProviderInstanceId.make("claude_openrouter")]: {
        driver: ProviderDriverKind.make("claudeAgent"),
        config: { customModels: ["openai/gpt-5.5"] },
      },
    },
  };
}

describe("instance-scoped model selection", () => {
  it("keeps custom models on the provider instance that declared them", () => {
    const providers = [
      provider({
        instanceId: "claudeAgent",
        models: ["claude-sonnet-4-6"],
      }),
      provider({
        instanceId: "claude_openrouter",
        models: ["claude-sonnet-4-6"],
      }),
    ];
    const entries = deriveProviderInstanceEntries(providers);
    const stock = entries.find((entry) => entry.instanceId === "claudeAgent")!;
    const openrouter = entries.find((entry) => entry.instanceId === "claude_openrouter")!;

    expect(
      getAppModelOptionsForInstance(settingsWithProviderInstances(), stock).map(
        (option) => option.slug,
      ),
    ).not.toContain("openai/gpt-5.5");
    expect(
      getAppModelOptionsForInstance(settingsWithProviderInstances(), openrouter).map(
        (option) => option.slug,
      ),
    ).toContain("openai/gpt-5.5");
  });

  it("resolves a custom slug against the selected custom instance", () => {
    const providers = [
      provider({ provider: ProviderDriverKind.make("claudeAgent"), instanceId: "claudeAgent" }),
      provider({
        provider: ProviderDriverKind.make("claudeAgent"),
        instanceId: "claude_openrouter",
      }),
    ];

    expect(
      resolveAppModelSelectionForInstance(
        ProviderInstanceId.make("claude_openrouter"),
        settingsWithProviderInstances(),
        providers,
        "openai/gpt-5.5",
      ),
    ).toBe("openai/gpt-5.5");
  });

  it("preserves an explicit model until the exact instance snapshot is ready", () => {
    const instanceId = ProviderInstanceId.make("claude_openrouter");
    const explicitModel = "openai/gpt-5.5";

    expect(
      resolveAppModelSelectionForInstance(
        instanceId,
        settingsWithProviderInstances(),
        [provider({ instanceId: "codex", models: ["gpt-5.6-codex"] })],
        explicitModel,
      ),
    ).toBe(explicitModel);

    expect(
      resolveAppModelSelectionForInstance(
        instanceId,
        settingsWithProviderInstances(),
        [
          {
            ...provider({ instanceId, models: ["unrelated-error-model"] }),
            status: "error",
          },
        ],
        explicitModel,
      ),
    ).toBe(explicitModel);
  });

  it("includes Grok custom models from the selected provider instance", () => {
    const providers = [provider({ provider: ProviderDriverKind.make("grok"), instanceId: "grok" })];
    const settings: UnifiedSettings = {
      ...settingsWithProviderInstances(),
      providerInstances: {
        ...settingsWithProviderInstances().providerInstances,
        [ProviderInstanceId.make("grok")]: {
          driver: ProviderDriverKind.make("grok"),
          config: { customModels: ["grok-test-custom-model"] },
        },
      },
    };
    const grok = deriveProviderInstanceEntries(providers).find(
      (entry) => entry.instanceId === "grok",
    )!;

    expect(getAppModelOptionsForInstance(settings, grok).map((option) => option.slug)).toContain(
      "grok-test-custom-model",
    );
  });

  it("does not inject an unknown selected slug into the stock instance list", () => {
    const providers = [
      provider({
        instanceId: "claudeAgent",
        models: ["claude-sonnet-4-6"],
      }),
      provider({
        instanceId: "claude_openrouter",
        models: ["claude-sonnet-4-6"],
      }),
    ];
    const stock = deriveProviderInstanceEntries(providers).find(
      (entry) => entry.instanceId === "claudeAgent",
    )!;

    expect(
      getAppModelOptionsForInstance(settingsWithProviderInstances(), stock).map(
        (option) => option.slug,
      ),
    ).not.toContain("openai/gpt-5.5");
  });

  it("hides server models from the instance option list", () => {
    const providers = [
      provider({
        instanceId: "claudeAgent",
        models: ["claude-opus-4-6", "claude-sonnet-4-6"],
      }),
    ];
    const settings: UnifiedSettings = {
      ...settingsWithProviderInstances(),
      providerModelPreferences: {
        [ProviderInstanceId.make("claudeAgent")]: {
          hiddenModels: ["claude-opus-4-6"],
          modelOrder: [],
        },
      },
    };
    const stock = deriveProviderInstanceEntries(providers).find(
      (entry) => entry.instanceId === "claudeAgent",
    )!;

    expect(getAppModelOptionsForInstance(settings, stock).map((option) => option.slug)).toEqual([
      "claude-sonnet-4-6",
    ]);
  });

  it("applies persisted per-instance model ordering", () => {
    const providers = [
      provider({
        instanceId: "claudeAgent",
        models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
      }),
    ];
    const settings: UnifiedSettings = {
      ...settingsWithProviderInstances(),
      providerModelPreferences: {
        [ProviderInstanceId.make("claudeAgent")]: {
          hiddenModels: [],
          modelOrder: ["claude-haiku-4-5", "claude-opus-4-6"],
        },
      },
    };
    const stock = deriveProviderInstanceEntries(providers).find(
      (entry) => entry.instanceId === "claudeAgent",
    )!;

    expect(getAppModelOptionsForInstance(settings, stock).map((option) => option.slug)).toEqual([
      "claude-haiku-4-5",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
    ]);
  });

  it("falls back when the selected model is hidden", () => {
    const providers = [
      provider({
        instanceId: "claudeAgent",
        models: ["claude-opus-4-6", "claude-sonnet-4-6"],
      }),
    ];
    const settings: UnifiedSettings = {
      ...settingsWithProviderInstances(),
      providerModelPreferences: {
        [ProviderInstanceId.make("claudeAgent")]: {
          hiddenModels: ["claude-opus-4-6"],
          modelOrder: [],
        },
      },
    };

    expect(
      resolveAppModelSelectionForInstance(
        ProviderInstanceId.make("claudeAgent"),
        settings,
        providers,
        "claude-opus-4-6",
      ),
    ).toBe("claude-sonnet-4-6");
  });

  it("falls back instead of resolving a custom slug against the wrong instance", () => {
    const providers = [
      provider({
        instanceId: "claudeAgent",
        models: ["claude-sonnet-4-6"],
      }),
      provider({
        instanceId: "claude_openrouter",
        models: ["claude-sonnet-4-6"],
      }),
    ];

    expect(
      resolveAppModelSelectionForInstance(
        ProviderInstanceId.make("claudeAgent"),
        settingsWithProviderInstances(),
        providers,
        "openai/gpt-5.5",
      ),
    ).toBe("claude-sonnet-4-6");
  });

  it("preserves custom provider instances in settings model selection", () => {
    const providers = [
      provider({
        instanceId: "claudeAgent",
        models: ["claude-sonnet-4-6"],
      }),
      provider({
        instanceId: "claude_openrouter",
        models: ["claude-sonnet-4-6"],
      }),
    ];
    const settings: UnifiedSettings = {
      ...settingsWithProviderInstances(),
      textGenerationModelSelection: {
        instanceId: ProviderInstanceId.make("claude_openrouter"),
        model: "openai/gpt-5.5",
      },
    };

    expect(resolveAppModelSelectionState(settings, providers)).toEqual({
      instanceId: ProviderInstanceId.make("claude_openrouter"),
      model: "openai/gpt-5.5",
    });
  });

  it("does not borrow or invent a model for an empty custom instance", () => {
    const providers = [
      provider({
        instanceId: "claudeAgent",
        models: ["claude-sonnet-4-6"],
      }),
      provider({
        instanceId: "claude_empty",
        models: [],
      }),
    ];
    const settings: UnifiedSettings = {
      ...settingsWithProviderInstances(),
      providerInstances: {
        ...settingsWithProviderInstances().providerInstances,
        [ProviderInstanceId.make("claude_empty")]: {
          driver: ProviderDriverKind.make("claudeAgent"),
          config: { customModels: [] },
        },
      },
      textGenerationModelSelection: {
        instanceId: ProviderInstanceId.make("claude_empty"),
        model: "removed-model",
      },
    };

    expect(resolveAppModelSelectionState(settings, providers)).toEqual(
      settings.textGenerationModelSelection,
    );
    expect(
      isAppModelSelectionUnavailableForInstance(
        ProviderInstanceId.make("claude_empty"),
        settings,
        providers,
        "removed-model",
      ),
    ).toBe(true);
  });

  it("marks a removed exact model unavailable before applying a ready default", () => {
    const instanceId = ProviderInstanceId.make("codex_personal");
    const providers = [provider({ instanceId, models: ["current-model"] })];
    const settings = settingsWithProviderInstances();

    expect(
      isAppModelSelectionUnavailableForInstance(instanceId, settings, providers, "removed-model"),
    ).toBe(true);
    expect(
      isAppModelSelectionUnavailableForInstance(instanceId, settings, providers, "current-model"),
    ).toBe(false);
  });

  it("preserves explicit custom intent through disconnect and late snapshot hydration", () => {
    const instanceId = ProviderInstanceId.make("claude_openrouter");
    const settings: UnifiedSettings = {
      ...settingsWithProviderInstances(),
      textGenerationModelSelection: {
        instanceId,
        model: "openai/gpt-5.5",
      },
    };
    const disconnected = resolveAppModelSelectionState(settings, []);
    const transientError = resolveAppModelSelectionState(settings, [
      {
        ...provider({ instanceId, models: [] }),
        status: "error",
      },
    ]);
    const hydrated = resolveAppModelSelectionState(settings, [
      provider({ instanceId, models: ["openai/gpt-5.5"] }),
    ]);

    expect(disconnected).toEqual({ instanceId, model: "openai/gpt-5.5" });
    expect(transientError).toEqual({ instanceId, model: "openai/gpt-5.5" });
    expect(hydrated).toEqual({ instanceId, model: "openai/gpt-5.5" });
  });

  it("preserves a built-in target before its snapshot arrives", () => {
    const selection = {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6-codex",
    };
    const settings: UnifiedSettings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      providerInstances: {},
      textGenerationModelSelection: selection,
    };

    expect(resolveAppModelSelectionState(settings, [])).toEqual(selection);
  });

  it("does not reaccept a known unavailable custom instance from settings", () => {
    const selection = {
      instanceId: ProviderInstanceId.make("claude_openrouter"),
      model: "openai/gpt-5.5",
    };
    const settings: UnifiedSettings = {
      ...settingsWithProviderInstances(),
      textGenerationModelSelection: selection,
    };
    const unavailable = {
      ...provider({ instanceId: "claude_openrouter", models: ["openai/gpt-5.5"] }),
      availability: "unavailable" as const,
    };

    expect(resolveAppModelSelectionState(settings, [unavailable])).toEqual(selection);
  });

  it("preserves a removed selection without inventing a dispatch target", () => {
    expect(
      resolveAppModelSelectionState(
        {
          ...settingsWithProviderInstances(),
          providerInstances: {},
          textGenerationModelSelection: {
            instanceId: ProviderInstanceId.make("removed"),
            model: "removed-model",
          },
        },
        [],
      ),
    ).toEqual({
      instanceId: ProviderInstanceId.make("removed"),
      model: "removed-model",
    });
  });
});
