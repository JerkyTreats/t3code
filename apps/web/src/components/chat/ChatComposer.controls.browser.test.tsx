import { RuntimeRequestId } from "@t3tools/contracts";
import { createElement, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { props } from "../../../test/fixtures/chatComposer";

// Mounted-host evidence for the fork's composer controls: T3 Thread presentation (F27-D1)
// and the floating runtime lock (CHAT.D1).
const mocks = vi.hoisted(() => ({
  picker: null as null | { onInstanceModelChange: (instanceId: never, model: string) => void },
}));
vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
}));
vi.mock(import("../../lib/openPullRequestLink"), async (original) => ({
  ...(await original()),
  useOpenPrLink: () => () => false,
}));
vi.mock(import("../../hooks/useMediaQuery"), async (original) => ({
  ...(await original()),
  useMediaQuery: () => false,
}));
vi.mock(import("../ComposerPromptEditorTiptap"), async (original) => ({
  ...(await original()),
  ComposerPromptEditorTiptap: (() => null) as never,
}));
vi.mock(import("./ProviderModelPicker"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    ProviderModelPicker: ((pickerProps: ComponentProps<typeof actual.ProviderModelPicker>) => {
      mocks.picker = pickerProps as never;
      return createElement(actual.ProviderModelPicker, pickerProps);
    }) as typeof actual.ProviderModelPicker,
  };
});

import { ChatComposer } from "./ChatComposer";
import { useComposerDraftStore } from "../../composerDraftStore";

const initialStore = useComposerDraftStore.getState();

function setup() {
  useComposerDraftStore.setState(initialStore, true);
  mocks.picker = null;
  return {
    [Symbol.dispose]() {
      vi.restoreAllMocks();
    },
  };
}

// A desktop-width host, so the expanded footer is not compact.
function wide() {
  const container = document.createElement("div");
  container.style.width = "900px";
  return { container };
}

// The lock floats once the composer has measured its footer.
async function floatingRuntime(container: HTMLElement) {
  await expect
    .poll(() => container.querySelector("[data-chat-composer-floating-runtime='true']"))
    .not.toBeNull();
  return container.querySelector<HTMLElement>("[data-chat-composer-floating-runtime='true']")!;
}

describe("Thread composer controls integration", () => {
  it("uses the existing selected model and permission handler with Thread presentation", async () => {
    using _fixture = setup();
    const input = props({ threadClient: true });
    await using screen = await render(<ChatComposer {...input} />);
    await expect.element(screen.getByRole("button", { name: "Model: test" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Permissions: Full access" }))
      .toBeVisible();
    const instanceId = input.providerStatuses[0]!.instanceId;
    await act(() => mocks.picker!.onInstanceModelChange(instanceId as never, "test"));
    expect(input.onProviderModelSelect).toHaveBeenCalledWith(instanceId, "test");
  });

  it("keeps ordinary chat's model display mode", async () => {
    using _fixture = setup();
    await using screen = await render(<ChatComposer {...props()} />);
    await expect
      .element(screen.getByRole("button", { name: "Permissions: Full access" }))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "Model: test" }).query()).toBeNull();
    expect(screen.container.textContent).toContain("Test");
  });
});

describe("ChatComposer floating runtime control", () => {
  it("places the unchanged runtime choices in the floating lock control", async () => {
    using _fixture = setup();
    const input = props();
    await using screen = await render(<ChatComposer {...input} />, wide());
    const floating = await floatingRuntime(screen.container);
    expect(floating.className).toContain("-top-4");
    expect(
      screen.container.querySelector("[data-chat-composer-main-surface='true']")?.className ?? "",
    ).toContain("rounded-2xl");
    const trigger = screen.getByRole("button", { name: "Permissions: Full access" });
    expect(floating.contains(trigger.element())).toBe(true);
    await trigger.click();
    await page.getByRole("menuitemradio", { name: "Supervised" }).click();
    expect(input.handleRuntimeModeChange).toHaveBeenCalledWith("approval-required");
  });

  it("leaves runtime mode out of the model picker footer while the lock floats", async () => {
    using _fixture = setup();
    await using screen = await render(<ChatComposer {...props()} />, wide());
    await floatingRuntime(screen.container);
    await userEvent.click(
      screen.container.querySelector<HTMLElement>("[data-chat-provider-model-picker]")!,
    );
    await expect.poll(() => document.querySelector("[data-model-picker-effort]")).not.toBeNull();
    expect(document.querySelector("[data-composer-permissions-trigger]")).toBeNull();
    expect(document.querySelectorAll('[aria-label^="Permissions:"]')).toHaveLength(1);
  });

  it("keeps the runtime control in the footer while an approval is pending", async () => {
    using _fixture = setup();
    const approval = {
      requestId: RuntimeRequestId.make("synthetic-approval"),
      requestKind: "command" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      responseCapability: "live" as const,
    };
    await using screen = await render(
      <ChatComposer
        {...props({ activePendingApproval: approval, pendingApprovals: [approval] })}
      />,
    );
    await expect
      .element(screen.getByRole("button", { name: "Permissions: Full access" }))
      .toBeInTheDocument();
    expect(screen.container.querySelector("[data-chat-composer-floating-runtime]")).toBeNull();
  });
});
