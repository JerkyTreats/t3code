import {
  AuthPreviewOperateScope,
  AuthTerminalOperateScope,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { getTerminalLabel } from "@t3tools/shared/terminalLabels";
import { useRouter } from "@tanstack/react-router";
import {
  closeConfirmedPreviewHostSurface,
  confirmPreviewHostClose,
  isPreviewHostRouteCurrent,
} from "../components/preview/previewHostActions";
import { useThreadTerminalActions } from "../components/terminal/useThreadTerminalActions";
import { confirmTerminalClose } from "../lib/terminalCloseConfirm";
import { readLocalApi } from "../localApi";
import { previewStateLifetimeIsCurrent, setActivePreviewTab } from "../previewStateStore";
import {
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
} from "../rightPanelStore";
import { previewEnvironment } from "../state/preview";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import { useStableCallback } from "./useStableCallback";

/**
 * Closes right panel surfaces for a thread. A surface's live resources go with
 * it: a browser's preview session and a terminal tab's sessions. Closing a
 * browser an agent is driving, or a terminal tab, asks first. Each close resolves
 * whether every requested surface closed; F23 closed-tab history records only those.
 */
export function useRightPanelSurfaceClose(input: {
  readonly threadRef: ScopedThreadRef | null;
  readonly terminalLabelsById: ReadonlyMap<string, string>;
}) {
  const { threadRef, terminalLabelsById } = input;
  const router = useRouter();
  const isCurrentHost = () =>
    isPreviewHostRouteCurrent(threadRef, router.state.matches.at(-1)?.params ?? {});
  const closePreview = useAtomCommand(previewEnvironment.close, "preview close");
  const canOperatePreview = useEnvironmentScope(
    threadRef?.environmentId ?? null,
    AuthPreviewOperateScope,
  );
  const terminalActions = useThreadTerminalActions(threadRef);
  const storeCloseTerminal = useTerminalUiStateStore((state) => state.closeTerminal);
  const surfaces = useRightPanelStore(
    (state) => selectThreadRightPanelState(state.byThreadKey, threadRef).surfaces,
  );

  const releaseSurfaceResources = async (
    ref: ScopedThreadRef,
    surface: RightPanelSurface,
  ): Promise<boolean> => {
    // Without preview access only the local surface goes away. The
    // server record is in-memory bookkeeping, not a live view, and stays
    // listed until a client with the scope closes it or the server restarts.
    if (canOperatePreview && surface.kind === "preview") {
      return closeConfirmedPreviewHostSurface({ threadRef: ref, surface, closePreview });
    }
    if (
      surface.kind === "terminal" &&
      readEnvironmentScope(ref.environmentId, AuthTerminalOperateScope)
    ) {
      for (const terminalId of surface.terminalIds) {
        storeCloseTerminal(ref, terminalId);
        terminalActions.closeTerminalSession(terminalId);
      }
    }
    return true;
  };
  const closeAfterAgentBrowserConfirmation = (
    toClose: readonly RightPanelSurface[],
    closeSurfaces: () => Promise<boolean>,
  ): Promise<boolean> => {
    if (!threadRef) return Promise.resolve(false);
    const localApi = readLocalApi();
    return confirmPreviewHostClose({
      threadRef,
      surfaces: toClose,
      isCurrent: isCurrentHost,
      confirm: localApi
        ? (message) => localApi.dialogs.confirm(message, { variant: "destructive" })
        : undefined,
      close: closeSurfaces,
    });
  };
  // The active surface closes last so the panel does not flash through it.
  const finishClose = async (toClose: readonly RightPanelSurface[]): Promise<boolean> => {
    if (!threadRef || !isCurrentHost()) return false;
    const sameLifetime = previewStateLifetimeIsCurrent(threadRef);
    const store = useRightPanelStore.getState();
    const activeId = selectThreadRightPanelState(store.byThreadKey, threadRef).activeSurfaceId;
    const ordered = toClose.toSorted(
      (left, right) => Number(left.id === activeId) - Number(right.id === activeId),
    );
    // Browser surfaces leave the panel before their server close settles.
    const released = await Promise.all(
      ordered.map((surface) => releaseSurfaceResources(threadRef, surface)),
    );
    if (!sameLifetime() || !isCurrentHost()) return false;
    ordered.forEach((surface, index) => {
      if (released[index]) store.closeSurface(threadRef, surface.id);
    });
    const nextActiveSurface = selectActiveRightPanelSurface(
      useRightPanelStore.getState().byThreadKey,
      threadRef,
    );
    if (nextActiveSurface?.kind === "preview" && nextActiveSurface.resourceId) {
      setActivePreviewTab(threadRef, nextActiveSurface.resourceId);
    }
    return released.every(Boolean);
  };
  const labelFor = (terminalId: string) =>
    terminalLabelsById.get(terminalId) ?? getTerminalLabel(terminalId);
  const closeSurfaces = (toClose: readonly RightPanelSurface[]): Promise<boolean> =>
    closeAfterAgentBrowserConfirmation(toClose, () => finishClose(toClose));

  const closeSurface = useStableCallback(async (surface: RightPanelSurface): Promise<boolean> => {
    if (!threadRef) return false;
    if (surface.kind === "preview") return closeSurfaces([surface]);
    if (
      surface.kind !== "terminal" ||
      !readEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope)
    ) {
      return finishClose([surface]);
    }
    const sameLifetime = previewStateLifetimeIsCurrent(threadRef);
    const otherLabels = surface.terminalIds
      .filter((terminalId) => terminalId !== surface.activeTerminalId)
      .map(labelFor);
    if (
      !(await confirmTerminalClose([labelFor(surface.activeTerminalId), ...otherLabels])) ||
      !sameLifetime()
    )
      return false;
    return finishClose([surface]);
  });
  const closeOtherSurfaces = useStableCallback((surface: RightPanelSurface) => {
    void closeSurfaces(surfaces.filter((entry) => entry.id !== surface.id));
  });
  const closeSurfacesToRight = useStableCallback((surface: RightPanelSurface) => {
    const surfaceIndex = surfaces.findIndex((entry) => entry.id === surface.id);
    if (surfaceIndex < 0) return;
    void closeSurfaces(surfaces.slice(surfaceIndex + 1));
  });
  const closeAllSurfaces = useStableCallback(() => {
    void closeSurfaces(surfaces);
  });

  return { closeSurface, closeOtherSurfaces, closeSurfacesToRight, closeAllSurfaces };
}
