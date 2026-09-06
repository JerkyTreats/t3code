import type { ScopedThreadRef } from "@t3tools/contracts";
import { previewStateLifetimeIsCurrent } from "~/previewStateStore";
import {
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  type RightPanelSurface,
  useRightPanelStore,
} from "~/rightPanelStore";

/** The host owns confirmation and removal; cancellation must leave the panel untouched. */
export async function closeFocusedPreviewSurface(input: {
  readonly threadRef: ScopedThreadRef;
  readonly closeSurface: (surface: RightPanelSurface) => Promise<boolean>;
  readonly syncActivePreview: () => void;
  readonly focusUrl: () => void;
}): Promise<RightPanelSurface | null> {
  const isCurrent = previewStateLifetimeIsCurrent(input.threadRef);
  const liveSurface = selectActiveRightPanelSurface(
    useRightPanelStore.getState().byThreadKey,
    input.threadRef,
  );
  if (liveSurface?.kind !== "preview") return null;
  if (!(await input.closeSurface(liveSurface)) || !isCurrent()) return null;
  const state = selectThreadRightPanelState(
    useRightPanelStore.getState().byThreadKey,
    input.threadRef,
  );
  if (
    liveSurface.resourceId !== null &&
    !state.surfaces.some((surface) => surface.kind === "preview")
  ) {
    useRightPanelStore.getState().openBrowser(input.threadRef, null);
    input.focusUrl();
  } else input.syncActivePreview();
  return liveSurface;
}
