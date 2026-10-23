import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { pruneNestedThreadExpansion } from "@t3tools/client-runtime/state/thread-nesting";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useEffectEvent } from "react";

import { scopedThreadKey } from "../../lib/scopedEntities";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { withNestedThreadExpansion } from "./threadListV2";

const scopedParentKey = (parent: ScopedThreadRef) =>
  scopedThreadKey(parent.environmentId, parent.threadId);

const NO_NESTED_EXPANSION: Readonly<Record<string, boolean>> = {};

export function useThreadListV2ShelfPreferences() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const snoozedShelfExpanded =
    loaded && preferencesResult.value.threadListSnoozedShelfExpanded === true;
  const settledShelfExpanded =
    loaded && preferencesResult.value.threadListSettledShelfExpanded === true;
  const workingShelfEnabled = loaded && preferencesResult.value.workingShelfEnabled === true;
  const workingShelfExpanded =
    loaded && preferencesResult.value.threadListWorkingShelfExpanded === true;

  // A transform reads the optimistic value, so two presses before the next
  // render still toggle twice instead of writing the same value.
  const toggleSnoozedShelf = () => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadListSnoozedShelfExpanded: current.threadListSnoozedShelfExpanded !== true,
      }),
    });
  };
  const toggleSettledShelf = () => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadListSettledShelfExpanded: current.threadListSettledShelfExpanded !== true,
      }),
    });
  };
  const toggleWorkingShelf = () => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadListWorkingShelfExpanded: current.threadListWorkingShelfExpanded !== true,
      }),
    });
  };

  return {
    loaded,
    settledShelfExpanded,
    snoozedShelfExpanded,
    workingShelfEnabled,
    workingShelfExpanded,
    toggleSettledShelf,
    toggleSnoozedShelf,
    toggleWorkingShelf,
  } as const;
}

/**
 * Persisted nested-thread expansion (F31), shared by the compact Home list and
 * the iPad sidebar. Keys are `environmentId:threadId` of the parent row. Writes
 * go through a transform so consecutive toggles always read the latest value.
 */
export function useThreadListV2NestedExpansion(threads: ReadonlyArray<EnvironmentThreadShell>) {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const nestedExpansion =
    (loaded ? preferencesResult.value.threadListNestedExpansion : undefined) ?? NO_NESTED_EXPANSION;

  /**
   * Stores an explicit choice, or clears it with `undefined`, and drops
   * entries for threads that no longer host nested threads.
   */
  const setNestedExpansion = (parentKey: string, expanded: boolean | undefined) => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => {
        const next = withNestedThreadExpansion(
          current.threadListNestedExpansion === undefined
            ? undefined
            : pruneNestedThreadExpansion(
                current.threadListNestedExpansion,
                threads,
                scopedParentKey,
              ),
          parentKey,
          expanded,
        );
        return next === current.threadListNestedExpansion
          ? {}
          : { threadListNestedExpansion: next };
      },
    });
  };

  return { nestedExpansion, setNestedExpansion } as const;
}

/**
 * When the selection moves to a nested child, drops its parent's stored
 * expansion so the parent opens automatically. Runs only on selection change,
 * so a later collapse of that parent sticks.
 */
export function useClearNestedExpansionOnSelection(
  selectedThreadKey: string | null,
  threads: ReadonlyArray<EnvironmentThreadShell>,
  nestedExpansion: Readonly<Record<string, boolean>>,
  setNestedExpansion: (parentKey: string, expanded: boolean | undefined) => void,
) {
  const clearForSelection = useEffectEvent((key: string) => {
    const selected = threads.find(
      (thread) => scopedThreadKey(thread.environmentId, thread.id) === key,
    );
    if (selected?.nestedUnderThreadId == null) return;
    const parentKey = scopedThreadKey(selected.environmentId, selected.nestedUnderThreadId);
    if (nestedExpansion[parentKey] !== undefined) setNestedExpansion(parentKey, undefined);
  });
  useEffect(() => {
    if (selectedThreadKey !== null) clearForSelection(selectedThreadKey);
  }, [selectedThreadKey]);
}
