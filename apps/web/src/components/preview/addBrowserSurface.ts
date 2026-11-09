import {
  mapAtomCommandResult,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";

import type { BrowserSettingsReadError, OpenPreviewMutation } from "~/browser/openFileInPreview";
import { useRightPanelStore } from "~/rightPanelStore";

import { openPreviewSession } from "./openPreviewSession";

export async function addBrowserSurface<E>(input: {
  readonly threadRef: ScopedThreadRef;
  readonly openPreview: OpenPreviewMutation<E>;
  readonly profileId?: string | undefined;
  /** Mounts the new tab instead of opening it in the panel, which keeps it as a background tab. */
  readonly place?: ((tabId: string) => void) | undefined;
}): Promise<AtomCommandResult<void, E | BrowserSettingsReadError>> {
  const result = await openPreviewSession({
    openPreview: input.openPreview,
    threadRef: input.threadRef,
    ...(input.profileId === undefined ? {} : { profileId: input.profileId }),
  });
  return mapAtomCommandResult(result, (snapshot) => {
    if (input.place) input.place(snapshot.tabId);
    else useRightPanelStore.getState().openBrowser(input.threadRef, snapshot.tabId);
  });
}
