import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  PreviewCloseInput,
  PreviewSessionSnapshot,
  ScopedThreadRef,
} from "@t3tools/contracts";

import {
  applyPreviewDesktopState,
  setPendingPreviewRestoration,
  readThreadPreviewState,
  previewStateLifetimeIsCurrent,
  reserveClosedPreviewTab,
  commitClosedPreviewTab,
  rollbackClosedPreviewTab,
  beginPreviewSessionClose,
  cancelPreviewSessionClose,
} from "~/previewStateStore";

interface ClosePreviewSessionInput<E> {
  readonly closePreview: (input: {
    readonly environmentId: EnvironmentId;
    readonly input: PreviewCloseInput;
  }) => Promise<AtomCommandResult<void, E>>;
  readonly snapshot: PreviewSessionSnapshot | null;
  readonly tabId: string;
  readonly threadRef: ScopedThreadRef;
}

/**
 * Optimistically closes a preview while suppressing stale list responses for
 * the same tab. A failed close restores the last known snapshot.
 */
export async function closePreviewSession<E>(
  input: ClosePreviewSessionInput<E>,
): Promise<AtomCommandResult<void, E>> {
  const isCurrent = previewStateLifetimeIsCurrent(input.threadRef);
  const current = readThreadPreviewState(input.threadRef);
  const snapshot = current.sessions[input.tabId] ?? input.snapshot;
  const reservation =
    snapshot && !current.suppressedTabIds.has(input.tabId)
      ? reserveClosedPreviewTab(
          input.threadRef,
          snapshot,
          current.desktopByTabId[input.tabId] ?? null,
        )
      : null;
  beginPreviewSessionClose(input.threadRef, input.tabId);
  const rollback = () => {
    if (!isCurrent()) return;
    if (reservation) rollbackClosedPreviewTab(input.threadRef, reservation.reservationId);
    cancelPreviewSessionClose(input.threadRef, snapshot, input.tabId);
    const overlay = current.desktopByTabId[input.tabId];
    if (overlay && readThreadPreviewState(input.threadRef).sessions[input.tabId]) {
      applyPreviewDesktopState(input.threadRef, input.tabId, overlay);
      setPendingPreviewRestoration(input.threadRef, input.tabId, {
        zoomFactor: overlay.zoomFactor,
        colorScheme: overlay.colorScheme,
      });
    }
  };
  try {
    const result = await input.closePreview({
      environmentId: input.threadRef.environmentId,
      input: { threadId: input.threadRef.threadId, tabId: input.tabId },
    });
    if (result._tag === "Failure") rollback();
    else if (reservation && isCurrent())
      commitClosedPreviewTab(input.threadRef, reservation.reservationId);
    return result;
  } catch (error) {
    rollback();
    throw error;
  }
}
