import { RuntimeRequestId } from "@t3tools/contracts";
import { createElement, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { environmentId, props, target, threadId } from "../../../test/fixtures/chatComposer";

// Mounted-host evidence for the fork's composer controls: T3 Thread presentation (F27-D1),
// the floating runtime lock (CHAT.D1) and the Poteto Mode toggle (F30-D6, F30-D8).
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
vi.mock(import("../ComposerPromptEditor"), async (original) => ({
  ...(await original()),
  ComposerPromptEditor: (() => null) as never,
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
import { potetoModeScope } from "../../fork/potetoMode";
import { PotetoModeControl } from "../../fork/PotetoModeControl";
import { usePotetoModeStore } from "../../fork/potetoModeStore";

const initialStore = useComposerDraftStore.getState();
const skill = { name: "poteto-mode", path: "/fixture/skills/poteto-mode/SKILL.md", enabled: true };
const unavailableSkill = "Poteto Mode skill is unavailable. Restore the skill or turn it off.";

function setup() {
  useComposerDraftStore.setState(initialStore, true);
  usePotetoModeStore.setState({ selections: {} });
  mocks.picker = null;
  return {
    [Symbol.dispose]() {
      usePotetoModeStore.setState({ selections: {} });
      vi.restoreAllMocks();
    },
  };
}

function withPotetoSkill(input = props()) {
  return {
    ...input,
    providerStatuses: input.providerStatuses.map((provider) => ({ ...provider, skills: [skill] })),
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
const validationMessage = (container: HTMLElement) =>
  container.querySelector("[data-chat-composer-validation]")?.textContent ?? null;

function selectPoteto() {
  usePotetoModeStore.getState().setSelection(potetoModeScope(environmentId, threadId), {
    instanceId: "codex",
    path: skill.path,
  });
}

describe("Thread composer controls integration", () => {
  it("uses the existing selected model and permission handler with Thread presentation", async () => {
    using _fixture = setup();
    const input = props({ threadClient: true });
    await using screen = await render(<ChatComposer {...input} />);
    await expect.element(screen.getByRole("button", { name: "Model: test" })).toBeVisible();
    await expect
      .element(screen.getByRole("combobox", { name: "Runtime mode: Full access" }))
      .toBeVisible();
    const instanceId = input.providerStatuses[0]!.instanceId;
    await act(() => mocks.picker!.onInstanceModelChange(instanceId as never, "test"));
    expect(input.onProviderModelSelect).toHaveBeenCalledWith(instanceId, "test");
  });

  it("keeps ordinary chat's model display mode", async () => {
    using _fixture = setup();
    await using screen = await render(<ChatComposer {...props()} />);
    await expect.element(screen.getByRole("combobox", { name: "Runtime mode" })).toBeVisible();
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
    ).toContain("rounded-[24px]");
    const trigger = screen.getByRole("combobox", { name: "Runtime mode" });
    expect(floating.contains(trigger.element())).toBe(true);
    await trigger.click();
    await page.getByRole("option", { name: /Supervised/ }).click();
    expect(input.handleRuntimeModeChange).toHaveBeenCalledWith("approval-required");
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
      .element(screen.getByRole("combobox", { name: "Runtime mode" }))
      .toBeInTheDocument();
    expect(screen.container.querySelector("[data-chat-composer-floating-runtime]")).toBeNull();
  });
});

describe("ChatComposer Poteto toggle", () => {
  it("sits right of the floating lock, toggles, survives draft clearing and remount, then stays off", async () => {
    using _fixture = setup();
    const input = withPotetoSkill();
    {
      await using screen = await render(<ChatComposer {...input} />, wide());
      const toggle = screen.getByRole("button", { name: "Poteto Mode" });
      const floating = await floatingRuntime(screen.container);
      const runtime = screen.getByRole("combobox", { name: "Runtime mode" }).element();
      expect(floating.contains(toggle.element())).toBe(true);
      expect(
        runtime.compareDocumentPosition(toggle.element()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
      await toggle.click();
      await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
      expect(input.composerRef.current!.getSendContext().potetoMode).toEqual({
        instanceId: "codex",
        path: skill.path,
      });
      await act(() => useComposerDraftStore.getState().clearComposerContent(target));
      expect(input.composerRef.current!.getSendContext().potetoMode).not.toBeNull();
    }
    {
      await using screen = await render(<ChatComposer {...input} />);
      const toggle = screen.getByRole("button", { name: "Poteto Mode" });
      await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
      await toggle.click();
      expect(input.composerRef.current!.getSendContext().potetoMode).toBeNull();
    }
    {
      await using screen = await render(<ChatComposer {...input} />);
      await expect
        .element(screen.getByRole("button", { name: "Poteto Mode" }))
        .toHaveAttribute("aria-pressed", "false");
    }
  });

  it("explains missing skills and prevents enabling an unavailable workflow", async () => {
    using _fixture = setup();
    const input = props();
    await using screen = await render(<ChatComposer {...input} />);
    const toggle = screen.getByRole("button", { name: "Poteto Mode" });
    await expect.element(toggle).toHaveAttribute("aria-disabled", "true");
    await expect
      .element(toggle)
      .toHaveAccessibleDescription("The poteto-mode skill must be enabled for this workspace.");
    await toggle.click({ force: true });
    expect(input.composerRef.current!.getSendContext().potetoMode).toBeNull();
  });

  it("blocks natural turns after a skill disappears, permits commands and remains switchable off", async () => {
    using _fixture = setup();
    selectPoteto();
    const input = props();
    await using screen = await render(<ChatComposer {...input} />);
    const toggle = screen.getByRole("button", { name: "Poteto Mode" });
    await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.element(toggle).not.toHaveAttribute("aria-disabled");
    const handle = () => input.composerRef.current!;
    expect(handle().validateProviderInput("/compact")).toBe(true);
    await act(() => {
      expect(handle().validateProviderInput("ordinary task")).toBe(false);
    });
    await expect.poll(() => validationMessage(screen.container)).toBe(unavailableSkill);
    await toggle.click();
    await expect.poll(() => validationMessage(screen.container)).toBeNull();
    expect(handle().validateProviderInput("ordinary task")).toBe(true);
  });

  it("lets approval feedback through when the selected skill disappears", async () => {
    using _fixture = setup();
    selectPoteto();
    const approval = {
      requestId: RuntimeRequestId.make("synthetic-approval"),
      requestKind: "command" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      responseCapability: "live" as const,
      supportsFeedback: true,
    };
    const input = props({ activePendingApproval: approval, pendingApprovals: [approval] });
    await using screen = await render(<ChatComposer {...input} />);
    await expect
      .element(screen.getByRole("button", { name: "Poteto Mode" }))
      .toHaveAttribute("aria-pressed", "true");
    await act(() => {
      expect(input.composerRef.current!.validateProviderInput("use the other file")).toBe(true);
    });
    expect(validationMessage(screen.container)).toBeNull();
  });
});

describe("PotetoModeControl", () => {
  it("is a native toggle button with a stable name, pressed state and keyboard activation", async () => {
    const onToggle = vi.fn();
    const control = (on: boolean) => (
      <PotetoModeControl
        on={on}
        unavailableReason={null}
        onToggle={onToggle}
        size="sm"
        hidden={false}
      />
    );
    await using screen = await render(control(false));
    const toggle = screen.getByRole("button", { name: "Poteto Mode" });
    expect(toggle.element().tagName).toBe("BUTTON");
    await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
    await expect.element(toggle).toHaveAccessibleDescription(/Poteto Mode off/);
    (toggle.element() as HTMLButtonElement).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onToggle).toHaveBeenCalledTimes(2);
    await screen.rerender(control(true));
    await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.element(toggle).toHaveAttribute("data-poteto-mode", "on");
    await expect.element(toggle).toHaveAccessibleDescription(/Poteto Mode on/);
    // The pressed look comes from the shared composer control tokens.
    expect(toggle.element().className).toContain("aria-pressed:bg-accent");
    expect(toggle.element().className).toContain("focus-visible:ring-inset");
  });

  it("keeps off reachable while unavailable and refuses to turn on", async () => {
    const onToggle = vi.fn();
    const reason = "Select Codex to turn on Poteto Mode.";
    const control = (on: boolean) => (
      <PotetoModeControl
        on={on}
        unavailableReason={reason}
        onToggle={onToggle}
        size="sm"
        hidden={false}
      />
    );
    await using screen = await render(control(false));
    const toggle = screen.getByRole("button", { name: "Poteto Mode" });
    await expect.element(toggle).toHaveAttribute("aria-disabled", "true");
    await expect.element(toggle).toHaveAccessibleDescription(reason);
    await toggle.click({ force: true });
    expect(onToggle).not.toHaveBeenCalled();
    await screen.rerender(control(true));
    await expect.element(toggle).not.toHaveAttribute("aria-disabled");
    await toggle.click();
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
