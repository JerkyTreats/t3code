import type { NestedThreadBadge } from "@t3tools/client-runtime/state/thread-nesting";
import type { ProviderInstanceId } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import { memo, type MouseEvent as ReactMouseEvent } from "react";

import { ProviderInstanceIcon } from "../components/chat/ProviderInstanceIcon";
import { cn } from "../lib/utils";
import type { ProviderInstanceEntry } from "../providerInstances";

/** Children may share a provider, so each repeat gets its own key. */
function badgeIconKeys(instanceIds: ReadonlyArray<ProviderInstanceId>) {
  const seen = new Map<ProviderInstanceId, number>();
  return instanceIds.map((instanceId) => {
    const repeat = seen.get(instanceId) ?? 0;
    seen.set(instanceId, repeat + 1);
    return { instanceId, key: `${instanceId}:${repeat}` };
  });
}

/**
 * A parent row's provider and its nested threads: the parent's own provider
 * icon, then one icon per shown child, most recently active first, then `+n`.
 * On card rows it stands in for the row's provider history.
 */
export const SidebarNestedThreadBadge = memo(function SidebarNestedThreadBadge(props: {
  badge: NestedThreadBadge<ProviderInstanceId>;
  parentProviderInstanceId: ProviderInstanceId;
  providerEntryByInstanceId: ReadonlyMap<string, ProviderInstanceEntry>;
}) {
  const { badge } = props;
  const count = badge.providerInstanceIds.length + badge.overflow;
  const parentEntry = props.providerEntryByInstanceId.get(props.parentProviderInstanceId);
  return (
    <span
      role="img"
      aria-label={`${count} nested ${count === 1 ? "thread" : "threads"}`}
      data-testid="sidebar-nested-thread-badge"
      className="inline-flex h-4.5 shrink-0 items-center gap-0.5 rounded-full border border-sidebar-border px-1 text-2xs leading-none text-sidebar-muted-foreground"
    >
      {parentEntry === undefined ? null : (
        <ProviderInstanceIcon
          driverKind={parentEntry.driverKind}
          displayName={parentEntry.displayName}
          accentColor={parentEntry.accentColor}
          acpRegistryAgentId={parentEntry.acpRegistryAgentId}
          acpRegistryIconUrl={parentEntry.acpRegistryIconUrl}
          iconClassName="size-3"
        />
      )}
      {badgeIconKeys(badge.providerInstanceIds).map(({ instanceId, key }) => {
        const entry = props.providerEntryByInstanceId.get(instanceId);
        return entry === undefined ? null : (
          <ProviderInstanceIcon
            key={key}
            driverKind={entry.driverKind}
            displayName={entry.displayName}
            accentColor={entry.accentColor}
            acpRegistryAgentId={entry.acpRegistryAgentId}
            acpRegistryIconUrl={entry.acpRegistryIconUrl}
            iconClassName="size-3"
          />
        );
      })}
      {badge.overflow > 0 ? <span className="tabular-nums">+{badge.overflow}</span> : null}
    </span>
  );
});

/** Shows or hides a parent row's nested threads without opening the parent. */
export function SidebarNestedThreadToggle(props: {
  expanded: boolean;
  onToggle: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      // The row's click guard (SIDEBAR_NESTED_TOGGLE_SELECTOR) leaves this click to the chevron.
      data-sidebar-nested-toggle=""
      aria-label={props.expanded ? "Hide nested threads" : "Show nested threads"}
      aria-expanded={props.expanded}
      onClick={props.onToggle}
      className="-ml-1 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-sidebar-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <ChevronRightIcon
        aria-hidden
        className={cn(
          "size-3.5 transition-transform motion-reduce:transition-none",
          props.expanded && "rotate-90",
        )}
      />
    </button>
  );
}
