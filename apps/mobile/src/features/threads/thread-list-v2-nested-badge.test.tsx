import { ProviderInstanceId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

type PressableProps = {
  accessibilityLabel?: string;
  accessibilityState?: { expanded?: boolean };
  onPress?: () => void;
  children: ReactNode;
};

vi.mock("react-native", () => ({
  View: ({
    children,
    accessibilityLabel,
    className,
  }: {
    children: ReactNode;
    accessibilityLabel?: string;
    className?: string;
  }) => (
    <div aria-label={accessibilityLabel} className={className}>
      {children}
    </div>
  ),
  Pressable: ({ children, accessibilityLabel, accessibilityState, onPress }: PressableProps) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      aria-expanded={accessibilityState?.expanded}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: { children: ReactNode }) => <span data-overflow="">{children}</span>,
}));
// Each icon reports which provider it draws, at what size, and whether it is the parent's.
vi.mock("../../components/ProviderIcon", () => ({
  ProviderIcon: (props: { provider: string; size: number }) => (
    <i data-icon="child" data-provider={props.provider} data-size={props.size} />
  ),
  ProviderInstanceIcon: (props: { provider: string; size: number }) => (
    <i data-icon="parent" data-provider={props.provider} data-size={props.size} />
  ),
}));

import { ThreadListV2NestedBadge } from "./thread-list-v2-nested-badge";

const RECENT = ProviderInstanceId.make("claude_work");
const OLDER = ProviderInstanceId.make("cursor_home");
const providers = [
  { instanceId: RECENT, driver: "claudeAgent", enabled: true, displayName: "Claude" },
  { instanceId: OLDER, driver: "cursor", enabled: true, displayName: "Cursor" },
] as never;
const parentProvider = {
  iconUrl: null,
  driverKind: "codex",
  displayName: "Codex",
  accentColor: undefined,
  surfaceColor: "#ffffff",
} as never;

let root: Root;
let container: HTMLDivElement;

function renderBadge(props: { expanded?: boolean; onToggle?: () => void } = {}) {
  act(() =>
    root.render(
      <ThreadListV2NestedBadge
        summary={{
          count: 3,
          expanded: props.expanded ?? false,
          badge: { providerInstanceIds: [RECENT, OLDER], overflow: 1 },
        }}
        title="Parent thread"
        parentProvider={parentProvider}
        providers={providers}
        textClassName="text-muted"
        {...(props.onToggle ? { onToggle: props.onToggle } : {})}
      />,
    ),
  );
}

function icons() {
  return Array.from(container.querySelectorAll("i"), (icon) => ({
    kind: icon.dataset.icon,
    provider: icon.dataset.provider,
    size: Number(icon.dataset.size),
  }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("ThreadListV2NestedBadge", () => {
  it("leads with the parent's own provider one size larger, then children and overflow", () => {
    renderBadge();

    expect(icons()).toEqual([
      { kind: "parent", provider: "codex", size: 14 },
      { kind: "child", provider: "claudeAgent", size: 12 },
      { kind: "child", provider: "cursor", size: 12 },
    ]);
    expect(container.querySelector("[data-overflow]")?.textContent).toBe("+1");
    expect(container.querySelector('[aria-label="3 nested threads"]')).not.toBeNull();
  });

  it("toggles expansion and fills while expanded", () => {
    const onToggle = vi.fn();
    renderBadge({ onToggle });
    const toggle = container.querySelector("button")!;

    expect(toggle.getAttribute("aria-label")).toBe("Show 3 nested threads");
    expect(toggle.firstElementChild?.className).not.toContain("bg-border-subtle");
    act(() => toggle.click());
    expect(onToggle).toHaveBeenCalledOnce();

    renderBadge({ onToggle, expanded: true });
    expect(toggle.getAttribute("aria-label")).toBe("Hide 3 nested threads");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.firstElementChild?.className).toContain("bg-border-subtle");
  });
});
