import { EnvironmentId, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { render } from "../../test/render";
import { NestedThreadRow, type SidebarProviderEntry } from "../components/sidebar/SidebarThreadRow";
import { makeThreadFixture } from "../test-fixtures";
import { SidebarNestedThreadBadge } from "./SidebarNestedThreads";

vi.mock(import("~/state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => ({
    data: null,
    dataUpdatedAt: 0,
    error: null,
    failure: null,
    isPending: false,
    isSuccess: false,
    refresh: () => {},
  })) as never,
}));

const PARENT = ProviderInstanceId.make("codex");
const RECENT_CHILD = ProviderInstanceId.make("claudeAgent");
const OLDER_CHILD = ProviderInstanceId.make("cursor");
const ACCENTS: Record<string, string> = {
  [PARENT]: "#112233",
  [RECENT_CHILD]: "#445566",
  [OLDER_CHILD]: "#778899",
};

function entry(instanceId: ProviderInstanceId): SidebarProviderEntry {
  return {
    instanceId,
    driverKind: ProviderDriverKind.make(instanceId),
    enabled: true,
    displayName: instanceId,
    accentColor: ACCENTS[instanceId],
    acpRegistryAgentId: undefined,
    acpRegistryIconUrl: undefined,
    models: [],
  };
}

const providerEntryByInstanceId = new Map(
  [PARENT, RECENT_CHILD, OLDER_CHILD].map((id) => [id, entry(id)] as const),
);
const badge = { providerInstanceIds: [RECENT_CHILD, OLDER_CHILD], overflow: 1 };

/** The badge's provider icons in order, as accent color and icon size class. */
function badgeIcons(container: Element) {
  const element = container.querySelector("[data-testid=sidebar-nested-thread-badge]");
  return Array.from(element?.querySelectorAll("[data-provider-accent-color]") ?? [], (icon) => ({
    accent: icon.getAttribute("data-provider-accent-color"),
    size: /\bsize-3(?:\.5)?\b/.exec(icon.firstElementChild?.getAttribute("class") ?? "")?.[0],
  }));
}

const LOCAL_ENVIRONMENT = EnvironmentId.make("environment-local");
const REMOTE_ENVIRONMENT = EnvironmentId.make("environment-remote");

function rowProps(variant: "card" | "slim"): ComponentProps<typeof NestedThreadRow> {
  const noop = () => {};
  return {
    sortableId: "thread-parent",
    sortableDisabled: true,
    contextDrag: false,
    thread: makeThreadFixture({ environmentId: REMOTE_ENVIRONMENT, title: "Parent thread" }),
    variant,
    variantAction: "settle",
    settlementSupported: false,
    snoozeSupported: false,
    pinningSupported: false,
    isPinned: false,
    dropVerb: null,
    dragOverPinned: false,
    sweepAction: null,
    snoozeWakeLabelText: null,
    wokeAt: null,
    isActive: false,
    isRouteThread: false,
    openPullRequestsInRightPanel: false,
    jumpLabel: null,
    currentEnvironmentId: LOCAL_ENVIRONMENT,
    environmentLabel: "Remote",
    environmentMachine: "server",
    scratchMachineLabel: null,
    project: null,
    projectDisplayName: null,
    providerEntryByInstanceId,
    timestampFormat: "locale",
    onThreadClick: noop,
    onThreadActivate: noop,
    onStartRename: noop,
    onRenameTitleChange: noop,
    onCommitRename: noop,
    onCancelRename: noop,
    isRenaming: false,
    renamingTitle: "",
    onContextMenu: noop,
    onSettle: noop,
    onActionSweepStart: noop,
    onUnsettle: noop,
    onSnooze: noop,
    onUnsnooze: noop,
    onUnpin: noop,
    onAcknowledgeWoke: noop,
    nestedBadge: badge,
    nestedExpanded: false,
    onToggleNested: noop,
  };
}

const EXPECTED_ICONS = [
  { accent: ACCENTS[PARENT], size: "size-3.5" },
  { accent: ACCENTS[RECENT_CHILD], size: "size-3" },
  { accent: ACCENTS[OLDER_CHILD], size: "size-3" },
];

describe("SidebarNestedThreadBadge", () => {
  it("leads with the parent's own provider one size larger, then children and overflow", async () => {
    await using screen = await render(
      <SidebarNestedThreadBadge
        badge={badge}
        parentProviderInstanceId={PARENT}
        providerEntryByInstanceId={providerEntryByInstanceId}
      />,
      { router: false },
    );
    const element = screen.container.querySelector("[data-testid=sidebar-nested-thread-badge]");

    expect(badgeIcons(screen.container)).toEqual(EXPECTED_ICONS);
    expect(element?.getAttribute("aria-label")).toBe("3 nested threads");
    expect(element?.textContent).toBe("+1");
  });
});

describe("nested parent rows", () => {
  it("places the badge beside the machine icon in place of the card row's provider history", async () => {
    await using screen = await render(<NestedThreadRow {...rowProps("card")} />);
    const element = screen.container.querySelector("[data-testid=sidebar-nested-thread-badge]");

    expect(badgeIcons(screen.container)).toEqual(EXPECTED_ICONS);
    const slot = element?.parentElement;
    expect(slot?.className).toContain("ml-auto");
    // The machine icon wrapper leads the slot and the badge follows it directly.
    expect(element?.previousElementSibling?.querySelector("svg")).not.toBeNull();
    expect(element?.nextElementSibling).toBeNull();
    // The parent's provider history stack is not drawn beside the badge.
    expect(slot?.querySelectorAll("[data-provider-accent-color]")).toHaveLength(3);
    // The title line holds the chevron, not the badge.
    expect(screen.container.querySelector("[data-sidebar-nested-toggle]")).not.toBeNull();
  });

  it("draws the same badge after the title on slim rows", async () => {
    await using screen = await render(<NestedThreadRow {...rowProps("slim")} />);

    expect(badgeIcons(screen.container)).toEqual(EXPECTED_ICONS);
    expect(
      screen.container.querySelectorAll("[data-testid=sidebar-nested-thread-badge]"),
    ).toHaveLength(1);
  });
});
