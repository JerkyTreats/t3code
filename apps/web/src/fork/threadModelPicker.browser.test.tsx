import {
  ANTIGRAVITY_DEFAULT_MODEL,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
// Rehomed from the deleted upstream host test: Thread model identity (F27-D1).
import { describe, expect, it } from "vite-plus/test";

import "~/index.css";

import { render } from "../../test/render";

import { deriveProviderInstanceEntries } from "../providerInstances";
import { ProviderModelPicker } from "../components/chat/ProviderModelPicker";
import type { ModelEsque } from "../components/chat/providerIconUtils";

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
  return render(
    <ProviderModelPicker
      environmentId={null}
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

describe("Thread model picker identity", () => {
  it("shows the exact selected identifier rather than a shortened catalog name in Thread", async () => {
    await using screen = await renderPicker({
      instanceId: "codex",
      driver: "codex",
      model: "model-2.4-light",
      options: [{ slug: "model-2.4-light", name: "Light" }],
      labelMode: "identifier",
    });
    await expect
      .element(screen.getByRole("button", { name: "Model: model-2.4-light" }))
      .toHaveTextContent("model-2.4-light");
  });
  it("does not replace a selected identifier with an unrelated catalog fallback", async () => {
    await using screen = await renderPicker({
      instanceId: "codex",
      driver: "codex",
      model: "custom-version",
      options: [{ slug: "other-version", name: "Other" }],
      labelMode: "identifier",
    });
    await expect.element(screen.getByText("custom-version", { exact: true })).toBeVisible();
  });
  it("resolves an account default marker to its concrete identifier", async () => {
    await using screen = await renderPicker({
      instanceId: "google",
      driver: "antigravity",
      model: ANTIGRAVITY_DEFAULT_MODEL,
      options: [{ slug: "model-account-version", name: "Account default", isDefault: true }],
      labelMode: "identifier",
    });
    await expect.element(screen.getByText("model-account-version", { exact: true })).toBeVisible();
    expect(screen.container.innerHTML).not.toContain(ANTIGRAVITY_DEFAULT_MODEL);
  });
});
