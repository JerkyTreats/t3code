import {
  mapAtomCommandResult,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";
import {
  PreviewZoomFactor,
  type EnvironmentId,
  type PreviewAdjustInput,
  type PreviewResizeInput,
  type PreviewSessionSnapshot,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import type { OpenPreviewMutation } from "~/browser/openFileInPreview";
import {
  applyPreviewServerSnapshot,
  previewStateLifetimeIsCurrent,
  restoreClosedPreviewTab,
  setPendingPreviewRestoration,
  takeClosedPreviewTab,
  updatePreviewServerSnapshot,
} from "~/previewStateStore";
import { useRightPanelStore } from "~/rightPanelStore";

export async function reopenClosedPreviewSession<E>(input: {
  readonly threadRef: ScopedThreadRef;
  readonly openPreview: OpenPreviewMutation<E>;
  /** Only route presentation is conditional after a dispatched open succeeds. */
  readonly canFocus?: () => boolean;
  readonly adjustPreview: (input: {
    readonly environmentId: EnvironmentId;
    readonly input: PreviewAdjustInput;
  }) => Promise<AtomCommandResult<PreviewSessionSnapshot, E>>;
  readonly resizePreview: (input: {
    readonly environmentId: EnvironmentId;
    readonly input: PreviewResizeInput;
  }) => Promise<AtomCommandResult<PreviewSessionSnapshot, E>>;
}): Promise<AtomCommandResult<void, E> | null> {
  const isCurrent = previewStateLifetimeIsCurrent(input.threadRef);
  const closedTab = takeClosedPreviewTab(input.threadRef);
  if (!closedTab) return null;
  let opened = false;
  try {
    // Reopen uses the captured profile and viewport, independent of changed defaults.
    const result = await input.openPreview({
      environmentId: input.threadRef.environmentId,
      input: {
        threadId: input.threadRef.threadId,
        ...(closedTab.url === null ? {} : { url: closedTab.url }),
        ...(closedTab.profileId === undefined ? {} : { profileId: closedTab.profileId }),
        ...(closedTab.runtime === undefined ? {} : { runtime: closedTab.runtime }),
        viewport: closedTab.viewport,
      },
    });
    if (!isCurrent()) return mapAtomCommandResult(result, () => undefined);
    if (result._tag === "Failure") {
      restoreClosedPreviewTab(input.threadRef, closedTab);
      return mapAtomCommandResult(result, () => undefined);
    }
    opened = true;
    const snapshot = result.value;
    applyPreviewServerSnapshot(input.threadRef, snapshot);
    if (snapshot.runtime !== "server") {
      setPendingPreviewRestoration(input.threadRef, snapshot.tabId, {
        zoomFactor: closedTab.zoomFactor,
        colorScheme: closedTab.colorScheme,
      });
    }
    if (!input.canFocus || input.canFocus())
      useRightPanelStore.getState().openBrowser(input.threadRef, snapshot.tabId);
    // An opened replacement consumes history even if the resize confirmation fails.
    const resized = await input.resizePreview({
      environmentId: input.threadRef.environmentId,
      input: {
        threadId: input.threadRef.threadId,
        tabId: snapshot.tabId,
        viewport: closedTab.viewport,
      },
    });
    if (isCurrent() && resized._tag === "Success")
      updatePreviewServerSnapshot(input.threadRef, resized.value);
    if (!isCurrent() || resized._tag === "Failure" || snapshot.runtime !== "server")
      return mapAtomCommandResult(resized, () => undefined);
    // Server tabs publish their rendering to all clients. Restore through the
    // public mutation so subsequent snapshots and guest attachment agree.
    const adjusted = await input.adjustPreview({
      environmentId: input.threadRef.environmentId,
      input: {
        threadId: input.threadRef.threadId,
        tabId: snapshot.tabId,
        zoomFactor: Schema.decodeUnknownSync(PreviewZoomFactor)(closedTab.zoomFactor),
        colorScheme: closedTab.colorScheme,
      },
    });
    if (isCurrent() && adjusted._tag === "Success")
      updatePreviewServerSnapshot(input.threadRef, adjusted.value);
    return mapAtomCommandResult(adjusted, () => undefined);
  } catch (error) {
    if (!opened && isCurrent()) restoreClosedPreviewTab(input.threadRef, closedTab);
    throw error;
  }
}
