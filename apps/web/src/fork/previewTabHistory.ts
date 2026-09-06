import {
  FILL_PREVIEW_VIEWPORT,
  type DesktopPreviewColorScheme,
  type PreviewSessionSnapshot,
  type PreviewViewportSetting,
} from "@t3tools/contracts";

export interface PreviewDesktopRestoration {
  readonly zoomFactor: number;
  readonly colorScheme: DesktopPreviewColorScheme;
}
export interface ClosedPreviewTab extends PreviewDesktopRestoration {
  readonly reservationId: string;
  readonly sequence: number;
  readonly status: "pending" | "closed";
  readonly tabId: string;
  readonly url: string | null;
  readonly profileId: string | undefined;
  readonly viewport: PreviewViewportSetting;
}
export interface PreviewTabHistory {
  readonly closedTabs: ReadonlyArray<ClosedPreviewTab>;
  readonly nextClosedTabSequence: number;
  readonly pendingRestorations: Readonly<Record<string, PreviewDesktopRestoration>>;
}
export const CLOSED_PREVIEW_TAB_LIMIT = 10;
export const EMPTY_PREVIEW_TAB_HISTORY: PreviewTabHistory = Object.freeze({
  closedTabs: [],
  nextClosedTabSequence: 1,
  pendingRestorations: {},
});

function normalize(tabs: ReadonlyArray<ClosedPreviewTab>): ReadonlyArray<ClosedPreviewTab> {
  const ordered = tabs.toSorted((left, right) => right.sequence - left.sequence);
  const retained = new Set(
    ordered
      .filter((entry) => entry.status === "closed")
      .slice(0, CLOSED_PREVIEW_TAB_LIMIT)
      .map((entry) => entry.reservationId),
  );
  return ordered.filter((entry) => entry.status === "pending" || retained.has(entry.reservationId));
}

export function reservePreviewTabClose(
  state: PreviewTabHistory,
  snapshot: PreviewSessionSnapshot,
  overlay: PreviewDesktopRestoration | null,
) {
  const sequence = state.nextClosedTabSequence;
  const reservation: ClosedPreviewTab = {
    reservationId: `${sequence}:${snapshot.tabId}`,
    sequence,
    status: "pending",
    tabId: snapshot.tabId,
    url: snapshot.navStatus._tag === "Idle" ? null : snapshot.navStatus.url,
    profileId: snapshot.profileId,
    viewport: snapshot.viewport ?? FILL_PREVIEW_VIEWPORT,
    zoomFactor: overlay?.zoomFactor ?? 1,
    colorScheme: overlay?.colorScheme ?? "system",
  };
  return {
    reservation,
    state: {
      ...state,
      closedTabs: normalize([reservation, ...state.closedTabs]),
      nextClosedTabSequence: sequence + 1,
    },
  };
}
export function commitPreviewTabClose(
  state: PreviewTabHistory,
  reservationId: string,
): PreviewTabHistory {
  return {
    ...state,
    closedTabs: normalize(
      state.closedTabs.map((entry) =>
        entry.reservationId === reservationId ? { ...entry, status: "closed" } : entry,
      ),
    ),
  };
}
export function rollbackPreviewTabClose(
  state: PreviewTabHistory,
  reservationId: string,
): PreviewTabHistory {
  return {
    ...state,
    closedTabs: normalize(
      state.closedTabs.filter((entry) => entry.reservationId !== reservationId),
    ),
  };
}
export function takePreviewTabToReopen(state: PreviewTabHistory): {
  state: PreviewTabHistory;
  entry: ClosedPreviewTab | null;
} {
  // A newer unresolved close owns the head even if an older request settles first.
  const entry = state.closedTabs[0];
  if (!entry || entry.status === "pending") return { state, entry: null };
  return { entry, state: { ...state, closedTabs: state.closedTabs.slice(1) } };
}
export function restorePreviewTabToHistory(
  state: PreviewTabHistory,
  entry: ClosedPreviewTab,
): PreviewTabHistory {
  return {
    ...state,
    closedTabs: normalize([
      { ...entry, status: "closed" },
      ...state.closedTabs.filter((tab) => tab.reservationId !== entry.reservationId),
    ]),
  };
}
export function setPreviewTabRestoration(
  state: PreviewTabHistory,
  tabId: string,
  restoration: PreviewDesktopRestoration,
): PreviewTabHistory {
  return { ...state, pendingRestorations: { ...state.pendingRestorations, [tabId]: restoration } };
}
export function clearPreviewTabRestoration(
  state: PreviewTabHistory,
  tabId: string,
): PreviewTabHistory {
  if (!state.pendingRestorations[tabId]) return state;
  const { [tabId]: _removed, ...pendingRestorations } = state.pendingRestorations;
  return { ...state, pendingRestorations };
}
/** History belongs to one server lifetime; presentation also requires a surviving tab. */
export function reconcilePreviewTabHistory(
  state: PreviewTabHistory,
  tabIds: ReadonlySet<string>,
  sameLifetime: boolean,
): PreviewTabHistory {
  if (!sameLifetime) return EMPTY_PREVIEW_TAB_HISTORY;
  return {
    ...state,
    pendingRestorations: Object.fromEntries(
      Object.entries(state.pendingRestorations).filter(([tabId]) => tabIds.has(tabId)),
    ),
  };
}
