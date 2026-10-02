/** Environment Board selection, thread exclusivity, and legacy selection migration. */
import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { RightPanelSurface, ThreadRightPanelState } from "../rightPanelStore";

const ENVIRONMENT_BOARD_KEY_SUFFIX = "\u0000environment-board";
export const environmentBoardKey = (environmentId: string) =>
  `${environmentId}${ENVIRONMENT_BOARD_KEY_SUFFIX}`;

export function environmentIdFromBoardKey(threadKey: string): string | null {
  return threadKey.endsWith(ENVIRONMENT_BOARD_KEY_SUFFIX)
    ? threadKey.slice(0, -ENVIRONMENT_BOARD_KEY_SUFFIX.length)
    : null;
}

const EMPTY_THREAD_STATE: ThreadRightPanelState = {
  isOpen: false,
  activeSurfaceId: null,
  surfaces: [],
};

const combinedThreadAndBoardStateCache = new WeakMap<
  ThreadRightPanelState,
  WeakMap<ThreadRightPanelState, ThreadRightPanelState>
>();

export function environmentBoardState(
  byThreadKey: Record<string, ThreadRightPanelState>,
  environmentId: string,
): ThreadRightPanelState {
  return byThreadKey[environmentBoardKey(environmentId)] ?? EMPTY_THREAD_STATE;
}

export function selectedEnvironmentBoardSurface(
  board: ThreadRightPanelState,
): Extract<RightPanelSurface, { kind: "board" }> | null {
  // A hidden Board keeps its active id so layout controls can reopen it. Explicit thread
  // surface actions clear the id through hideEnvironmentBoard and take over selection.
  const selected = board.surfaces.find((surface) => surface.id === board.activeSurfaceId);
  return selected?.kind === "board" ? selected : null;
}

export function combineThreadAndEnvironmentBoardState(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef,
): ThreadRightPanelState {
  const thread = byThreadKey[scopedThreadKey(ref)] ?? EMPTY_THREAD_STATE;
  const board = environmentBoardState(byThreadKey, ref.environmentId);
  const boardSurface = selectedEnvironmentBoardSurface(board);
  if (!boardSurface) return thread;
  const cached = combinedThreadAndBoardStateCache.get(thread)?.get(board);
  if (cached) return cached;
  const combined = {
    ...thread,
    isOpen: board.isOpen,
    activeSurfaceId: boardSurface.id,
    surfaces: [...thread.surfaces.filter((surface) => surface.kind !== "board"), boardSurface],
  };
  const boardCache =
    combinedThreadAndBoardStateCache.get(thread) ??
    new WeakMap<ThreadRightPanelState, ThreadRightPanelState>();
  boardCache.set(board, combined);
  combinedThreadAndBoardStateCache.set(thread, boardCache);
  return combined;
}

export function hideEnvironmentBoard(
  byThreadKey: Record<string, ThreadRightPanelState>,
  environmentId: string,
): Record<string, ThreadRightPanelState> {
  const key = environmentBoardKey(environmentId);
  const current = byThreadKey[key];
  if (!current || (!current.isOpen && current.activeSurfaceId === null)) return byThreadKey;
  const next = { ...current, isOpen: false, activeSurfaceId: null };
  if (next.surfaces.length === 0 && !next.dismissedDeviceSurfaceIds?.length) {
    const { [key]: _removed, ...rest } = byThreadKey;
    return rest;
  }
  return { ...byThreadKey, [key]: next };
}

export function boardPanelActionKey(ref: ScopedThreadRef, surfaceId: string): string {
  return surfaceId === "board" ? environmentBoardKey(ref.environmentId) : scopedThreadKey(ref);
}

export function selectedBoardPanelActionKey(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef,
): string {
  return selectedEnvironmentBoardSurface(environmentBoardState(byThreadKey, ref.environmentId))
    ? environmentBoardKey(ref.environmentId)
    : scopedThreadKey(ref);
}

export function boardPanelVisibilityKeys(
  panelKey: string,
  threadKeys: readonly string[],
): string[] {
  const environmentId = environmentIdFromBoardKey(panelKey);
  return environmentId === null
    ? [panelKey]
    : threadKeys.filter((key) => parseScopedThreadKey(key)?.environmentId === environmentId);
}

export function boardPanelAfterThreadAction(
  byThreadKey: Record<string, ThreadRightPanelState>,
  panelKey: string,
): Record<string, ThreadRightPanelState> {
  const ref = parseScopedThreadKey(panelKey);
  return ref ? hideEnvironmentBoard(byThreadKey, ref.environmentId) : byThreadKey;
}

/** Keeping Board closes only the current thread's peers and retains environment selection. */
export function boardPanelCloseOtherSurfaces(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef,
  surfaceId: string,
): Record<string, ThreadRightPanelState> | null {
  if (surfaceId !== "board") return null;
  const key = scopedThreadKey(ref);
  const current = byThreadKey[key];
  if (!current || current.surfaces.length === 0) return byThreadKey;
  if (!current.dismissedDeviceSurfaceIds?.length) {
    const { [key]: _removed, ...rest } = byThreadKey;
    return rest;
  }
  return {
    ...byThreadKey,
    [key]: { ...current, isOpen: false, surfaces: [], activeSurfaceId: null },
  };
}

export function boardPanelUserActionRevision(
  revisions: Record<string, number>,
  ref: ScopedThreadRef,
): number {
  return (
    (revisions[scopedThreadKey(ref)] ?? 0) +
    (revisions[environmentBoardKey(ref.environmentId)] ?? 0)
  );
}

export function migrateBoardPanelSelection(
  byThreadKey: Record<string, ThreadRightPanelState>,
  persistedVersion: number,
): Record<string, ThreadRightPanelState> {
  const environmentsWithOpenThreadPanels = new Set<string>(
    Object.entries(byThreadKey).flatMap(([threadKey, threadState]) => {
      if (!threadState.isOpen || environmentIdFromBoardKey(threadKey) !== null) return [];
      const ref = parseScopedThreadKey(threadKey);
      return ref ? [ref.environmentId] : [];
    }),
  );
  return Object.fromEntries(
    Object.entries(byThreadKey).map(([threadKey, threadState]) => {
      const environmentId = environmentIdFromBoardKey(threadKey);
      const selectedBoard = selectedEnvironmentBoardSurface(threadState);
      // Before v13, explicit thread openers hid Board without clearing its active id. An open
      // thread panel therefore owns selection when these otherwise ambiguous legacy bytes load.
      if (
        persistedVersion < 13 &&
        environmentId !== null &&
        !threadState.isOpen &&
        selectedBoard &&
        environmentsWithOpenThreadPanels.has(environmentId)
      ) {
        return [threadKey, { ...threadState, activeSurfaceId: null }];
      }
      return [threadKey, threadState];
    }),
  );
}
