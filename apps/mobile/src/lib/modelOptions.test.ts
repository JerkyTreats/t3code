import { describe, expect, it } from "vite-plus/test";

import { ProviderInstanceId, type ServerConfig } from "@t3tools/contracts";

import { buildModelOptions } from "./modelOptions";

describe("mobile model options", () => {
  it("keeps models from same-driver provider instances scoped by exact instance id", () => {
    const config = {
      providers: [
        {
          instanceId: "codex-personal",
          driver: "codex",
          displayName: "Codex Personal",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "gpt-test",
              name: "GPT Test",
              isCustom: false,
              capabilities: null,
            },
          ],
        },
        {
          instanceId: "codex-work",
          driver: "codex",
          displayName: "Codex Work",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "gpt-test",
              name: "GPT Test",
              isCustom: false,
              isDefault: true,
              capabilities: null,
            },
          ],
        },
      ],
    } as unknown as ServerConfig;

    expect(
      buildModelOptions(config, {
        instanceId: ProviderInstanceId.make("codex-work"),
        model: "gpt-test",
      }),
    ).toMatchObject([
      {
        key: "codex-personal:gpt-test",
        providerKey: "codex-personal",
        selection: {
          instanceId: "codex-personal",
          model: "gpt-test",
        },
      },
      {
        key: "codex-work:gpt-test",
        providerKey: "codex-work",
        selection: {
          instanceId: "codex-work",
          model: "gpt-test",
        },
      },
    ]);
  });

  it("normalizes a legacy fallback selection against current capabilities", () => {
    const config = {
      providers: [
        {
          instanceId: "codex",
          driver: "codex",
          displayName: "Codex",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "gpt-test",
              name: "GPT Test",
              isCustom: false,
              capabilities: {
                optionDescriptors: [
                  {
                    id: "serviceTier",
                    label: "Service Tier",
                    type: "select",
                    options: [
                      { id: "default", label: "Standard", isDefault: true },
                      { id: "priority", label: "Fast" },
                    ],
                    currentValue: "default",
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as ServerConfig;

    const [option] = buildModelOptions(config, {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-test",
      options: [{ id: "fastMode", value: true }],
    });

    expect(option?.capabilities?.optionDescriptors?.[0]?.id).toBe("serviceTier");
    expect(option?.selection.options).toEqual([{ id: "serviceTier", value: "default" }]);
  });
});
