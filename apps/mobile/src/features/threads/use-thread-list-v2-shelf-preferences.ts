import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { pruneNestedThreadExpansion } from "@t3tools/client-runtime/state/thread-nesting";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useEffect, useRef } from "react";

import { scopedThreadKey } from "../../lib/scopedEntities";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { withNestedThreadExpansion } from "./threadListV2";

const scopedParentKey = (parent: ScopedThreadRef) =>
  scopedThreadKey(parent.environmentId, parent.threadId);

const NO_NESTED_EXPANSION: Readonly<Record<string, boolean>> = {};

/**
 * Shared persisted shelf state for the compact Home list and iPad sidebar.
 * Refs advance before persistence starts so consecutive presses always toggle
 * the latest value, even if React has not rendered the optimistic patch yet.
 */
export function useThreadListV2ShelfPreferences() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const snoozedShelfExpanded =
    loaded && preferencesResult.value.threadListSnoozedShelfExpanded === true;
  const settledShelfExpanded =
    loaded && preferencesResult.value.threadListSettledShelfExpanded === true;
  // Working section beta: off until the preference loads and is enabled.
  const workingShelfEnabled = loaded && preferencesResult.value.workingShelfEnabled === true;
  const workingShelfExpanded =
    loaded && preferencesResult.value.threadListWorkingShelfExpanded === true;
  const snoozedShelfExpandedRef = useRef(snoozedShelfExpanded);
  const settledShelfExpandedRef = useRef(settledShelfExpanded);
  const workingShelfExpandedRef = useRef(workingShelfExpanded);
  snoozedShelfExpandedRef.current = snoozedShelfExpanded;
  settledShelfExpandedRef.current = settledShelfExpanded;
  workingShelfExpandedRef.current = workingShelfExpanded;

  const toggleSnoozedShelf = useCallback(() => {
    if (!loaded) return;
    const expanded = !snoozedShelfExpandedRef.current;
    snoozedShelfExpandedRef.current = expanded;
    savePreferences({ threadListSnoozedShelfExpanded: expanded });
  }, [loaded, savePreferences]);
  const toggleSettledShelf = useCallback(() => {
    if (!loaded) return;
    const expanded = !settledShelfExpandedRef.current;
    settledShelfExpandedRef.current = expanded;
    savePreferences({ threadListSettledShelfExpanded: expanded });
  }, [loaded, savePreferences]);
  const toggleWorkingShelf = useCallback(() => {
    if (!loaded) return;
    const expanded = !workingShelfExpandedRef.current;
    workingShelfExpandedRef.current = expanded;
    savePreferences({ threadListWorkingShelfExpanded: expanded });
  }, [loaded, savePreferences]);

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
 * Persisted nested-thread expansion, shared by the compact Home list and the
 * iPad sidebar. Keys are `environmentId:threadId` of the parent row. Writes go
 * through a transform so consecutive toggles always read the latest value.
 */
export function useThreadListV2NestedExpansion(threads: ReadonlyArray<EnvironmentThreadShell>) {
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const nestedExpansion =
    (loaded ? preferencesResult.value.threadListNestedExpansion : undefined) ?? NO_NESTED_EXPANSION;

  /**
   * Stores an explicit choice, or clears it with `undefined`, and drops
   * entries for threads that no longer host nested threads.
   */
  const setNestedExpansion = useCallback(
    (parentKey: string, expanded: boolean | undefined) => {
      if (!loaded) return;
      savePreferences({
        transform: (current) => {
          const next = withNestedThreadExpansion(
            current.threadListNestedExpansion === undefined
              ? undefined
              : pruneNestedThreadExpansion(
                  current.threadListNestedExpansion,
                  threadsRef.current,
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
    },
    [loaded, savePreferences],
  );

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
  const latest = useRef({ threads, nestedExpansion, setNestedExpansion });
  latest.current = { threads, nestedExpansion, setNestedExpansion };
  useEffect(() => {
    if (selectedThreadKey === null) return;
    const { threads, nestedExpansion, setNestedExpansion } = latest.current;
    const selected = threads.find(
      (thread) => scopedThreadKey(thread.environmentId, thread.id) === selectedThreadKey,
    );
    if (selected?.nestedUnderThreadId == null) return;
    const parentKey = scopedThreadKey(selected.environmentId, selected.nestedUnderThreadId);
    if (nestedExpansion[parentKey] !== undefined) setNestedExpansion(parentKey, undefined);
  }, [selectedThreadKey]);
}
