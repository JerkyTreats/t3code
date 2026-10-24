import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { ProviderIcon, ProviderInstanceIcon } from "../../components/ProviderIcon";
import { cn } from "../../lib/cn";
import type { ThreadListProvider } from "../../state/thread-list-environments";
import type { ThreadRowProviderInstance } from "./thread-provider-instance";
import type { ThreadListV2NestedSummary } from "./threadListV2";

/**
 * A parent row's nested-thread badge (F31): the parent's own provider icon one
 * step larger, then one icon per shown child, most recently active first, plus
 * `+n`. On card rows it stands in for the row's provider history. With
 * `onToggle`, pressing it expands or collapses the nested threads without
 * opening the parent, and it is filled while expanded.
 */
export function ThreadListV2NestedBadge(props: {
  readonly summary: ThreadListV2NestedSummary;
  readonly title: string;
  readonly parentProvider:
    | (Pick<ThreadRowProviderInstance, "driverKind" | "displayName" | "accentColor"> & {
        readonly iconUrl: string | null | undefined;
        readonly surfaceColor: string;
      })
    | null;
  readonly providers: ReadonlyArray<ThreadListProvider> | undefined;
  readonly textClassName: string;
  readonly onToggle?: () => void;
}) {
  const { providerInstanceIds, overflow } = props.summary.badge;
  const { count, expanded } = props.summary;
  const countLabel = `${count} nested ${count === 1 ? "thread" : "threads"}`;
  const parent = props.parentProvider;
  const content = (
    <>
      {parent ? (
        <ProviderInstanceIcon
          iconUrl={parent.iconUrl}
          provider={parent.driverKind}
          // One step larger than the children's icons marks it as the parent.
          size={14}
          displayName={parent.displayName}
          accentColor={parent.accentColor}
          showBadge={false}
          surfaceColor={parent.surfaceColor}
        />
      ) : null}
      {providerInstanceIds.map((instanceId, index) => {
        const provider = props.providers?.find((candidate) => candidate.instanceId === instanceId);
        return (
          <ProviderIcon
            key={`${instanceId}:${index}`}
            iconUrl={provider?.iconUrl}
            provider={provider?.driver ?? instanceId}
            size={12}
          />
        );
      })}
      {overflow > 0 ? (
        <Text className={cn("text-[11px] tabular-nums", props.textClassName)}>+{overflow}</Text>
      ) : null}
    </>
  );
  const className = cn(
    "flex-row items-center gap-0.5 rounded-full border border-border-subtle px-1.5 py-1",
    expanded && props.onToggle !== undefined && "bg-border-subtle",
  );
  if (props.onToggle === undefined) {
    return (
      <View accessible accessibilityLabel={countLabel} className={className}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint={`${expanded ? "Hides" : "Shows"} the threads nested under ${props.title}.`}
      accessibilityLabel={`${expanded ? "Hide" : "Show"} ${countLabel}`}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      hitSlop={8}
      onPress={props.onToggle}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View className={className}>{content}</View>
    </Pressable>
  );
}
