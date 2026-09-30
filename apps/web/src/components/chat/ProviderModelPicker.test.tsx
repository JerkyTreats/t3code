import {
  ANTIGRAVITY_DEFAULT_MODEL,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { deriveProviderInstanceEntries } from "../../providerInstances";
import { ProviderModelPicker } from "./ProviderModelPicker";
import type { ModelEsque } from "./providerIconUtils";

function providerEntry(instanceId: string, driver: string) {
  const provider: ServerProvider = {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make(driver),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-28T00:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
  };
  return deriveProviderInstanceEntries([provider])[0]!;
}

function renderPicker(input: {
  instanceId: string;
  driver: string;
  model: string;
  options: ReadonlyArray<ModelEsque>;
  includeEntry?: boolean;
  labelMode?: "display" | "identifier";
  triggerLabel?: string;
}) {
  const instanceId = ProviderInstanceId.make(input.instanceId);
  const entry = providerEntry(input.instanceId, input.driver);
  return renderToStaticMarkup(
    <ProviderModelPicker
      activeInstanceId={instanceId}
      model={input.model}
      {...(input.labelMode ? { labelMode: input.labelMode } : {})}
      lockedProvider={null}
      instanceEntries={input.includeEntry === false ? [] : [entry]}
      modelOptionsByInstance={new Map([[instanceId, input.options]])}
      onInstanceModelChange={() => {}}
      {...(input.triggerLabel ? { triggerLabel: input.triggerLabel } : {})}
    />,
  );
}

describe("ProviderModelPicker", () => {
  it("shows the exact selected identifier rather than a shortened catalog name in Thread", () => {
    const markup = renderPicker({
      instanceId: "codex",
      driver: "codex",
      model: "model-2.4-light",
      options: [{ slug: "model-2.4-light", name: "Light" }],
      labelMode: "identifier",
    });
    expect(markup).toContain('aria-label="Model: model-2.4-light"');
    expect(markup).toContain(">model-2.4-light<");
  });
  it("does not replace a selected identifier with an unrelated catalog fallback", () => {
    const markup = renderPicker({
      instanceId: "codex",
      driver: "codex",
      model: "custom-version",
      options: [{ slug: "other-version", name: "Other" }],
      labelMode: "identifier",
    });
    expect(markup).toContain(">custom-version<");
  });
  it("resolves an account default marker to its concrete identifier", () => {
    const markup = renderPicker({
      instanceId: "google",
      driver: "antigravity",
      model: ANTIGRAVITY_DEFAULT_MODEL,
      options: [{ slug: "model-account-version", name: "Account default", isDefault: true }],
      labelMode: "identifier",
    });
    expect(markup).toContain(">model-account-version<");
    expect(markup).not.toContain(ANTIGRAVITY_DEFAULT_MODEL);
  });
  it("shows a neutral aggregate value without a representative model or availability badge", () => {
    const markup = renderPicker({
      instanceId: "codex_personal",
      driver: "codex",
      model: "gpt-5",
      options: [{ slug: "gpt-5", name: "GPT 5", isUnavailable: true }],
      triggerLabel: "Mixed values",
    });
    expect(markup).toContain("Mixed values");
    expect(markup).not.toContain("GPT 5");
    expect(markup).not.toContain("Unavailable");
  });

  it.each(["", ANTIGRAVITY_DEFAULT_MODEL])(
    "shows a choice prompt before Antigravity has an account catalog for %s",
    (model) => {
      const markup = renderPicker({
        instanceId: "antigravity",
        driver: "antigravity",
        model,
        options: [],
      });

      expect(markup).toContain("Choose model");
      expect(markup).not.toContain(ANTIGRAVITY_DEFAULT_MODEL);
    },
  );

  it.each([{ aliases: [ANTIGRAVITY_DEFAULT_MODEL] }, { isDefault: true }])(
    "shows the actual default model for an Antigravity marker with %j",
    (defaultMetadata) => {
      const markup = renderPicker({
        instanceId: "google_work",
        driver: "antigravity",
        model: ANTIGRAVITY_DEFAULT_MODEL,
        options: [
          { slug: "gemini-fast", name: "Gemini Fast" },
          { slug: "gemini-pro", name: "Gemini Pro", ...defaultMetadata },
        ],
      });

      expect(markup).toContain("Gemini Pro");
      expect(markup).not.toContain("Gemini Fast");
      expect(markup).not.toContain(ANTIGRAVITY_DEFAULT_MODEL);
    },
  );

  it.each(["opencode", "antigravity"])(
    "keeps the selected model label when the %s account catalog does not contain it",
    (driver) => {
      const markup = renderPicker({
        instanceId: "team_runtime",
        driver,
        model: "missing-model",
        options: [{ slug: "fallback", name: "Fallback model" }],
      });

      expect(markup).toContain("missing-model");
      expect(markup).not.toContain("Fallback model");
    },
  );

  it.each(["codex", "claudeAgent", "cursor", "grok"])(
    "uses the first option label for a missing %s model",
    (driver) => {
      const markup = renderPicker({
        instanceId: `${driver}_work`,
        driver,
        model: "missing-model",
        options: [{ slug: "fallback-model", name: "Fallback model" }],
      });

      expect(markup).toContain("Fallback model");
      expect(markup).not.toContain(">missing-model<");
    },
  );

  it("prefers a matching model for OpenCode", () => {
    const markup = renderPicker({
      instanceId: "custom_runtime",
      driver: "opencode",
      model: "openrouter/selected",
      options: [
        { slug: "openrouter/fallback", name: "Fallback model" },
        { slug: "openrouter/selected", name: "Selected model" },
      ],
    });

    expect(markup).toContain("Selected model");
    expect(markup).not.toContain("Fallback model");
  });

  it("uses the first option when the active instance entry is missing", () => {
    const markup = renderPicker({
      instanceId: "missing_instance",
      driver: "opencode",
      model: "missing-model",
      options: [{ slug: "fallback-model", name: "Fallback model" }],
      includeEntry: false,
    });

    expect(markup).toContain("Fallback model");
    expect(markup).not.toContain(">missing-model<");
  });

  it("keeps instance initials visible in the resting trigger", () => {
    const activeEntry = providerEntry("codex_personal", "codex");
    const markup = renderToStaticMarkup(
      <ProviderModelPicker
        activeInstanceId={activeEntry.instanceId}
        model="gpt-5"
        lockedProvider={null}
        instanceEntries={[providerEntry("codex", "codex"), activeEntry]}
        modelOptionsByInstance={new Map()}
        size="xs"
        onInstanceModelChange={() => {}}
      />,
    );

    expect(markup).toContain(">CP</span>");
  });
});
